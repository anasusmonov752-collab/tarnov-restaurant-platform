// ── Bazasiz testlar: sof qoidalar ────────────────────────────
// Ishga tushirish: npm test (CI'da har push'da — .github/workflows/test.yml)
const { test } = require('node:test');
const assert = require('node:assert/strict');

const anonymize = require('../src/services/anonymize');
const photoToken = require('../src/utils/photoToken');
const { mergeParsed } = require('../src/utils/mergeParsed');
const { phoneKey } = require('../src/utils/candidateKeys');
const pipeline = require('../src/data/pipeline');
const survey = require('../src/services/survey');

test('anonim matn: kontaktlar yashiriladi', () => {
  for (const s of ['+998 90 123 45 67', '90-123-45-67', '(90)1234567', '998901234567', '901234567',
                   '+7 916 123 45 67', 'aziza.k@gmail.com', 't.me/aziza_k', 'https://instagram.com/aziza', '@aziza_karimova']) {
    assert.match(anonymize.hideContacts('x ' + s + ' y'), /•••/, s);
  }
});

test('anonim matn: yil, maosh, sana, so\'z o\'zgarmaydi', () => {
  for (const s of ['2015-2017 va 2018-2020', 'maosh 5 000 000 so\'m', '15 000 000', '01.09.2020 - 31.05.2023',
                   '3 yil, 10 ta stol', 'iiko, R-Keeper', 'C++ va @ belgisi']) {
    assert.equal(anonymize.hideContacts(s), s);
  }
});

test('forClient: ism, telefon, email chiqmaydi', () => {
  const out = anonymize.forClient({ id: 'x', fullName: 'Aziza Karimova', publicCode: 'A-7K2M', role: 'xostess',
    phone: '+998901234567', email: 'a@b.uz', summary: 'Aziza Karimova, tel 90 123 45 67',
    workHistory: [{ company: 'Rayhon', position: 'Xostess', description: '@aziza_k', period: '2021-2023' }] });
  const s = JSON.stringify(out);
  assert.ok(!/Aziza|Karimova|123 45 67|@aziza|a@b\.uz/.test(s), s);
  assert.equal(out.workHistory[0].period, '2021-2023');
  assert.ok(!('phone' in out) && !('email' in out) && !('fullName' in out));
});

test('rasm tokeni: imzo, muddat, soxtalik', () => {
  const t = photoToken.sign('12345');
  assert.equal(photoToken.verify(t), '12345');
  assert.equal(photoToken.verify(t.replace(/^12345/, '12346')), '');
  assert.equal(photoToken.verify(photoToken.sign('1', -7200)), '');      // muddati o'tgan
  assert.equal(photoToken.verify('garbage'), '');
  assert.equal(photoToken.sign('9'), photoToken.sign('9'));              // soat ichida barqaror (kesh)
});

test('qayta tahlil: qo\'lda kiritilgan saqlanadi', () => {
  const d = { aiParsed: true, fullName: 'Aziza Karimova', phone: '+998 90 111 22 33', email: '', role: 'menejer', summary: 'eski', skills: [] };
  mergeParsed(d, { fullName: 'Женщина 21 год', phone: '+998 99 999 99 99', email: 'a@b.uz', role: 'xostess', summary: 'yangi', skills: ['bron'] });
  assert.deepEqual([d.fullName, d.phone, d.role, d.email, d.summary, d.skills[0]],
    ['Aziza Karimova', '+998 90 111 22 33', 'menejer', 'a@b.uz', 'eski', 'bron']);
  const e = { aiParsed: false, fullName: '', role: 'boshqa', summary: 'taxmin' };
  mergeParsed(e, { fullName: 'Aziza K', role: 'xostess', summary: 'AI' });
  assert.deepEqual([e.fullName, e.role, e.summary], ['Aziza K', 'xostess', 'AI']);
});

test('telefon kaliti formatdan qat\'i nazar bir xil', () => {
  assert.equal(phoneKey('+998 90 135 93 94'), phoneKey('901359394'));
  assert.equal(phoneKey('123'), '');
});

