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
  let v = ids({ role: 'oshpaz', experience: 'none', sanitary: 'yes', study: 'no' });
  assert.ok(v.includes('c_kuxnya') && !v.includes('lastJob') && !v.includes('c_bron') && !v.includes('c_sanit'));
  v = ids({ role: 'oshpaz' }, 'xostess');
  assert.ok(v.includes('c_bron') && !v.includes('c_kuxnya'));
  const f = survey.toFields({ role: 'xostess', experience: 'none', lastJob: 'X', c_bron: 'ha', c_kuxnya: 'milliy' }, { questions: qs }, '');
  assert.equal(f.experienceSummary, undefined);
  assert.deepEqual(f.extraAnswers.map(x => x.a), ['Ha']);
});

test('anketa: noto\'g\'ri shart rad etiladi', () => {
  const q = JSON.parse(JSON.stringify(survey.cleanQuestions(survey.template())));
  q.find(x => x.id === 'role').showIf = { q: 'experience', in: ['none'] };
  assert.throws(() => survey.cleanQuestions(q), /oldingi/);
  const q2 = JSON.parse(JSON.stringify(survey.cleanQuestions(survey.template())));
  q2.find(x => x.id === 'fullName').showIf = { q: 'role', in: ['oshpaz'] };
  assert.throws(() => survey.cleanQuestions(q2), /doim/);
});
