// ── NOMZOD YO'LI ANALITIKASI (services/track) ────────────────
// Asosiy shartlar: voronka KOHORTA bo'yicha (foiz 100% dan oshmaydi),
// sinov yozuvlari kirmaydi, takroriy ko'rish bitta, hodisa yozish asosiy
// oqimni hech qachon buzmaydi.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, track;
const A = 'agAN';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Event', 'Vacancy', 'Client', 'Candidate', 'SurveyResponse', 'Survey', 'Restaurant', 'Application'])
    M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  track = require('../src/services/track');
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async () => ({ message_id: 1 });
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });
beforeEach(async () => { await Promise.all(Object.values(M).map(m => m.deleteMany({}))); });

const ev = (tgUserId, kind, x = {}) => track.record(kind, Object.assign({ agencyId: A, tgUserId }, x));

test('voronka kohorta bo\'yicha: davrda kirganlar qaysi bosqichga yetgan', async () => {
  await ev('a', 'start', { channel: 'sms' }); await ev('a', 'open'); await ev('a', 'done'); await ev('a', 'apply', { ref: 'v1' });
  await ev('b', 'start', { channel: 'sms' });
  await ev('c', 'start', { channel: 'ig' }); await ev('c', 'voice');          // ovoz ham "ochdi" hisoblanadi
  await ev('d', 'done');                                                       // davrda kirmagan — kohortada yo'q
  await ev('t', 'start', { channel: 'sms', isTest: true }); await ev('t', 'done', { isTest: true });  // sinov

  const f = await track.funnel(A, 7);
  assert.deepEqual(f.total, { start: 3, open: 2, done: 1, apply: 1 });
  const sms = f.channels.find(c => c.channel === 'sms');
  assert.deepEqual([sms.start, sms.open, sms.done, sms.apply], [2, 1, 1, 1]);
  const ig = f.channels.find(c => c.channel === 'ig');
  assert.deepEqual([ig.start, ig.open, ig.done], [1, 1, 0]);
});

test('eski kirish davrdan tashqarida — voronkaga kirmaydi', async () => {
  await ev('old', 'start', { at: new Date(Date.now() - 20 * 864e5) });
  await ev('old', 'done');
  assert.equal((await track.funnel(A, 7)).total.start, 0);
  assert.equal((await track.funnel(A, 30)).total.start, 1);
});

test('vakansiya: 30 daqiqada takroriy ko\'rish bitta, kim ko\'rgani va ariza', async () => {
  await ev('u1', 'view', { ref: 'v1', name: 'Aziza' });
  await ev('u1', 'view', { ref: 'v1', name: 'Aziza' });                       // takror — yozilmaydi
  await ev('u2', 'view', { ref: 'v1', name: 'Jasur' });
  await ev('u2', 'apply', { ref: 'v1', name: 'Jasur' });
  await ev('u3', 'view', { ref: 'v2', name: 'Nodira' });
  assert.equal(await M.Event.countDocuments({ kind: 'view', ref: 'v1' }), 2);

  const vs = await track.vacancies(A, 7);
  const v1 = vs.find(v => v.vacancyId === 'v1');
  assert.equal(v1.views, 2);
  assert.equal(v1.applies, 1);
  assert.deepEqual(v1.recent.map(r => r.name).sort(), ['Aziza', 'Jasur']);
  assert.equal(vs[0].vacancyId, 'v1');                                         // ko'p ko'rilgani tepada
});

test('yozish xatosi asosiy oqimni buzmaydi', async () => {
  // agencyId yo'q — jim qaytadi, istisno chiqmaydi
  await track.track('start', { tgUserId: '1' });
  await track.track('nomalum', { agencyId: A, tgUserId: '1' });
  assert.equal(await M.Event.countDocuments({}), 0);
});

test('lavozim tanlash va ariza o\'z joyida yoziladi', async () => {
  await M.Restaurant.create({ id: A, name: 'TH', kind: 'agency', active: true, adminEmail: 'an@t.uz', adminPassword: 'secret1' });
  await require('../src/services/survey').ensureDefault(A);
  const ft = require('../src/services/firstTouch');
  await ft.candidateRole({ agencyId: A, role: 'xostess', lang: 'uz', tgUserId: '77', chatId: '77', appBase: 'https://x', name: 'Malika' });
  await new Promise(r => setTimeout(r, 50));                                   // track kutilmaydi
  const role = await M.Event.findOne({ kind: 'role' }).lean();
  assert.equal(role.ref, 'xostess');
  assert.equal(role.name, 'Malika');

  const v = await M.Vacancy.create({ id: 'vx', agencyId: A, clientId: 'c', title: 'Xostess', role: 'xostess' });
  const c = await M.Candidate.create({ id: 'cx', restaurantId: A, fullName: 'Malika K', tgChatId: '77', phone: '+998901112233' });
  await require('../src/services/applications').submit({ cand: c, vacancy: v, appBase: 'https://x' });
  await new Promise(r => setTimeout(r, 50));
  const ap = await M.Event.findOne({ kind: 'apply' }).lean();
  assert.equal(ap.ref, 'vx');
  assert.equal(ap.tgUserId, '77');
  assert.equal(ap.candidateId, 'cx');
});

test('panel javobi: savol nomi, lavozim nomi, vakansiya sarlavhasi', async () => {
  await M.Restaurant.create({ id: A, name: 'TH', kind: 'agency', active: true, adminEmail: 'an2@t.uz', adminPassword: 'secret1' });
  const sv = await require('../src/services/survey').ensureDefault(A);
  await M.Client.create({ id: 'c1', agencyId: A, name: 'Tarnov' });
  await M.Vacancy.create({ id: 'v1', agencyId: A, clientId: 'c1', title: 'Xostess', role: 'xostess' });
  await ev('a', 'start', { channel: 'sms', name: 'Aziza' });
  await ev('a', 'role', { ref: 'xostess' });
  await ev('a', 'view', { ref: 'v1', name: 'Aziza' });
  await M.SurveyResponse.create({ id: 'r1', agencyId: A, surveyId: sv.id, tgUserId: 'a', status: 'started', step: 'salary' });

  const ag = require('../src/routes/agency');
  const layer = ag.stack.find(l => l.route && l.route.path === '/analytics');
  const h = layer.route.stack[layer.route.stack.length - 1].handle;
  let out; await h({ user: { restaurantId: A }, query: { days: '7' } }, { json: j => { out = j; } }, e => { throw e; });

  assert.equal(out.funnel.start, 1);
  assert.equal(out.channels[0].label, 'SMS taklifi');
  assert.equal(out.roles[0].label, 'Xostess');
  assert.equal(out.vacancies[0].title, 'Xostess');
  assert.equal(out.vacancies[0].client, 'Tarnov');
  assert.ok(out.dropAt.find(d => d.step === 'salary' && d.label && d.label !== 'salary'), JSON.stringify(out.dropAt));
  assert.equal(out.recent[0].label, track.KINDS.view);
});
