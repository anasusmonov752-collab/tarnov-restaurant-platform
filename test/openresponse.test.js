// ── Nomzodning ochiq anketasi: bitta odamga BITTA yozuv, kanal saqlanadi ──
// 2026-11-18 (Anas): story'dan kelganlar analitikada «Botni o'zi topgan» bo'lib chiqdi.
// Sabab: lavozim tanlanganda (firstTouch.candidateRole) yangi yozuv 'bot' kanali bilan
// ochilardi, /start dagi yozuv (kanal 'tg') esa bo'sh qolib «boshladi, tugatmadi» bo'lardi.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, survey, ft, def, xost;
const A = 'agOR';
const tick = () => new Promise(r => setTimeout(r, 60));   // track() kutilmaydi

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Restaurant', 'Survey', 'SurveyResponse', 'Candidate', 'Vacancy', 'Event', 'Client'])
    M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  survey = require('../src/services/survey');
  ft = require('../src/services/firstTouch');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

beforeEach(async () => {
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  await M.Restaurant.create({ id: A, name: 'TalentHub', kind: 'agency', active: true, adminEmail: 'or@test.uz', adminPassword: 'secret1' });
  def = await survey.ensureDefault(A);
  xost = await M.Survey.create({ id: 'sx', agencyId: A, code: 'XOST01', role: 'xostess', active: true, isDefault: false,
    title: { uz: 'Xostess', ru: 'Хостес' }, questions: [] });
});

const mine = () => M.SurveyResponse.find({ agencyId: A, tgUserId: '77' }).lean();

test('story havolasi -> lavozim: o\'sha yozuv lavozim anketasiga o\'tadi, kanal "tg" qoladi', async () => {
  const r0 = await survey.openResponse({ agencyId: A, tgUserId: '77', chatId: '77', surveyId: def.id, channel: 'tg', refBy: 'c9' });
  assert.equal(r0.channel, 'tg');
  await ft.candidateRole({ agencyId: A, role: 'xostess', lang: 'ru', tgUserId: '77', chatId: '77', appBase: 'https://x', name: 'Aziza', chosenLang: 'ru' });
  await tick();
  const rows = await mine();
  assert.equal(rows.length, 1, 'ikkinchi yozuv ochilmadi');
  assert.equal(rows[0].id, r0.id);
  assert.equal(rows[0].surveyId, 'sx');
  assert.equal(rows[0].channel, 'tg');
  assert.equal(rows[0].refBy, 'c9');
  assert.equal(rows[0].lang, 'ru');
  const ev = await M.Event.findOne({ agencyId: A, tgUserId: '77', kind: 'role' }).lean();
  assert.equal(ev.channel, 'tg');                                   // «Botni o'zi topgan» emas
  assert.equal(ev.rid, r0.id);

  // Yana umumiy havola (yoki «Lavozimim ro'yxatda yo'q») — javobsiz yozuv umumiyga qaytadi
  const back = await survey.openResponse({ agencyId: A, tgUserId: '77', chatId: '77', surveyId: def.id, channel: 'ig' });
  assert.equal(back.id, r0.id);
  assert.equal(back.surveyId, def.id);
  assert.equal(back.channel, 'tg');                                  // birinchi tegish saqlanadi
  assert.equal((await mine()).length, 1);
});

test('javobi bor yozuv o\'zgarmaydi: boshqa lavozimga yangi yozuv, kanal meros', async () => {
  const r0 = await survey.openResponse({ agencyId: A, tgUserId: '77', chatId: '77', surveyId: def.id, channel: 'sms' });
  await M.SurveyResponse.updateOne({ id: r0.id }, { $set: { answers: { role: 'kassir' }, step: 'role' } });
  await ft.candidateRole({ agencyId: A, role: 'xostess', lang: 'uz', tgUserId: '77', chatId: '77', appBase: 'https://x' });
  const rows = await mine();
  assert.equal(rows.length, 2);
  const first = rows.find(r => r.id === r0.id), second = rows.find(r => r.id !== r0.id);
  assert.equal(first.surveyId, def.id);                             // chala anketa joyida
  assert.deepEqual(first.answers, { role: 'kassir' });
  assert.equal(second.surveyId, 'sx');
  assert.equal(second.channel, 'sms');
});

test('umumiy havolani qayta bosgan, anketani yarmigacha to\'ldirgan odam — o\'sha davom etadi', async () => {
  const r0 = await survey.openResponse({ agencyId: A, tgUserId: '77', chatId: '77', surveyId: 'sx', channel: 'ig' });
  await M.SurveyResponse.updateOne({ id: r0.id }, { $set: { answers: { experience: 'y1' }, step: 'experience' } });
  const again = await survey.openResponse({ agencyId: A, tgUserId: '77', chatId: '77', surveyId: def.id, channel: 'tg', resume: true });
  assert.equal(again.id, r0.id);
  assert.equal(again.surveyId, 'sx');                                // anketa almashtirilmadi
  assert.equal((await mine()).length, 1);
  // resume'siz (lavozim havolasi) — alohida yozuv
  const role = await survey.openResponse({ agencyId: A, tgUserId: '77', chatId: '77', surveyId: def.id, channel: 'tg' });
  assert.notEqual(role.id, r0.id);
  assert.equal(role.channel, 'tg');
});

