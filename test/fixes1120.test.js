// ── 2026-11-20 tekshiruvi tuzatishlari (pul, to'lov, anketa, qidiruv, suhbat) ──
// Har test bitta topilmani himoya qiladi: qaytib kelsa — shu yerda yiqiladi.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, sl, sent = [];
const A = 'agFX';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Shortlist', 'CreditLedger', 'Order', 'Restaurant', 'Vacancy', 'Application', 'Interview'])
    M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async (tok, chat, text) => { sent.push({ chat, text }); return { message_id: 1 }; };
  sl = require('../src/services/shortlist');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  sent = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true,
    adminEmail: 'fx@test.uz', adminPassword: 'secret1', telegram: { adminChatId: 'adm' } });
  await M.Client.create({ id: 'cl1', agencyId: A, name: 'Rayhon', credits: 5, status: 'active' });
  await M.Candidate.create({ id: 'k1', restaurantId: A, fullName: 'Aziza Karimova', phone: '+998901112233', publicCode: 'A-1111' });
});
const bal = async () => (await M.Client.findOne({ id: 'cl1' }).lean()).credits;

test('ikki tanlovda BIR VAQTDA ochish: kontakt bepul ochilib ketmaydi', async () => {
  await M.Shortlist.create([
    { id: 's1', agencyId: A, clientId: 'cl1', items: [{ candidateId: 'k1', state: 'selected' }] },
    { id: 's2', agencyId: A, clientId: 'cl1', items: [{ candidateId: 'k1', state: 'selected' }] }
  ]);
  const [a, b] = await Promise.allSettled([
    sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' }),
    sl.reveal({ agencyId: A, shortlistId: 's2', candidateId: 'k1' })
  ]);
  assert.equal(a.status, 'fulfilled'); assert.equal(b.status, 'fulfilled');
  const charged = await M.CreditLedger.countDocuments({ reason: 'reveal' });
  assert.ok(charged >= 1, 'kamida bitta ochilish pullik');
  assert.equal(await bal(), 5 - charged);
});

test('pullik ochilish qaytarilsa — bepul nusxa ham yopiladi', async () => {
  await M.Shortlist.create([
    { id: 's1', agencyId: A, clientId: 'cl1', items: [{ candidateId: 'k1', state: 'candidate_ok' }] },
    { id: 's2', agencyId: A, clientId: 'cl1', items: [{ candidateId: 'k1', state: 'candidate_ok' }] }
  ]);
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  const r2 = await sl.reveal({ agencyId: A, shortlistId: 's2', candidateId: 'k1' });
  assert.equal(r2.openedBefore, true);
  assert.equal(await bal(), 4);
  await sl.refund({ agencyId: A, shortlistId: 's1', candidateId: 'k1', reason: 'dead_phone' });
  assert.equal(await bal(), 5);
  const s2 = await M.Shortlist.findOne({ id: 's2' }).lean();
  assert.equal(s2.items[0].state, 'refunded', 'kredit qaytgach kontakt tekin qolmasin');
});

test('Payme: buyurtma boshqa yo\'l bilan to\'langan — PerformTransaction pul yechmaydi', async () => {
  process.env.PAYME_MERCHANT_ID = process.env.PAYME_MERCHANT_ID || 'mfx';
  process.env.PAYME_KEY = 'fx-key';
  const billing = require('../src/services/billing');
  const client = await M.Client.findOne({ id: 'cl1' });
  const o = await billing.createOrder({ client, planKey: 'base', provider: 'payme' });
  const now = Date.now();
  await M.Order.updateOne({ id: o.id }, { $set: { paymeId: 'tx1', paymeState: 1, paymeCreateTime: now, paymeTime: now } });
  await billing.activate(o.id, { by: 'click' });                   // shu orada Click bilan to'landi
  const payme = require('../src/services/payme');
  const auth = 'Basic ' + Buffer.from('Paycom:fx-key').toString('base64');
  const res = await payme.handle({ id: 1, method: 'PerformTransaction', params: { id: 'tx1' } }, auth, now);
  assert.equal(res.error && res.error.code, -31008, 'Payme pulni yechmasligi kerak');
  const fresh = await M.Order.findOne({ id: o.id }).lean();
  assert.notEqual(fresh.paymeState, 2);
  assert.equal(fresh.paidBy, 'click');
});

