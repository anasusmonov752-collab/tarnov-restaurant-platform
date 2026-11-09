// ── Vakansiya kanalga o'zi chiqadi + mos nomzodlarga xabar (services/jobPost) ──
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, jp, sent = [], edits = [], R = {};
const A = 'agJP';
const NOON = new Date(Date.UTC(2026, 10, 9, 7, 0));          // 12:00 Toshkent
const NIGHT = new Date(Date.UTC(2026, 10, 9, 19, 0));        // 00:00 Toshkent
const SINCE = new Date(Date.UTC(2026, 10, 8, 0, 0));
let msgId = 100;

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Vacancy', 'Application', 'Restaurant']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.platformUsername = async () => 'TalentHubUzBot';
  tg.sendMessage = async (tok, chat, text, extra) => {
    sent.push({ chat, text, extra });
    return { message_id: ++msgId, chat: chat === '@vakuz_test' ? { id: -1001, username: 'vakuz_test' } : { id: chat } };
  };
  tg.editMessageText = async (tok, chat, id, text, extra) => { edits.push({ chat, id, text, extra }); return {}; };
  tg.getMe = async () => ({ id: 42, username: 'TalentHubUzBot' });
  tg.getChat = async (tok, chat) => { if (chat !== '@vakuz_test') throw new Error('chat not found'); return { id: -1001, type: 'channel', title: 'Vakansiya.uz', username: 'vakuz_test' }; };
  tg.getChatMember = async () => ({ status: 'administrator', can_post_messages: true });
  jp = require('../src/services/jobPost');
  const vr = require('../src/routes/vacancies');
  const h = (m, p) => { const l = vr.stack.find(x => x.route && x.route.path === p && x.route.methods[m]); return l.route.stack[l.route.stack.length - 1].handle; };
  R.getCh = h('get', '/channel'); R.putCh = h('put', '/channel');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const call = (h, req) => new Promise((resolve, reject) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, set() { return this; }, json(j) { resolve({ code: this.code, j }); } };
  h(Object.assign({ user: { restaurantId: A }, params: {}, body: {}, query: {}, headers: {}, get: () => 'test.local', protocol: 'https' }, req), res,
    e => (e ? reject(e) : resolve({ code: 0 })));
});

beforeEach(async () => {
  sent = []; edits = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true, adminEmail: 'jp@test.uz', adminPassword: 'secret1',
    telegram: { jobChannel: '@vakuz_test', jobChannelAuto: true, jobChannelSince: SINCE } });
  await M.Client.create({ id: 'cl1', agencyId: A, name: 'MASA restoran', status: 'active', tgChatId: 'c100' });
  await M.Vacancy.create({ id: '11111111-1111-4111-8111-111111111111', agencyId: A, clientId: 'cl1', title: 'Ofitsiant, kechki smena',
    role: 'ofitsiant', shift: 'kechki', location: 'Chilonzor', salaryFrom: 4000000, salaryTo: 5000000, status: 'open', listed: true,
    perks: ['ovqat'], createdAt: new Date(Date.UTC(2026, 10, 9, 5, 0)) });
  await M.Candidate.create([
    { id: 'k1', restaurantId: A, role: 'ofitsiant', experienceYears: 2, location: 'Chilonzor', shift: 'kechki', tgChatId: 'k1c', tgState: 'linked', jobStatus: 'active' },
    { id: 'k2', restaurantId: A, role: 'ofitsiant', experienceYears: 1, tgChatId: 'k2c', tgState: 'linked', jobStatus: 'not_looking' },
    { id: 'k3', restaurantId: A, role: 'ofitsiant', experienceYears: 1, tgChatId: 'k3c', tgState: 'linked', jobStatus: 'active', jobAlertsOff: true },
    { id: 'k4', restaurantId: A, role: 'oshpaz', experienceYears: 3, tgChatId: 'k4c', tgState: 'linked', jobStatus: 'active' },
    { id: 'k5', restaurantId: A, role: 'ofitsiant', experienceYears: 1, location: 'Chilonzor' },     // Telegramsiz
    { id: 'k6', restaurantId: A, desiredPosition: 'Официант', experienceYears: 1, location: 'Chilonzor', tgChatId: 'k6c', tgState: 'linked', jobStatus: 'active' }
  ]);
});

test('kanal manzilini tushunish', () => {
  assert.equal(jp.normChannel('@vakansiya_uz'), '@vakansiya_uz');
  assert.equal(jp.normChannel('https://t.me/vakansiya_uz'), '@vakansiya_uz');
  assert.equal(jp.normChannel('t.me/vakansiya_uz'), '@vakansiya_uz');
  assert.equal(jp.normChannel('-1001234567890'), '-1001234567890');
  assert.equal(jp.normChannel('salom dunyo'), '');
});

