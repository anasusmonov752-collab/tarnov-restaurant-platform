// ── Ishga olingandan keyin: 1/7/30-kun, kafolat (services/placements) va ishonchlilik (services/reliability) ──
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, pl, sl, rel, sent = [];
const A = 'agPL';
const DAY = 864e5;
// Dushanba 2026-11-09 12:00 Toshkent
const T0 = new Date(Date.UTC(2026, 10, 9, 7, 0));

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Shortlist', 'CreditLedger', 'Vacancy', 'Placement', 'Interview', 'Restaurant']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return { message_id: 1, chat: { id: chat } }; };
  tg.platformToken = () => 'x';
  pl = require('../src/services/placements');
  sl = require('../src/services/shortlist');
  rel = require('../src/services/reliability');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  sent = [];
  delete process.env.REPLACE_GUARANTEE;
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true, adminEmail: 'pl@test.uz', adminPassword: 'secret1',
    telegram: { adminChatId: 'adm' } });
  await M.Client.create({ id: 'cl1', agencyId: A, name: 'Rayhon', credits: 5, status: 'active', tgChatId: 'c100' });
  await M.Candidate.create({ id: 'k1', restaurantId: A, fullName: 'Aziza Karimova', phone: '+998901112233', publicCode: 'A-1',
    tgChatId: 'k200', tgState: 'linked', jobStatus: 'active' });
  await M.Vacancy.create({ id: 'v1', agencyId: A, clientId: 'cl1', title: 'Ofitsiant', role: 'ofitsiant', status: 'open', listed: true,
    channelPost: { chatId: '@k', messageId: 5, url: 'https://t.me/k/5', postedAt: T0 } });
  await M.Shortlist.create({ id: 's1', agencyId: A, clientId: 'cl1', vacancyId: 'v1', items: [{ candidateId: 'k1', state: 'candidate_ok' }] });
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });                 // 5 -> 4
  sent = [];
});

const hire = async () => {
  await sl.setClientState({ agencyId: A, shortlistId: 's1', clientId: 'cl1', candidateId: 'k1', state: 'hired' });
  // Testda vaqtni boshqaramiz: ishga olingan payt — T0
  await M.Placement.updateOne({}, { $set: { hiredAt: T0 } });
  // Ishga olindi — vakansiya yopilgan deb faraz qilamiz (kafolat uni qayta ochadi)
  await M.Vacancy.updateOne({ id: 'v1' }, { $set: { status: 'closed' } });
  return M.Placement.findOne({}).lean();
};
const bal = async () => (await M.Client.findOne({ id: 'cl1' }).lean()).credits;

