// ── O'sish funksiyalari: maosh tahlili (market), ish beruvchi reytingi,
// do'st taklifi (referral), birinchi kun paketi (onboard), smena bozori (shifts) ──
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, sent = [], market, er, pl, ob, sh, rel;
const A = 'agGR';
const H = 3600e3;

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Vacancy', 'Placement', 'Restaurant', 'Shift', 'Interview']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return { message_id: 1, chat: { id: chat } }; };
  market = require('../src/services/market');
  er = require('../src/services/employerRating');
  pl = require('../src/services/placements');
  ob = require('../src/services/onboard');
  sh = require('../src/services/shifts');
  rel = require('../src/services/reliability');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  sent = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true, adminEmail: 'gr@test.uz', adminPassword: 'secret1',
    telegram: { adminChatId: 'adm' } });
  await M.Client.create({ id: 'cl1', agencyId: A, name: 'Rayhon', status: 'active', tgChatId: 'c100', location: 'Chilonzor',
    address: 'Chilonzor 9', phone: '+998901234567' });
});

const btns = m => ((m && m.extra && m.extra.reply_markup && m.extra.reply_markup.inline_keyboard) || []).flat();
const cand = (id, x = {}) => M.Candidate.create(Object.assign({ id, restaurantId: A, fullName: 'Nomzod ' + id, role: 'ofitsiant',
  tgChatId: 't' + id, tgState: 'linked', jobStatus: 'active', phone: '+99890000000' + id.slice(-1) }, x));

// ── Maosh tahlili ──
test('market: kamida 5 ta yozuvda o\'rtacha, sinov hisoblanmaydi, maslahat darajasi', async () => {
  for (const [i, s] of ['4 000 000', '5 000 000', '5 000 000', '6 000 000'].entries()) await cand('m' + i, { salaryExpectation: s });
  await cand('mt', { salaryExpectation: '50 000 000', isTest: true });
  let st = await market.stats(A, { role: 'ofitsiant', location: 'Chilonzor' });
  assert.equal(st.n, 4);
  assert.equal(st.median, null);                                  // 5 tadan kam — ko'rsatilmaydi
  await cand('m9', { salaryExpectation: '7 000 000', location: 'Chilonzor tumani' });
  st = await market.stats(A, { role: 'ofitsiant', location: 'Chilonzor' });
  assert.equal(st.n, 5);
  assert.equal(st.median, 5000000);
  assert.equal(st.nearby, 1);
  assert.equal(market.advise(4000000, st).level, 'low');
  assert.equal(market.advise(5200000, st).level, 'ok');
  assert.equal(market.advise(6500000, st).level, 'high');
  assert.equal(await market.stats(A, { role: 'boshqa' }), null);
});

// ── Ish beruvchi reytingi va do'st mukofoti ──
test('reyting: "ha" bor va "yo\'q" yo\'q bo\'lsa belgi; bitta "yo\'q" belgini oladi', async () => {
  const P = (id, payOk, clientId = 'cl1') => M.Placement.create({ id, agencyId: A, clientId, candidateId: 'x' + id, shortlistId: 's', hiredAt: new Date(), payOk });
  await P('p00000001', 'yes'); await P('p00000002', 'partial'); await P('p00000003', 'no', 'cl2'); await P('p00000004', 'yes', 'cl2');
  const r = await er.forClients(A, ['cl1', 'cl2', 'cl3']);
  assert.deepEqual(r.cl1, { yes: 1, partial: 1, no: 0, ok: true });
  assert.equal(r.cl2.ok, false);
  assert.equal(r.cl3, undefined);
});

test('do\'st taklifi: mukofot bir marta, taklif qilganga va agentlikka xabar', async () => {
  await cand('r1');                                                 // taklif qilgan
  await cand('r2', { referredBy: 'r1' });                           // do'sti
  const p = await M.Placement.create({ id: 'a1b2c3d4e5', agencyId: A, clientId: 'cl1', candidateId: 'r2', shortlistId: 's', hiredAt: new Date(), status: 'done' });
  assert.equal(await pl.rewardReferrer(p), true);
  assert.equal(await pl.rewardReferrer(p), false);                  // takror — yo'q
  assert.equal((await M.Candidate.findOne({ id: 'r1' }).lean()).refRewards, 1);
  assert.ok(sent.some(x => x.chat === 'tr1'));
  assert.equal(sent.filter(x => x.chat === 'adm' && /Tavsiya mukofoti/.test(x.text)).length, 1);
  // Taklif qilmagan nomzod — mukofot yo'q
  const q = await M.Placement.create({ id: 'f0f0f0f0f0', agencyId: A, clientId: 'cl1', candidateId: 'r1', shortlistId: 's', hiredAt: new Date() });
  assert.equal(await pl.rewardReferrer(q), false);
});