test('anketani yakunlash ikki marta bosilsa — bitta nomzod', async () => {
  const survey = require('../src/services/survey');
  for (const n of ['Survey', 'SurveyResponse']) { M[n] = require('../src/models/' + n); await M[n].syncIndexes(); await M[n].deleteMany({}); }
  await survey.ensureDefault(A);
  const s = await M.Survey.findOne({ agencyId: A, isDefault: true }).lean();
  const r = await M.SurveyResponse.create({ id: 'rf1', agencyId: A, surveyId: s.id, tgUserId: '9001', chatId: '9001',
    status: 'started', answers: { fullName: 'Ali Valiyev', consent: true } });
  const out = await Promise.allSettled([survey.finalize(r, {}), survey.finalize(r, {})]);
  assert.equal(out.filter(x => x.status === 'fulfilled').length, 1);
  assert.ok(out.some(x => x.status === 'rejected' && x.reason.already));
  assert.equal(await M.Candidate.countDocuments({ tgChatId: '9001' }), 1);
});

test('yosh Toshkent kalendari bo\'yicha: tug\'ilgan kun yarim tunda almashadi', () => {
  const survey = require('../src/services/survey');
  const q = { id: 'birthDate', type: 'date', required: true };
  // checkAnswer bugungi sana bilan ishlaydi — 16 yoshga to'lishiga 1 kun qolgan odam rad etiladi
  const now = new Date(Date.now() + 5 * 36e5);
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear() - 16, now.getUTCMonth(), now.getUTCDate() + 1));
  const iso = tomorrow.toISOString().slice(0, 10);
  assert.throws(() => survey.checkAnswer(q, iso));
});

test('qidiruv: maosh shifti qo\'llanadi, maoshi noma\'lum tushib qolmaydi', async () => {
  await M.Candidate.create([
    { id: 'm1', restaurantId: A, fullName: 'Arzon', role: 'ofitsiant', salaryExpectation: '4 mln' },
    { id: 'm2', restaurantId: A, fullName: 'Qimmat', role: 'ofitsiant', salaryExpectation: '9 mln' },
    { id: 'm3', restaurantId: A, fullName: 'Noma\'lum', role: 'ofitsiant' }
  ]);
  const cs = require('../src/services/candidateSearch');
  const crit = Object.assign({}, cs.EMPTY, { role: 'ofitsiant', maxSalary: 5e6 });
  const r = await cs.search(crit, A, { limit: 10 });
  const ids = r.rows.map(c => c.id).sort();
  assert.deepEqual(ids, ['m1', 'm3']);
  const m2 = await M.Candidate.findOne({ id: 'm2' }).lean();
  assert.equal(m2.salaryMin, 9e6);
});

test('qaytarib olingan ariza qayta topshiriladi (abadiy yopilmaydi)', async () => {
  const applications = require('../src/services/applications');
  const v = await M.Vacancy.create({ id: 'v1', agencyId: A, clientId: 'cl1', title: 'Ofitsiant', role: 'ofitsiant', status: 'open' });
  const cand = await M.Candidate.findOne({ id: 'k1' });
  const a = await applications.submit({ cand, vacancy: v.toObject(), appBase: '' });
  await M.Application.updateOne({ id: a.id }, { $set: { state: 'rejected', reason: 'withdrawn' } });
  const b = await applications.submit({ cand, vacancy: v.toObject(), appBase: '' });
  assert.equal(b.id, a.id);
  const saved = await M.Application.findOne({ id: a.id }).lean();
  assert.equal(saved.state, 'new');
  assert.equal(await M.Application.countDocuments({}), 1);
});

test('suhbat vaqtini o\'zgartirish: noto\'g\'ri vaqt eski suhbatni bekor qilmaydi', async () => {
  const iv = require('../src/services/interviews');
  if (typeof iv.offer !== 'function') return;
  await M.Candidate.updateOne({ id: 'k1' }, { $set: { tgChatId: '7001', tgState: 'linked' } });
  await M.Shortlist.create({ id: 's1', agencyId: A, clientId: 'cl1', items: [{ candidateId: 'k1', state: 'revealed', revealedAt: new Date() }] });
  const at = new Date(Date.now() + 3 * 864e5);
  await M.Interview.create({ id: 'iv1', agencyId: A, clientId: 'cl1', candidateId: 'k1', shortlistId: 's1', status: 'scheduled', at });
  await assert.rejects(() => iv.offer({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k1', now: new Date(),
    mode: 'fixed', at: new Date(Date.now() + 10 * 60e3).toISOString() }), /30 daqiqadan/);
  const old = await M.Interview.findOne({ id: 'iv1' }).lean();
  assert.equal(old.status, 'scheduled', 'eski suhbat joyida qoladi');
});