test('pipeline: qaytarish holatlari va sabablari', () => {
  assert.ok(!pipeline.REFUNDABLE_STATES.includes('hired'));
  assert.ok(pipeline.REFUNDABLE_STATES.every(s => pipeline.STATE_KEYS.includes(s)));
  for (const r of pipeline.REFUND_REASON_KEYS) assert.ok(pipeline.reasonLabel(r));
});

test('anketa: shablon va lavozim anketalari qoidadan o\'tadi', () => {
  assert.doesNotThrow(() => survey.cleanQuestions(survey.template()));
  for (const role of survey.PRESET_ROLES) assert.doesNotThrow(() => survey.rolePreset(role), role);
  const osh = survey.rolePreset('oshpaz').questions.map(q => q.id);
  assert.ok(osh.includes('c_kuxnya') && !osh.includes('c_bron') && !osh.includes('english'));
});

test('anketa: shartli savollar (zanjir va lavozim)', () => {
  const qs = survey.cleanQuestions(survey.template());
  const ids = (a, pr) => survey.shownQuestions(qs, a, pr).map(q => q.id);
  let v = ids({ role: 'oshpaz', sanitary: 'yes', study: 'no' });
  assert.ok(v.includes('c_kuxnya') && v.includes('lastJob') && !v.includes('c_bron') && !v.includes('c_sanit'));
  v = ids({ role: 'oshpaz' }, 'xostess');
  assert.ok(v.includes('c_bron') && !v.includes('c_kuxnya'));
  const f = survey.toFields({ role: 'xostess', lastJob: 'none', c_bron: 'ha', c_kuxnya: 'milliy' }, { questions: qs }, '');
  assert.equal(f.experienceSummary, 'Tajribasiz');
  assert.equal(f.experienceYears, 0);
  assert.deepEqual(f.extraAnswers.map(x => x.a), ['Ha']);        // yashirin oshpaz savoli tushmadi
});

test('anketa: ish tajribasi — joy, lavozim, muddat yoki "Tajribam yo\'q"', () => {
  const qs = survey.cleanQuestions(survey.template());
  const q = qs.find(x => x.id === 'lastJob');
  assert.equal(q.type, 'work');
  assert.ok(!qs.some(x => x.id === 'experience'));               // alohida tajriba savoli endi yo'q
  const code = v => { try { survey.checkAnswer(q, v); return 'ok'; } catch (e) { return e.code; } };
  const ok = { place: ' Rayhon  restorani ', role: 'ofitsiant', dur: 'y1_3' };
  assert.equal(code([ok]), 'ok');
  assert.equal(code('none'), 'ok');
  assert.equal(code([]), 'required');
  assert.equal(code([Object.assign({}, ok, { place: 'R' })]), 'work');
  assert.equal(code([Object.assign({}, ok, { role: 'pilot' })]), 'work');
  assert.equal(code([Object.assign({}, ok, { dur: '10y' })]), 'work');
  assert.equal(code([Object.assign({}, ok, { role: 'boshqa' })]), 'work');           // boshqa lavozim — nomi kerak
  assert.equal(code([ok, ok, ok, ok]), 'work');                                       // ko'pi bilan 3
  assert.deepEqual(survey.checkAnswer(q, [ok]), [{ place: 'Rayhon restorani', role: 'ofitsiant', other: '', dur: 'y1_3' }]);

  // Ikki joy: 1–3 yil (12 oy) + 6 oy–1 yil (6 oy) = 18 oy -> filtrda 1 yil (pastki chegara)
  const second = { place: 'Plov Center', role: 'boshqa', other: 'Katta ofitsiant', dur: 'm6_12' };
  const f = survey.toFields({ role: 'ofitsiant', lastJob: survey.checkAnswer(q, [ok, second]) }, { questions: qs }, '');
  assert.equal(f.experienceYears, 1);
  assert.deepEqual(f.workHistory, [
    { company: 'Rayhon restorani', position: 'Ofitsiant', period: '1–3 yil', description: '' },
    { company: 'Plov Center', position: 'Katta ofitsiant', period: '6 oy – 1 yil', description: '' }
  ]);
  assert.equal(f.experienceSummary, 'Ofitsiant — Rayhon restorani, 1–3 yil; yana 1 ta ish joyi');
  assert.match(f.rawText, /Qayerda ishlagansiz\?: Ofitsiant, Rayhon restorani, 1–3 yil; Katta ofitsiant, Plov Center/);

  // Eski anketa (alohida "Qancha tajribangiz bor?" savoli bilan) buzilmaydi
  const old = survey.template();
  old.splice(1, 0, Object.assign({}, survey.catalogInfo().find(x => x.id === 'experience')));
  const oq = survey.cleanQuestions(old);
  assert.equal(oq.find(x => x.id === 'experience').type, 'choice');
  const g = survey.toFields({ experience: 'y3_5', lastJob: [{ place: 'Bon', role: 'xostess', other: '', dur: 'lt6' }] }, { questions: oq }, '');
  assert.equal(g.experienceYears, 3);                                                 // kattasi qoladi
});

