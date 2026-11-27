// ── Botni o'zi topgan nomzod: bot -> anketa -> ariza (2026-11-19 tahlili tuzatishlari) ──
// 1) botda tanlangan lavozim anketada QAYTA so'ralmaydi (umumiy anketada ham)
// 2) botda ko'rsatilgan ishlarga anketa tugagach ariza O'ZI ketadi; bot savollari faqat birinchisiga
// 3) tug'ilgan sana: 16–70 yosh, kalendar xatosi rad etiladi
// 4) lavozim tugmalarida ochiq ishlar soni, ishi borlar oldin
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, ft, survey, sent = [];
const A = 'agAF';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Vacancy', 'Restaurant', 'Survey', 'SurveyResponse', 'Application'])
    M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return { message_id: 1 }; };
  ft = require('../src/services/firstTouch');
  survey = require('../src/services/survey');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  sent = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true,
    adminEmail: 'af@test.uz', adminPassword: 'secret1', telegram: { adminChatId: 'adm' } });
  await survey.ensureDefault(A);
});

const vacancy = (id, x = {}) => M.Vacancy.create(Object.assign({
  id, agencyId: A, clientId: 'cl1', title: 'Ofitsiant', role: 'ofitsiant', status: 'open',
  listed: true, confirmedAt: new Date(), location: 'Chilonzor', salaryFrom: 4e6, salaryTo: 5e6
}, x));

test('lavozim botdan anketaga o\'tadi: umumiy anketada "Qaysi lavozim?" so\'ralmaydi', async () => {
  await ft.candidateRole({ agencyId: A, role: 'barmen', lang: 'uz', tgUserId: '501', chatId: '501', appBase: 'https://x' });
  const r = await M.SurveyResponse.findOne({ agencyId: A, tgUserId: '501' }).lean();
  assert.equal(r.role, 'barmen');
  assert.deepEqual(r.offerIds, []);                         // barmenda ochiq ish yo'q
  const s = await M.Survey.findOne({ agencyId: A, id: r.surveyId }).lean();
  assert.ok(!s.role, 'barmenning alohida anketasi yo\'q — umumiy');
  const preset = survey.presetRoleOf(r, s, null);
  assert.equal(preset, 'barmen');
  assert.ok(!survey.visibleQuestions(s, preset).some(q => q.id === 'role'));
  // Vakansiya havolasi ustun turadi
  assert.equal(survey.presetRoleOf(r, s, { role: 'oshpaz' }), 'oshpaz');
});

test('anketa tugagach botda ko\'rsatilgan ishlarga ariza o\'zi ketadi, bot savollari faqat birinchisiga', async () => {
  await vacancy('v1');
  await vacancy('v2', { title: 'Ranner' });
  await vacancy('v3', { role: 'oshpaz', title: 'Salatchi' });
  await ft.candidateRole({ agencyId: A, role: 'ofitsiant', lang: 'uz', tgUserId: '502', chatId: '502', appBase: 'https://x' });
  let r = await M.SurveyResponse.findOne({ agencyId: A, tgUserId: '502' });
  assert.equal(r.offerIds.length, 2);
  assert.ok(!r.offerIds.includes('v3'));
  // Ko'rsatilgandan keyin bittasi yopildi — unga ariza ketmaydi
  await M.Vacancy.updateOne({ id: 'v2' }, { $set: { status: 'closed' } });

  r.answers = { fullName: 'Aziza Karimova', consent: true, startWhen: 'now', photoLater: true };
  r.phone = '+998901234567'; r.phoneVerifiedAt = new Date();
  await r.save();
  const out = await survey.finalize(r, { appBase: 'https://x' });
  // Bot savollari rahmatdan KEYIN (anketaDone) — haqiqiy oqim: finalize, keyin afterFinalize
  sent = [];
  await require('../src/services/anketaDone').afterFinalize(r, out, { appBase: 'https://x', lang: 'uz' });
  const toCand = sent.filter(m => m.chat === '502');
  assert.ok(toCand.length >= 2, 'rahmat va savol');
  assert.match(toCand[toCand.length - 1].text, /1\/2|1\/3/, 'oxirgi xabar — bot savoli (faol harakat pastda)');
  assert.equal(out.applied, true);
  assert.deepEqual(out.appliedTo.map(v => v.id), ['v1']);
  assert.equal(out.candidate.role, 'ofitsiant');            // lavozim botdagi tanlovdan
  const apps = await M.Application.find({ agencyId: A, candidateId: out.candidate.id }).lean();
  assert.equal(apps.length, 1);
  assert.equal(apps[0].screen && apps[0].screen.step, 'fit');   // birinchisiga bot savollari
});