// ── Birinchi kun paketi ──
test('onboard: paket mijoz ma\'lumoti bilan, test bir marta hisoblanadi, natija mijozga', async () => {
  await M.Client.updateOne({ id: 'cl1' }, { $set: { onboard: ob.clean({ time: 'Soat 09:30 da', bring: 'Pasport', dress: 'Qora shim' }) } });
  await cand('o1');
  const p = await M.Placement.create({ id: 'abcdef0123', agencyId: A, clientId: 'cl1', candidateId: 'o1', shortlistId: 's', hiredAt: new Date() });
  assert.equal(await ob.sendPack(p), true);
  const pack = sent.find(x => x.chat === 'to1');
  assert.match(pack.text, /Rayhon/);
  assert.match(pack.text, /09:30/);
  assert.match(pack.text, /Chilonzor 9/);                            // manzil — Client.address dan
  assert.equal(btns(pack)[0].callback_data, 'ob:s:abcdef0123');

  // Begona chat — rad
  assert.equal((await ob.handleCallback({ data: 'ob:s:abcdef0123', chatId: 'boshqa' })).ok, false);
  let r = await ob.handleCallback({ data: 'ob:s:abcdef0123', chatId: 'to1' });
  assert.equal(r.ok, true);
  assert.equal(r.keyboard.length, 3);
  const quiz = require('../src/data/onboardQuiz').HALL;
  for (let i = 0; i < quiz.length; i++) {
    r = await ob.handleCallback({ data: `ob:a:abcdef0123:${i}:${quiz[i].c}`, chatId: 'to1' });
    if (i === 0) {                                                   // takror bosish — ball qo'shilmaydi
      await ob.handleCallback({ data: `ob:a:abcdef0123:0:${quiz[0].c}`, chatId: 'to1' });
    }
  }
  const doc = await M.Placement.findOne({ id: 'abcdef0123' }).lean();
  assert.equal(doc.quizScore, 5);
  assert.ok(doc.quizDoneAt);
  assert.ok(sent.some(x => x.chat === 'c100' && /5\/5/.test(x.text)));
  assert.match((await ob.handleCallback({ data: 'ob:s:abcdef0123', chatId: 'to1' })).edit, /5\/5/);
});

// ── Smena bozori ──
const day = (now, addDays) => { const d = new Date(now.getTime() + 5 * H + addDays * 864e5); return d.toISOString().slice(0, 10); };

