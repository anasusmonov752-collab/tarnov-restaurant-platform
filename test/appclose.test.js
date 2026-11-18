// ── Nomzodga yakuniy xabar (2026-11-18, Anas) ──
// 1) Vakansiya yopilsa — qaror qilinmagan arizalar "o'rin yopildi" bo'ladi va nomzodga
//    halol xabar boradi (bir marta). Tanlovga o'tganlar va qaror qilinganlar tegilmaydi.
// 2) Suhbatdan keyin "mos kelmadi" — nomzodga yumshoq xabar; "kelmadi" (no_show) — yo'q.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, SENT = [];
const A = 'agCL';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Shortlist', 'Vacancy', 'Application', 'Restaurant'])
    M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const tg = require('../src/services/telegram');
  tg.platformToken = () => 'x';
  tg.sendMessage = async (tok, chatId, text, opts) => { SENT.push({ chatId, text, opts }); return { message_id: 1 }; };

  await M.Restaurant.create({ id: A, name: 'TH', kind: 'agency', active: true, adminEmail: 'cl@t.uz', adminPassword: 'secret1' });
  await M.Client.create({ id: 'c1', agencyId: A, name: 'Tarnov', status: 'active' });
  await M.Vacancy.create([
    { id: 'vc', agencyId: A, clientId: 'c1', title: 'Xostess', role: 'xostess', status: 'open', confirmedAt: new Date() },
    { id: 'vo1', agencyId: A, clientId: 'c1', title: 'Ofitsiant', role: 'ofitsiant', status: 'open', confirmedAt: new Date() },
    { id: 'vo2', agencyId: A, clientId: 'c1', title: 'Ranner', role: 'ofitsiant', status: 'open', confirmedAt: new Date() }
  ]);
  await M.Candidate.create([
    { id: 'k1', restaurantId: A, fullName: 'Aziza', tgChatId: '501', lang: 'ru' },
    { id: 'k2', restaurantId: A, fullName: 'Nodira', tgChatId: '502' },
    { id: 'k3', restaurantId: A, fullName: 'Lola', tgChatId: '503' },
    { id: 'k4', restaurantId: A, fullName: 'Malika', tgChatId: '504' }
  ]);
  await M.Application.create([
    { id: 'a1', agencyId: A, vacancyId: 'vc', candidateId: 'k1', clientId: 'c1', state: 'new', screen: { step: 'start' } },
    { id: 'a2', agencyId: A, vacancyId: 'vc', candidateId: 'k2', clientId: 'c1', state: 'seen', agencySeenAt: new Date() },
    { id: 'a3', agencyId: A, vacancyId: 'vc', candidateId: 'k3', clientId: 'c1', state: 'shortlisted' },
    { id: 'a4', agencyId: A, vacancyId: 'vc', candidateId: 'k4', clientId: 'c1', state: 'rejected', reason: 'agency' }
  ]);
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const handler = (router, method, path) => {
  const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
  const hs = layer.route.stack.map(s => s.handle);
  return hs[hs.length - 1];
};
const call = (h, req) => new Promise((resolve, reject) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, set() { return this; }, json(j) { resolve({ code: this.code, j }); } };
  const r = Object.assign({ params: {}, body: {}, query: {}, headers: {}, protocol: 'https', get: () => 'test.local' }, req);
  h(r, res, e => (e ? reject(e) : resolve({ code: 0 })));
});

