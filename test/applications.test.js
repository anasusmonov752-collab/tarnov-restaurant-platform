// ── Ariza oqimi: nomzod yuboradi -> agentlik ko'radi/bog'lanadi -> taklif ──
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, M = {}, R = {};
const A = 'agA';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  for (const n of ['Client', 'Candidate', 'Shortlist', 'Vacancy', 'Application']) M[n] = require('../src/models/' + n);
  await Promise.all(Object.values(M).map(m => m.syncIndexes()));
  const handler = (router, method, path) => {
    const layer = router.stack.find(l => l.route && l.route.path === path && l.route.methods[method]);
    const hs = layer.route.stack.map(s => s.handle);
    return hs[hs.length - 1];                         // guard'ni chetlab
  };
  const cd = require('../src/routes/candidate'), vc = require('../src/routes/vacancies');
  R.apply = handler(cd, 'post', '/vacancies/:id/apply');
  R.mine = handler(cd, 'get', '/applications');
  R.inbox = handler(vc, 'get', '/applications/inbox');
  R.mark = handler(vc, 'post', '/applications/:appId/:mark(seen|contacted)');
  R.act = handler(vc, 'post', '/:id/applications/:appId/:action');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });

const call = (h, req) => new Promise((resolve, reject) => {
  const res = { code: 200, headers: {}, status(c) { this.code = c; return this; }, set(k, v) { this.headers[k] = v; return this; },
    json(j) { resolve({ code: this.code, j }); } };
  const r = Object.assign({ user: { restaurantId: A }, params: {}, body: {}, query: {}, headers: {}, protocol: 'https',
    get: () => 'test.local' }, req);
  h(r, res, e => (e ? reject(e) : resolve({ code: 0 })));
});

test('bosqichlar: yuborildi -> ko\'rildi -> bog\'landi -> taklif -> suhbat -> natija', () => {
  const life = require('../src/services/appLife');
  const t0 = new Date('2026-10-22T10:00:00Z');
  let s = life.stepsFor({ createdAt: t0, state: 'new' });
  assert.deepEqual(s.steps.map(x => x.key), ['sent']);
  assert.equal(s.tone, 'wait');
  s = life.stepsFor({ createdAt: t0, state: 'new', agencySeenAt: t0, contactedAt: t0 });
  assert.deepEqual(s.steps.map(x => x.key), ['sent', 'reviewed', 'contacted']);
  s = life.stepsFor({ createdAt: t0, state: 'shortlisted', decidedAt: t0 },
    { state: 'interview', interviewAt: new Date('2026-10-24T10:00:00Z') });
  assert.equal(s.stage, 'interview');
  assert.equal(s.stageLabel, 'Suhbat: 24-oktabr, 15:00');      // Toshkent vaqti
  s = life.stepsFor({ createdAt: t0, state: 'shortlisted', decidedAt: t0 }, { state: 'hired', interviewAt: t0, decidedAt: t0 });
  assert.equal(s.stage, 'hired'); assert.equal(s.final, true); assert.equal(s.tone, 'ok');
  s = life.stepsFor({ createdAt: t0, state: 'rejected', decidedAt: t0 });
  assert.equal(s.stage, 'closed'); assert.equal(s.tone, 'no');

  // Nomzod tili — ruscha bosqichlar va sana
  s = life.stepsFor({ createdAt: t0, state: 'shortlisted', decidedAt: t0 },
    { state: 'interview', interviewAt: new Date('2026-10-24T10:00:00Z') }, 'ru');
  assert.equal(s.stageLabel, 'Собеседование: 24 октября, 15:00');
  assert.equal(s.steps[0].label, 'Отклик отправлен');
});

test('nomzod vakansiya kartasi nomzod tilida (forCandidate lang)', () => {
  const vac = require('../src/services/vacancy');
  const v = { id: 'v1', role: 'ofitsiant', shift: 'kechki', title: 'Ofitsiant, kechki smena', location: 'Chilonzor',
    salaryFrom: 200000, salaryPeriod: 'day', payout: 'daily', perks: ['ovqat'], createdAt: new Date(), confirmedAt: new Date() };
  const uz = vac.forCandidate(v, null);
  assert.equal(uz.place, 'Chilonzorda restoran');
  const ru = vac.forCandidate(v, null, 'ru');
  assert.equal(ru.title, 'Официант, вечерняя смена');
  assert.equal(ru.salaryText, 'от 200 000 сум / день');
  assert.deepEqual(ru.perkLabels, ['Питание']);
  assert.equal(ru.payoutText, 'Выплата каждый день');
  assert.equal(vac.forCandidate(Object.assign({}, v, { location: '' }), null, 'ru').place, 'Ресторан в Ташкенте');
});