test('anketa: noto\'g\'ri shart rad etiladi', () => {
  const q = JSON.parse(JSON.stringify(survey.cleanQuestions(survey.template())));
  q.find(x => x.id === 'role').showIf = { q: 'study', in: ['day'] };
  assert.throws(() => survey.cleanQuestions(q), /oldingi/);
  const q2 = JSON.parse(JSON.stringify(survey.cleanQuestions(survey.template())));
  q2.find(x => x.id === 'fullName').showIf = { q: 'role', in: ['oshpaz'] };
  assert.throws(() => survey.cleanQuestions(q2), /doim/);
});

test('anketa havolasi: kanal kaliti bot payload\'idan qaytib o\'qiladi', () => {
  // Telegram /start payload'i 64 belgigacha, kanal kaliti — kichik lotin, 8 tagacha
  for (const ch of Object.keys(survey.CHANNELS)) assert.match(ch, /^[a-z]{1,8}$/, ch);
  const p = survey.payloadFor({ code: 'HMXT37', channel: 'vakuz' });
  assert.deepEqual(survey.parsePayload(p), { code: 'HMXT37', channel: 'vakuz' });
  const v = survey.payloadFor({ vacancyId: '0b6f3c1e-1234-4abc-9def-0123456789ab', channel: 'vakuz' });
  assert.ok(v.length <= 64);
  assert.equal(survey.parsePayload(v).channel, 'vakuz');
  assert.equal(survey.parsePayload('a_HMXT37_yoq').channel, '');   // noma'lum kanal — belgisiz
});

test('vakansiya shabloni: maosh davri, afzalliklar, bandlar va ishonch belgisi', () => {
  const vac = require('../src/services/vacancy');
  const c = vac.clean({ title: 'Ofitsiant', role: 'ofitsiant', salaryFrom: 300000, salaryTo: 250000, salaryPeriod: 'shift',
    payout: 'twice', perks: ['ovqat', 'rasmiy', 'yoq', 'ovqat'], duties: '• Mehmonni kutib olish\n\n- Buyurtma olish',
    requirements: ['Rus tili'], venue: 'Steak-house', hook: 'Yangi filial' });
  assert.equal(c.salaryFrom, 250000);                          // chalkash kiritilsa almashtiriladi
  assert.deepEqual(c.perks, ['ovqat', 'rasmiy']);              // noma'lum kalit va takror tushadi
  assert.deepEqual(c.duties, ['Mehmonni kutib olish', 'Buyurtma olish']);
  assert.equal(vac.clean({ salaryPeriod: 'yil', payout: 'har soat' }).salaryPeriod, 'month');
  assert.equal(vac.clean({ payout: 'har soat' }).payout, '');

  assert.equal(vac.salaryText(Object.assign({}, c)), "250 000 – 300 000 so'm / smena");
  assert.equal(vac.salaryText({ salaryFrom: 4000000, salaryTo: 6000000 }), "4 000 000 – 6 000 000 so'm");   // oylik — qo'shimchasiz
  assert.equal(vac.salaryText({ salaryFrom: 200000, salaryPeriod: 'day' }, 'ru'), 'от 200 000 сум / день');
  assert.equal(vac.payoutText(c), "Oyiga 2 marta to'lanadi");

  // Nomzod: restoran nomi yo'q; ishonch belgisi faqat haqiqat bo'lsa
  const v = Object.assign({ id: 'v1', createdAt: new Date(), confirmedAt: new Date() }, c);
  const posted = vac.forCandidate(v, { name: 'MASA', status: 'pending', location: 'Yakkasaroy' });
  assert.equal(posted.trust, 'posted');
  assert.ok(!JSON.stringify(posted).includes('MASA'));
  assert.deepEqual(posted.perkLabels, ['Ovqat', 'Rasmiy ishga joylashtirish']);
  assert.equal(vac.forCandidate(v, { status: 'active' }).trust, 'client');
  assert.equal(vac.forCandidate(Object.assign({}, v, { verifiedAt: new Date() }), { status: 'pending' }).trust, 'verified');
});