test('panelda yopish: javobsiz arizalar yakunlanadi, nomzodga xabar — bir marta', async () => {
  const patch = handler(require('../src/routes/vacancies'), 'patch', '/:id');
  SENT = [];
  const r = await call(patch, { user: { restaurantId: A }, params: { id: 'vc' }, body: { status: 'closed' } });
  assert.equal(r.j.status, 'closed');

  const apps = Object.fromEntries((await M.Application.find({ agencyId: A }).lean()).map(a => [a.id, a]));
  assert.equal(apps.a1.state, 'rejected'); assert.equal(apps.a1.reason, 'vac_closed');
  assert.equal(apps.a1.screen.step, 'stopped');                         // botdagi savollar to'xtaydi
  assert.equal(apps.a2.reason, 'vac_closed');
  assert.equal(apps.a3.state, 'shortlisted');                           // mijoz qo'lida — tegilmaydi
  assert.equal(apps.a4.reason, 'agency');                               // oldin rad etilgan — tegilmaydi

  assert.deepEqual(SENT.map(s => s.chatId).sort(), ['501', '502']);
  const ru = SENT.find(s => s.chatId === '501');
  assert.match(ru.text, /«Хостес».*закрыта/);
  assert.match(ru.text, /Сейчас открыто 2 вакансии/);                   // bazadan, rus ko'plik shakli
  assert.doesNotMatch(ru.text, /другого кандидата/);                    // "boshqa nomzod tanlandi" — yolg'on
  assert.match(ru.opts.reply_markup.inline_keyboard[0][0].web_app.url, /profil\.html#jobs$/);

  // Qayta saqlash / tozalash — ikkinchi xabar yo'q
  SENT = [];
  await call(patch, { user: { restaurantId: A }, params: { id: 'vc' }, body: { status: 'closed' } });
  const sweep = handler(require('../src/routes/vacancies'), 'post', '/closed-sweep');
  const s = await call(sweep, { user: { restaurantId: A }, body: { apply: true } });
  assert.equal(s.j.closed, 0);
  assert.equal(SENT.length, 0);
});

test('nomzod kabinetida halol holat: "o\'rin yopildi", "ko\'rib chiqildi" yozilmaydi', async () => {
  const appLife = require('../src/services/appLife');
  const a1 = await M.Application.findOne({ id: 'a1' }).lean();
  const life = appLife.stepsFor(a1, null, 'uz');
  assert.equal(life.stage, 'vacClosed');
  assert.equal(life.stageLabel, 'O\'rin yopildi');
  assert.equal(life.final, true);
  assert.equal(life.tone, 'no');
  assert.deepEqual(life.steps.map(x => x.key), ['sent', 'vacClosed']);
  assert.equal(appLife.stepsFor(a1).stageLabel, 'O\'rin yopildi');      // panel (tilsiz)
});

test('tozalash: avval ko\'rish (apply:false) hech narsa o\'zgartirmaydi', async () => {
  await M.Vacancy.create({ id: 'vold', agencyId: A, clientId: 'c1', title: 'Kassir', role: 'kassir', status: 'closed' });
  await M.Application.create({ id: 'a5', agencyId: A, vacancyId: 'vold', candidateId: 'k4', clientId: 'c1', state: 'new' });
  const sweep = handler(require('../src/routes/vacancies'), 'post', '/closed-sweep');
  SENT = [];
  let s = await call(sweep, { user: { restaurantId: A }, body: {} });
  assert.equal(s.j.apply, false);
  assert.equal(s.j.closed, 1);
  assert.equal((await M.Application.findOne({ id: 'a5' }).lean()).state, 'new');
  assert.equal(SENT.length, 0);
  s = await call(sweep, { user: { restaurantId: A }, body: { apply: true } });
  assert.equal(s.j.notified, 1);
  assert.equal((await M.Application.findOne({ id: 'a5' }).lean()).reason, 'vac_closed');
});

test('suhbatdan keyin "mos kelmadi" — nomzodga xabar; "kelmadi" — yo\'q', async () => {
  const sl = require('../src/services/shortlist');
  await M.Shortlist.create({ id: 's1', agencyId: A, clientId: 'c1', vacancyId: 'vo1', summary: 'Ofitsiant',
    items: [{ candidateId: 'k2', state: 'interview', interviewAt: new Date() }, { candidateId: 'k3', state: 'revealed' }] });
  SENT = [];
  await sl.setClientState({ agencyId: A, shortlistId: 's1', clientId: 'c1', candidateId: 'k2', state: 'not_fit', reason: 'experience' });
  assert.equal(SENT.length, 1);
  assert.equal(SENT[0].chatId, '502');
  assert.match(SENT[0].text, /«Ofitsiant» bo'yicha bu safar boshqa nomzod tanlandi/);

  SENT = [];
  await sl.setClientState({ agencyId: A, shortlistId: 's1', clientId: 'c1', candidateId: 'k3', state: 'not_fit', reason: 'no_show' });
  assert.equal(SENT.length, 0);
});
