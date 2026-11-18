// ── Test rejimi: HAQIQIY mijoz sifatida (2026-11-18, Anas: "Tarnovni mijoz sifatida ulab o'taman") ──
// /test -> "👔 Tarnov": admin akkaunti haqiqiy mijozga ulanadi — kredit to'ldirilmaydi,
// sinov belgisi qo'yilmaydi. Admin rejimida uziladi. Boshqa odamga ulangan mijoz tegilmaydi.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, tm;
const U = '700200';
let A;

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Restaurant', 'Client', 'Candidate', 'TestMode', 'CreditLedger']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  tm = require('../src/services/testMode');
  const ag = await M.Restaurant.create({ name: 'TalentHub', category: 'agency', kind: 'agency',
    adminEmail: 'th2@test.local', adminPassword: 'hash-123456', telegram: { adminChatId: U } });
  A = ag.id;
  await M.Client.create([
    { id: 'c-tarnov', agencyId: A, name: 'Tarnov', status: 'active', credits: 35 },
    { id: 'c-test', agencyId: A, name: '🧪 Sinov restoran', status: 'active', isTest: true, credits: 5 },
    { id: 'c-pending', agencyId: A, name: 'Kutilmoqda', status: 'pending' }
  ]);
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const tgOf = async id => (await M.Client.findOne({ id }).lean()).tgChatId;

test('yagona faol haqiqiy mijoz — shu ulanadi, kredit va belgi o\'zgarmaydi', async () => {
  const out = await tm.setMode(U, 'real', { language_code: 'ru' });
  assert.equal(out.client.id, 'c-tarnov');
  const c = await M.Client.findOne({ id: 'c-tarnov' }).lean();
  assert.equal(c.tgChatId, U);
  assert.equal(c.credits, 35);
  assert.ok(!c.isTest);
  assert.equal(await M.CreditLedger.countDocuments({ clientId: 'c-tarnov' }), 0);
  assert.equal(await tm.modeOf(U), 'real');

  // Sinov mijoziga o'tish — Tarnov uziladi
  await tm.setMode(U, 'client');
  assert.equal(await tgOf('c-tarnov'), '');
  assert.equal(await tgOf('c-test'), U);

  // Admin — hech kimga ulanmaydi (test rejimidan oldin hech narsa ulanmagan edi)
  await tm.setMode(U, 'admin');
  assert.equal(await tgOf('c-tarnov'), '');
  assert.equal(await tgOf('c-test'), '');
});

test('bir nechta haqiqiy mijoz — tanlash so\'raladi, tanlangani eslab qolinadi', async () => {
  await M.Client.create({ id: 'c-other', agencyId: A, name: 'Boshqa restoran', status: 'active' });
  await M.TestMode.updateOne({ tgUserId: U }, { $set: { realClientId: '' } });
  await assert.rejects(() => tm.setMode(U, 'real'), e => e.choose && e.choose.map(c => c.id).sort().join() === 'c-other,c-tarnov');
  assert.equal(await tm.modeOf(U), 'admin');                       // hech narsa o'zgarmadi

  await tm.setMode(U, 'real', null, { clientId: 'c-tarnov' });
  await tm.setMode(U, 'admin');
  const out = await tm.setMode(U, 'real');                          // ikkinchi safar so'ramaydi
  assert.equal(out.client.id, 'c-tarnov');
  // Sinov va faol bo'lmagan mijoz — tanlab bo'lmaydi
  await assert.rejects(() => tm.setMode(U, 'real', null, { clientId: 'c-test' }), e => e.status === 400);
  await assert.rejects(() => tm.setMode(U, 'real', null, { clientId: 'c-pending' }), e => e.status === 400);
  await tm.setMode(U, 'admin');
});

test('boshqa Telegramga ulangan haqiqiy mijoz — uzilmaydi, 409', async () => {
  await M.Client.updateOne({ id: 'c-other' }, { $set: { tgChatId: '555' } });
  await assert.rejects(() => tm.setMode(U, 'real', null, { clientId: 'c-other' }), e => e.status === 409);
  assert.equal(await tgOf('c-other'), '555');
  assert.equal(await tm.modeOf(U), 'admin');
});
