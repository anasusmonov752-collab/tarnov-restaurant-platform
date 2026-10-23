// ── Chala anketa eslatmasi: kimga, qachon, necha marta ───────
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, SR, Candidate, Client, rem;
const H = 36e5;
// Toshkent 12:00 = 07:00 UTC — kunduz (tunda yozilmaydi)
const NOON = new Date('2026-10-23T07:00:00Z');
const ago = h => new Date(NOON.getTime() - h * H);

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  SR = require('../src/models/SurveyResponse');
  Candidate = require('../src/models/Candidate');
  Client = require('../src/models/Client');
  await Promise.all([SR.syncIndexes(), Candidate.syncIndexes()]);
  rem = require('../src/services/reminders');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const mk = (id, o) => SR.create(Object.assign({ id, agencyId: 'agR', surveyId: 's', tgUserId: 'u' + id, chatId: 'u' + id,
  status: 'started', startedAt: ago(3), updatedAt: ago(3) }, o));

test('tunda yozilmaydi (Toshkent 22:00–09:00)', () => {
  assert.equal(rem.quietNow(new Date('2026-10-23T17:30:00Z')), true);   // 22:30
  assert.equal(rem.quietNow(new Date('2026-10-23T03:59:00Z')), true);   // 08:59
  assert.equal(rem.quietNow(new Date('2026-10-23T04:00:00Z')), false);  // 09:00
  assert.equal(rem.quietNow(NOON), false);
});

test('kimga ketadi: ochmagan va yarmida qoldirgan; kimga ketmaydi', async () => {
  await mk('a', {});                                                     // 3 soat oldin, ochmagan -> 1-eslatma
  await mk('b', { step: 'shift', answers: { role: 'ofitsiant', shift: 'kechki' } });   // yarmida -> 1-eslatma
  await mk('c', { startedAt: ago(1), updatedAt: ago(1) });              // hali 2 soat bo'lmagan
  await mk('d', { reminders: 1, remindedAt: ago(10) });                 // 2-eslatmaga hali erta
  await mk('e', { reminders: 1, remindedAt: ago(23) });                 // 2-eslatma vaqti keldi
  await mk('f', { reminders: 2, remindedAt: ago(48) });                 // 2 tadan ortiq yo'q
  await mk('g', { startedAt: ago(8 * 24), updatedAt: ago(8 * 24) });    // 7 kundan eski
  await mk('h', {});                                                     // bazada bor nomzod
  await Candidate.create({ id: 'kh', restaurantId: 'agR', tgChatId: 'uh', tgState: 'linked' });
  await mk('i', {});                                                     // mijoz akkaunti
  await Client.create({ id: 'ci', agencyId: 'agR', name: 'R', tgChatId: 'ui' });
  await mk('j', {});                                                     // boshqa anketani tugatgan
  await SR.create({ id: 'j2', agencyId: 'agR', surveyId: 's', tgUserId: 'uj', status: 'done' });
  await mk('k', { remindStop: true });                                   // botni bloklagan

  const due = (await rem.due(NOON)).map(r => r.id).sort();
  assert.deepEqual(due, ['a', 'b', 'e']);
});

test('yuborish: matn turi, tugma havolasi, hisob; bloklagan — to\'xtatiladi', async () => {
  const sent = [];
  const send = async (chat, text, opts) => {
    if (chat === 'ue') { const e = new Error('blocked'); e.code = 403; throw e; }
    sent.push({ chat, text, url: opts.reply_markup.inline_keyboard[0][0].web_app.url, btn: opts.reply_markup.inline_keyboard[0][0].text });
  };
  // dry — hech narsa yubormaydi va yozmaydi
  const dry = await rem.run({ appBase: 'https://x', dry: true, now: NOON, send });
  assert.equal(dry.due, 3); assert.equal(sent.length, 0);

  const r = await rem.run({ appBase: 'https://x', now: NOON, send });
  assert.equal(r.sent, 2); assert.equal(r.blocked, 1);
  const a = sent.find(s => s.chat === 'ua'), b = sent.find(s => s.chat === 'ub');
  assert.match(a.text, /hali to'ldirilmagan/);
  assert.match(b.text, /yarmida qoldi/);
  assert.match(b.btn, /Davom ettirish/);
  assert.equal(a.url, 'https://x/anketa.html?r=a');
  assert.equal((await SR.findOne({ id: 'a' }).lean()).reminders, 1);
  assert.equal((await SR.findOne({ id: 'e' }).lean()).remindStop, true);

  // Darhol qayta ishga tushsa — takror yubormaydi
  const again = await rem.run({ appBase: 'https://x', now: NOON, send });
  assert.equal(again.sent, 0);
  // Tunda — umuman ishlamaydi
  assert.equal((await rem.run({ appBase: 'https://x', now: new Date('2026-10-23T18:00:00Z'), send })).quiet, true);
});

test('cron himoyasi: sir sozlanmagan — 503, noto\'g\'ri — 401', async () => {
  const router = require('../src/routes/cron');
  const layer = router.stack.find(l => l.route && l.route.path === '/reminders');
  const h = layer.route.stack[layer.route.stack.length - 1].handle;
  const call = (secret) => new Promise((resolve, reject) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(j) { resolve({ code: this.code, j }); } };
    h({ get: k => (k === 'X-Cron-Secret' ? secret : 'test.local'), headers: {}, protocol: 'https', body: { dry: true } },
      res, e => (e ? reject(e) : resolve({ code: 0 })));
  });
  delete process.env.CRON_SECRET;
  assert.equal((await call('x')).code, 503);
  process.env.CRON_SECRET = 'a'.repeat(32);
  assert.equal((await call('noto\'g\'ri')).code, 401);
  assert.equal((await call('b'.repeat(32))).code, 401);
  const ok = await call('a'.repeat(32));
  assert.ok(ok.code === 200 && ('quiet' in ok.j));
  delete process.env.CRON_SECRET;
});
