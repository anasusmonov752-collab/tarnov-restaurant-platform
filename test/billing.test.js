// ── Tariflar va to'lov: activate, sinov, muddat tugashi, Payme, Click ──
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, billing, payme, click;
const A = 'agB';

before(async () => {
  process.env.PAYME_MERCHANT_ID = 'm1'; process.env.PAYME_KEY = 'secret-key';
  process.env.CLICK_SERVICE_ID = '111'; process.env.CLICK_MERCHANT_ID = '222'; process.env.CLICK_SECRET_KEY = 'click-secret';
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Order', 'CreditLedger']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  billing = require('../src/services/billing');
  payme = require('../src/services/payme');
  click = require('../src/services/click');
  await M.Client.create({ id: 'c1', agencyId: A, name: 'Rayhon', status: 'active', credits: 2 });
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const cl = () => M.Client.findOne({ id: 'c1' }).lean();

test('ulangan to\'lov tizimlari va to\'lov havolasi', async () => {
  assert.deepEqual(billing.providers(), ['payme', 'click']);
  const o = { id: 'o-x', amount: 499000, provider: 'payme' };
  const url = billing.checkoutUrl(o, 'https://t.me/bot');
  const raw = Buffer.from(url.split('/').pop(), 'base64').toString();
  assert.match(raw, /^m=m1;ac\.order_id=o-x;a=49900000;c=https:\/\/t\.me\/bot/);
  assert.match(billing.checkoutUrl(Object.assign({}, o, { provider: 'click' }), 'x'), /service_id=111&merchant_id=222&amount=499000&transaction_param=o-x/);
});

test('bepul sinov: bir marta, 3 kredit, 7 kun', async () => {
  const r = await billing.startTrial({ agencyId: A, id: 'c1' });
  assert.equal(r.balance, 5);
  assert.equal((await cl()).plan.key, 'trial');
  await assert.rejects(() => billing.startTrial({ agencyId: A, id: 'c1' }), /allaqachon/);
});

test('qo\'lda tasdiqlash: kredit qo\'shiladi, qolgani saqlanadi, takror xavfsiz', async () => {
  const c = await cl();
  const o = await billing.createOrder({ client: c, planKey: 'pro', provider: 'manual' });
  assert.equal(o.amount, 999000);
  const r = await billing.activate(o.id, { by: 'admin' });
  assert.equal(r.balance, 5 + 30);                                    // sinovdan qolgan 5 + Pro 30
  const after = await cl();
  assert.equal(after.plan.key, 'pro');
  assert.ok(new Date(after.plan.endsAt) > new Date(Date.now() + 29 * 864e5));
  assert.equal((await billing.activate(o.id)).already, true);
  assert.equal((await cl()).credits, 35);                             // ikkinchi marta qo'shilmadi
  await assert.rejects(() => billing.createOrder({ client: c, planKey: 'gold', provider: 'manual' }), /Tarif/);
});

test('muddat tugashi: kreditlar yonadi, eslatma bir marta', async () => {
  const now = new Date();
  await M.Client.updateOne({ id: 'c1' }, { $set: { 'plan.endsAt': new Date(now.getTime() + 2 * 864e5), 'plan.remindedAt': null } });
  let t = await billing.tick({ now });
  assert.equal(t.reminded, 1);
  assert.equal((await billing.tick({ now })).reminded, 0);
  t = await billing.tick({ now: new Date(now.getTime() + 3 * 864e5) });
  assert.equal(t.expired, 1);
  assert.equal(t.burned, 35);
  const c = await cl();
  assert.equal(c.credits, 0);
  assert.ok(c.plan.expiredAt);
  assert.equal(await M.CreditLedger.countDocuments({ clientId: 'c1', reason: 'expire' }), 1);
  assert.equal(billing.planView(c, new Date(now.getTime() + 3 * 864e5)).key, '');
});

const auth = 'Basic ' + Buffer.from('Paycom:secret-key').toString('base64');
const call = (method, params, now) => payme.handle({ id: 1, method, params }, auth, now);

test('Payme: tekshiruv, yaratish, bajarish, bekor qilish', async () => {
  const c = await cl();
  const o = await billing.createOrder({ client: c, planKey: 'base', provider: 'payme' });
  const acc = { order_id: o.id };
  assert.equal((await payme.handle({ id: 1, method: 'CheckPerformTransaction', params: {} }, 'Basic xxx')).error.code, -32504);
  assert.equal((await call('CheckPerformTransaction', { amount: 100, account: acc })).error.code, -31001);
  assert.equal((await call('CheckPerformTransaction', { amount: 49900000, account: { order_id: 'yoq' } })).error.code, -31050);
  assert.equal((await call('CheckPerformTransaction', { amount: 49900000, account: acc })).result.allow, true);

  const t0 = Date.now();
  const cr = await call('CreateTransaction', { id: 'p1', time: t0, amount: 49900000, account: acc }, t0);
  assert.equal(cr.result.state, 1);
  assert.equal((await call('CreateTransaction', { id: 'p2', time: t0, amount: 49900000, account: acc }, t0)).error.code, -31099);
  assert.equal((await call('CreateTransaction', { id: 'p1', time: t0, amount: 49900000, account: acc }, t0)).result.create_time, t0);

  const pf = await call('PerformTransaction', { id: 'p1' }, t0 + 1000);
  assert.equal(pf.result.state, 2);
  assert.equal((await cl()).credits, 10);                             // Base: 10 kredit
  assert.equal((await call('PerformTransaction', { id: 'p1' }, t0 + 5000)).result.perform_time, t0 + 1000);
  assert.equal((await call('CancelTransaction', { id: 'p1', reason: 5 })).error.code, -31007);
  assert.equal((await call('CheckTransaction', { id: 'p1' })).result.state, 2);
  assert.equal((await call('GetStatement', { from: t0 - 1, to: t0 + 1 })).result.transactions.length, 1);
  assert.equal((await call('Nomalum', {})).error.code, -32601);

  // 12 soatda bajarilmagan — bekor (sabab 4)
  const o2 = await billing.createOrder({ client: c, planKey: 'base', provider: 'payme' });
  await call('CreateTransaction', { id: 'p3', time: t0, amount: 49900000, account: { order_id: o2.id } }, t0);
  assert.equal((await call('PerformTransaction', { id: 'p3' }, t0 + payme.TIMEOUT + 1)).error.code, -31008);
  const ch = await call('CheckTransaction', { id: 'p3' });
  assert.equal(ch.result.state, -1);
  assert.equal(ch.result.reason, 4);
  assert.equal((await M.Order.findOne({ id: o2.id }).lean()).status, 'canceled');
});

test('Click: imzo, prepare, complete', async () => {
  const c = await cl();
  const o = await billing.createOrder({ client: c, planKey: 'base', provider: 'click' });
  const base = { click_trans_id: '9001', service_id: '111', click_paydoc_id: '1', merchant_trans_id: o.id, amount: '499000', sign_time: '2026-10-23 12:00:00' };
  const signed = (p, prep) => Object.assign({}, p, { sign_string: click.md5(`${p.click_trans_id}${p.service_id}click-secret${p.merchant_trans_id}${prep || ''}${p.amount}${p.action}${p.sign_time}`) });
  assert.equal((await click.prepare(Object.assign({}, base, { action: '0', sign_string: 'bad' }))).error, -1);
  assert.equal((await click.prepare(signed(Object.assign({}, base, { action: '0', amount: '1' })))).error, -2);
  const pr = await click.prepare(signed(Object.assign({}, base, { action: '0' })));
  assert.equal(pr.error, 0);
  const before = (await cl()).credits;
  const cm = await click.complete(signed(Object.assign({}, base, { action: '1', merchant_prepare_id: pr.merchant_prepare_id, error: '0' }), pr.merchant_prepare_id));
  assert.equal(cm.error, 0);
  assert.equal((await cl()).credits, before + 10);
  assert.equal((await click.complete(signed(Object.assign({}, base, { action: '1', merchant_prepare_id: pr.merchant_prepare_id, error: '0' }), pr.merchant_prepare_id))).error, -4);
});
