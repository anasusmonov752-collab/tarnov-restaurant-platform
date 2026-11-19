// ── "HR 24 soat ichida qo'ng'iroq qiladi" nazorati (services/slaAlert) ──
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, sla, sent = [];
const A = 'agSLA';
const H = 36e5;
// Toshkentda 12:00 (UTC 07:00) — kunduz; 23:00 Toshkent = UTC 18:00 — tun
const NOON = new Date('2026-11-20T07:00:00Z');
const NIGHT = new Date('2026-11-20T18:00:00Z');

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Application', 'Candidate', 'Vacancy', 'Restaurant']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return { message_id: 1 }; };
  sla = require('../src/services/slaAlert');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  sent = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true,
    adminEmail: 'sla@test.uz', adminPassword: 'secret1', telegram: { adminChatId: 'adm' } });
  await M.Vacancy.create({ id: 'v1', agencyId: A, clientId: 'cl1', title: 'Xostess', role: 'xostess', status: 'open' });
});

let n = 0;
async function app(hoursAgo, x = {}, c = {}) {
  n++;
  const cid = 'c' + n;
  await M.Candidate.create(Object.assign({ id: cid, restaurantId: A, fullName: 'Nomzod ' + n, phone: '+99890000000' + (n % 10), role: 'xostess' }, c));
  return M.Application.create(Object.assign({ id: 'a' + n, agencyId: A, vacancyId: 'v1', candidateId: cid, clientId: 'cl1',
    state: 'new', createdAt: new Date(NOON.getTime() - hoursAgo * H) }, x));
}

test('18 soatda ogohlantirish, 24 soatda kechikish; qo\'ng\'iroq qilingan, qaror qilingan, sinov, eski — yo\'q', async () => {
  await app(20);                                                   // ogohlantirish
  await app(30);                                                   // kechikdi
  await app(30, { contactedAt: new Date() });                      // panelda "Bog'landim"
  await app(30, { state: 'shortlisted' });                         // mijoz qaror qildi
  await app(30, { isTest: true });                                 // sinov
  await app(9 * 24);                                               // 7 kundan eski
  await app(5);                                                    // hali erta
  await app(30, {}, { firstContactAt: new Date(NOON.getTime() - 2 * H) });   // ariza tushgach Telegramda yozilgan

  const r = await sla.tick(NOON);
  assert.deepEqual(r, { warned: 1, late: 1 });
  assert.equal(sent.length, 2);
  assert.ok(sent.every(m => m.chat === 'adm'));
  assert.match(sent[0].text, /24 soatdan beri/);
  assert.match(sent[0].text, /Xostess · 30 soat/);
  assert.match(sent[1].text, /6 soat qoldi/);

  // Qayta — takror yuborilmaydi
  sent = [];
  assert.deepEqual(await sla.tick(new Date(NOON.getTime() + 2 * 60 * 1000)), { warned: 0, late: 0 });
  assert.equal(sent.length, 0);
});

test('tunda yozilmaydi, ertalab bitta xabar; ogohlantirilgan ariza 24 soatda kechikish sifatida yana bir marta', async () => {
  await app(30);
  assert.deepEqual(await sla.tick(NIGHT), { warned: 0, late: 0 });
  assert.equal(sent.length, 0);

  const a = await app(19);
  await sla.tick(NOON);                                            // 30 soatlik — kech, 19 soatlik — ogohlantirish
  assert.equal(sent.length, 2);
  sent = [];
  const later = new Date(NOON.getTime() + 6 * H);                  // 19 + 6 = 25 soat
  const r = await sla.tick(later);
  assert.deepEqual(r, { warned: 0, late: 1 });
  assert.match(sent[0].text, /Nomzod/);
  const saved = await M.Application.findOne({ id: a.id }).lean();
  assert.ok(saved.slaWarnAt && saved.slaLateAt);
});