test('ishga olindi — yozuv bitta (takror xavfsiz)', async () => {
  const p = await hire();
  assert.equal(p.status, 'active');
  await pl.create({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  assert.equal(await M.Placement.countDocuments({}), 1);
});

test('1-kun va 7-kun so\'rovlari ikki tomonga, bir martadan; kechasi yo\'q', async () => {
  await hire();
  assert.equal((await pl.tick(new Date(T0.getTime() + 1 * DAY + 3600e3 * 10))).asked, 0);   // 22:00 — kechasi
  let r = await pl.tick(new Date(T0.getTime() + 1 * DAY + 3600e3));
  assert.equal(r.asked, 1);
  assert.ok(sent.some(x => x.chat === 'c100' && /ishga chiqdimi/.test(x.text)));
  assert.ok(sent.some(x => x.chat === 'k200' && /birinchi kun/.test(x.text)));
  assert.equal((await pl.tick(new Date(T0.getTime() + 1 * DAY + 2 * 3600e3))).asked, 0);
  r = await pl.tick(new Date(T0.getTime() + 7 * DAY + 3600e3));
  assert.equal(r.asked, 1);
  assert.ok(sent.some(x => x.chat === 'c100' && /7 kundan beri/.test(x.text)));
});

test('nomzod "muammo bor" — agentlikka bir marta', async () => {
  const p = await hire();
  await pl.handleCallback({ data: `pl:kp:${p.id}:7`, chatId: 'k200' });
  await pl.handleCallback({ data: `pl:kp:${p.id}:7`, chatId: 'k200' });
  assert.equal(sent.filter(x => x.chat === 'adm' && /muammo bor/.test(x.text)).length, 1);
});

test('30 kun ichida ketdi — kafolat: vakansiya qayta ochiladi, +1 kredit, nomzod yana faol', async () => {
  const p = await hire();
  await M.Candidate.updateOne({ id: 'k1' }, { $set: { jobStatus: 'not_looking' } });
  const r = await pl.handleCallback({ data: `pl:cl:${p.id}:7`, chatId: 'c100', now: new Date(T0.getTime() + 7 * DAY) });
  assert.equal(r.ok, true);
  const doc = await M.Placement.findOne({}).lean();
  assert.equal(doc.status, 'left');
  assert.ok(doc.replacedAt);
  const v = await M.Vacancy.findOne({ id: 'v1' }).lean();
  assert.deepEqual([v.status, v.listed, v.channelPost.postedAt, v.channelPost.messageId], ['open', true, null, 0]);
  assert.equal(await bal(), 5);
  assert.equal((await M.Candidate.findOne({ id: 'k1' }).lean()).jobStatus, 'active');
  assert.ok(sent.some(x => x.chat === 'c100' && /kafolat/i.test(x.text)));
  // Takror bosilsa — ikkinchi kredit yo'q
  await pl.handleCallback({ data: `pl:cl:${p.id}:7`, chatId: 'c100', now: new Date(T0.getTime() + 7 * DAY) });
  assert.equal(await bal(), 5);
});

test('30 kundan keyin ketdi yoki kafolat o\'chiq — kredit yo\'q', async () => {
  let p = await hire();
  await pl.handleCallback({ data: `pl:kl:${p.id}:30`, chatId: 'k200', now: new Date(T0.getTime() + 31 * DAY) });
  assert.equal((await M.Placement.findOne({}).lean()).status, 'left');
  assert.equal(await bal(), 4);

  await M.Placement.deleteMany({});
  await M.Shortlist.updateOne({ id: 's1' }, { $set: { 'items.0.state': 'revealed' } });
  process.env.REPLACE_GUARANTEE = '0';
  p = await hire();
  await pl.handleCallback({ data: `pl:cl:${p.id}:7`, chatId: 'c100', now: new Date(T0.getTime() + 3 * DAY) });
  assert.equal(await bal(), 4);
});

test('boshqa chatdan bosilgan tugma rad etiladi; 33 kundan keyin — done', async () => {
  const p = await hire();
  const r = await pl.handleCallback({ data: `pl:cl:${p.id}:7`, chatId: 'k200' });
  assert.equal(r.ok, false);
  assert.equal((await pl.tick(new Date(T0.getTime() + 34 * DAY))).done, 1);
  assert.equal((await M.Placement.findOne({}).lean()).status, 'done');
});

test('ishonchlilik: suhbatlar (kelgan/kelmagan) va ishda qolgani', async () => {
  await M.Interview.create([
    { id: 'i1', agencyId: A, clientId: 'cl1', candidateId: 'k1', shortlistId: 's1', status: 'done' },
    { id: 'i2', agencyId: A, clientId: 'cl1', candidateId: 'k1', shortlistId: 's1', status: 'noshow' },
    { id: 'i3', agencyId: A, clientId: 'cl1', candidateId: 'k1', shortlistId: 's1', status: 'declined' }
  ]);
  let r = await rel.forCandidates(A, ['k1']);
  assert.deepEqual(r.k1, { came: 1, total: 2, stayed: false });
  await M.Placement.create({ id: 'abcdef0123', agencyId: A, clientId: 'cl1', candidateId: 'k1', shortlistId: 's1', hiredAt: new Date(Date.now() - 40 * DAY), status: 'done' });
  r = await rel.forCandidates(A, ['k1']);
  assert.equal(r.k1.stayed, true);
});