test('hamma marshrut fayllari yuklanadi (sintaksis va require xatosi CI\'da ushlansin)', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '../src/routes');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    assert.doesNotThrow(() => require(path.join(dir, f)), f);
  }
});

test('anketa: "Talabamisiz?" smena o\'rniga — smena javobdan yoziladi', () => {
  const qs = survey.cleanQuestions(survey.template());
  assert.ok(!qs.some(q => q.id === 'shift') && qs.some(q => q.id === 'study'));
  const f = survey.toFields({ study: 'day' }, { questions: qs }, '');
  assert.equal(f.shift, 'kechki');                                   // kunduzi o'qiydi -> kechqurun ishlaydi
  assert.equal(f.education, 'O\'qiydi (Kunduzgi ta\'lim)');
  assert.equal(survey.toFields({ study: 'evening' }, { questions: qs }, '').shift, 'kunduzgi');
  const n = survey.toFields({ study: 'no' }, { questions: qs }, '');
  assert.equal(n.education, 'O\'qimaydi');
  assert.equal(n.shift, 'ikkalasi');
  // Eski anketa (smena savoli bilan) buzilmaydi; smena javobi bo'lsa — o'sha
  const old = survey.template();
  old.splice(2, 0, Object.assign({}, survey.catalogInfo().find(x => x.id === 'shift')));
  const oq = survey.cleanQuestions(old);
  assert.equal(oq.find(x => x.id === 'shift').type, 'choice');
  assert.equal(survey.toFields({ shift: 'kunduzgi', study: 'day' }, { questions: oq }, '').shift, 'kunduzgi');
});

test('tajriba oylari: 6–12 oy ishlagan "Tajribasiz" emas', () => {
  const qs = survey.cleanQuestions(survey.template());
  const q = qs.find(x => x.id === 'lastJob');
  const f = survey.toFields({ lastJob: survey.checkAnswer(q, [{ place: 'Bon', role: 'xostess', dur: 'm6_12' }]) }, { questions: qs }, '');
  assert.equal(f.experienceYears, 0);
  assert.equal(f.experienceMonths, 6);
  const g = survey.toFields({ lastJob: survey.checkAnswer(q, [{ place: 'Bon', role: 'xostess', dur: 'lt6' }]) }, { questions: qs }, '');
  assert.equal(g.experienceMonths, 1);                                  // "6 oygacha" — tajriba bor
  assert.equal(survey.toFields({ lastJob: 'none' }, { questions: qs }, '').experienceMonths, 0);
  // Eski nomzodlar uchun ko'chirish jadvali — workHistory.period yozuvidan
  const mig = require('../src/services/migrations');
  assert.equal(mig.PERIOD_MONTHS['6 oy – 1 yil'], 6);
  assert.equal(mig.PERIOD_MONTHS['6 oygacha'], 1);
  assert.equal(mig.PERIOD_MONTHS['1–3 yil'], 12);
});

test('anketa: barcha savollar majburiy (jinsdan tashqari — u anketalarda yo\'q)', () => {
  const opt = qs => qs.filter(q => !q.required).map(q => q.id);
  assert.deepEqual(opt(survey.cleanQuestions(survey.template())).filter(id => id !== 'gender'), []);
  for (const role of survey.PRESET_ROLES) assert.deepEqual(opt(survey.rolePreset(role).questions).filter(id => id !== 'gender'), [], role);
});
