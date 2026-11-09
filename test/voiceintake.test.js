// ── Ovozli rezyume (services/voiceIntake) va AI ovozi (services/tts) ──
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, vi, sv, sent = [], aiCalls = [];
const A = 'agVI';
const PARSED = { fullName: 'Aziza Karimova', age: 22, birthDate: null, role: 'ofitsiant', noExperience: false,
  jobs: [{ place: 'Rayhon', role: 'ofitsiant', other: null, dur: 'y1_3' }], district: 'chilonzor', startWhen: 'now',
  study: 'no', salaryAmount: 5000000, salaryNegotiable: false, russian: 'fluent',
  summary: 'Mehmonlar bilan tez til topishadi.', spokenLang: 'uz' };

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Survey', 'SurveyResponse', 'Candidate', 'Restaurant', 'Vacancy']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async (tok, chat, text, extra) => { sent.push({ chat, text, extra }); return { message_id: 1 }; };
  tg.setChatMenuButton = async () => ({});
  tg.getFileBase64 = async () => ({ base64: Buffer.from('ffd8ffe0', 'hex').toString('base64'), bytes: 4 });
  const ai = require('../src/services/ai');
  ai.complete = async (args) => {
    aiCalls.push(args);
    if (!args.json) return 'Salom, ishlarni ko\'rsating';
    return args.schema && args.schema.properties.district ? PARSED : { value: null, jobs: [], noExperience: false };
  };
  vi = require('../src/services/voiceIntake');
  sv = require('../src/services/survey');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

let r0;
beforeEach(async () => {
  sent = []; aiCalls = [];
  await Promise.all(Object.values(M).map(m => m.deleteMany({})));
  const s = await sv.ensureDefault(A);
  r0 = await M.SurveyResponse.create({ id: '33333333-3333-4333-8333-333333333333', agencyId: A, surveyId: s.id,
    tgUserId: '777', chatId: '777', status: 'started' });
});

const from = { id: 777, language_code: 'uz' };
const btns = m => ((m && m.extra && m.extra.reply_markup && m.extra.reply_markup.inline_keyboard) || []).flat();
const cur = () => M.SurveyResponse.findOne({ id: r0.id }).lean();

test('AI javobidan anketa javoblari: shablon bo\'yicha, noto\'g\'risi tashlanadi', () => {
  const qs = sv.template();
  const a = vi.answersFrom(PARSED, qs, new Date('2026-11-10T12:00:00Z'));
  assert.equal(a.fullName, 'Aziza Karimova');
  assert.equal(a.role, 'ofitsiant');
  assert.equal(a.location, 'chilonzor');
  assert.equal(a.salary, 's4_6');
  assert.equal(a.russian, 'fluent');
  assert.deepEqual(a.lastJob, [{ place: 'Rayhon', role: 'ofitsiant', other: '', dur: 'y1_3' }]);
  assert.equal(sv.ageOf(new Date(a.birthDate + 'T00:00:00+05:00')), 22);
  // Bitta so'zli ism — anketa qoidasi bo'yicha qabul qilinmaydi (keyin so'raladi)
  assert.equal(vi.answersFrom(Object.assign({}, PARSED, { fullName: 'Aziza' }), qs).fullName, undefined);
  assert.equal(vi.salaryBucket(9500000), 's9_12');
  assert.equal(vi.salaryBucket(null, true), 'agree');
  assert.equal(vi.parseDate('12.05.2001'), '2001-05-12');
});

test('to\'liq oqim: rozilik -> shablon -> ovoz -> tasdiq -> yetishmaganlar -> tayyor rezyume', async () => {
  let r = await vi.handleCallback({ data: `vi:go:${r0.id}`, chatId: '777', from });
  assert.equal(r.ok, true);
  assert.equal((await cur()).vstep, 'consent');
  // Rozilikdan oldin ovoz — qabul qilinmaydi
  assert.equal(await vi.onMessage({ msg: { from, voice: { file_id: 'V1', duration: 40 } }, chatId: '777' }), true);
  assert.equal(aiCalls.length, 0);

  await vi.handleCallback({ data: `vi:ok:${r0.id}`, chatId: '777', from });
  assert.ok(sent.some(x => /Bitta ovozli xabarda/.test(x.text)));            // shablon
  assert.equal((await cur()).vstep, 'wait');

  sent = [];
  await vi.onMessage({ msg: { from, voice: { file_id: 'V1', duration: 40 } }, chatId: '777', appBase: 'https://x' });
  let doc = await cur();
  assert.equal(doc.vstep, 'review');
  assert.equal(doc.answers.fullName, 'Aziza Karimova');
  assert.equal(doc.voiceFileId, 'V1');
  const review = sent.find(x => /Mana nimani tushundim/.test(x.text));
  assert.ok(review && /Aziza Karimova/.test(review.text));
  assert.ok(btns(review).some(b => b.callback_data === `vi:y:${r0.id}`));

  await vi.handleCallback({ data: `vi:y:${r0.id}`, chatId: '777', from, appBase: 'https://x' });
  // Yetishmaganlarni bittadan: variant — birinchisi, rasm, telefon, matn
  for (let i = 0; i < 25; i++) {
    doc = await cur();
    if (doc.status === 'done') break;
    const last = sent[sent.length - 1];
    const choice = btns(last).find(b => /^vi:a:/.test(b.callback_data));
    if (choice) { await vi.handleCallback({ data: choice.callback_data, chatId: '777', from, appBase: 'https://x' }); continue; }
    const q = sv.template().find(x => x.id === doc.vAsk);
    if (q && q.type === 'photo') { await vi.onMessage({ msg: { from, photo: [{ file_id: 'P1', width: 640 }] }, chatId: '777', appBase: 'https://x' }); continue; }
    if (q && q.type === 'contact') {
      await M.SurveyResponse.updateOne({ id: r0.id }, { $set: { phone: '+998 90 111 22 33', phoneVerifiedAt: new Date() } });
      await vi.afterContact('777', from, 'https://x'); continue;
    }
    await vi.onMessage({ msg: { from, text: 'Dushanba-juma 17:00 dan keyin' }, chatId: '777', appBase: 'https://x' });
  }
  doc = await cur();
  assert.equal(doc.status, 'done');
  const c = await M.Candidate.findOne({ tgChatId: '777' }).lean();
  assert.equal(c.fullName, 'Aziza Karimova');
  assert.equal(c.role, 'ofitsiant');
  assert.equal(c.voiceIntro.fileId, 'V1');
  assert.equal(c.summary, 'Mehmonlar bilan tez til topishadi.');
  assert.ok(c.hasPhoto);
  assert.ok(sent.some(x => /Rezyumengiz tayyor/.test(x.text)));
});

test('ovozli anketa bo\'lmasa xabar boshqa yo\'lga ketadi; boshqa odam tugmasi ishlamaydi', async () => {
  assert.equal(await vi.onMessage({ msg: { from, text: 'salom' }, chatId: '777' }), false);
  const r = await vi.handleCallback({ data: `vi:go:${r0.id}`, chatId: '888', from: { id: 888 } });
  assert.equal(r.ok, false);
});

test('ovozni matnga aylantirish (AI rekruter suhbati)', async () => {
  const t = await vi.transcribe({ file_id: 'V2' }, A);
  assert.match(t, /Salom/);
});

test('AI ovozi: kalitsiz — o\'chiq, hech narsa yubormaydi', async () => {
  delete process.env.AISHA_API_KEY;
  const tts = require('../src/services/tts');
  assert.equal(tts.enabled(), false);
  assert.equal(await tts.speak('777', 'Salom', 'uz'), false);
});
