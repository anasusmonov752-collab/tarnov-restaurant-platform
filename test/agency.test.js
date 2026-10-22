// ── TalentHub'ni restoran akkauntidan ajratish ───────────────
// super.js /agency-split va middleware/agency (o'tish rejimi bilan)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, Restaurant, Candidate, Client, Survey, MentorChat, agency, splitHandler;

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  Restaurant = require('../src/models/Restaurant');
  Candidate = require('../src/models/Candidate');
  Client = require('../src/models/Client');
  Survey = require('../src/models/Survey');
  MentorChat = require('../src/models/MentorChat');
  await Promise.all([Restaurant, Candidate, Client, Survey].map(m => m.syncIndexes()));
  agency = require('../src/middleware/agency');
  const router = require('../src/routes/super');
  const layer = router.stack.find(l => l.route && l.route.path === '/agency-split');
  const hs = layer.route.stack.map(s => s.handle);
  splitHandler = hs[hs.length - 1];                  // superadmin guard'ini chetlab
});

after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const call = body => new Promise((resolve, reject) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j }); } };
  splitHandler({ body }, res, e => (e ? reject(e) : resolve({ code: 0 })));
});

test('ajratish: reja, ko\'chirish, takror, guard', async () => {
  await Restaurant.create([
    { id: 'tarnov', name: 'Tarnov', adminEmail: 't@t.uz', adminPassword: 'x'.repeat(10),
      telegram: { adminChatId: '555', enabled: true } },
    { id: 'th', name: 'TalentHub', adminEmail: 'a@th.uz', adminPassword: 'x'.repeat(10) }
  ]);
  await Candidate.create([{ id: 'k1', restaurantId: 'tarnov' }, { id: 'k2', restaurantId: 'tarnov' }]);
  await Client.create({ id: 'c1', agencyId: 'tarnov', name: 'Rayhon' });
  await Survey.create([
    { id: 's1', agencyId: 'tarnov', code: 'AAAAAA', isDefault: true },
    { id: 's2', agencyId: 'th', code: 'BBBBBB', isDefault: true }     // yangi akkauntda ochib qo'yilgan bo'sh nusxa
  ]);
  await MentorChat.collection.insertOne({ restaurantId: 'tarnov', waiterId: 'w1' });   // trening — joyida qolishi kerak

  // O'tish rejimi: agentlik yo'q — ikkalasi ham kiradi
  agency.invalidate();
  assert.equal(await agency.canRecruit('tarnov'), true);

  const plan = await call({ fromId: 'tarnov', toId: 'th', apply: false });
  assert.equal(plan.j.applied, false);
  assert.equal(plan.j.plan.find(x => x.model === 'Candidate').from, 2);
  assert.equal(await Candidate.countDocuments({ restaurantId: 'tarnov' }), 2);   // reja hech narsa yozmadi

  const done = await call({ fromId: 'tarnov', toId: 'th', apply: true });
  assert.equal(done.j.applied, true);
  assert.equal(await Candidate.countDocuments({ restaurantId: 'th' }), 2);
  assert.equal(await Client.countDocuments({ agencyId: 'th' }), 1);
  assert.equal(await Survey.countDocuments({ agencyId: 'th', isDefault: true }), 1);   // bitta umumiy anketa
  assert.equal((await Survey.findOne({ isDefault: true, agencyId: 'th' })).id, 's1');  // asosiysi — ko'chgani
  assert.equal(await MentorChat.collection.countDocuments({ restaurantId: 'tarnov' }), 1);
  const [t, th] = await Promise.all([Restaurant.findOne({ id: 'tarnov' }), Restaurant.findOne({ id: 'th' })]);
  assert.equal(th.kind, 'agency');
  assert.equal(th.telegram.adminChatId, '555');
  assert.equal(t.telegram.adminChatId, '');

  // Guard: endi faqat agentlik
  assert.equal(await agency.canRecruit('th'), true);
  assert.equal(await agency.canRecruit('tarnov'), false);

  // Takror — xavfsiz, hech narsa ko'chmaydi; agentlikdan ko'chirish rad
  const again = await call({ fromId: 'tarnov', toId: 'th', apply: true });
  assert.equal(Object.values(again.j.moved).reduce((s, x) => s + x, 0), 0);
  const bad = await call({ fromId: 'th', toId: 'tarnov', apply: false });
  assert.equal(bad.code, 400);
});
