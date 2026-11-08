// ── Suhbatni avtomatik kelishish (services/interviews) ──
// Vaqt tanlash, eslatmalar, "keldimi?", kelmasa kredit qaytishi, conflict.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, iv, sl, sent = [];
const A = 'agIV';
// Dushanba, 2026-11-09 08:00 Toshkent (03:00 UTC)
const MON8 = new Date(Date.UTC(2026, 10, 9, 3, 0));
const H = 3600e3;

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Shortlist', 'CreditLedger', 'Interview', 'Restaurant']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return {}; };
  tg.platformToken = () => 'x';
  iv = require('../src/services/interviews');
  sl = require('../src/services/shortlist');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  sent = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Client.create({ id: 'cl1', agencyId: A, name: 'Rayhon', credits: 5, status: 'active', tgChatId: 'c100',
    address: 'Chilonzor 9', ivPrefs: { days: [1, 2, 3, 4, 5, 6], from: '11:00', to: '17:00' } });
  await M.Candidate.create([
    { id: 'k1', restaurantId: A, fullName: 'Aziza Karimova', phone: '+998901112233', publicCode: 'A-1', tgChatId: 'k200', tgState: 'linked' },
    { id: 'k2', restaurantId: A, fullName: 'Bekzod', phone: '+998901112244', publicCode: 'B-2' }
  ]);
  await M.Shortlist.create({ id: 's1', agencyId: A, clientId: 'cl1', items: [
    { candidateId: 'k1', state: 'candidate_ok' }, { candidateId: 'k2', state: 'candidate_ok' }] });
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k1' });       // -1 kredit
  sent = [];
});