test('havolasiz kelgan odam — "bot"; ovozli yozuv lavozimga o\'tkazilmaydi', async () => {
  await ft.candidateRole({ agencyId: A, role: 'xostess', lang: 'uz', tgUserId: '77', chatId: '77', appBase: 'https://x' });
  let rows = await mine();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].channel, 'bot');
  await M.SurveyResponse.updateOne({ id: rows[0].id }, { $set: { mode: 'voice' } });
  assert.equal(survey.isShell(await M.SurveyResponse.findOne({ id: rows[0].id }).lean()), false);
});

test('eski ma\'lumot: javobsiz yozuv asosiysiga qo\'shiladi, kanal nomzodga o\'tadi (takror xavfsiz)', async () => {
  const SR = M.SurveyResponse, t = ms => new Date(Date.UTC(2026, 10, 16, 10, 0, 0) + ms);
  // 1) Story -> lavozim -> tugatdi (eski kod: ikkinchi yozuv 'bot')
  await SR.create({ id: 'a0', agencyId: A, surveyId: def.id, vacancyId: '', tgUserId: '1', channel: 'tg', refBy: 'c9', startedAt: t(0) });
  await SR.create({ id: 'a1', agencyId: A, surveyId: 'sx', vacancyId: '', tgUserId: '1', channel: 'bot', status: 'done',
    answers: { fullName: 'Aziza' }, step: 'consent', candidateId: 'cA', startedAt: t(60e3) });
  await M.Candidate.create({ id: 'cA', restaurantId: A, fullName: 'Aziza Karimova', source: 'anketa', channel: 'bot' });
  await M.Event.create({ agencyId: A, tgUserId: '1', kind: 'done', rid: 'a1', channel: 'bot' });
  // 2) Instagram -> lavozim tanladi, anketani ochmadi: ikkalasi javobsiz — eng yangisi qoladi
  await SR.create({ id: 'b0', agencyId: A, surveyId: def.id, vacancyId: '', tgUserId: '2', channel: 'ig', startedAt: t(0) });
  await SR.create({ id: 'b1', agencyId: A, surveyId: 'sx', vacancyId: '', tgUserId: '2', channel: 'bot', startedAt: t(30e3) });
  // 3) Tugatgan, keyin story'dan qaytib kirgan: keyingi tegish oldingi anketaga yozilmaydi
  await SR.create({ id: 'c0', agencyId: A, surveyId: def.id, vacancyId: '', tgUserId: '3', channel: 'bot', status: 'done',
    answers: { fullName: 'Ali' }, step: 'consent', startedAt: t(0) });
  await SR.create({ id: 'c1', agencyId: A, surveyId: def.id, vacancyId: '', tgUserId: '3', channel: 'tg', startedAt: t(9e6) });
  // 4) Bitta yozuvli odam va vakansiya anketasi — tegilmaydi
  await SR.create({ id: 'd0', agencyId: A, surveyId: def.id, vacancyId: '', tgUserId: '4', channel: 'tg', startedAt: t(0) });
  await SR.create({ id: 'v0', agencyId: A, surveyId: def.id, vacancyId: 'vac1', tgUserId: '1', channel: 'vakuz', startedAt: t(0) });

  const { mergeShells } = require('../src/services/migrations');
  assert.deepEqual(await mergeShells(), { merged: 3, fixed: 2 });

  const get = id => SR.findOne({ id }).lean();
  assert.equal((await get('a1')).channel, 'tg');
  assert.equal((await get('a1')).refBy, 'c9');
  assert.equal((await M.Candidate.findOne({ id: 'cA' }).lean()).channel, 'tg');   // panel kartasida ham
  assert.equal((await M.Event.findOne({ rid: 'a1' }).lean()).channel, 'tg');
  assert.equal((await get('a0')).status, 'merged');
  assert.equal((await get('a0')).mergedInto, 'a1');
  assert.equal((await get('b1')).channel, 'ig');
  assert.equal((await get('b1')).status, 'started');                 // ochiq yozuv qoladi (eslatma unga)
  assert.equal((await get('b0')).status, 'merged');
  assert.equal((await get('c0')).channel, 'bot');                    // keyingi tashrif kanali yozilmadi
  assert.equal((await get('c1')).status, 'merged');
  assert.equal((await get('d0')).status, 'started');
  assert.equal((await get('v0')).status, 'started');

  assert.deepEqual(await mergeShells(), { merged: 0, fixed: 0 });   // takror — hech narsa o'zgarmaydi
});
