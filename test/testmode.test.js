// ── Admin test rejimi: bitta akkauntdan mijoz / nomzod / admin ──
// Rejim almashganda sinov yozuvlari akkauntga qayta ulanadi; admin rejimida
// oldingi holat tiklanadi. Sinov haqiqiy ma'lumotga tegmasligi shart.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, tm, survey;
const U = '700100';                    // admin Telegram akkaunti
let A;                                 // agentlik id

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Restaurant', 'Client', 'Candidate', 'Shortlist', 'Vacancy', 'SurveyResponse', 'Survey', 'TestMode', 'CreditLedger']) {
    M[n] = require('../src/models/' + n);
  }
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  tm = require('../src/services/testMode');
  survey = require('../src/services/survey');
  const ag = await M.Restaurant.create({ name: 'TalentHub', category: 'agency', kind: 'agency',
    adminEmail: 'th@test.local', adminPassword: 'x', telegram: { adminChatId: U } });
  A = ag.id;
  // Test rejimidan oldin admin akkaunti haqiqiy (eski sinov) mijozga ulangan
  await M.Client.create({ id: 'c-real', agencyId: A, name: 'Sinov 2', status: 'active', tgChatId: U });
  // Bazadagi haqiqiy nomzod — telefoni admin telefoni bilan bir xil
  await M.Candidate.create({ id: 'k-real', restaurantId: A, fullName: 'Haqiqiy Odam', role: 'ofitsiant', phone: '+998 90 111 22 33', phoneKey: '901112233' });
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const linked = async () => ({
  clients: (await M.Client.find({ tgChatId: U }).lean()).map(c => c.id),
  cands: (await M.Candidate.find({ tgChatId: U }).lean()).map(c => c.id)
});

test('faqat agentlik admini', async () => {
  await assert.rejects(() => tm.setMode('999', 'client'), e => e.status === 403);
  assert.equal(await tm.modeOf('999'), 'admin');
});

let testClientId, testCandId;
test('mijoz rejimi: sinov mijozi ulanadi, haqiqiy ulanish eslab qolinadi', async () => {
  const out = await tm.setMode(U, 'client', { username: 'tarnovhr' });
  assert.equal(out.client.isTest, true);
  assert.equal(out.client.credits, tm.TEST_CREDITS);                // kredit jurnal orqali
  assert.equal(await M.CreditLedger.countDocuments({ clientId: out.client.id }), 1);
  testClientId = out.client.id;
  assert.deepEqual(await linked(), { clients: [testClientId], cands: [] });
  const st = await tm.state(U);
  assert.deepEqual(st.saved.clients, ['c-real']);
});

test('nomzod rejimi: sinov nomzodi yo\'q — hech kimga ulanmaydi; anketadan sinov nomzodi', async () => {
  const out = await tm.setMode(U, 'candidate');
  assert.equal(out.candidate, undefined);
  assert.deepEqual(await linked(), { clients: [], cands: [] });

  // Anketa (bot startSurvey test rejimida isTest qo'yadi) — Telegram tasdiqlagan telefon
  // haqiqiy nomzodniki bilan bir xil, lekin sinov anketasi unga ULANMASLIGI kerak
  const s = await survey.ensureDefault(A);
  const r = await M.SurveyResponse.create({ id: 'r1', agencyId: A, surveyId: s.id, tgUserId: U, chatId: U, isTest: true,
    answers: { role: 'ofitsiant', fullName: 'Sinov Nomzod', lastJob: 'none' },
    phone: '+998901112233', phoneVerifiedAt: new Date() });
  const fin = await survey.finalize(r.toObject());
  assert.equal(fin.created, true);
  assert.notEqual(fin.candidate.id, 'k-real');
  assert.equal(fin.candidate.isTest, true);
  testCandId = fin.candidate.id;
  assert.equal((await tm.state(U)).candidateId, testCandId);
  assert.equal((await M.Candidate.findOne({ id: 'k-real' }).lean()).tgChatId || '', '');
});

test('admin rejimi: oldingi holat tiklanadi; nomzod rejimi sinov nomzodini qayta ulaydi', async () => {
  await tm.setMode(U, 'admin');
  assert.deepEqual(await linked(), { clients: ['c-real'], cands: [] });
  const out = await tm.setMode(U, 'candidate');
  assert.equal(out.candidate.id, testCandId);
  assert.deepEqual(await linked(), { clients: [], cands: [testCandId] });
  // Mijozga o'tib qaytganda ham saqlangan haqiqiy ulanish yo'qolmaydi
  await tm.setMode(U, 'client');
  await tm.setMode(U, 'admin');
  assert.deepEqual(await linked(), { clients: ['c-real'], cands: [] });
});

test('anketani qaytadan: javoblar o\'chadi, akkaunt yangi odam', async () => {
  const out = await tm.resetSurvey(U);
  assert.equal(out.deleted, 1);
  assert.equal(await tm.modeOf(U), 'candidate');
  assert.deepEqual(await linked(), { clients: [], cands: [] });
  assert.equal((await tm.state(U)).candidateId, '');
  assert.equal(await M.Candidate.countDocuments({ id: testCandId, isTest: true }), 1);   // panelda SINOV bo'lib qoladi
  await tm.setMode(U, 'admin');
  assert.deepEqual(await linked(), { clients: ['c-real'], cands: [] });
});

test('himoya: sinov mijozi haqiqiy nomzodni ocha olmaydi, sinov nomzodini ochadi', async () => {
  const sl = require('../src/services/shortlist');
  await M.Shortlist.create({ id: 's1', agencyId: A, clientId: testClientId,
    items: [{ candidateId: 'k-real', state: 'candidate_ok' }, { candidateId: testCandId, state: 'candidate_ok' }] });
  const before = (await M.Client.findOne({ id: testClientId }).lean()).credits;
  await assert.rejects(() => sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k-real' }), /Sinov rejimi/);
  const s1 = await M.Shortlist.findOne({ id: 's1' }).lean();
  assert.equal(s1.items.find(i => i.candidateId === 'k-real').state, 'candidate_ok');   // holat o'zgarmadi
  assert.equal((await M.Client.findOne({ id: testClientId }).lean()).credits, before); // kredit yechilmadi
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: testCandId });
  assert.equal((await M.Client.findOne({ id: testClientId }).lean()).credits, before - 1);
});

test('ajratish: sinov vakansiyasi va sinov nomzodi haqiqiylarga ko\'rinmaydi', async () => {
  const v1 = await M.Vacancy.create({ id: 'v-test', agencyId: A, clientId: testClientId, title: 'Ofitsiant', role: 'ofitsiant' });
  const v2 = await M.Vacancy.create({ id: 'v-real', agencyId: A, clientId: 'c-real', title: 'Ofitsiant', role: 'ofitsiant' });
  assert.equal(v1.isTest, true);
  assert.equal(v2.isTest, false);

  const cs = require('../src/services/candidateSearch');
  const crit = Object.assign({}, cs.EMPTY, { role: 'ofitsiant' });
  const ids = r => r.rows.map(x => x.id);
  assert.ok(!ids(await cs.search(crit, A)).includes(testCandId));                     // haqiqiy mijoz
  assert.ok(ids(await cs.search(Object.assign({ includeTest: true }, crit), A)).includes(testCandId));  // sinov mijozi
});
