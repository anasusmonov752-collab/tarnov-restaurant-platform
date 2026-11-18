// ── Nomzod kabineti: «Arizalarim» (2026-11-18, Anas bilan) ──
// Har kartada: nomzod tilidagi sarlavha va restoran nomi, bitta holat + keyingi qadam,
// botdagi savollar javob kutyaptimi, faol suhbat, qaytarib olish.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, R = {};
const A = 'agCA';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Shortlist', 'Vacancy', 'Application', 'Interview', 'Restaurant'])
    M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x'; tg.sendMessage = async () => ({ message_id: 1 });
  const handler = (router, method, path) => {
    const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
    const hs = layer.route.stack.map(s => s.handle);
    return hs[hs.length - 1];                         // guard'ni chetlab
  };
  const cd = require('../src/routes/candidate');
  R.mine = handler(cd, 'get', '/applications');
  R.wd = handler(cd, 'post', '/applications/:id/withdraw');
  R.iv = handler(cd, 'post', '/interviews/:id/:op');

  await M.Restaurant.create({ id: A, name: 'TH', kind: 'agency', active: true, adminEmail: 'ca@t.uz', adminPassword: 'secret1' });
  await M.Client.create({ id: 'c1', agencyId: A, name: 'Tarnov', status: 'active', showName: true });
  await M.Vacancy.create([
    { id: 'vx', agencyId: A, clientId: 'c1', title: 'Xostess', role: 'xostess', status: 'open', listed: true,
      confirmedAt: new Date(), salaryFrom: 225000, salaryTo: 225000, salaryPeriod: 'day', payout: 'tenday', venue: '5 ta filial' },
    { id: 'vo', agencyId: A, clientId: 'c1', title: 'Ranner (ovqat tashuvchi)', role: 'ofitsiant', status: 'open', listed: true, confirmedAt: new Date() }
  ]);
  await M.Candidate.create({ id: 'k1', restaurantId: A, fullName: 'Aziza Karimova', phone: '+998901112233', tgChatId: '501', lang: 'ru' });
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const call = (h, req) => new Promise((resolve, reject) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, set() { return this; }, json(j) { resolve({ code: this.code, j }); } };
  const r = Object.assign({ params: {}, body: {}, query: {}, headers: {}, protocol: 'https', get: () => 'test.local', lang: 'ru' }, req);
  h(r, res, e => (e ? reject(e) : resolve({ code: 0 })));
});
const cand = () => M.Candidate.findOne({ id: 'k1' }).lean();

test('sarlavha nomzod tilida: lavozimning o\'zi tarjima qilinadi, qo\'shimchali nom — yo\'q', () => {
  const vac = require('../src/services/vacancy');
  assert.equal(vac.titleFor({ title: 'Xostess', role: 'xostess' }, 'ru'), 'Хостес');
  assert.equal(vac.titleFor({ title: 'xostess ', role: 'xostess' }, 'uz'), 'Xostess');
  assert.equal(vac.titleFor({ title: 'Ranner (ovqat tashuvchi)', role: 'ofitsiant' }, 'ru'), 'Ranner (ovqat tashuvchi)');
  assert.equal(vac.titleFor({ title: 'Xostess', role: 'xostess' }), 'Xostess');      // panel (tilsiz) — o'zgarmaydi
});

test('karta: restoran nomi, holat + keyingi qadam, botda qolgan savollar', async () => {
  await M.Application.create({ id: 'a1', agencyId: A, vacancyId: 'vx', candidateId: 'k1', clientId: 'c1', state: 'new',
    createdAt: new Date(Date.now() - 3600e3), agencySeenAt: new Date(), contactedAt: new Date(),
    screen: { step: 'start', startedAt: new Date() } });
  const { j } = await call(R.mine, { cand: await cand() });
  const a = j.find(x => x.id === 'a1');
  assert.equal(a.vacancy.title, 'Хостес');
  assert.equal(a.vacancy.employer, 'Tarnov');
  assert.equal(a.vacancy.payoutText, 'Выплата каждые 10 дней');
  assert.equal(a.stage, 'contacted');
  assert.equal(a.stateLabel, 'HR связался с вами');
  assert.match(a.next, /собеседование/);
  assert.deepEqual(a.screen, { left: 2, voice: false });                 // fit -> START -> commute
  assert.equal(a.canWithdraw, true);
  assert.deepEqual(a.steps.map(s => s.key), ['sent', 'reviewed', 'contacted']);
});

test('qaytarib olish: holat, bot savollari to\'xtaydi, ikkinchi marta — 409', async () => {
  const r = await call(R.wd, { cand: await cand(), params: { id: 'a1' } });
  assert.equal(r.j.ok, true);
  const db = await M.Application.findOne({ id: 'a1' }).lean();
  assert.equal(db.state, 'rejected');
  assert.equal(db.reason, 'withdrawn');
  assert.equal(db.screen.step, 'stopped');
  const { j } = await call(R.mine, { cand: await cand() });
  const a = j.find(x => x.id === 'a1');
  assert.equal(a.final, true);
  assert.equal(a.stage, 'withdrawn');
  assert.equal(a.stateLabel, 'Отклик отозван');
  assert.equal(a.canWithdraw, false);
  assert.equal(a.screen, null);
  assert.ok(!a.steps.some(s => s.key === 'closed'));                      // "boshqa nomzod tanlandi" emas
  assert.equal((await call(R.wd, { cand: await cand(), params: { id: 'a1' } })).code, 409);
  // Panel uchun ham neytral yozuv
  assert.equal(require('../src/services/appLife').stepsFor(db).stageLabel, 'Ariza qaytarib olindi');
});

test('tanlovga o\'tgan ariza qaytarib olinmaydi; faol suhbat va "Boraman"', async () => {
  const at = new Date(Date.now() + 26 * 3600e3);
  await M.Application.create({ id: 'a2', agencyId: A, vacancyId: 'vo', candidateId: 'k1', clientId: 'c1',
    state: 'shortlisted', shortlistId: 's1', decidedAt: new Date() });
  await M.Interview.create({ id: 'IVab12cd', agencyId: A, clientId: 'c1', candidateId: 'k1', shortlistId: 's1',
    vacancyId: 'vo', status: 'scheduled', mode: 'fixed', at, address: 'Sebzor, 12' });
  assert.equal((await call(R.wd, { cand: await cand(), params: { id: 'a2' } })).code, 409);

  let { j } = await call(R.mine, { cand: await cand() });
  let a = j.find(x => x.id === 'a2');
  assert.equal(a.canWithdraw, false);
  assert.equal(a.interview.id, 'IVab12cd');
  assert.equal(a.interview.place, 'Tarnov');
  assert.equal(a.interview.address, 'Sebzor, 12');
  assert.match(a.interview.map, /^https:\/\/yandex\.uz\/maps\/\?text=/);
  assert.equal(a.interview.confirmed, false);

  const r = await call(R.iv, { cand: await cand(), params: { id: 'IVab12cd', op: 'y' } });
  assert.equal(r.j.ok, true);
  ({ j } = await call(R.mine, { cand: await cand() }));
  a = j.find(x => x.id === 'a2');
  assert.equal(a.interview.status, 'confirmed');
  assert.equal(a.interview.confirmed, true);

  // Begona amal va boshqa odamning suhbati
  assert.equal((await call(R.iv, { cand: await cand(), params: { id: 'IVab12cd', op: 'kg' } })).code, 400);
  const other = Object.assign(await cand(), { tgChatId: '999' });
  assert.equal((await call(R.iv, { cand: other, params: { id: 'IVab12cd', op: 'y' } })).code, 409);
});