const bal = async () => (await M.Client.findOne({ id: 'cl1' }).lean()).credits;
const item = async c => (await M.Shortlist.findOne({ id: 's1' }).lean()).items.find(i => i.candidateId === c);
const local = d => { const x = new Date(new Date(d).getTime() + 5 * H); return { wd: x.getUTCDay() || 7, hh: x.getUTCHours(), mm: x.getUTCMinutes() }; };
const btns = m => ((m && m.extra && m.extra.reply_markup && m.extra.reply_markup.inline_keyboard) || []).flat();
const offerPick = (now = MON8) => iv.offer({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k1', now });

test('bo\'sh vaqtlar: 3 kun, kuniga 4 tagacha, oraliq ichida, yakshanba yo\'q, band vaqt chiqadi', () => {
  const p = { days: [1, 2, 3, 4, 5, 6], from: '11:00', to: '17:00' };
  const s = iv.makeSlots(p, MON8);
  const days = new Set(s.map(d => local(d).wd));
  assert.equal(days.size, 3);
  for (const d of s) { const L = local(d); assert.ok(L.hh >= 11 && L.hh <= 16, 'soat ' + L.hh); assert.notEqual(L.wd, 7); }
  for (const wd of days) assert.ok(s.filter(d => local(d).wd === wd).length <= 4);
  assert.ok(s[0].getTime() >= MON8.getTime() + 3 * H);
  const busy = iv.makeSlots(p, MON8, [s[0]]);
  assert.ok(!busy.some(d => d.getTime() === s[0].getTime()));
  // Shanba kechqurun: yakshanba o'tkazib yuboriladi
  const sat = new Date(Date.UTC(2026, 10, 14, 16, 0));      // Sh 21:00
  assert.ok(iv.makeSlots(p, sat).every(d => local(d).wd !== 7));
});

test('taklif -> nomzod vaqt tanlaydi -> tanlovda "suhbat", mijozga xabar', async () => {
  const v = await offerPick();
  assert.equal(v.status, 'offered');
  const m = sent.find(x => x.chat === 'k200');
  assert.ok(m && /Rayhon/.test(m.text) && /Chilonzor 9/.test(m.text));
  const pick = btns(m).find(b => /^iv:p:/.test(b.callback_data));
  sent = [];
  const r = await iv.handleCallback({ data: pick.callback_data, chatId: 'k200', now: MON8 });
  assert.equal(r.ok, true);
  const doc = await M.Interview.findOne({ id: v.id }).lean();
  assert.equal(doc.status, 'scheduled');
  const it = await item('k1');
  assert.equal(it.state, 'interview');
  assert.equal(new Date(it.interviewAt).getTime(), new Date(doc.at).getTime());
  assert.ok(sent.some(x => x.chat === 'c100' && /Aziza/.test(x.text)));
});

test('boshqa chatdan bosilgan tugma rad etiladi', async () => {
  const v = await offerPick();
  const r = await iv.handleCallback({ data: `iv:p:${v.id}:0`, chatId: 'c100', now: MON8 });
  assert.equal(r.ok, false);
  assert.equal((await M.Interview.findOne({ id: v.id }).lean()).status, 'offered');
});

test('eslatmalar: 2 soat oldin bir marta, 30 daqiqada tasdiqlamasa mijozga ogohlantirish', async () => {
  const at = new Date(MON8.getTime() + 6 * H);
  const v = await iv.offer({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k1', mode: 'fixed', at, now: MON8 });
  assert.equal(v.status, 'scheduled');
  sent = [];
  const t2 = new Date(at.getTime() - 2 * H + 60e3);
  let r = await iv.tick(t2);
  assert.equal(r.r2, 1);
  assert.equal((await iv.tick(t2)).r2, 0);                       // takror yo'q
  assert.ok(btns(sent.find(x => x.chat === 'k200')).some(b => /^iv:y:/.test(b.callback_data)));
  r = await iv.tick(new Date(at.getTime() - 20 * 60e3));
  assert.equal(r.warn, 1);
  assert.ok(sent.some(x => x.chat === 'c100' && /tasdiqlamadi/.test(x.text)));
});

test('nomzod "umuman bormayman" — kredit qaytadi, mijozga xabar', async () => {
  const v = await offerPick();
  assert.equal(await bal(), 4);
  await iv.handleCallback({ data: `iv:n:${v.id}`, chatId: 'k200', now: MON8 });
  const r = await iv.handleCallback({ data: `iv:x:${v.id}`, chatId: 'k200', now: MON8 });
  assert.equal(r.ok, true);
  assert.equal((await M.Interview.findOne({ id: v.id }).lean()).status, 'declined');
  assert.equal(await bal(), 5);
  assert.equal((await item('k1')).state, 'refunded');
  assert.ok(sent.some(x => x.chat === 'c100' && /bora olmasligini/.test(x.text)));
});

test('suhbatdan keyin: mijoz "kelmadi" — kredit qaytadi; ikkinchi bosish ta\'sir qilmaydi', async () => {
  const at = new Date(MON8.getTime() + 5 * H);
  const v = await iv.offer({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k1', mode: 'fixed', at, now: MON8 });
  const after1h = new Date(at.getTime() + H + 60e3);
  sent = [];
  const r = await iv.tick(after1h);
  assert.equal(r.asked, 1);
  assert.ok(sent.some(x => x.chat === 'c100') && sent.some(x => x.chat === 'k200'));
  await iv.handleCallback({ data: `iv:cn:${v.id}`, chatId: 'c100', now: after1h });
  assert.equal(await bal(), 5);
  assert.equal((await M.Interview.findOne({ id: v.id }).lean()).status, 'noshow');
  await iv.handleCallback({ data: `iv:cn:${v.id}`, chatId: 'c100', now: after1h });
  assert.equal(await bal(), 5);
});

test('conflict: nomzod "bordim", mijoz "kelmadi" — kredit qaytmaydi', async () => {
  const at = new Date(MON8.getTime() + 5 * H);
  const v = await iv.offer({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k1', mode: 'fixed', at, now: MON8 });
  const later = new Date(at.getTime() + 2 * H);
  await iv.tick(later);
  await iv.handleCallback({ data: `iv:kg:${v.id}`, chatId: 'k200', now: later });
  await iv.handleCallback({ data: `iv:cn:${v.id}`, chatId: 'c100', now: later });
  assert.equal((await M.Interview.findOne({ id: v.id }).lean()).status, 'conflict');
  assert.equal(await bal(), 4);
});

test('mijoz "keldi" -> "ishga olaman" — tanlovda hired', async () => {
  const at = new Date(MON8.getTime() + 5 * H);
  const v = await iv.offer({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k1', mode: 'fixed', at, now: MON8 });
  const later = new Date(at.getTime() + 2 * H);
  const r = await iv.handleCallback({ data: `iv:cc:${v.id}`, chatId: 'c100', now: later });
  assert.ok(r.keyboard.flat().some(b => b.callback_data === `iv:h1:${v.id}`));
  await iv.handleCallback({ data: `iv:h1:${v.id}`, chatId: 'c100', now: later });
  assert.equal((await item('k1')).state, 'hired');
  assert.equal((await M.Interview.findOne({ id: v.id }).lean()).status, 'done');
  assert.equal(await bal(), 4);
});

test('24 soatda vaqt tanlamadi — yopiladi, kredit qaytadi', async () => {
  const v = await offerPick();
  const r = await iv.tick(new Date(MON8.getTime() + 25 * H));
  assert.equal(r.expired, 1);
  assert.equal((await M.Interview.findOne({ id: v.id }).lean()).status, 'expired');
  assert.equal(await bal(), 5);
});

test('Telegramsiz nomzod — avtomatik taklif yo\'q (no_tg)', async () => {
  await sl.reveal({ agencyId: A, shortlistId: 's1', candidateId: 'k2' });
  await assert.rejects(iv.offer({ agencyId: A, clientId: 'cl1', shortlistId: 's1', candidateId: 'k2', now: MON8 }), e => e.code === 'no_tg');
});

test('yangi taklif oldingisini bekor qiladi (bitta faol suhbat)', async () => {
  const a = await offerPick();
  const b = await offerPick();
  assert.equal((await M.Interview.findOne({ id: a.id }).lean()).status, 'cancelled');
  assert.equal((await M.Interview.findOne({ id: b.id }).lean()).status, 'offered');
  const r = await iv.handleCallback({ data: `iv:p:${a.id}:0`, chatId: 'k200', now: MON8 });
  assert.equal(r.ok, false);
});
