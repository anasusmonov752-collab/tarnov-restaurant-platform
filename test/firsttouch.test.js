// ── BOTGA BIRINCHI KIRISH (services/firstTouch) ──────────────
// Asosiy shart: birinchi javobda HAQIQIY ma'lumot ko'rsatiladi, lekin
// nomzodning ismi/telefoni chiqib ketmaydi va tasdiqlanmagan restoran
// cheklangan sonda namoyish ko'radi.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, ft, sent = [];
const A = 'agFT';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Vacancy', 'Restaurant', 'Survey', 'SurveyResponse', 'Interview', 'Placement', 'Shift'])
    M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return { message_id: 1 }; };
  ft = require('../src/services/firstTouch');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  sent = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true,
    adminEmail: 'ft@test.uz', adminPassword: 'secret1', telegram: { adminChatId: 'adm' } });
  await require('../src/services/survey').ensureDefault(A);
});

const cand = (id, x = {}) => M.Candidate.create(Object.assign({
  id, restaurantId: A, fullName: 'Nomzod ' + id, phone: '+99890123456' + id.slice(-1),
  role: 'ofitsiant', jobStatus: 'active', publicCode: 'A-' + id.toUpperCase()
}, x));

const vacancy = (id, x = {}) => M.Vacancy.create(Object.assign({
  id, agencyId: A, clientId: 'cl1', title: 'Ofitsiant', role: 'ofitsiant', status: 'open',
  listed: true, confirmedAt: new Date(), location: 'Chilonzor', salaryFrom: 4e6, salaryTo: 5e6
}, x));

// ── Ish beruvchi ──

test('restoran: birinchi xabarda jonli raqamlar va lavozim tugmalari', async () => {
  for (const i of [1, 2, 3]) await cand('c' + i);
  await cand('cx', { role: 'oshpaz' });
  await cand('ct', { role: 'ofitsiant', isTest: true });            // sinov yozuvi hisoblanmaydi
  await cand('cn', { role: 'ofitsiant', jobStatus: 'not_looking' }); // ish qidirmayapti

  const r = await ft.employerIntro({ agencyId: A, lang: 'uz' });
  assert.match(r.text, /4 ta nomzod/);                  // 3 ofitsiant + 1 oshpaz
  assert.match(r.text, /ofitsiant 3/);
  assert.match(r.text, /Kim kerak\?/);
  const keys = r.keyboard.flat().map(b => b.callback_data);
  assert.ok(keys.includes('ft:e:ofitsiant') && keys.includes('ft:e:oshpaz'));
});

test('restoran: lavozim tanlansa — soni, bozor maoshi va 3 ta ANONIM karta', async () => {
  const sal = ['4 000 000', '5 000 000', '5 000 000', '6 000 000', '7 000 000'];
  for (const [i, s] of sal.entries()) await cand('s' + i, { salaryExpectation: s, location: 'Toshkent, Chilonzor' });
  await cand('v1', { phoneVerifiedAt: new Date(), fullName: 'Aziza Karimova', phone: '+998901112233' });

  const r = await ft.employerRole({ agencyId: A, role: 'ofitsiant', lang: 'uz' });
  assert.match(r.text, /6 ta nomzod/);
  assert.match(r.text, /Bozor maoshi/);                 // 5 tadan ko'p yozuv bor
  // Ism va telefon KO'RINMAYDI
  assert.ok(!/Aziza|Karimova|\+998/.test(r.text), r.text);
  assert.match(r.text, /A-/);                           // anonim kod bor
  const keys = r.keyboard.flat().map(b => b.callback_data);
  assert.deepEqual(keys, ['ft:t:ofitsiant', 'ft:v', 'ft:eb']);
});

test('restoran: bepul sinov so\'rovi agentlikka ketadi, ikkinchi marta takrorlanmaydi', async () => {
  await M.Client.create({ id: 'cl1', agencyId: A, name: 'Rayhon', status: 'pending', tgChatId: 'c100' });
  const r1 = await ft.handleCallback({ data: 'ft:t:ofitsiant', chatId: 'c100', appBase: 'https://x', from: { id: 1 } });
  assert.match(r1.text, /Menejer/);
  assert.equal(sent.filter(m => m.chat === 'adm').length, 1);
  const cl = await M.Client.findOne({ id: 'cl1' }).lean();
  assert.ok(cl.trialAskedAt);
  assert.equal(cl.trialAskedRole, 'ofitsiant');

  const r2 = await ft.handleCallback({ data: 'ft:t:', chatId: 'c100', appBase: 'https://x', from: { id: 1 } });
  assert.match(r2.text, /menejerda/);
  assert.equal(sent.filter(m => m.chat === 'adm').length, 1);      // ikkinchi xabar yo'q
});