test('post matni: restoran nomisiz, maosh va tugma matni bor; yopilgan — YOPILDI', async () => {
  const v = await M.Vacancy.findOne({}).lean();
  const txt = jp.postText(v, { name: 'MASA restoran', status: 'active' });
  assert.ok(!/MASA/.test(txt));
  assert.match(txt, /Chilonzor/);
  assert.match(txt, /4 000 000/);
  assert.match(jp.postText(v, null, { closed: true }), /YOPILDI/);
});

test('tick: yangi vakansiya kanalga chiqadi, mos nomzodlarga xabar, mijozga xabar; takror yo\'q', async () => {
  const r = await jp.tick(NOON, { appBase: 'https://x' });
  assert.equal(r.posted, 1);
  const post = sent.find(x => x.chat === '@vakuz_test');
  assert.ok(post);
  assert.equal(post.extra.parse_mode, 'HTML');
  assert.match(post.extra.reply_markup.inline_keyboard[0][0].url, /start=v_11111111-1111-4111-8111-111111111111_vakuz$/);
  const v = await M.Vacancy.findOne({}).lean();
  assert.match(v.channelPost.url, /^https:\/\/t\.me\/vakuz_test\/\d+$/);
  // Faqat k1 va k6 (ruscha lavozim yozuvi ham taniladi): not_looking, o'chirgan, boshqa lavozim, Telegramsiz — yo'q
  const to = sent.filter(x => /^k\dc$/.test(x.chat)).map(x => x.chat).sort();
  assert.deepEqual(to, ['k1c', 'k6c']);
  assert.equal(v.alertedN, 2);
  assert.ok(sent.some(x => x.chat === 'c100' && /2 ta mos nomzod/.test(x.text)));
  sent = [];
  assert.equal((await jp.tick(NOON)).posted, 0);
  assert.equal(sent.length, 0);
});

test('kanal ulanishidan oldingi vakansiya o\'zi chiqmaydi; kechasi ham chiqmaydi', async () => {
  await M.Vacancy.updateOne({}, { $set: { createdAt: new Date(Date.UTC(2026, 10, 1)), confirmedAt: new Date(Date.UTC(2026, 10, 1)) } });
  assert.equal((await jp.tick(NOON)).posted, 0);
  await M.Vacancy.updateOne({}, { $set: { createdAt: new Date(Date.UTC(2026, 10, 9, 5)) } });
  assert.equal((await jp.tick(NIGHT)).posted, 0);
});

test('yopilgan vakansiya — postga YOPILDI, bir marta', async () => {
  await jp.tick(NOON);
  await M.Vacancy.updateOne({}, { $set: { status: 'closed' } });
  let r = await jp.tick(NIGHT);                                   // yopish kechasi ham
  assert.equal(r.closed, 1);
  assert.match(edits[0].text, /YOPILDI/);
  r = await jp.tick(NIGHT);
  assert.equal(r.closed, 0);
});

test('nomzodga 20 soatda bitta xabar; o\'chirish tugmasi', async () => {
  await jp.tick(NOON);
  await M.Vacancy.create({ id: '22222222-2222-4222-8222-222222222222', agencyId: A, clientId: 'cl1', title: 'Ofitsiant', role: 'ofitsiant',
    status: 'open', listed: true, createdAt: new Date(Date.UTC(2026, 10, 9, 6, 0)) });
  sent = [];
  await jp.tick(new Date(NOON.getTime() + 2 * 3600e3));
  assert.ok(!sent.some(x => x.chat === 'k1c'));
  await jp.alertsOff('k6c');
  assert.equal((await M.Candidate.findOne({ id: 'k6' }).lean()).jobAlertsOff, true);
});

test('panel: kanal saqlanadi (bot tekshiriladi), noto\'g\'ri kanal rad etiladi', async () => {
  await M.Restaurant.updateOne({ id: A }, { $set: { 'telegram.jobChannel': '', 'telegram.jobChannelSince': null } });
  let r = await call(R.putCh, { body: { channel: 'boshqa_kanal_yoq', auto: true } });
  assert.equal(r.code, 400);
  r = await call(R.putCh, { body: { channel: 'https://t.me/vakuz_test', auto: true } });
  assert.equal(r.j.ok, true);
  r = await call(R.getCh, {});
  assert.equal(r.j.channel, '@vakuz_test');
  assert.equal(r.j.title, 'Vakansiya.uz');
  assert.ok(r.j.since);
});
