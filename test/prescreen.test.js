// ── Arizadan keyingi tekshiruv (services/prescreen) va moslik bali (services/matchScore) ──
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, ps, ms, apps, sent = [], R = {};
const A = 'agPS';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Vacancy', 'Application', 'Restaurant', 'Shortlist']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return {}; };
  tg.sendVoice = async (tok, chat, fid, extra) => { sent.push({ chat, voice: fid, extra }); return {}; };
  tg.platformToken = () => 'x';
  ps = require('../src/services/prescreen');
  ms = require('../src/services/matchScore');
  apps = require('../src/services/applications');
  const ma = require('../src/routes/miniapp');
  const layer = ma.stack.find(l => l.route && l.route.path === '/applications' && l.route.methods.get);
  R.list = layer.route.stack[layer.route.stack.length - 1].handle;
  const vl = ma.stack.find(l => l.route && l.route.path === '/applications/:id/voice' && l.route.methods.post);
  R.voice = vl.route.stack[vl.route.stack.length - 1].handle;
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const call = (h, req) => new Promise((resolve, reject) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, set() { return this; }, json(j) { resolve({ code: this.code, j }); } };
  h(Object.assign({ params: {}, body: {}, query: {}, headers: {}, lang: 'uz', get: () => 'test.local', protocol: 'https' }, req), res,
    e => (e ? reject(e) : resolve({ code: 0 })));
});

beforeEach(async () => {
  sent = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Client.create({ id: 'cl1', agencyId: A, name: 'Rayhon', status: 'active', tgChatId: 'c100', credits: 3 });
  await M.Vacancy.create({ id: 'v1', agencyId: A, clientId: 'cl1', title: 'Ofitsiant, kechki smena', role: 'ofitsiant',
    shift: 'kechki', location: 'Chilonzor', salaryFrom: 4000000, salaryTo: 5000000, minExp: 1, status: 'open' });
  await M.Candidate.create({ id: 'k1', restaurantId: A, fullName: 'Aziza', phone: '+998901112233', role: 'ofitsiant',
    experienceYears: 2, salaryExpectation: '4-5 mln', shift: 'kechki', location: 'Chilonzor', tgChatId: 'k200', tgState: 'linked', jobStatus: 'active' });
});

const btns = m => ((m && m.extra && m.extra.reply_markup && m.extra.reply_markup.inline_keyboard) || []).flat();
async function submit() {
  const c = await M.Candidate.findOne({ id: 'k1' });
  const v = await M.Vacancy.findOne({ id: 'v1' }).lean();
  return apps.submit({ cand: c, vacancy: v, appBase: 'https://x' });
}

test('maosh matnini o\'qish', () => {
  assert.equal(ms.parseMoney('4-5 mln'), 4000000);
  assert.equal(ms.parseMoney('4 500 000 so\'m'), 4500000);
  assert.equal(ms.parseMoney('4,5 млн'), 4500000);
  assert.equal(ms.parseMoney('800 ming'), 800000);
  assert.equal(ms.parseMoney('5'), 5000000);
  assert.equal(ms.parseMoney('kelishamiz'), null);
});

test('moslik bali: hammasi mos — yuqori, mos emas — past, sabablari bilan', () => {
  const v = { role: 'ofitsiant', minExp: 1, salaryTo: 5000000, location: 'Chilonzor', shift: 'kechki' };
  const good = ms.score({ role: 'ofitsiant', experienceYears: 2, salaryExpectation: '4 mln', location: 'Chilonzor', shift: 'kechki' }, v,
    { fit: 'ok', start: 'week', commute: '30' });
  assert.ok(good.score >= 90, 'good ' + good.score);
  assert.ok(good.parts.every(p => p.ok !== false));
  const bad = ms.score({ role: 'oshpaz', experienceYears: 0, salaryExpectation: '9 mln', shift: 'kunduzgi' }, v,
    { fit: 'no', start: 'busy', commute: '90' });
  assert.ok(bad.score < 25, 'bad ' + bad.score);
  for (const k of ['role', 'expLow', 'salaryHigh', 'far', 'shiftNo', 'fitNo']) assert.ok(bad.parts.some(p => p.k === k && p.ok === false), k);
});

