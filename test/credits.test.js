// ── Pul oqimi: haqiqiy MongoDB (xotirada, replika to'plam) ───
// Kontakt ochish, qaytarish, tranzaksiya va jurnal indeksi. CI'da
// mongodb-memory-server o'rnatiladi (package.json'ga qo'shilmagan —
// Render'ga keraksiz yuk). Mahalliy: npm i --no-save mongodb-memory-server
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs;
let Client, Candidate, Shortlist, CreditLedger, sl, credits;

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  Client = require('../src/models/Client');
  Candidate = require('../src/models/Candidate');
  Shortlist = require('../src/models/Shortlist');
  CreditLedger = require('../src/models/CreditLedger');
  await Promise.all([Client, Candidate, Shortlist, CreditLedger].map(m => m.syncIndexes()));
  sl = require('../src/services/shortlist');
  credits = require('../src/services/credits');
});

after(async () => {
  await mongoose.disconnect();
  if (rs) await rs.stop();
});

const A = 'agency1';
beforeEach(async () => {
  await Promise.all([Client, Candidate, Shortlist, CreditLedger].map(m => m.deleteMany({})));
  await Client.create([{ id: 'cl1', agencyId: A, name: 'Rayhon', credits: 5, status: 'active' },
                       { id: 'cl2', agencyId: A, name: 'Navruz', credits: 5, status: 'active' }]);
  await Candidate.create({ id: 'k1', restaurantId: A, fullName: 'Aziza Karimova', phone: '+998901112233', publicCode: 'A-1111' });
  await Shortlist.create([
    { id: 's1', agencyId: A, clientId: 'cl1', items: [{ candidateId: 'k1', state: 'candidate_ok' }] },
    { id: 's2', agencyId: A, clientId: 'cl1', items: [{ candidateId: 'k1', state: 'candidate_ok' }] },
    { id: 's3', agencyId: A, clientId: 'cl2', items: [{ candidateId: 'k1', state: 'candidate_ok' }] }
  ]);
});

const bal = async id => (await Client.findOne({ id }).lean()).credits;
const state = async (sid) => (await Shortlist.findOne({ id: sid }).lean()).items[0].state;

test('kontakt ochish: bir marta -1, jurnalda bitta yozuv', async () => {
  const r = await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  assert.equal(r.already, false);
  assert.equal(await bal('cl1'), 4);
  assert.equal(await CreditLedger.countDocuments({ reason: 'reveal' }), 1);
  const again = await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  assert.equal(again.already, true);
  assert.equal(await bal('cl1'), 4);
});

test('shu mijoz boshqa tanlovda ochgan bo\'lsa — kredit yechilmaydi', async () => {
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  const r = await sl.reveal({ agencyId: A, shortlistId: 's2', candidateId: 'k1' });
  assert.equal(r.already, true);
  assert.equal(r.openedBefore, true);
  assert.equal(await bal('cl1'), 4);
  assert.equal(await state('s2'), 'revealed');
});

test('boshqa mijoz uchun — kredit yechiladi', async () => {
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  await sl.reveal({ agencyId: A, shortlistId: 's3', candidateId: 'k1' });
  assert.equal(await bal('cl1'), 4);
  assert.equal(await bal('cl2'), 4);
});

test('kredit yetmasa — holat qaytadi, balans va jurnal o\'zgarmaydi', async () => {
  await Client.updateOne({ id: 'cl1' }, { $set: { credits: 0 } });
  await assert.rejects(sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' }), /yetarli emas/);
  assert.equal(await state('s1'), 'candidate_ok');
  assert.equal(await bal('cl1'), 0);
  assert.equal(await CreditLedger.countDocuments({}), 0);
});

test('jurnal indeksi: bitta element uchun ikkinchi yechish rad etiladi va balans qaytadi', async () => {
  await credits.reveal({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k1' });
  await assert.rejects(credits.reveal({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k1' }),
    e => e.code === 11000);
  assert.equal(await bal('cl1'), 4);                       // tranzaksiya $inc ni ham qaytardi
  assert.equal(await CreditLedger.countDocuments({ reason: 'reveal' }), 1);
});

test('qaytarish: +1, holat refunded, takror bosish qaytarmaydi', async () => {
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  const r = await sl.refund({ agencyId: A, shortlistId: 's1', candidateId: 'k1', reason: 'dead_phone' });
  assert.equal(r.credited, true);
  assert.equal(await bal('cl1'), 5);
  assert.equal(await state('s1'), 'refunded');
  const again = await sl.refund({ agencyId: A, shortlistId: 's1', candidateId: 'k1', reason: 'dead_phone' });
  assert.equal(again.already, true);
  assert.equal(await bal('cl1'), 5);
});

test('qaytarish: bepul ochilgan (openedBefore) elementdan pul qaytmaydi', async () => {
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  await sl.reveal({ agencyId: A, shortlistId: 's2', candidateId: 'k1' });
  const r = await sl.refund({ agencyId: A, shortlistId: 's2', candidateId: 'k1', reason: 'goodwill' });
  assert.equal(r.credited, false);
  assert.equal(await bal('cl1'), 4);
});

test('qaytarish: ishga olingan, ochilmagan, sababsiz — rad', async () => {
  await assert.rejects(sl.refund({ agencyId: A, shortlistId: 's1', candidateId: 'k1', reason: 'dead_phone' }), /ochilmagan/);
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });
  await assert.rejects(sl.refund({ agencyId: A, shortlistId: 's1', candidateId: 'k1', reason: 'xyz' }), /sababini/);
  await Shortlist.updateOne({ id: 's1' }, { $set: { 'items.0.state': 'hired' } });
  await assert.rejects(sl.refund({ agencyId: A, shortlistId: 's1', candidateId: 'k1', reason: 'dead_phone' }), /Ishga olingan/);
  assert.equal(await bal('cl1'), 4);
});

test('parallel ochish: ikki so\'rov — bitta yechish', async () => {
  const rs2 = await Promise.allSettled([
    sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' }),
    sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' })
  ]);
  assert.equal(rs2.filter(x => x.status === 'fulfilled').length, 2);
  assert.equal(await bal('cl1'), 4);
});
