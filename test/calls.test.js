// ── Qo'ng'iroq ro'yxati, "Hali ish qidiryapsizmi?", haftalik hisobot (2026-11-26) ──
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, sent = [], edits = [], cq, lk, wk;
const A = 'agCL';
const H = 36e5, D = 24 * H;

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Vacancy', 'Application', 'Restaurant', 'Shortlist'])
    M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return { message_id: 1 }; };
  tg.editMessageText = async (tok, chat, id, text, extra) => { edits.push({ chat, text, extra }); return {}; };
  tg.answerCallback = async () => ({});
  cq = require('../src/services/callQueue');
  lk = require('../src/services/lookCheck');
  wk = require('../src/services/weekly');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  sent = []; edits = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true,
    adminEmail: 'cl@test.uz', adminPassword: 'secret1', telegram: { adminChatId: 'adm' } });
  await M.Client.create([
    { id: 'k1', agencyId: A, name: 'Tarnov', status: 'active' },
    { id: 'kt', agencyId: A, name: 'Sinov', status: 'active', isTest: true }
  ]);
  await M.Vacancy.create([
    { id: 'v1', agencyId: A, clientId: 'k1', title: 'Ofitsiant', role: 'ofitsiant', status: 'open', listed: true, confirmedAt: new Date() },
    { id: 'v2', agencyId: A, clientId: 'k1', title: 'Oshpaz', role: 'oshpaz', status: 'open', listed: true, confirmedAt: new Date() },
    { id: 'vc', agencyId: A, clientId: 'k1', title: 'Yopiq', role: 'kassir', status: 'closed' },
    { id: 'vt', agencyId: A, clientId: 'kt', title: 'Sinov ishi', role: 'ofitsiant', status: 'open' }
  ]);
});

const ago = h => new Date(Date.now() - h * H);
const cand = (id, x = {}) => M.Candidate.create(Object.assign({
  id, restaurantId: A, fullName: 'Aziza Karimova', phone: '+998901112233', role: 'ofitsiant', source: 'hh'
}, x));
const app = (id, candidateId, vacancyId, x = {}) => M.Application.create(Object.assign({
  id, agencyId: A, candidateId, vacancyId, clientId: vacancyId === 'vt' ? 'kt' : 'k1', state: 'new'
}, x));

// ── Qo'ng'iroq ro'yxati ──

test('ro\'yxat: ariza + anketa, bir odam bir marta; yopiq/sinov vakansiya va sinov nomzodi yo\'q', async () => {
  await cand('c1', { source: 'anketa', createdAt: ago(50) });       // anketa + ariza — bitta qator
  await app('a1', 'c1', 'v1', { createdAt: ago(30) });
  await app('a2', 'c1', 'v2', { createdAt: ago(2) });
  await cand('c2'); await app('a3', 'c2', 'vc');                     // yopiq vakansiya
  await cand('c3'); await app('a4', 'c3', 'vt');                     // sinov mijozining ishi
  await cand('c4', { isTest: true }); await app('a5', 'c4', 'v1');   // sinov nomzodi
  await cand('c5', { source: 'anketa', createdAt: ago(3) });         // yangi anketa
  await cand('c6', { source: 'anketa', firstContactAt: new Date() });// allaqachon bog'lanilgan
  await cand('c7'); await app('a6', 'c7', 'v1', { contactedAt: new Date() }); // "Bog'landim"

  const q = await cq.build(A);
  assert.deepEqual(q.due.map(r => r.cand.id), ['c5', 'c1'], 'yangisi oldin, kechikkan keyin');
  const c1 = q.due.find(r => r.cand.id === 'c1');
  assert.equal(c1.apps.length, 2);
  assert.equal(c1.late, true, 'eng eski kutishdan sanaladi (50 soat)');
  assert.deepEqual(q.counts, { due: 2, late: 1, apps: 1, anketa: 1, later: 0, unreachable: 0 });
});