test('ariza -> botda 3 savol -> ovoz o\'tkazib yuborildi -> tugadi', async () => {
  const a = await submit();
  const q1 = sent.find(x => x.chat === 'k200');
  assert.ok(q1 && /1\/3/.test(q1.text) && /Chilonzor/.test(q1.text));
  const ok = btns(q1).find(b => b.callback_data === `ps:f:${a.id}:ok`);
  assert.ok(ok);
  let r = await ps.handleCallback({ data: ok.callback_data, chatId: 'k200' });
  assert.match(r.edit, /2\/3/);
  r = await ps.handleCallback({ data: `ps:f:${a.id}:ok`, chatId: 'k200' });             // takror — ta'sirsiz
  assert.equal(r.edit, undefined);
  r = await ps.handleCallback({ data: `ps:s:${a.id}:week`, chatId: 'k200' });
  assert.match(r.edit, /3\/3/);
  r = await ps.handleCallback({ data: `ps:c:${a.id}:30`, chatId: 'k200' });
  assert.ok(r.keyboard.flat().some(b => b.callback_data === `ps:v:${a.id}:skip`));
  r = await ps.handleCallback({ data: `ps:v:${a.id}:skip`, chatId: 'k200', appBase: 'https://x' });
  assert.match(r.edit, /Rahmat/);
  const doc = await M.Application.findOne({ id: a.id }).lean();
  assert.deepEqual([doc.screen.step, doc.screen.fit, doc.screen.start, doc.screen.commute], ['done', 'ok', 'week', '30']);
});

test('anketada "qachondan" javob bergan — bu savol so\'ralmaydi (1/2, 2/2)', async () => {
  await M.Candidate.updateOne({ id: 'k1' }, { $set: { availableFrom: new Date(Date.now() + 864e5) } });
  const a = await submit();
  const q1 = sent.find(x => x.chat === 'k200');
  assert.match(q1.text, /1\/2/);
  const r = await ps.handleCallback({ data: `ps:f:${a.id}:ok`, chatId: 'k200' });
  assert.match(r.edit, /2\/2/);
  const doc = await M.Application.findOne({ id: a.id }).lean();
  assert.deepEqual([doc.screen.step, doc.screen.start, doc.screen.startPre], ['commute', 'now', true]);
});

test('"mos emas" — sababi so\'raladi va tugaydi', async () => {
  const a = await submit();
  let r = await ps.handleCallback({ data: `ps:f:${a.id}:no`, chatId: 'k200' });
  assert.ok(r.keyboard.flat().some(b => b.callback_data === `ps:w:${a.id}:far`));
  r = await ps.handleCallback({ data: `ps:w:${a.id}:far`, chatId: 'k200' });
  const doc = await M.Application.findOne({ id: a.id }).lean();
  assert.deepEqual([doc.screen.step, doc.screen.fit, doc.screen.fitWhy], ['done', 'no', 'far']);
});

test('boshqa chatdan bosilgan tugma rad etiladi', async () => {
  const a = await submit();
  const r = await ps.handleCallback({ data: `ps:f:${a.id}:ok`, chatId: 'c100' });
  assert.equal(r.ok, false);
  assert.equal((await M.Application.findOne({ id: a.id }).lean()).screen.step, 'fit');
});

test('ovozli tanishuv: faqat oxirgi savolda qabul qilinadi; mijozga yuboriladi', async () => {
  const a = await submit();
  const cand = await M.Candidate.findOne({ id: 'k1' }).lean();
  assert.equal(await ps.takeVoice({ cand, voice: { file_id: 'F1', duration: 25 } }), false);   // hali birinchi savol
  for (const d of [`ps:f:${a.id}:ok`, `ps:s:${a.id}:now`, `ps:c:${a.id}:60`]) await ps.handleCallback({ data: d, chatId: 'k200' });
  assert.equal(await ps.takeVoice({ cand, voice: { file_id: 'F1', duration: 25 } }), true);
  const doc = await M.Application.findOne({ id: a.id }).lean();
  assert.equal(doc.screen.voiceFileId, 'F1');
  assert.equal(doc.screen.step, 'done');

  // Mini App: ball, sabablar, ovoz tugmasi; ovoz mijoz chatiga
  const client = await M.Client.findOne({ id: 'cl1' });
  const list = await call(R.list, { client });
  const it = list.j.find(x => x.id === a.id);
  assert.ok(it.score >= 80, 'score ' + it.score);
  assert.ok(it.scoreWhy.some(w => /Bugun-ertaga/.test(w.t)));
  assert.equal(it.screen.voice, true);
  sent = [];
  const v = await call(R.voice, { client, params: { id: a.id } });
  assert.equal(v.j.ok, true);
  assert.ok(sent.some(x => x.chat === 'c100' && x.voice === 'F1'));
});

test('eslatma: 3 soatdan keyin bir marta, kunduzi', async () => {
  const a = await submit();
  await M.Application.updateOne({ id: a.id }, { $set: { 'screen.startedAt': new Date(Date.UTC(2026, 10, 9, 4, 0)) } });   // 09:00 Toshkent
  sent = [];
  const noon = new Date(Date.UTC(2026, 10, 9, 8, 0));                                                                          // 13:00
  assert.equal((await ps.tick(noon)).reminded, 1);
  assert.equal((await ps.tick(noon)).reminded, 0);
  assert.ok(sent.some(x => x.chat === 'k200' && /1\/3/.test(x.text)));
});
