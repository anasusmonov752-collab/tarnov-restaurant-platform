// ── NOMZOD KABINETI: ish tajribasi va foto tahriri ───────────
// Qoida YAGONA (services/survey.js): anketa savoli ham, kabinetdagi oyna
// ham cleanWork -> workSet dan o'tadi. Shu yerda tekshiriladigan narsa —
// tahrir nomzodning boshqa ma'lumotini buzmasligi.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const survey = require('../src/services/survey');

const job = (x = {}) => Object.assign({ place: 'Rayhon restorani', role: 'ofitsiant', dur: 'y1_3' }, x);
const code = fn => { try { fn(); return 'ok'; } catch (e) { return e.code || e.message; } };

test('kabinet: ish joylari tekshiruvi anketa bilan bir xil', () => {
  assert.equal(survey.cleanWork('none'), 'none');
  assert.equal(code(() => survey.cleanWork([job({ place: 'R' })])), 'work');
  assert.equal(code(() => survey.cleanWork([job({ dur: '' })])), 'work');
  assert.equal(code(() => survey.cleanWork([job({ role: 'boshqa' })])), 'work');      // nomi kerak
  assert.equal(code(() => survey.cleanWork([])), 'ok');                                // kabinetda bo'sh ro'yxat mumkin
  assert.equal(code(() => survey.cleanWork([], { required: true })), 'required');      // anketada — majburiy
  assert.equal(code(() => survey.cleanWork([job(), job(), job(), job()])), 'work');    // ko'pi bilan 3
  // Rezyumeda 4 ta ish joyi bo'lsa tahrirda ular yo'qolmasin
  assert.equal(code(() => survey.cleanWork([job(), job(), job(), job()], { max: 4 })), 'ok');
});

test('kabinet: rezyumedagi vazifalar va asl muddat yo\'qolmaydi', () => {
  const row = { place: 'Rayhon', role: 'ofitsiant', dur: 'y1_3', periodText: '2019-2021', desc: 'Zal xizmati' };
  const kept = survey.cleanWork([row])[0];
  assert.equal(kept.periodText, '2019-2021');
  assert.equal(kept.desc, 'Zal xizmati');
  // Muddat o'zgarmagan — kartada asl matn qoladi
  assert.equal(survey.workFields([kept]).workHistory[0].period, '2019-2021');
  assert.equal(survey.workFields([kept]).workHistory[0].description, 'Zal xizmati');
  // Nomzod muddatni o'zgartirdi — endi standart yozuv (eski matn yolg'on bo'lardi)
  const changed = Object.assign({}, kept, { dur: 'y5' });
  assert.equal(survey.workFields([changed]).workHistory[0].period, '5 yildan ko\'p');
});

test('kabinet: muddat matnidan oraliq (rezyume yozuvlari)', () => {
  const d = survey.durFromPeriod;
  assert.equal(d('2019-2021'), 'y1_3');
  assert.equal(d('2016 — 2023'), 'y5');
  assert.equal(d('1–3 yil'), 'y1_3');          // anketa yozuvi (uz)
  assert.equal(d('1–3 года'), 'y1_3');        // anketa yozuvi (ru)
  assert.equal(d('2 yil'), 'y1_3');
  assert.equal(d('8 месяцев'), 'm6_12');
  assert.equal(d('3 oy'), 'lt6');
  assert.equal(d('qachonlardir'), '');            // tanib bo'lmadi — nomzod o'zi tanlaydi
  assert.equal(d(''), '');
});

test('kabinet: rezyume ish tarixi tahrir qatorlariga aylanadi', () => {
  const rows = survey.historyToWork([
    { company: 'Rayhon', position: 'Официант', period: '2019-2021', description: 'Zal' },
    { company: 'Digital Agency', position: 'SMM menejeri', period: '6 oy' },
    { company: '', position: '', period: '' }
  ]);
  assert.equal(rows.length, 2);                                   // bo'sh qator tushib qoladi
  assert.equal(rows[0].role, 'ofitsiant');                        // ruscha lavozim ham tanildi (roles.guessRole)
  assert.equal(rows[0].dur, 'y1_3');
  assert.equal(rows[0].desc, 'Zal');
  assert.equal(rows[1].role, 'boshqa');                           // restoran roli emas
  assert.equal(rows[1].other, 'SMM menejeri');
  // Qaytib kelgan qatorlar tekshiruvdan o'tadi (nomzod hech narsani tahrirlamasa ham)
  assert.equal(code(() => survey.cleanWork(rows)), 'ok');
});

test('kabinet: tahrir tajribani kamaytirmaydi, "tajribam yo\'q" hammasini tozalaydi', () => {
  const c = { experienceYears: 5, experienceSummary: 'Ofitsiant — Rayhon, 1–3 yil',
    workHistory: [{ company: 'Rayhon', position: 'Ofitsiant', period: '1–3 yil' }] };
  const set = survey.workSet(c, [job({ place: 'Bon', dur: 'lt6' })]);
  assert.equal(set.experienceYears, 5);                           // rezyumedagi 5 yil saqlanadi
  assert.equal(set.experienceMonths, 1);                          // "6 oygacha" = 1 oy
  assert.equal(set.workNone, false);
  assert.equal(set.workRaw.length, 1);
  assert.equal(set.experienceSummary, 'Ofitsiant — Bon, 6 oygacha');   // tizim yozuvi yangilandi

  const none = survey.workSet(c, 'none');
  assert.deepEqual(none.workHistory, []);
  assert.equal(none.experienceYears, 0);
  assert.equal(none.experienceMonths, 0);
  assert.equal(none.workNone, true);
  assert.equal(none.experienceSummary, 'Tajribasiz');
});

