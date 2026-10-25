// ── Kartaga o'tkazma: rekvizit, buyurtma, "To'ladim", tushmadi, eslatmalar ──
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, cp, billing, sent = [];
const A = 'agC';
const H = 36e5;

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Order', 'CreditLedger', 'Restaurant', 'Shortlist']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return {}; };
  billing = require('../src/services/billing');
  cp = require('../src/services/cardPay');
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', adminEmail: 'ag@test.uz', adminPassword: 'secret1',
    telegram: { adminChatId: '900' } });
  await M.Client.create({ id: 'k1', agencyId: A, name: 'Navruz', status: 'active', credits: 1, tgChatId: '700' });
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const cl = () => M.Client.findOne({ id: 'k1' }).lean();
const toAdmin = () => sent.filter(s => s.chat === '900');
const toClient = () => sent.filter(s => s.chat === '700');

test('rekvizitsiz — karta usuli yo\'q; noto\'g\'ri rekvizit rad etiladi', async () => {
  await assert.rejects(async () => cp.startOrder(await cl(), 'pro'), /yoqilmagan/);
  await assert.rejects(() => cp.setCard(A, { number: '8600 1234', holder: 'Anas' }), /16/);
  await assert.rejects(() => cp.setCard(A, { number: '8600123412341234', holder: 'A' }), /egasi/);
  await assert.rejects(async () => billing.createOrder({ client: await cl(), planKey: 'pro', provider: 'card' }), /usuli/);
});