test('"javob bermadi": ertaga 10:00 gacha yashirinadi, 3-marta — Ulanmadi; yangi ariza qaytaradi', async () => {
  await cand('c1'); await app('a1', 'c1', 'v1', { createdAt: ago(5) });
  const r1 = await cq.record({ agencyId: A, candId: 'c1', result: 'noanswer' });
  assert.equal(r1.result, 'noanswer'); assert.equal(r1.tries, 1);
  let q = await cq.build(A);
  assert.equal(q.counts.due, 0); assert.equal(q.counts.later, 1);
  assert.equal((await M.Application.findOne({ id: 'a1' }).lean()).contactedAt, null, 'urinish — aloqa emas');

  // ertaga ertalab — yana "Hozir"da, qayta qo'ng'iroq belgisi bilan
  q = await cq.build(A, new Date(r1.nextAt.getTime() + 60e3));
  assert.equal(q.counts.due, 1); assert.equal(q.due[0].retry, true);

  await cq.record({ agencyId: A, candId: 'c1', result: 'noanswer' });
  const r3 = await cq.record({ agencyId: A, candId: 'c1', result: 'noanswer' });
  assert.equal(r3.result, 'unreachable'); assert.equal(r3.tries, 3);
  q = await cq.build(A);
  assert.equal(q.counts.due, 0); assert.equal(q.counts.later, 0); assert.equal(q.counts.unreachable, 1);

  await new Promise(r => setTimeout(r, 5));
  await app('a2', 'c1', 'v2');                                       // yangi ariza
  q = await cq.build(A);
  assert.equal(q.counts.due, 1, 'yangi ariza bergan nomzod yana ro\'yxatda');
});

test('"Gaplashdik": arizalarga aloqa yoziladi, ro\'yxatdan chiqadi, taklif uchun arizalar qaytadi', async () => {
  await cand('c1', { source: 'anketa' });
  await app('a1', 'c1', 'v1'); await app('a2', 'c1', 'v2');
  const r = await cq.record({ agencyId: A, candId: 'c1', result: 'talked' });
  assert.deepEqual(r.apps.map(a => a.id).sort(), ['a1', 'a2']);
  const apps = await M.Application.find({ candidateId: 'c1' }).lean();
  assert.ok(apps.every(a => a.contactedAt && a.agencySeenAt));
  const c = await M.Candidate.findOne({ id: 'c1' }).lean();
  assert.ok(c.firstContactAt); assert.equal(c.callLast, 'talked'); assert.equal(c.callTries, 0);
  assert.equal((await cq.build(A)).counts.due, 0);
});

test('"Mos emas": arizalar rad etiladi (nomzodga xabar), arizasiz anketa nomzodi — rejected', async () => {
  await cand('c1', { tgChatId: '501', tgState: 'linked' });
  await app('a1', 'c1', 'v1');
  const r = await cq.record({ agencyId: A, candId: 'c1', result: 'unfit' });
  assert.equal(r.rejected, 1);
  const a = await M.Application.findOne({ id: 'a1' }).lean();
  assert.equal(a.state, 'rejected'); assert.equal(a.reason, 'agency');
  assert.ok(sent.some(m => m.chat === '501'), 'nomzodga yumshoq xabar');
  assert.equal((await M.Candidate.findOne({ id: 'c1' }).lean()).status, 'new', 'arizali nomzod bazadan chiqmaydi');

  await cand('c2', { source: 'anketa' });
  await cq.record({ agencyId: A, candId: 'c2', result: 'unfit' });
  assert.equal((await M.Candidate.findOne({ id: 'c2' }).lean()).status, 'rejected');
  // takroriy rad etish ikkinchi xabar yubormaydi
  const before = sent.length;
  assert.equal(await require('../src/services/applications').agencyReject({ agencyId: A, appId: 'a1' }), null);
  assert.equal(sent.length, before);
});

