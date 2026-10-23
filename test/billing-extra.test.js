// ── Tarif qo'shimchalari: kafolat, kam balans, tavsiya, hisob-faktura, Uzum, avto-yangilash ──
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, billing, uzum, sent = [];
const A = 'agX';
const DAY = 864e5;

before(async () => {
  process.env.UZUM_SERVICE_ID = '777'; process.env.UZUM_LOGIN = 'uz'; process.env.UZUM_PASSWORD = 'uzpass';
  process.env.PAYME_MERCHANT_ID = 'm9'; process.env.PAYME_KEY = 'pk';
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Order', 'CreditLedger', 'Shortlist']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  // Telegram'ga chiqmaymiz — yuborilganlarni yig'amiz
  const tg = require('../src/services/telegram');
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return {}; };
  billing = require('../src/services/billing');
  uzum = require('../src/services/uzum');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const get = id => M.Client.findOne({ id }).lean();

test('kafolat bajarilgan bo\'lsa muddat uzaymaydi (Base: 5 nomzod)', async () => {
  const now = new Date();
  const start = new Date(now.getTime() - 15 * DAY);
  await M.Client.create({ id: 'g1', agencyId: A, name: 'Bek', status: 'active', credits: 4,
    plan: { key: 'base', startedAt: start, endsAt: new Date(now.getTime() - 1000) } });
  const items = [1, 2, 3, 4].map(i => ({ candidateId: 'k' + i, state: 'revealed', revealedAt: new Date(start.getTime() + DAY) }));
  items.push({ candidateId: 'k5', state: 'candidate_ok' });
  items.push({ candidateId: 'k6', state: 'refunded', revealedAt: new Date(start.getTime() + DAY) });   // qaytarilgan — sanalmaydi
  await M.Shortlist.create({ id: 's1', agencyId: A, clientId: 'g1', items, createdAt: new Date(start.getTime() + 1000) });
  // davrdan oldingi tanlov sanalmaydi
  await M.Shortlist.create({ id: 's0', agencyId: A, clientId: 'g1', createdAt: new Date(start.getTime() - DAY),
    items: [{ candidateId: 'old', state: 'candidate_ok' }] });
  const g = await billing.guaranteeProgress(await get('g1'));
  assert.deepEqual(g, { candidates: 5, needCandidates: 5, hired: 0, needHire: 0 });
  assert.equal(billing.guaranteeMet(g), true);
  const t = await billing.tick({ now });
  assert.equal(t.extended, 0);
  assert.equal(t.expired, 1);
  assert.equal((await get('g1')).credits, 0);
});

test('Max kafolati: ishga olingan xodim sanaladi', async () => {
  const now = new Date();
  await M.Client.create({ id: 'g2', agencyId: A, name: 'Max', status: 'active', credits: 50,
    plan: { key: 'max', startedAt: new Date(now.getTime() - 10 * DAY), endsAt: new Date(now.getTime() + 20 * DAY) } });
  await M.Shortlist.create({ id: 's2', agencyId: A, clientId: 'g2', items: [
    { candidateId: 'h1', state: 'hired', revealedAt: new Date(now.getTime() - 5 * DAY), decidedAt: new Date(now.getTime() - DAY) }] });
  const g = await billing.guaranteeProgress(await get('g2'));
  assert.equal(g.hired, 1);
  assert.equal(g.needHire, 1);
  assert.equal(billing.guaranteeMet(g), true);
});

test('kam balans: 2 yoki kam qolsa bir marta taklif, Max\'ga yo\'q', async () => {
  await M.Client.create({ id: 'l1', agencyId: A, name: 'Low', status: 'active', credits: 2, tgChatId: '501',
    plan: { key: 'pro', startedAt: new Date(), endsAt: new Date(Date.now() + 9 * DAY) } });
  sent = [];
  assert.equal(await billing.lowBalance({ agencyId: A, clientId: 'l1', balance: 3 }), false);
  assert.equal(await billing.lowBalance({ agencyId: A, clientId: 'l1', balance: 2, appBase: 'https://x.uz' }), true);
  assert.equal(await billing.lowBalance({ agencyId: A, clientId: 'l1', balance: 1, appBase: 'https://x.uz' }), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat, '501');
  assert.match(sent[0].extra.reply_markup.inline_keyboard[0][0].web_app.url, /miniapp\.html\?open=plans$/);
  // Max — yozilmaydi
  assert.equal(await billing.lowBalance({ agencyId: A, clientId: 'g2', balance: 1 }), false);
  // yangi tarif — belgi tushadi, yana taklif qilinadi
  const o = await billing.createOrder({ client: await get('l1'), planKey: 'base', provider: 'manual' });
  await billing.activate(o.id);
  assert.equal((await get('l1')).plan.lowAt, null);
});

test('faol tarif davomida yangilash — muddat joriy oxiridan boshlanadi', async () => {
  const c = await get('l1');
  const end0 = new Date(c.plan.endsAt);
  const o = await billing.createOrder({ client: c, planKey: 'base', provider: 'manual' });
  const r = await billing.activate(o.id);
  assert.equal(new Date(r.endsAt).getTime(), end0.getTime() + 14 * DAY);
});

test('hisob-faktura: kompaniya va STIR majburiy, buyurtma raqami 8 xonali', async () => {
  const c = await get('l1');
  await assert.rejects(() => billing.createOrder({ client: c, planKey: 'pro', provider: 'invoice', invoice: { company: 'X', inn: '12' } }), /STIR/);
  sent = [];
  const o = await billing.createOrder({ client: c, planKey: 'pro', provider: 'invoice', invoice: { company: '  Navruz MChJ ', inn: '301 234 567' } });
  assert.equal(o.provider, 'invoice');
  assert.equal(o.invoiceCompany, 'Navruz MChJ');
  assert.equal(o.invoiceInn, '301234567');
  assert.match(o.code, /^\d{8}$/);
  await assert.rejects(() => billing.createOrder({ client: c, planKey: 'pro', provider: 'yoq' }), /usuli/);
});

test('tavsiya: kod, havola, birinchi to\'lovda ikkalasiga +3 (bir marta)', async () => {
  await M.Client.create({ id: 'r0', agencyId: A, name: 'Taklifchi', status: 'active', credits: 0, tgChatId: '600' });
  const ref = await billing.referralLink(await get('r0'), 'TestBot');
  assert.match(ref.code, /^[A-Z2-9]{6}$/);
  assert.equal(ref.link, `https://t.me/TestBot?start=ref_${ref.code}`);
  assert.equal((await billing.referralLink(await get('r0'), 'TestBot')).code, ref.code);       // o'zgarmaydi
  await M.Client.create({ id: 'r1', agencyId: A, name: 'Yangi', status: 'active', credits: 0, tgChatId: '601', referredBy: 'r0' });
  const o1 = await billing.createOrder({ client: await get('r1'), planKey: 'base', provider: 'manual' });
  await billing.activate(o1.id);
  assert.equal((await get('r1')).credits, 10 + billing.REFERRAL_BONUS);
  assert.equal((await get('r0')).credits, billing.REFERRAL_BONUS);
  const o2 = await billing.createOrder({ client: await get('r1'), planKey: 'base', provider: 'manual' });
  await billing.activate(o2.id);
  assert.equal((await get('r0')).credits, billing.REFERRAL_BONUS);                            // ikkinchi marta yo'q
  const st = await billing.referralLink(await get('r0'), 'TestBot');
  assert.equal(st.invited, 1);
  assert.equal(st.paid, 1);
});

const UA = 'Basic ' + Buffer.from('uz:uzpass').toString('base64');

test('Uzum: check, create, confirm (takror xavfsiz), status, reverse', async () => {
  await M.Client.create({ id: 'u1', agencyId: A, name: 'Uzumchi', status: 'active', credits: 0 });
  const o = await billing.createOrder({ client: await get('u1'), planKey: 'pro', provider: 'uzum' });
  assert.match(billing.checkoutUrl(o, 'https://t.me/b'), /^https:\/\/www\.uzumbank\.uz\/open-service\?serviceId=777&order_id=\d{8}&amount=99900000/);
  const t0 = Date.now();
  const bad = await uzum.handle('check', { serviceId: 777, params: { order_id: o.code } }, 'Basic xx', t0);
  assert.equal(bad.status, 400); assert.equal(bad.body.errorCode, '10001');
  assert.equal((await uzum.handle('check', { serviceId: 1, params: { order_id: o.code } }, UA, t0)).body.errorCode, '10006');
  assert.equal((await uzum.handle('check', { serviceId: 777, params: { order_id: '99999999' } }, UA, t0)).body.errorCode, '10007');
  const ch = await uzum.handle('check', { serviceId: 777, timestamp: t0, params: { account: o.code } }, UA, t0);
  assert.equal(ch.status, 200); assert.equal(ch.body.status, 'OK');
  assert.equal((await uzum.handle('create', { serviceId: 777, transId: 'T1', params: { order_id: o.id }, amount: 100 }, UA, t0)).body.errorCode, '10011');
  const cr = await uzum.handle('create', { serviceId: 777, transId: 'T1', params: { order_id: o.id }, amount: 99900000 }, UA, t0);
  assert.equal(cr.body.status, 'CREATED'); assert.equal(cr.body.transTime, t0);
  assert.equal((await uzum.handle('create', { serviceId: 777, transId: 'T1', params: { order_id: o.id }, amount: 99900000 }, UA, t0 + 5)).body.transTime, t0);
  assert.equal((await uzum.handle('create', { serviceId: 777, transId: 'T2', params: { order_id: o.id }, amount: 99900000 }, UA, t0 + 5)).body.errorCode, '10010');
  const cf = await uzum.handle('confirm', { serviceId: 777, transId: 'T1', paymentSource: 'UZCARD', phone: '998901234567' }, UA, t0 + 100);
  assert.equal(cf.body.status, 'CONFIRMED'); assert.equal(cf.body.amount, 99900000);
  assert.equal((await get('u1')).credits, 30);
  assert.equal((await uzum.handle('confirm', { serviceId: 777, transId: 'T1' }, UA, t0 + 200)).body.confirmTime, t0 + 100);
  assert.equal((await get('u1')).credits, 30);
  assert.equal((await uzum.handle('status', { serviceId: 777, transId: 'T1' }, UA)).body.status, 'CONFIRMED');
  assert.equal((await uzum.handle('check', { serviceId: 777, params: { order_id: o.id } }, UA)).body.errorCode, '10008');
  assert.equal((await uzum.handle('status', { serviceId: 777, transId: 'nope' }, UA)).body.errorCode, '10014');
  const rv = await uzum.handle('reverse', { serviceId: 777, transId: 'T1' }, UA, t0 + 300);
  assert.equal(rv.body.status, 'REVERSED');
  assert.equal((await get('u1')).credits, 0);
  assert.equal((await M.Order.findOne({ id: o.id }).lean()).status, 'refunded');
  // 30 daqiqada tasdiqlanmagan — bekor
  const o2 = await billing.createOrder({ client: await get('u1'), planKey: 'base', provider: 'uzum' });
  await uzum.handle('create', { serviceId: 777, transId: 'T3', params: { order_id: o2.id }, amount: 49900000 }, UA, t0);
  assert.equal((await uzum.handle('confirm', { serviceId: 777, transId: 'T3' }, UA, t0 + uzum.CONFIRM_WINDOW + 1)).body.errorCode, '10015');
});

test('avto-yangilash: kartadan to\'lov bir marta, kafolat bajarilmagan bo\'lsa olinmaydi', async () => {
  process.env.PAYME_SUBSCRIBE = '1';
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opt) => {
    const b = JSON.parse(opt.body);
    calls.push({ url, method: b.method, auth: opt.headers['X-Auth'], params: b.params });
    const result = b.method === 'receipts.create' ? { receipt: { _id: 'rc1', state: 0 } }
      : b.method === 'receipts.pay' ? { receipt: { _id: 'rc1', state: 4 } }
      : b.method === 'cards.check' ? { card: { number: '860006******6311', verify: true, recurrent: true } } : {};
    return { json: async () => ({ result }) };
  };
  try {
    const now = new Date();
    await M.Client.create({ id: 'a1', agencyId: A, name: 'Avto', status: 'active', credits: 5,
      plan: { key: 'pro', startedAt: new Date(now.getTime() - 29 * DAY), endsAt: new Date(now.getTime() + 12 * 36e5), guaranteeExtendedAt: now } });
    const r = await billing.saveCard(await get('a1'), 'tok_1234567890');
    assert.equal(r.masked, '860006******6311');
    assert.equal(calls[0].auth, 'm9:pk');
    let t = await billing.tick({ now });
    assert.equal(t.auto.paid, 1);
    const o = await M.Order.findOne({ clientId: 'a1', auto: true }).lean();
    assert.equal(o.receiptId, 'rc1');
    assert.equal(o.planKey, 'pro');
    const pay = calls.find(c => c.method === 'receipts.pay');
    assert.deepEqual(pay.params, { id: 'rc1', token: 'tok_1234567890' });
    assert.equal(calls.find(c => c.method === 'receipts.create').params.account.order_id, o.id);
    t = await billing.tick({ now });
    assert.equal(t.auto.tried, 0);                                   // shu davrda qayta urinilmaydi

    // kafolat bajarilmagan (uzaytirilmagan) — kartadan yechilmaydi
    await M.Client.create({ id: 'a2', agencyId: A, name: 'Avto2', status: 'active', credits: 5,
      autoRenew: { on: true, provider: 'payme', token: 'tok_x', masked: '8600' },
      plan: { key: 'pro', startedAt: new Date(now.getTime() - 29 * DAY), endsAt: new Date(now.getTime() + 12 * 36e5) } });
    t = await billing.tick({ now });
    assert.equal(t.auto.tried, 0);
    // o'chirish
    assert.equal((await billing.setAutoRenew(await get('a1'), false)).on, false);
    assert.equal((await billing.setAutoRenew(await get('a1'), 'remove')).masked, '');
    assert.equal((await get('a1')).autoRenew.token, '');
  } finally { global.fetch = realFetch; delete process.env.PAYME_SUBSCRIBE; }
});
