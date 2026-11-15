// ── TAKLIF NAVBATI (services/outreach) ───────────────────────
// Asosiy shart: bir odamga ikki marta SMS ketmasin, botda bor odamga
// umuman ketmasin va matn BITTA SMS ichiga sig'sin.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, Candidate, Client, outreach, vac;
const A = 'agO';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  Candidate = require('../src/models/Candidate');
  Client = require('../src/models/Client');
  await Promise.all([Candidate.syncIndexes(), Client.syncIndexes()]);
  outreach = require('../src/services/outreach');
  vac = require('../src/services/vacancy');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });
beforeEach(async () => { await Candidate.deleteMany({}); });

const cand = (id, x = {}) => Candidate.create(Object.assign({
  id, restaurantId: A, fullName: 'Karimov Dilshod Anvarovich', phone: '+998 90 123 45 67',
  role: 'ofitsiant', source: 'hh', jobStatus: 'active'
}, x));

test('navbatga faqat yozsa bo\'ladiganlar tushadi', async () => {
  await cand('ok1');
  await cand('ok2', { role: 'oshpaz' });
  await cand('x1', { source: 'anketa' });                       // o'zimizniki — botda bor
  await cand('x2', { tgChatId: '555' });                        // Telegramda — bepul yozamiz
  await cand('x3', { jobStatus: 'not_looking' });
  await cand('x4', { status: 'hired' });
  await cand('x5', { status: 'rejected' });
  await cand('x6', { phone: '' });                              // telefoni yo'q
  await cand('x7', { phone: '12345' });                         // buzuq raqam (phoneKey bo'sh)
  await cand('x8', { smsSentAt: new Date() });                  // allaqachon yozilgan
  await cand('x9', { isTest: true });
  await cand('x10', { restaurantId: 'boshqa' });                // boshqa agentlik

  const out = await outreach.list(A);
  assert.deepEqual(out.rows.map(r => r.id).sort(), ['ok1', 'ok2']);
  assert.equal(out.total, 2);
  assert.deepEqual(out.byRole.map(r => [r.role, r.n]).sort(), [['ofitsiant', 1], ['oshpaz', 1]]);

  const one = await outreach.list(A, { role: 'oshpaz' });
  assert.deepEqual(one.rows.map(r => r.id), ['ok2']);
});

test('telefon formatdan qat\'i nazar +998 ga keltiriladi, ism ikkinchi so\'z', async () => {
  await cand('p1', { phone: '+998 90 123 45 67' });
  await cand('p2', { phone: '901234568', fullName: 'Aziza' });
  const rows = (await outreach.list(A)).rows;
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.p1.phone, '+998901234567');
  assert.equal(by.p1.first, 'Dilshod');                         // "Familiya Ism Otasining ismi"
  assert.equal(by.p2.phone, '+998901234568');
  assert.equal(by.p2.first, 'Aziza');                           // bitta so'z bo'lsa o'zi
});

test('standart matn BITTA SMS: GSM-7, 160 belgigacha', async () => {
  const c = { fullName: 'Karimov Dilshod', role: 'ofitsiant' };
  const text = outreach.render(outreach.DEFAULT_TPL, c, 't.me/TalentHubUzBot?start=a_HMXT37_sms');
  const i = outreach.smsInfo(text);
  assert.equal(i.parts, 1, text);
  assert.deepEqual(i.bad, [], 'GSM-7 ga kirmaydigan belgi bo\'lmasin');
  assert.ok(text.includes('Dilshod') && text.includes('ofitsiant') && text.includes('t.me/'));
  // Professional va huquqiy qolip: kim yozyapti, raqam qayerdan, undovsiz
  assert.ok(text.includes('TalentHub') && text.includes('hh.uz'), text);
  assert.ok(!/!/.test(text), 'undov belgisi reklamaga o\'xshatadi');

  // Bitta tire yoki qo'shtirnoq SMS'ni uchga bo'ladi — ogohlantirish shart
  const bad = outreach.smsInfo('Assalomu alaykum — TalentHub');
  assert.ok(bad.bad.includes('—'));
});

test('yuborildi: navbatdan chiqadi, "bog\'lanildi" yoziladi, qaytarish ishlaydi', async () => {
  await cand('s1');
  assert.equal((await outreach.list(A)).total, 1);

  assert.equal(await outreach.markSent(A, 's1'), true);
  let c = await Candidate.findOne({ id: 's1' }).lean();
  assert.ok(c.smsSentAt && c.firstContactAt && c.seenAt);
  assert.equal(+c.smsSentAt, +c.firstContactAt);
  assert.equal((await outreach.list(A)).total, 0);
  assert.equal((await outreach.list(A)).sentToday, 1);

  // Qaytarish: SMS ketmagan — "bog'lanildi" ham olinadi
  await outreach.markSent(A, 's1', true);
  c = await Candidate.findOne({ id: 's1' }).lean();
  assert.equal(c.smsSentAt, null);
  assert.equal(c.firstContactAt, null);
  assert.equal((await outreach.list(A)).total, 1);

  assert.equal(await outreach.markSent(A, 'yoq'), false);
});

test('qaytarish OLDINGI aloqani o\'chirmaydi', async () => {
  const earlier = new Date(Date.now() - 3 * 864e5);
  await cand('s2', { firstContactAt: earlier });
  await outreach.markSent(A, 's2');
  await outreach.markSent(A, 's2', true);
  const c = await Candidate.findOne({ id: 's2' }).lean();
  assert.equal(+c.firstContactAt, +earlier, 'oldin qo\'ng\'iroq qilingan edi — qolsin');
});

test('restoran nomi: faqat mijoz ochiq ko\'rsatishga rozi bo\'lsa', async () => {
  const v = { id: 'v1', title: 'Ofitsiant', role: 'ofitsiant', location: 'Chilonzor', confirmedAt: new Date() };
  const hidden = { id: 'c1', name: 'Chaykhana Navruz', status: 'active' };
  const shown = { id: 'c2', name: 'Tarnov', status: 'active', showName: true };
  assert.equal(vac.forCandidate(v, hidden, 'uz').employer, '');
  assert.equal(vac.forCandidate(v, shown, 'uz').employer, 'Tarnov');
});
