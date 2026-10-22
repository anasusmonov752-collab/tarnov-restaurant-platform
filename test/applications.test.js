// ── Ariza oqimi: nomzod yuboradi -> agentlik ko'radi/bog'lanadi -> taklif ──
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, R = {};
const A = 'agA';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Shortlist', 'Vacancy', 'Application']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const handler = (router, method, path) => {
    const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
    const hs = layer.route.stack.map(s => s.handle);
    return hs[hs.length - 1];                         // guard'ni chetlab
  };
  const cd = require('../src/routes/candidate'), vc = require('../src/routes/vacancies');
  R.apply = handler(cd, 'post', '/vacancies/:id/apply');
  R.mine = handler(cd, 'get', '/applications');
  R.inbox = handler(vc, 'get', '/applications/inbox');
  R.mark = handler(vc, 'post', '/applications/:appId/:mark(seen|contacted)');
  R.act = handler(vc, 'post', '/:id/applications/:appId/:action');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const call = (h, req) => new Promise((resolve, reject) => {
  const res = { code: 200, headers: {}, status(c) { this.code = c; return this; }, set(k, v) { this.headers[k] = v; return this; },
    json(j) { resolve({ code: this.code, j }); } };
  const r = Object.assign({ user: { restaurantId: A }, params: {}, body: {}, query: {}, headers: {}, protocol: 'https',
    get: () => 'test.local' }, req);
  h(r, res, e => (e ? reject(e) : resolve({ code: 0 })));
});

test('bosqichlar: yuborildi -> ko\'rildi -> bog\'landi -> taklif -> suhbat -> natija', () => {
  const life = require('../src/services/appLife');
  const t0 = new Date('2026-10-22T10:00:00Z');
  let s = life.stepsFor({ createdAt: t0, state: 'new' });
  assert.deepEqual(s.steps.map(x => x.key), ['sent']);
  assert.equal(s.tone, 'wait');
  s = life.stepsFor({ createdAt: t0, state: 'new', agencySeenAt: t0, contactedAt: t0 });
  assert.deepEqual(s.steps.map(x => x.key), ['sent', 'reviewed', 'contacted']);
  s = life.stepsFor({ createdAt: t0, state: 'shortlisted', decidedAt: t0 },
    { state: 'interview', interviewAt: new Date('2026-10-24T10:00:00Z') });
  assert.equal(s.stage, 'interview');
  assert.equal(s.stageLabel, 'Suhbat: 24-oktabr, 15:00');      // Toshkent vaqti
  s = life.stepsFor({ createdAt: t0, state: 'shortlisted', decidedAt: t0 }, { state: 'hired', interviewAt: t0, decidedAt: t0 });
  assert.equal(s.stage, 'hired'); assert.equal(s.final, true); assert.equal(s.tone, 'ok');
  s = life.stepsFor({ createdAt: t0, state: 'rejected', decidedAt: t0 });
  assert.equal(s.stage, 'closed'); assert.equal(s.tone, 'no');
});

test('ariza: aniq xato kodlari, muvaffaqiyat, takror', async () => {
  await M.Client.create({ id: 'c1', agencyId: A, name: 'Restoran', status: 'pending' });
  await M.Vacancy.create([
    { id: 'v1', agencyId: A, clientId: 'c1', title: 'Ofitsiant', status: 'open' },
    { id: 'v0', agencyId: A, clientId: 'c1', title: 'Yopiq', status: 'closed' }
  ]);
  const noName = await M.Candidate.create({ id: 'k0', restaurantId: A, phone: '+998901112233' });
  let r = await call(R.apply, { cand: noName, params: { id: 'v1' } });
  assert.equal(r.code, 400); assert.equal(r.j.code, 'no_name');

  const k = await M.Candidate.create({ id: 'k1', restaurantId: A, fullName: 'Aziz', phone: '12' });
  r = await call(R.apply, { cand: k, params: { id: 'v1' } });
  assert.equal(r.j.code, 'bad_phone');
  k.phone = '+998 90 111 22 33'; await k.save();
  r = await call(R.apply, { cand: k, params: { id: 'v0' } });
  assert.equal(r.code, 404); assert.equal(r.j.code, 'closed');

  r = await call(R.apply, { cand: k, params: { id: 'v1' }, body: { message: '  2 yil tajriba  ' } });
  assert.equal(r.code, 200);
  const a = await M.Application.findOne({ id: r.j.id }).lean();
  assert.equal(a.message, '2 yil tajriba');
  r = await call(R.apply, { cand: k, params: { id: 'v1' } });
  assert.equal(r.code, 409); assert.equal(r.j.code, 'duplicate');

  const mine = (await call(R.mine, { cand: k })).j;
  assert.equal(mine[0].stateLabel, 'Ariza yuborildi');
  assert.deepEqual(mine[0].steps.map(s => s.key), ['sent']);
});

