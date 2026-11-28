// Anketada rasm MAJBURIY (Anas, 2026-11-28): "Keyinroq qo'shaman" bekor — uni bosgan 5/54 nomzodning
// birortasi keyin rasm qo'shmagan. Eski (keshdagi) sahifa 'later' yuborsa ham rasmsiz yakunlanmaydi.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, router;
const A = 'agPH';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Restaurant', 'Survey', 'SurveyResponse', 'Client', 'Vacancy']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  router = require('../src/routes/anketa');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

// guard'siz (Telegram initData shart emas) — oxirgi handler, req.resp bilan
const call = async (path, r, body) => {
  const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods.post);
  const h = layer.route.stack[layer.route.stack.length - 1].handle;
  let status = 200, out;
  const res = { status(s) { status = s; return this; }, json(j) { out = j; return this; } };
  await h({ params: { rid: r.id }, body, resp: r, get: () => '', protocol: 'https', headers: {} }, res, e => { throw e; });
  return { status, out };
};

test('rasm: "keyinroq" rad etiladi, rasmsiz anketa yuborilmaydi', async () => {
  const s = await require('../src/services/survey').ensureDefault(A);
  const r = await M.SurveyResponse.create({ id: 'rp1', agencyId: A, surveyId: s.id, tgUserId: '901', status: 'started',
    answers: { photoLater: true } });
  const later = await call('/:rid/answer', r, { q: 'photo', value: 'later' });
  assert.equal(later.status, 400);
  assert.equal(later.out.code, 'required');

  // Hamma ko'rinadigan savolga javob, faqat rasm yo'q (eski photoLater belgisi ham o'tkazmaydi)
  const survey = require('../src/services/survey');
  const fresh = await M.SurveyResponse.findOne({ id: 'rp1' });
  const a = { photoLater: true };
  const val = q => q.type === 'choice' ? q.options[0].key : q.type === 'date' ? '1995-05-05' : q.type === 'consent' ? true
    : q.type === 'work' ? 'none' : q.type === 'contact' ? '+998901234567' : 'Test Testov';
  for (let i = 0; i < 5; i++) for (const q of survey.shownQuestions(survey.visibleQuestions(s, ''), a, ''))
    if (q.type !== 'photo' && a[q.id] == null) a[q.id] = val(q);
  fresh.answers = a; fresh.phoneVerifiedAt = new Date(); fresh.markModified('answers'); await fresh.save();
  const sub = await call('/:rid/submit', fresh, {});
  assert.equal(sub.status, 400, JSON.stringify(sub.out));
  assert.equal(sub.out.code, 'required');
  assert.equal(sub.out.q, 'photo');
});