test('noto\'g\'ri natija va begona nomzod rad etiladi', async () => {
  await assert.rejects(cq.record({ agencyId: A, candId: 'x', result: 'talked' }), e => e.status === 404);
  await cand('c1');
  await assert.rejects(cq.record({ agencyId: A, candId: 'c1', result: 'hired' }), e => e.status === 400);
});

test('nextMorning — ertangi 10:00 Toshkent (05:00 UTC)', () => {
  assert.equal(cq.nextMorning(new Date('2026-11-26T18:30:00Z')).toISOString(), '2026-11-27T05:00:00.000Z');  // 23:30 Toshkent
  assert.equal(cq.nextMorning(new Date('2026-11-26T20:30:00Z')).toISOString(), '2026-11-28T05:00:00.000Z');  // 01:30 ertasi kun
});

// ── "Hali ish qidiryapsizmi?" ──

const NOON = new Date('2026-11-26T07:00:00Z');   // 12:00 Toshkent
const old = new Date(NOON.getTime() - 20 * D);

test('lookCheck: faqat 14 kundan eski tasdiq, ulangan, ariza bermagan, so\'ralmagan', async () => {
  const L = { tgState: 'linked', createdAt: old, jobStatus: 'active', jobStatusAt: old };
  await cand('y1', Object.assign({ tgChatId: '1' }, L));
  await cand('n1', Object.assign({ tgChatId: '2' }, L, { jobStatusAt: new Date(NOON - 3 * D) }));   // yaqinda tasdiqlagan
  await cand('n2', Object.assign({ tgChatId: '3' }, L, { jobStatus: 'not_looking' }));
  await cand('n3', Object.assign({ tgChatId: '4' }, L, { tgState: 'blocked' }));
  await cand('n4', Object.assign({ tgChatId: '5' }, L, { isTest: true }));
  await cand('n5', Object.assign({ tgChatId: '6' }, L, { status: 'hired' }));
  await cand('n6', Object.assign({ tgChatId: '7' }, L, { lookAskedAt: new Date(NOON - 5 * D) }));
  await cand('n8', Object.assign({ tgChatId: '9' }, L, { status: 'interview' }));                 // suhbatda
  await cand('n7', Object.assign({ tgChatId: '8' }, L)); await app('a7', 'n7', 'v1', { createdAt: new Date(NOON - 2 * D) });
  const due = await lk.due(NOON);
  assert.deepEqual(due.map(c => c.id), ['y1']);
});

test('lookCheck: kunduzi yuboradi (Ha/Yo\'q tugmalari), ikkinchi tick takrorlamaydi, kechasi jim', async () => {
  await cand('y1', { tgChatId: '11', tgState: 'linked', createdAt: old, fullName: 'Karimova Aziza' });
  await cand('y2', { tgChatId: '12', tgState: 'linked', createdAt: old, fullName: '', lang: 'ru' });
  const night = new Date('2026-11-26T17:00:00Z');   // 22:00 Toshkent
  assert.equal((await lk.tick(night)).sent, 0);
  assert.equal((await lk.tick(NOON)).sent, 2);
  const m1 = sent.find(m => m.chat === '11'), m2 = sent.find(m => m.chat === '12');
  assert.match(m1.text, /^👋 Aziza, hali ish qidiryapsizmi\?/);
  assert.match(m2.text, /^👋 Вы ещё ищете работу\?/, 'ismsiz — bosh harf bilan');
  assert.deepEqual(m1.extra.reply_markup.inline_keyboard[0].map(b => b.callback_data), ['cp', 'cn']);
  assert.ok((await M.Candidate.findOne({ id: 'y1' }).lean()).lookAskedAt);
  assert.equal((await lk.tick(new Date(NOON.getTime() + 60e3))).sent, 0, 'qayta so\'ralmaydi');
});