test('panel: kirish qutisi, ko\'rildi/bog\'landim va taklif — nomzod bosqichi yangilanadi', async () => {
  let box = (await call(R.inbox, {})).j;
  assert.equal(box.counts.new, 1); assert.equal(box.counts.unseen, 1);
  const it = box.items[0];
  assert.equal(it.tab, 'new'); assert.equal(it.client.status, 'pending');
  assert.equal(it.candidate.fullName, 'Aziz');

  await call(R.mark, { params: { appId: it.id, mark: 'seen' } });
  const seen1 = (await M.Application.findOne({ id: it.id }).lean()).agencySeenAt;
  await call(R.mark, { params: { appId: it.id, mark: 'seen' } });          // ikkinchi marta surmaydi
  assert.equal(+(await M.Application.findOne({ id: it.id }).lean()).agencySeenAt, +seen1);
  await call(R.mark, { params: { appId: it.id, mark: 'contacted' } });
  box = (await call(R.inbox, {})).j;
  assert.equal(box.counts.unseen, 0); assert.equal(box.items[0].tab, 'work');
  assert.equal(box.items[0].stage, 'contacted');
  assert.equal((await call(R.mark, { params: { appId: 'yoq', mark: 'seen' } })).code, 404);

  const r = await call(R.act, { params: { id: 'v1', appId: it.id, action: 'shortlist' } });
  assert.equal(r.code, 200);
  const k = await M.Candidate.findOne({ id: 'k1' });
  const mine = (await call(R.mine, { cand: k })).j;
  assert.deepEqual(mine[0].steps.map(s => s.key), ['sent', 'reviewed', 'contacted', 'proposed']);
  assert.equal(mine[0].stateLabel, 'Ish beruvchiga taklif qilindi');
});

test('/start birinchi xabari: ism, haqiqiy ochiq ishlar soni va lavozimlar, uz/ru, HTML xavfsiz', async () => {
  const { hookText } = require('../src/routes/telegram');
  await M.Vacancy.create([
    { id: 'h1', agencyId: 'agH', clientId: 'c', title: 'Ofitsiant', role: 'ofitsiant', status: 'open' },
    { id: 'h2', agencyId: 'agH', clientId: 'c', title: 'Ofitsiant 2', role: 'ofitsiant', status: 'open' },
    { id: 'h3', agencyId: 'agH', clientId: 'c', title: 'Oshpaz', role: 'oshpaz', status: 'open' },
    { id: 'h4', agencyId: 'agH', clientId: 'c', title: 'Yopiq', role: 'kassir', status: 'closed' },
    { id: 'h5', agencyId: 'agH', clientId: 'c', title: 'Yashirin', role: 'xostess', status: 'open', listed: false }
  ]);
  const uz = await hookText({ lang: 'uz', from: { first_name: 'Ali<b>' }, agencyId: 'agH' });
  assert.match(uz, /Assalomu alaykum, Ali&lt;b&gt;!/);
  assert.match(uz, /<b>3 ta ochiq ish<\/b>: ofitsiant, oshpaz\./);      // yopiq va yashirin sanalmaydi
  assert.ok(!/\n{3,}/.test(uz));
  assert.match(uz, /xodim tanlash xizmati\.\nRestoranlar bizga/);       // kimmiz + qanday ishlaymiz
  const ru = await hookText({ lang: 'ru', from: {}, agencyId: 'agH', v: { title: 'Ofitsiant', role: 'ofitsiant' } });
  assert.match(ru, /^👋 Здравствуйте!/);
  assert.match(ru, /открыто <b>3 вакансии<\/b>/);
  assert.match(ru, /по вакансии <b>«/);
  const empty = await hookText({ lang: 'uz', from: {}, agencyId: 'yoq' });
  assert.ok(!/ochiq ish/.test(empty));                                   // ish yo'q — raqam aytilmaydi
});