test('bir nechta ish: hammasiga ariza, bot savollari bitta', async () => {
  await vacancy('v1'); await vacancy('v2', { title: 'Ranner' }); await vacancy('v4', { title: 'Buyurtma yig\'uvchi' });
  await ft.candidateRole({ agencyId: A, role: 'ofitsiant', lang: 'ru', tgUserId: '503', chatId: '503', appBase: 'https://x' });
  const r = await M.SurveyResponse.findOne({ agencyId: A, tgUserId: '503' });
  r.answers = { fullName: 'Ali Valiyev', consent: true };
  await r.save();
  const out = await survey.finalize(r, { appBase: 'https://x' });
  await require('../src/services/anketaDone').afterFinalize(r, out, { appBase: 'https://x', lang: 'ru' });
  assert.equal(out.appliedTo.length, 3);
  const apps = await M.Application.find({ agencyId: A, candidateId: out.candidate.id }).lean();
  assert.equal(apps.length, 3);
  assert.equal(apps.filter(a => a.screen && a.screen.step === 'fit').length, 1);
});

test('tug\'ilgan sana: 16 yoshdan kichik va kalendar xatosi rad etiladi', () => {
  const q = { id: 'birthDate', type: 'date', required: true };
  const y = new Date().getFullYear();
  assert.throws(() => survey.checkAnswer(q, `${y - 15}-01-01`));
  assert.throws(() => survey.checkAnswer(q, '2003-02-31'));
  assert.throws(() => survey.checkAnswer(q, '1940-01-01'));
  assert.equal(survey.checkAnswer(q, '2003-02-28'), '2003-02-28');
});

test('birinchi ekran: lavozim tugmalarida son, ishi bor lavozim oldin', async () => {
  await vacancy('v1'); await vacancy('v2'); await vacancy('v3', { role: 'oshpaz' });
  const pick = await ft.candidatePick({ agencyId: A, lang: 'uz' });
  const first = pick.keyboard[0][0];
  assert.equal(first.callback_data, 'ft:c:ofitsiant');
  assert.match(first.text, /· 2$/);
  const all = pick.keyboard.flat();
  assert.match(all.find(b => b.callback_data === 'ft:c:oshpaz').text, /· 1$/);
  // Ishi yo'q lavozim tugmasi CHIQMAYDI (Anas, 2026-11-27: "aji-buji lavozimlar")
  assert.ok(!all.some(b => b.callback_data === 'ft:c:barmen'));
});

test('birinchi ekran: ro\'yxatdan tashqari ish (boshqa) ham tugma oladi, nomi bilan; uzun nom alohida qatorda', async () => {
  await vacancy('o1', { role: 'boshqa', title: 'HR-rekruter (ommaviy yollash)' });
  await vacancy('o2', { role: 'operator', title: 'Call operator' });
  await vacancy('o3'); await vacancy('o4');
  const pick = await ft.candidatePick({ agencyId: A, lang: 'uz' });
  assert.ok(!/\{top\}|call-markaz operatori 1/.test(pick.text), pick.text);    // taqsimot matnda yo'q
  assert.match(pick.text, /<b>4 ta ochiq ish<\/b>/);
  const all = pick.keyboard.flat();
  assert.equal(all.find(b => b.callback_data === 'ft:c:boshqa').text, 'HR-rekruter · 1');
  const opRow = pick.keyboard.find(r => r.some(b => b.callback_data === 'ft:c:operator'));
  assert.equal(opRow.length, 1, 'uzun nom alohida qatorda');
  // "Boshqa" bosilsa — shu ishning o'zi, sarlavhasi o'z nomi bilan
  const r = await ft.candidateRole({ agencyId: A, role: 'boshqa', lang: 'uz', tgUserId: '901', chatId: '901', appBase: 'https://x' });
  assert.match(r.text, /<b>HR-rekruter<\/b> — hozir <b>1 ta ochiq ish<\/b>/);
  assert.ok(!/va shunga yaqin/.test(r.text));
});

test('birinchi ekran: ish umuman yo\'q bo\'lsa — hamma lavozim (anketa kelajakdagi ish uchun)', async () => {
  const pick = await ft.candidatePick({ agencyId: 'bosh-agentlik', lang: 'uz' });
  assert.ok(pick.keyboard.flat().some(b => b.callback_data === 'ft:c:barmen'));
});