test('kabinet: nomzod o\'zi yozgan "o\'zim haqimda" matni ustidan yozilmaydi', () => {
  const c = { experienceYears: 0, experienceSummary: 'Mehmonlar bilan ishlashni yaxshi ko\'raman.', workHistory: [] };
  const set = survey.workSet(c, [job()]);
  assert.ok(!('experienceSummary' in set), 'nomzod matni saqlanishi kerak');
  assert.equal(survey.isAutoSummary(c), false);
  // Tizim yozuvlari (anketa javobi yoki birinchi ish joyi) — yangilanadi
  assert.equal(survey.isAutoSummary({ experienceSummary: '' }), true);
  assert.equal(survey.isAutoSummary({ experienceSummary: 'Tajribasiz' }), true);
  assert.equal(survey.isAutoSummary({ experienceSummary: 'Ofitsiant — Rayhon, 1–3 yil',
    workHistory: [{ company: 'Rayhon', position: 'Ofitsiant' }] }), true);
});

test('kabinet: tahrir qatorlari eskirgan xom javobga ishonmaydi', () => {
  const raw = [{ place: 'Rayhon', role: 'ofitsiant', other: '', dur: 'y1_3' }];
  const workHistory = survey.workFields(raw).workHistory;
  // Xom javob joriy tarixni bergan — o'shani ko'rsatamiz
  assert.equal(survey.workRows({ workRaw: raw, workHistory })[0].place, 'Rayhon');
  // Agentlik paneldan tarixni o'zgartirgan — oyna yangi tarixdan tiklanadi
  const rows = survey.workRows({ workRaw: raw, workHistory: [{ company: 'Bon', position: 'Barmen', period: '2 yil' }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].place, 'Bon');
  assert.equal(rows[0].role, 'barmen');
  assert.deepEqual(survey.workRows({ workNone: true, workHistory }), []);
});

test('kabinet: foto qoidasi anketa savoli bilan bitta', () => {
  const ok = 'data:image/jpeg;base64,' + 'A'.repeat(100);
  assert.equal(survey.cleanPhoto(ok), ok);
  assert.equal(code(() => survey.cleanPhoto('data:image/gif;base64,AAA')), 'photo');
  assert.equal(code(() => survey.cleanPhoto('https://example.com/a.jpg')), 'photo');
  assert.equal(code(() => survey.cleanPhoto('data:image/png;base64,' + 'A'.repeat(1500001))), 'photo');
});

test('anketa: "tajribam yo\'q" javobi ish tarixini ham tozalaydi', () => {
  const qs = survey.cleanQuestions(survey.template());
  const f = survey.toFields({ role: 'ofitsiant', lastJob: 'none' }, { questions: qs }, '');
  assert.deepEqual(f.workHistory, []);
  assert.equal(f.workNone, true);
  assert.deepEqual(f.workRaw, []);
  const g = survey.toFields({ role: 'ofitsiant', lastJob: [job()] }, { questions: qs }, '');
  assert.equal(g.workNone, false);
  assert.equal(g.workRaw.length, 1);
});

// ── Anketani qayta to'ldirish (bazada) ──
// Bo'sh ro'yxat finalize tsiklida ataylab o'tkazib yuboriladi (tillarni
// o'chirmasin) — shuning uchun "tajribam yo'q" alohida tozalanadi.
const { before, after } = require('node:test');
const mongoose = require('mongoose');
let rs, M = {};
const A = 'agCP';
before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Survey', 'SurveyResponse', 'Candidate', 'Restaurant', 'Vacancy']) M[n] = require('../src/models/' + n);
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async () => ({ message_id: 1 });
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

test('anketani qayta to\'ldirish: eski ish tarixi qolib ketmaydi', async () => {
  const sv = await survey.ensureDefault(A);
  await M.Candidate.create({ id: 'c-cp1', restaurantId: A, source: 'hh', tgChatId: '900', tgState: 'linked',
    fullName: 'Aziza Karimova', experienceMonths: 18, experienceYears: 2,
    workHistory: [{ company: 'Rayhon', position: 'Ofitsiant', period: '2019-2021', description: 'Zal' }] });
  const r = await M.SurveyResponse.create({ id: '44444444-4444-4444-8444-444444444444', agencyId: A, surveyId: sv.id,
    tgUserId: '900', chatId: '900', status: 'started', answers: { role: 'ofitsiant', lastJob: 'none' } });
  const { candidate } = await survey.finalize(r);
  assert.deepEqual(candidate.workHistory.toObject ? candidate.workHistory.toObject() : candidate.workHistory, []);
  assert.equal(candidate.workNone, true);
  assert.equal(candidate.experienceMonths, 0);
  assert.equal(candidate.experienceSummary, 'Tajribasiz');
});