test('bot javobi: "Ha" — faol + ochiq ishlar tugmasi; "Yo\'q" — mijoz qidiruvidan chiqadi', async () => {
  const { handleCallback } = require('../src/routes/telegram');
  await cand('y1', { tgChatId: '21', tgState: 'linked', jobStatus: 'unknown' });
  await handleCallback({ id: 'q1', data: 'cp', from: { id: 21 }, message: { chat: { id: 21 }, message_id: 5, text: 'x' } }, 'https://app.test');
  let c = await M.Candidate.findOne({ id: 'y1' }).lean();
  assert.equal(c.jobStatus, 'active'); assert.ok(c.jobStatusAt);
  const e1 = edits.pop();
  assert.match(e1.text, /Rahmat/); assert.match(e1.text, /Hozir 2 ta ochiq ish bor/);
  assert.equal(e1.extra.reply_markup.inline_keyboard[0][0].web_app.url, 'https://app.test/profil.html#jobs');

  await handleCallback({ id: 'q2', data: 'cn', from: { id: 21 }, message: { chat: { id: 21 }, message_id: 5, text: 'x' } }, 'https://app.test');
  c = await M.Candidate.findOne({ id: 'y1' }).lean();
  assert.equal(c.jobStatus, 'not_looking');
  assert.match(edits.pop().text, /hozircha ish taklif qilmaymiz/);
  assert.ok(!sent.some(m => m.chat === 'adm'), 'admin chatiga birma-bir yuborilmaydi');
});

// ── Haftalik hisobot ──

const MON = new Date('2026-11-30T05:00:00Z');   // dushanba 10:00 Toshkent

test('haftalik: raqamlar o\'tgan haftadan (dush–yak), sinov yozuvlari yo\'q', async () => {
  const inWeek = new Date('2026-11-26T08:00:00Z'), before = new Date('2026-11-20T08:00:00Z');
  await cand('c1', { source: 'anketa', createdAt: inWeek });
  await cand('c2', { source: 'hh', createdAt: inWeek });
  await cand('c3', { source: 'anketa', createdAt: before });
  await cand('ct', { source: 'anketa', createdAt: inWeek, isTest: true });
  await app('a1', 'c1', 'v1', { createdAt: inWeek, contactedAt: new Date(inWeek.getTime() + 3 * H) });
  await app('a2', 'c2', 'v1', { createdAt: inWeek });
  await app('at', 'c2', 'vt', { createdAt: inWeek });                // sinov mijozi
  const r = await wk.build(A, MON);
  assert.equal(r.label, '23–29-noyabr');
  assert.equal(r.newCands, 2); assert.deepEqual(r.bySource, { anketa: 1, hh: 1 });
  assert.equal(r.apps, 2); assert.equal(r.called24, 1);
  // c2 (ariza) va c3 (anketa) kutmoqda; c1 — arizasi bo'yicha bog'lanilgan, anketa sifatida ham kutmaydi
  assert.equal(r.calls.due, 2);
  const msg = wk.messageFor(r);
  assert.match(msg, /Yangi nomzodlar: <b>2<\/b>/);
  assert.match(msg, /24 soat ichida qo'ng'iroq: 1 tasiga/);
  assert.match(msg, /Faol baza \(30 kun\): <b>3<\/b>/);
});

test('haftalik: faqat dushanba 09–13, haftada bir marta', async () => {
  assert.equal((await wk.tick(new Date('2026-11-29T05:00:00Z'))).sent, 0, 'yakshanba');
  assert.equal((await wk.tick(new Date('2026-11-30T09:00:00Z'))).sent, 0, 'dushanba 14:00');
  assert.equal((await wk.tick(MON)).sent, 1);
  assert.equal((await wk.tick(new Date(MON.getTime() + 30 * 60e3))).sent, 0, 'shu hafta qayta yo\'q');
  assert.equal((await wk.tick(new Date(MON.getTime() + 7 * D))).sent, 1, 'keyingi dushanba');
  assert.equal(sent.filter(m => m.chat === 'adm').length, 2);
});