test('ariza: aniq xato kodlari, muvaffaqiyat, takror', async () => {
  await M.Client.create({ id: 'c1', agencyId: A, name: 'Restoran', status: 'pending' });
  await M.Vacancy.create([
    { id: 'v1', agencyId: A, clientId: 'c1', title: 'Ofitsiant', status: 'open' },
    { id: 'v0', agencyId: A, clientId: 'c1', title: 'Yopiq', status: 'closed' }
  ]);
  const noName = await M.Candidate.create({ id: 'k0', restaurantId: A, phone: '+998901112233' });
  let r = await call(R.apply, { cand: noName, params: { id: 'v1' } });
  assert.equal(r.code, 400); assert.equal(r.j.code, 'no_name');

  const k = await M.Candidate.create({ id: 'k1', restaurantId: A, fullName: 'Aziz', phone: '12' });
  r = await call(R.apply, { cand: k, params: { id: 'v1' } });
  assert.equal(r.j.code, 'bad_phone');
  k.phone = '+998 90 111 22 33'; await k.save();
  r = await call(R.apply, { cand: k, params: { id: 'v0' } });
  assert.equal(r.code, 404); assert.equal(r.j.code, 'closed');

  r = await call(R.apply, { cand: k, params: { id: 'v1' }, body: { message: '  2 yil tajriba  ' } });
  assert.equal(r.code, 200);
  const a = await M.Application.findOne({ id: r.j.id }).lean();
  assert.equal(a.message, '2 yil tajriba');
  r = await call(R.apply, { cand: k, params: { id: 'v1' } });
  assert.equal(r.code, 409); assert.equal(r.j.code, 'duplicate');

  const mine = (await call(R.mine, { cand: k })).j;
  assert.equal(mine[0].stateLabel, 'Ariza yuborildi');
  assert.deepEqual(mine[0].steps.map(s => s.key), ['sent']);
});

test('panel: kirish qutisi, ko\'rildi/bog\'landim va taklif — nomzod bosqichi yangilanadi', async () => {
  let box = (await call(R.inbox, {})).j;
  assert.equal(box.counts.new, 1); assert.equal(box.counts.unseen, 1);
  const it = box.items[0];
  assert.equal(it.tab, 'new'); assert.equal(it.client.status, 'pending');
  assert.equal(it.candidate.fullName, 'Aziz');

  // Vakansiya yopilsa — ariza "Yakunlangan"da, sanoqqa kirmaydi, yozuv o'zgarmaydi (2026-11-17)
  await M.Vacancy.updateOne({ id: 'v1' }, { $set: { status: 'closed' } });
  const cbox = (await call(R.inbox, {})).j;
  assert.equal(cbox.counts.new, 0); assert.equal(cbox.counts.unseen, 0);
  assert.equal(cbox.items[0].tab, 'done'); assert.equal(cbox.items[0].closed, true);
  assert.equal(cbox.items[0].stageLabel, 'Vakansiya yopilgan');
  assert.equal((await M.Application.findOne({ id: it.id }).lean()).state, 'new');
  await M.Vacancy.updateOne({ id: 'v1' }, { $set: { status: 'open' } });

  await call(R.mark, { params: { appId: it.id, mark: 'seen' } });
  const seen1 = (await M.Application.findOne({ id: it.id }).lean()).agencySeenAt;
  await call(R.mark, { params: { appId: it.id, mark: 'seen' } });          // ikkinchi marta surmaydi
  assert.equal(+(await M.Application.findOne({ id: it.id }).lean()).agencySeenAt, +seen1);
  await call(R.mark, { params: { appId: it.id, mark: 'contacted' } });
  box = (await call(R.inbox, {})).j;
  assert.equal(box.counts.unseen, 0); assert.equal(box.items[0].tab, 'work');
  assert.equal(box.items[0].stage, 'contacted');
  assert.equal((await call(R.mark, { params: { appId: 'yoq', mark: 'seen' } })).code, 404);

  const r = await call(R.act, { params: { id: 'v1', appId: it.id, action: 'shortlist' } });
  assert.equal(r.code, 200);
  const k = await M.Candidate.findOne({ id: 'k1' });
  const mine = (await call(R.mine, { cand: k })).j;
  assert.deepEqual(mine[0].steps.map(s => s.key), ['sent', 'reviewed', 'contacted', 'proposed']);
  assert.equal(mine[0].stateLabel, 'Ish beruvchiga taklif qilindi');
});