test('rekvizit saqlanadi, o\'zgarsa agentlikka xabar', async () => {
  sent = [];
  const r = await cp.setCard(A, { number: '8600 0691 9540 6311', holder: '  Anas   Usmonov ', bank: 'Kapitalbank' }, 'ag@test.uz');
  assert.equal(r.number, '8600069195406311');
  assert.equal(r.holder, 'Anas Usmonov');
  assert.equal(typeof r.luhn, 'boolean');
  assert.equal(toAdmin().length, 1);
  assert.match(toAdmin()[0].text, /qo'shildi: 8600 •••• 6311/);
  sent = [];
  await cp.setCard(A, { number: '8600069195406311', holder: 'Anas Usmonov', bank: 'Hamkorbank' });   // faqat bank — jim
  assert.equal(toAdmin().length, 0);
});

test('buyurtma: rekvizit beriladi, botga xabar, takror bosish — o\'sha buyurtma', async () => {
  sent = [];
  const o = await cp.startOrder(await cl(), 'pro', 'https://app.uz');
  assert.equal(o.status, 'waiting');
  assert.equal(o.amount, 999000);
  assert.equal(o.card.number, '8600069195406311');
  assert.match(o.code, /^\d{8}$/);
  const msg = toClient()[0];
  assert.equal(msg.extra.parse_mode, 'HTML');
  assert.match(msg.text, /<code>8600 0691 9540 6311<\/code>/);
  assert.equal(msg.extra.reply_markup.inline_keyboard[0][0].callback_data, 'pc:' + o.id);
  assert.match(msg.extra.reply_markup.inline_keyboard[1][0].web_app.url, /open=pay&o=/);
  assert.equal(toAdmin().length, 0);                                  // "To'ladim" gacha agentlik bezovta qilinmaydi
  const again = await cp.startOrder(await cl(), 'pro', 'https://app.uz');
  assert.equal(again.id, o.id);
  assert.equal(toClient().length, 1);
  // boshqa tarif — eskisi yopiladi
  const b = await cp.startOrder(await cl(), 'base');
  assert.notEqual(b.id, o.id);
  assert.equal((await M.Order.findOne({ id: o.id }).lean()).status, 'canceled');
  assert.equal((await M.Order.findOne({ id: b.id }).lean()).cardTo, '8600 •••• 6311');
});

test('"To\'ladim" -> tekshirish, "Tushmadi" -> qayta, "Pul tushdi" -> tarif', async () => {
  const c = await cl();
  const o = await cp.startOrder(c, 'base');
  sent = [];
  let v = await cp.claim(c, o.id, '  Aziz  •• 4417 ');
  assert.equal(v.status, 'checking');
  assert.equal(toAdmin().length, 1);
  const kb = toAdmin()[0].extra.reply_markup.inline_keyboard[0];
  assert.deepEqual(kb.map(b => b.callback_data), ['bo:' + o.id, 'bx:' + o.id]);
  assert.match(toAdmin()[0].text, /Aziz •• 4417/);
  v = await cp.claim(c, o.id);                                         // ikkinchi bosish — jim
  assert.equal(v.status, 'checking');
  assert.equal(toAdmin().length, 1);
  await assert.rejects(() => cp.cancelByClient(c, o.id), /bekor/);    // tekshirilayotganni mijoz bekor qilmaydi

  sent = [];
  await cp.reject(A, o.id);
  assert.equal((await cp.getForClient(c, o.id)).status, 'rejected');
  assert.equal(toClient().length, 1);
  assert.equal(toClient()[0].extra.reply_markup.inline_keyboard[0][0].callback_data, 'pc:' + o.id);
  await assert.rejects(() => cp.reject(A, o.id), /topilmadi/);        // "To'ladim" yo'q — rad etib bo'lmaydi

  sent = [];
  await cp.claim(c, o.id);
  assert.match(toAdmin()[0].text, /2-urinish/);
  await billing.activate(o.id, { by: 'admin' });
  const p = await cp.getForClient(c, o.id);
  assert.equal(p.status, 'paid');
  assert.equal(p.credits, 1 + 10);
  assert.equal(p.card, null);                                          // yopilgan buyurtmada rekvizit qaytmaydi
  assert.equal((await cl()).plan.key, 'base');
});

test('mijoz o\'zi bekor qiladi; begona buyurtma ko\'rinmaydi', async () => {
  const c = await cl();
  const o = await cp.startOrder(c, 'max');
  await M.Client.create({ id: 'k2', agencyId: A, name: 'Boshqa', status: 'active', credits: 0 });
  await assert.rejects(async () => cp.getForClient(await M.Client.findOne({ id: 'k2' }).lean(), o.id), /topilmadi/);
  await assert.rejects(async () => cp.claim(await M.Client.findOne({ id: 'k2' }).lean(), o.id), /topilmadi/);
  assert.deepEqual(await cp.cancelByClient(c, o.id), { ok: true });
  assert.equal((await cp.getForClient(c, o.id)).status, 'canceled');
});

test('eslatmalar: 3 soatda mijozga, 72 soatda bekor, 2 soat tekshirilmasa agentlikka', async () => {
  const c = await cl();
  const now = new Date();
  const w = await cp.startOrder(c, 'pro');
  await M.Order.updateOne({ id: w.id }, { $set: { createdAt: new Date(now - 4 * H) } });
  sent = [];
  let t = await cp.tick(now);
  assert.equal(t.reminded, 1);
  assert.equal(toClient().length, 1);
  assert.equal((await cp.tick(now)).reminded, 0);                      // bir marta

  await M.Order.updateOne({ id: w.id }, { $set: { createdAt: new Date(now - 73 * H) } });
  t = await cp.tick(now);
  assert.equal(t.expired, 1);
  assert.equal((await M.Order.findOne({ id: w.id }).lean()).status, 'canceled');

  const x = await cp.startOrder(c, 'pro');
  await cp.claim(c, x.id);
  await M.Order.updateOne({ id: x.id }, { $set: { claimedAt: new Date(now - 3 * H) } });
  sent = [];
  t = await cp.tick(now);
  assert.equal(t.adminReminded, 1);
  assert.match(toAdmin()[0].text, /Hali tekshirilmadi/);
  assert.equal((await cp.tick(now)).adminReminded, 0);
  assert.equal(t.expired, 0);                                          // "To'ladim" bosilgan — bekor bo'lmaydi
});

test('Luhn va niqob', () => {
  assert.equal(cp.luhnOk('4242424242424242'), true);
  assert.equal(cp.luhnOk('4242424242424241'), false);
  assert.equal(cp.masked('8600069195406311'), '8600 •••• 6311');
});
