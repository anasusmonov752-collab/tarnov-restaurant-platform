// ── Ovozni Mini App ichida o'ynatish: Range javoblari (iOS <audio> 206 talab qiladi) ──
const { test } = require('node:test');
const assert = require('node:assert/strict');
const va = require('../src/services/voiceAudio');

test('Range sarlavhasi: boshi-oxiri, ochiq oxir, oxirgi N bayt, noto\'g\'ri', () => {
  assert.equal(va.parseRange(undefined, 100), null);
  assert.deepEqual(va.parseRange('bytes=0-1', 100), { start: 0, end: 1 });
  assert.deepEqual(va.parseRange('bytes=10-', 100), { start: 10, end: 99 });
  assert.deepEqual(va.parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(va.parseRange('bytes=50-500', 100), { start: 50, end: 99 });
  assert.equal(va.parseRange('bytes=200-', 100), false);
  assert.equal(va.parseRange('bytes=-', 100), false);
  assert.equal(va.parseRange('items=0-1', 100), false);
});

function fakeRes() {
  const r = { headers: {}, code: 0, body: null };
  r.set = (k, v) => { r.headers[k] = v; return r; };
  r.status = c => { r.code = c; return r; };
  r.end = b => { r.body = b === undefined ? null : b; return r; };
  return r;
}

test('send: 200 butun fayl, 206 bo\'lak, 416 chegaradan tashqari', () => {
  const buf = Buffer.from('0123456789');
  let res = va.send({ headers: {} }, fakeRes(), buf);
  assert.equal(res.code, 200); assert.equal(res.body.length, 10);
  assert.equal(res.headers['Content-Type'], 'audio/mp4');
  assert.equal(res.headers['Accept-Ranges'], 'bytes');

  res = va.send({ headers: { range: 'bytes=0-1' } }, fakeRes(), buf);
  assert.equal(res.code, 206); assert.equal(res.body.toString(), '01');
  assert.equal(res.headers['Content-Range'], 'bytes 0-1/10');

  res = va.send({ headers: { range: 'bytes=20-' } }, fakeRes(), buf);
  assert.equal(res.code, 416); assert.equal(res.headers['Content-Range'], 'bytes */10');
});

test('m4a: keshdagi fayl Telegram\'ga qayta so\'rov yubormaydi', async () => {
  const b = Buffer.from('cached');
  va._cache.set('fid-test', b);
  assert.equal(await va.m4a('fid-test', { token: 'x' }), b);
  await assert.rejects(() => va.m4a('', { token: 'x' }), /Ovoz/);
});

test('ai.isBusy: timeout, kvota, 429/503 — "band"; boshqa xato — yo\'q', () => {
  const ai = require('../src/services/ai');
  assert.equal(ai.isBusy(Object.assign(new Error('Gemini 45 s ichida javob bermadi'), { code: 'AI_TIMEOUT' })), true);
  assert.equal(ai.isBusy(Object.assign(new Error('x'), { code: 'QUOTA_EXHAUSTED' })), true);
  assert.equal(ai.isBusy(new Error('got status: 429 RESOURCE_EXHAUSTED')), true);
  assert.equal(ai.isBusy(new Error('503 UNAVAILABLE: The model is overloaded')), true);
  assert.equal(ai.isBusy(new Error('AI javobini JSON sifatida o\'qib bo\'lmadi')), false);
  assert.equal(ai.isBusy(null), false);
});