test('tugma javobi HTML bilan beriladi (<b> matn bo\'lib chiqmasin)', async () => {
  // 2026-11-14 jonli topildi: tahrirlangan xabarda parse_mode yo'q edi va
  // mijoz "<b>\u041e\u0444\u0438\u0446\u0438\u0430\u043d\u0442</b>" matnini ko'rdi
  await M.Client.create({ id: 'cl9', agencyId: A, name: 'Bon', status: 'pending', tgChatId: 'c900' });
  for (const d of ['ft:e:ofitsiant', 'ft:eb']) {
    const r = await ft.handleCallback({ data: d, chatId: 'c900', appBase: 'https://x', from: { id: 9 } });
    assert.equal(r.html, true, d);
    assert.ok(r.edit.includes('<b>'), d);
  }
  const c = await ft.handleCallback({ data: 'ft:c:ofitsiant', chatId: 'c901', appBase: 'https://x', from: { id: 91 } });
  assert.equal(c.html, true);
});

test('restoran: namoyish qidiruvi cheklangan', async () => {
  const cl = await M.Client.create({ id: 'cl2', agencyId: A, name: 'Bon', status: 'pending', tgChatId: 'c200' });
  assert.equal(ft.demoLeft(cl), ft.DEMO_LIMIT);
  await ft.noteDemo(cl);
  await ft.noteDemo(cl);
  await ft.noteDemo(cl);
  const after = await M.Client.findOne({ id: 'cl2' }).lean();
  assert.equal(after.demoSearches, 3);
  assert.equal(ft.demoLeft(after), 0);
});

// ── Nomzod ──

test('nomzod: lavozim tanlansa — shu lavozimdagi ochiq ishlar va anketa tugmasi', async () => {
  await vacancy('v1');
  await vacancy('v2', { location: 'Yunusobod', salaryFrom: 6e6, salaryTo: 7e6 });
  await vacancy('v3', { role: 'oshpaz' });
  await vacancy('v4', { status: 'closed' });
  await vacancy('v5', { isTest: true });

  const pick = await ft.candidatePick({ agencyId: A, lang: 'uz' });
  assert.match(pick.text, /3 ta ochiq ish/);            // yopiq va sinov hisoblanmaydi

  const r = await ft.candidateRole({ agencyId: A, role: 'ofitsiant', lang: 'uz',
    tgUserId: '777', chatId: '777', appBase: 'https://x' });
  assert.match(r.text, /2 ta ochiq ish/);
  assert.match(r.text, /Chilonzor/);
  assert.match(r.text, /Yunusobod/);
  assert.ok(!/Oshpaz/i.test(r.text));                   // boshqa lavozim tushmaydi

  // Anketa yozuvi ochildi va tugmada aynan shu yozuv
  const resp = await M.SurveyResponse.findOne({ agencyId: A, tgUserId: '777' }).lean();
  assert.ok(resp && resp.status === 'started');
  assert.ok(r.keyboard[0][0].web_app.url.endsWith('/anketa.html?r=' + resp.id));
  assert.ok(r.keyboard[2][0].callback_data === 'ft:cb');

  // Ikkinchi marta bosilsa — YANGI yozuv ochilmaydi (javoblar saqlanadi)
  await ft.candidateRole({ agencyId: A, role: 'ofitsiant', lang: 'uz', tgUserId: '777', chatId: '777', appBase: 'https://x' });
  assert.equal(await M.SurveyResponse.countDocuments({ agencyId: A, tgUserId: '777' }), 1);
});

test('nomzod: lavozim anketasi bo\'lsa o\'sha ochiladi (forma qisqaradi)', async () => {
  const sv = require('../src/services/survey');
  const preset = sv.rolePreset('xostess');
  await M.Survey.create(Object.assign({ id: 'sv-x', agencyId: A, code: 'XOST01', active: true, isDefault: false,
    role: 'xostess' }, { title: preset.title, questions: sv.cleanQuestions(preset.questions) }));

  await ft.candidateRole({ agencyId: A, role: 'xostess', lang: 'uz', tgUserId: '888', chatId: '888', appBase: 'https://x' });
  const resp = await M.SurveyResponse.findOne({ agencyId: A, tgUserId: '888' }).lean();
  assert.equal(resp.surveyId, 'sv-x');
});

test('nomzod: ish bo\'lmasa ham anketa taklif qilinadi', async () => {
  const r = await ft.candidateRole({ agencyId: A, role: 'barmen', lang: 'uz',
    tgUserId: '999', chatId: '999', appBase: 'https://x' });
  assert.match(r.text, /ochiq ish yo'q/);
  assert.ok(r.keyboard[0][0].web_app);                  // anketa tugmasi baribir bor
});

test('ikkala tomon ham ruscha ishlaydi', async () => {
  await cand('r1');
  await vacancy('vr');
  const e = await ft.employerIntro({ agencyId: A, lang: 'ru' });
  assert.match(e.text, /Кто нужен/);
  const c = await ft.candidateRole({ agencyId: A, role: 'ofitsiant', lang: 'ru',
    tgUserId: '555', chatId: '555', appBase: 'https://x' });
  assert.match(c.text, /вакансий/);
});