test('/start birinchi ekrani: nomzod matni (agentlik tavsifisiz), haqiqiy ishlar, uz/ru, HTML xavfsiz', async () => {
  const { firstScreen } = require('../src/routes/telegram');
  await M.Vacancy.create([
    { id: 'h1', agencyId: 'agH', clientId: 'c', title: 'Ofitsiant', role: 'ofitsiant', status: 'open' },
    { id: 'h2', agencyId: 'agH', clientId: 'c', title: 'Ofitsiant 2', role: 'ofitsiant', status: 'open' },
    { id: 'h3', agencyId: 'agH', clientId: 'c', title: 'Oshpaz', role: 'oshpaz', status: 'open' },
    { id: 'h4', agencyId: 'agH', clientId: 'c', title: 'Yopiq', role: 'kassir', status: 'closed' },
    { id: 'h5', agencyId: 'agH', clientId: 'c', title: 'Yashirin', role: 'xostess', status: 'open', listed: false }
  ]);
  const scr = o => firstScreen(Object.assign({ r: { id: 'r1' }, appBase: 'https://x' }, o));

  const uz = await scr({ lang: 'uz', from: { first_name: 'Ali<b>' }, agencyId: 'agH' });
  assert.match(uz.text, /Assalomu alaykum, Ali&lt;b&gt;!\nBu <b>TalentHub<\/b> — orzuingizdagi ishni biz bilan toping/);   // kimligimiz + ilmoq
  assert.ok(!/platforma/i.test(uz.text));
  assert.match(uz.text, /<b>3 ta ochiq ish<\/b>/);                     // yopiq va yashirin sanalmaydi
  // Taqsimot tugmalarda (matnda takrorlanmaydi); ishi yo'q lavozim tugmasi yo'q
  const btn = uz.rows.flat().map(b => b.text);
  assert.ok(btn.includes('Ofitsiant \u00b7 2') && btn.includes('Oshpaz \u00b7 1'), btn.join(' | '));
  assert.ok(!btn.some(t => /Kassir|Barmen/.test(t)));
  assert.ok(!/\n{3,}/.test(uz.text));
  // Nomzodga agentlik tavsifi YOZILMAYDI (docs/auditoriya.md)
  assert.ok(!/xodim tanlash|tavsiya qilamiz|Restoranlar bizga/.test(uz.text), uz.text);
  const keys = uz.rows.flat().map(b => b.callback_data || (b.web_app ? 'app' : ''));
  assert.ok(keys.includes('ft:c:ofitsiant'));                          // lavozim tugmalari
  assert.ok(keys.includes('app'));                                     // zaxira yo'l (anketa)
  assert.ok(keys.includes('ft:lang:ru:r1'));                           // til almashtirish

  // Vakansiya havolasi: e'lonning O'ZI va "ariza darhol yuboriladi"
  const ru = await scr({ lang: 'ru', from: {}, agencyId: 'agH',
    v: { id: 'h1', title: 'Ofitsiant', role: 'ofitsiant', location: 'Chilonzor', salaryFrom: 4e6, salaryTo: 5e6 } });
  assert.match(ru.text, /^\ud83d\udc4b \u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435!/);
  assert.match(ru.text, /Chilonzor/);
  assert.match(ru.text, /\u041e\u0442\u043a\u043b\u0438\u043a \u0443\u0439\u0434\u0451\u0442/);   // "Otklik uydyot na etu vakansiyu srazu"
  assert.ok(!/\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0439:/.test(ru.text));                     // ro'yxat emas
  assert.equal(ru.rows.length, 3);

  // Ish yo'q: raqam TO'QILMAYDI, foyda va o'sha savol
  const empty = await scr({ lang: 'uz', from: {}, agencyId: 'yoq' });
  assert.ok(!/ta ochiq ish/.test(empty.text));
  assert.match(empty.text, /Bepul/);
  assert.match(empty.text, /Qaysi ish kerak\?/);
});
