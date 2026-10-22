// ── Nomzodlar bo'limlari: "Anketadan" va "hh.uz bazasi" ──────
// Ko'rilmagan / javobsiz qoidasi (services/contactLog) va manba filtri.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, Candidate, routes = {};
const A = 'agS';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  Candidate = require('../src/models/Candidate');
  await Candidate.syncIndexes();
  const handler = (router, method, path) => {
    const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
    const hs = layer.route.stack.map(s => s.handle);
    return hs[hs.length - 1];                         // agentlik guard'ini chetlab
  };
  const rc = require('../src/routes/recruitment'), ag = require('../src/routes/agency');
  routes.list = handler(rc, 'get', '/');
  routes.sections = handler(rc, 'get', '/sections');
  routes.seen = handler(rc, 'post', '/:id/seen');
  routes.contacted = handler(rc, 'post', '/:id/contacted');
  routes.patch = handler(rc, 'patch', '/:id');
  routes.bulk = handler(rc, 'post', '/bulk');
  routes.today = handler(ag, 'get', '/today');
  routes.unlink = handler(rc, 'post', '/:id/tg/unlink');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const call = (h, req) => new Promise((resolve, reject) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j }); } };
  h(Object.assign({ user: { restaurantId: A }, params: {}, body: {}, query: {} }, req), res, e => (e ? reject(e) : resolve({ code: 0 })));
});
const sec = async () => (await call(routes.sections, {})).j;
const get = id => Candidate.findOne({ restaurantId: A, id }).lean();

test('manba bo\'yicha ro\'yxat va bo\'lim sanoqlari', async () => {
  const old = new Date(Date.now() - 3 * 864e5), older = new Date(Date.now() - 10 * 864e5);
  await Candidate.create([
    { id: 'h1', restaurantId: A, source: 'hh' },
    { id: 'm1', restaurantId: A, source: 'manual' },
    { id: 'a1', restaurantId: A, source: 'anketa' },                                     // bugun keldi
    { id: 'a2', restaurantId: A, source: 'anketa', createdAt: old },                     // 3 kundan beri javobsiz
    { id: 'a3', restaurantId: A, source: 'anketa', status: 'reserve', createdAt: older }, // ishlangan, haftadan eski
    { id: 'x1', restaurantId: 'boshqa', source: 'anketa' }                               // boshqa agentlik
  ]);
  const base = (await call(routes.list, { query: { source: 'base' } })).j.map(c => c.id).sort();
  assert.deepEqual(base, ['h1', 'm1']);
  const ank = (await call(routes.list, { query: { source: 'anketa' } })).j.map(c => c.id).sort();
  assert.deepEqual(ank, ['a1', 'a2', 'a3']);
  const all = (await call(routes.list, { query: {} })).j.length;
  assert.equal(all, 5);

  const s = await sec();
  assert.deepEqual(s.base, { total: 2, week: 2 });
  assert.equal(s.anketa.total, 3);
  assert.equal(s.anketa.unseen, 2);         // a3 bosqichi o'zgargan — ko'rilgan hisoblanadi
  assert.equal(s.anketa.waiting, 2);
  assert.equal(s.anketa.waitingOld, 1);     // a2
  assert.equal(s.anketa.week, 2);           // a1 (bugun) va a2 (3 kun) — a3 10 kunlik

  const t = (await call(routes.today, {})).j;
  assert.equal(t.anketaUnseen, 2);
  assert.equal(t.baseWeek, 2);
});

test('ko\'rildi: faqat birinchi marta yoziladi, javobsizlikni o\'zgartirmaydi', async () => {
  assert.equal((await call(routes.seen, { params: { id: 'a1' } })).code, 200);
  const t1 = (await get('a1')).seenAt;
  assert.ok(t1);
  await call(routes.seen, { params: { id: 'a1' } });
  assert.equal(+(await get('a1')).seenAt, +t1);
  const s = await sec();
  assert.equal(s.anketa.unseen, 1);
  assert.equal(s.anketa.waiting, 2);        // ochish — hali javob emas
  assert.equal((await call(routes.seen, { params: { id: 'yoq' } })).code, 404);
  assert.equal((await call(routes.seen, { params: { id: 'x1' } })).code, 404);   // boshqa agentlikniki
});

test('aloqa: qo\'ng\'iroq, bosqich o\'zgarishi va guruh amali', async () => {
  // Qo'ng'iroq — aloqa va ko'rildi
  await call(routes.contacted, { params: { id: 'a2' } });
  let c = await get('a2');
  assert.ok(c.firstContactAt && c.seenAt);
  const first = +c.firstContactAt;
  // Keyingi bosqich o'zgarishi birinchi aloqa vaqtini surmaydi
  await call(routes.patch, { params: { id: 'a2' }, body: { status: 'phone' } });
  c = await get('a2');
  assert.equal(c.status, 'phone');
  assert.equal(+c.firstContactAt, first);

  // Bosqich o'zgarishi (panel) — aloqa
  await call(routes.patch, { params: { id: 'a1' }, body: { status: 'interview' } });
  assert.ok((await get('a1')).firstContactAt);
  // Bir xil bosqichga qayta saqlash aloqa emas
  await Candidate.create({ id: 'a4', restaurantId: A, source: 'anketa' });
  await call(routes.patch, { params: { id: 'a4' }, body: { status: 'new', notes: 'izoh' } });
  assert.equal((await get('a4')).firstContactAt, null);
  // Guruh amali
  await call(routes.bulk, { body: { ids: ['a4'], action: 'status', status: 'rejected' } });
  const a4 = await get('a4');
  assert.ok(a4.firstContactAt && a4.seenAt);

  const s = await sec();
  assert.equal(s.anketa.waiting, 0);
  assert.equal(s.anketa.unseen, 0);
});

test('Telegramdan uzish: rezyume qoladi, akkaunt bo\'shaydi, boshqa agentlikka tegilmaydi', async () => {
  await Candidate.create([
    { id: 'u1', restaurantId: A, source: 'hh', fullName: 'Farina', fileName: 'cv.pdf', tgChatId: '5553596', tgState: 'linked', tgLinkedAt: new Date() },
    { id: 'u2', restaurantId: 'boshqa', tgChatId: '777', tgState: 'linked' }
  ]);
  const r = await call(routes.unlink, { params: { id: 'u1' } });
  assert.equal(r.code, 200);
  const c = await get('u1');
  assert.equal(c.tgChatId, ''); assert.equal(c.tgState, 'none'); assert.equal(c.tgLinkedAt, null);
  assert.equal(c.fullName, 'Farina'); assert.equal(c.fileName, 'cv.pdf');          // rezyume joyida
  assert.equal(await Candidate.countDocuments({ tgChatId: '5553596' }), 0);       // bot akkauntni tanimaydi
  assert.equal((await call(routes.unlink, { params: { id: 'u2' } })).code, 404);
  assert.equal((await Candidate.findOne({ id: 'u2' }).lean()).tgChatId, '777');
});
