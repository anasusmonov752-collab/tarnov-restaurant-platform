// ── Panel ish oqimi (2-bosqich): taklif, natija, arizalar ────
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, routes = {};

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Shortlist', 'Vacancy', 'Application']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const handler = (router, method, path) => {
    const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
    const hs = layer.route.stack.map(s => s.handle);
    return hs[hs.length - 1];                         // agentlik guard'ini chetlab
  };
  const sl = require('../src/routes/shortlists'), vc = require('../src/routes/vacancies');
  routes.propose = handler(sl, 'post', '/');
  routes.outcome = handler(sl, 'post', '/:id/outcome/:candidateId');
  routes.appAct = handler(vc, 'post', '/:id/applications/:appId/:action');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const A = 'ag1';
const call = (h, params, body) => new Promise((resolve, reject) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j }); } };
  h({ user: { restaurantId: A }, params, body: body || {} }, res, e => (e ? reject(e) : resolve({ code: 0 })));
});

test('mijozga taklif: tanlov yaratiladi, takror va begona id tashlanadi', async () => {
  await M.Client.create({ id: 'cl1', agencyId: A, name: 'Rayhon', status: 'active' });
  await M.Candidate.create([{ id: 'k1', restaurantId: A }, { id: 'k2', restaurantId: A }, { id: 'kx', restaurantId: 'boshqa' }]);
  const r = await call(routes.propose, {}, { clientId: 'cl1', candidateIds: ['k1', 'k2', 'k1', 'kx', 'yoq'], summary: '2 ta xostess' });
  assert.equal(r.code, 200);
  assert.equal(r.j.count, 2);
  const row = await M.Shortlist.findOne({ id: r.j.id }).lean();
  assert.deepEqual(row.items.map(i => [i.candidateId, i.state]), [['k1', 'selected'], ['k2', 'selected']]);
  assert.equal(row.summary, '2 ta xostess');
  assert.equal((await call(routes.propose, {}, { clientId: 'yoq', candidateIds: ['k1'] })).code, 404);
  assert.equal((await call(routes.propose, {}, { clientId: 'cl1', candidateIds: ['kx'] })).code, 400);
});

test('natijani agentlik belgilaydi: faqat ochilgandan keyin, yakuniy qayta o\'zgarmaydi', async () => {
  await M.Shortlist.create({ id: 's9', agencyId: A, clientId: 'cl1', items: [{ candidateId: 'k1', state: 'selected' }] });
  let r = await call(routes.outcome, { id: 's9', candidateId: 'k1' }, { state: 'hired' });
  assert.equal(r.code, 400);                                             // kontakt ochilmagan
  await M.Shortlist.updateOne({ id: 's9' }, { $set: { 'items.0.state': 'revealed' } });
  r = await call(routes.outcome, { id: 's9', candidateId: 'k1' }, { state: 'interview' });
  assert.equal(r.code, 400);                                             // sanasiz suhbat
  r = await call(routes.outcome, { id: 's9', candidateId: 'k1' }, { state: 'interview', interviewAt: new Date(Date.now() + 864e5).toISOString() });
  assert.equal(r.code, 200);
  r = await call(routes.outcome, { id: 's9', candidateId: 'k1' }, { state: 'hired' });
  assert.equal(r.code, 200);
  assert.equal((await M.Shortlist.findOne({ id: 's9' }).lean()).items[0].state, 'hired');
  r = await call(routes.outcome, { id: 's9', candidateId: 'k1' }, { state: 'not_fit', reason: 'other' });
  assert.equal(r.code, 400);                                             // yakuniy
});

test('ariza: tanlovga qo\'shish (mijozning vakansiya tanlovi) va rad etish', async () => {
  await M.Vacancy.create({ id: 'v1', agencyId: A, clientId: 'cl1', title: 'Xostess', status: 'open' });
  await M.Application.create([
    { id: 'a1', agencyId: A, clientId: 'cl1', vacancyId: 'v1', candidateId: 'k2', state: 'new' },
    { id: 'a2', agencyId: A, clientId: 'cl1', vacancyId: 'v1', candidateId: 'k1', state: 'seen' }
  ]);
  let r = await call(routes.appAct, { id: 'v1', appId: 'a1', action: 'shortlist' });
  assert.equal(r.code, 200);
  const sl = await M.Shortlist.findOne({ id: r.j.shortlistId }).lean();
  assert.equal(sl.vacancyId, 'v1');
  assert.deepEqual(sl.items.map(i => i.candidateId), ['k2']);
  assert.equal((await M.Application.findOne({ id: 'a1' }).lean()).state, 'shortlisted');
  r = await call(routes.appAct, { id: 'v1', appId: 'a1', action: 'shortlist' });
  assert.equal(r.code, 400);                                             // qaror qabul qilingan
  r = await call(routes.appAct, { id: 'v1', appId: 'a2', action: 'reject' });
  assert.equal(r.code, 200);
  assert.equal((await M.Application.findOne({ id: 'a2' }).lean()).state, 'rejected');
  assert.equal((await call(routes.appAct, { id: 'v1', appId: 'a2', action: 'boshqa' })).code, 400);
});