test('smena: tekshiruv — lavozim, vaqt, to\'lov; tungi smena ertasiga tugaydi', () => {
  const now = new Date(Date.UTC(2026, 10, 10, 7, 0));                 // 12:00 Toshkent
  assert.match(sh.validate({ role: 'x', date: day(now, 1), from: '18:00', to: '23:00', pay: 200000 }, now).error, /Lavozim/);
  assert.match(sh.validate({ role: 'ofitsiant', date: day(now, 0), from: '12:30', to: '18:00', pay: 200000 }, now).error, /1 soat/);
  assert.match(sh.validate({ role: 'ofitsiant', date: day(now, 1), from: '18:00', to: '23:00', pay: 1000 }, now).error, /to'lov/);
  const v = sh.validate({ role: 'ofitsiant', date: day(now, 1), from: '18:00', to: '02:00', pay: '250 000', slots: 2 }, now);
  assert.equal(v.error, undefined);
  assert.equal((v.endAt - v.startAt) / H, 8);
  assert.equal(v.startAt.toISOString(), `${day(now, 1)}T13:00:00.000Z`);
  assert.equal(v.pay, 250000);
});

test('smena: e\'lon -> mos nomzodlarga -> birinchi bosganlar band qiladi -> mijozga -> eslatma -> keldi/kelmadi', async () => {
  await cand('s1', { location: 'Chilonzor' });
  await cand('s2');
  await cand('s3');
  await cand('s4', { role: 'oshpaz' });                              // boshqa lavozim — yuborilmaydi
  await cand('s5', { shiftOptOut: true });                           // o'chirgan
  await cand('s6', { isTest: true });                                // sinov
  await cand('s7', { status: 'hired' });                             // ishda
  const client = await M.Client.findOne({ id: 'cl1' }).lean();
  const now = new Date();
  const start = new Date(now.getTime() + 5 * H);
  const loc = new Date(start.getTime() + 5 * H);
  const p2 = n => String(n).padStart(2, '0');
  const hm = d => `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  const r = await sh.create(client, { role: 'ofitsiant', date: loc.toISOString().slice(0, 10), from: hm(loc),
    to: hm(new Date(loc.getTime() + 4 * H)), pay: 200000, slots: 2 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.sent, 3);
  const offers = sent.filter(x => /Bir martalik smena/.test(x.text));
  assert.equal(offers[0].chat, 'ts1');                               // shu tumandagi oldin
  assert.ok(!/Rayhon/.test(offers[0].text));                         // restoran nomi band qilguncha yo'q
  const id = r.shift.id;

  // Ikkinchi e'lon 6 soat ichida — shu nomzodlarga qayta yuborilmaydi
  const r2 = await sh.create(client, { role: 'ofitsiant', date: loc.toISOString().slice(0, 10), from: hm(loc),
    to: hm(new Date(loc.getTime() + 4 * H)), pay: 200000 });
  assert.equal(r2.sent, 0);
  await M.Shift.deleteOne({ id: r2.shift.id });

  sent = [];
  let b = await sh.handleCallback({ data: `sh:b:${id}`, chatId: 'ts1' });
  assert.equal(b.ok, true);
  assert.match(b.edit, /Chilonzor 9/);                               // band qilgach — manzil
  assert.ok(sent.some(x => x.chat === 'c100' && /Nomzod s1/.test(x.text) && /1\/2/.test(x.text)));
  assert.match((await sh.handleCallback({ data: `sh:b:${id}`, chatId: 'ts1' })).text, /band qilgansiz/);
  await sh.handleCallback({ data: `sh:b:${id}`, chatId: 'ts2' });
  let s = await M.Shift.findOne({ id }).lean();
  assert.equal(s.status, 'full');
  assert.equal(s.bookedN, 2);
  const late = await sh.handleCallback({ data: `sh:b:${id}`, chatId: 'ts3' });
  assert.match(late.edit, /band bo'ldi/);                            // uchinchisi — joy yo'q
  assert.equal((await M.Shift.findOne({ id }).lean()).booked.length, 2);

  // s2 bekor qiladi -> smena yana ochiq, s3 oladi
  await sh.handleCallback({ data: `sh:c:${id}`, chatId: 'ts2' });
  s = await M.Shift.findOne({ id }).lean();
  assert.equal(s.status, 'open');
  assert.equal(s.bookedN, 1);
  await sh.handleCallback({ data: `sh:b:${id}`, chatId: 'ts3' });
  assert.equal((await M.Shift.findOne({ id }).lean()).status, 'full');

  // Eslatma — 2 soat oldin, bir marta
  sent = [];
  await sh.tick(new Date(start.getTime() - 1.5 * H));
  await sh.tick(new Date(start.getTime() - 1 * H));
  assert.equal(sent.filter(x => /Eslatma/.test(x.text)).length, 2);

  // Tugadi -> mijozdan har biri uchun so'rov, bir marta
  sent = [];
  const end = new Date(start.getTime() + 4.5 * H);
  await sh.tick(end); await sh.tick(end);
  const asks = sent.filter(x => x.chat === 'c100' && /keldimi/.test(x.text));
  assert.equal(asks.length, 2);
  // Belgilash haqiqiy vaqtga qaraydi (smena boshlangan bo'lsin) — vaqtni orqaga suramiz
  await M.Shift.updateOne({ id }, { $set: { startAt: new Date(Date.now() - 5 * H), endAt: new Date(Date.now() - H) } });
  // Begona bosa olmaydi
  assert.equal((await sh.handleCallback({ data: `sh:k:${id}:s1`, chatId: 'ts1' })).ok, false);
  // Belgilash Mini App va bot orqali bir xil (bu yerda servis to'g'ridan-to'g'ri)
  await sh.mark(client, id, 's1', true);
  await sh.handleCallback({ data: `sh:n:${id}:s3`, chatId: 'c100' });
  s = await M.Shift.findOne({ id }).lean();
  assert.equal(s.status, 'done');
  assert.ok(sent.some(x => x.chat === 'adm' && /kelmadi/.test(x.text)));
  const R = await rel.forCandidates(A, ['s1', 's3']);
  assert.deepEqual([R.s1.came, R.s1.total], [1, 1]);
  assert.deepEqual([R.s3.came, R.s3.total], [0, 1]);

  // Mijoz ro'yxati — ism va telefon bilan
  const list = await sh.listFor(client, 'uz');
  assert.equal(list.length, 1);
  assert.equal(list[0].booked.length, 2);
  assert.ok(list[0].booked.every(x => x.phone));
});

test('smena: o\'chirish tugmasi, mijoz bekor qilsa band qilganlarga xabar', async () => {
  await cand('u1');
  const client = await M.Client.findOne({ id: 'cl1' }).lean();
  const d = new Date(Date.now() + 5 * H + 24 * H);
  const r = await sh.create(client, { role: 'ofitsiant', date: d.toISOString().slice(0, 10), from: '18:00', to: '23:00', pay: 150000 });
  await sh.handleCallback({ data: `sh:b:${r.shift.id}`, chatId: 'tu1' });
  sent = [];
  assert.equal((await sh.cancel(client, r.shift.id)).ok, true);
  assert.ok(sent.some(x => x.chat === 'tu1' && /bekor qildi/.test(x.text)));
  assert.equal((await sh.cancel(client, r.shift.id)).error, 'Smena topilmadi');
  await sh.handleCallback({ data: `sh:x:${r.shift.id}`, chatId: 'tu1' });
  assert.equal((await M.Candidate.findOne({ id: 'u1' }).lean()).shiftOptOut, true);
});
