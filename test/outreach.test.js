// ── TAKLIF NAVBATI (services/outreach) ───────────────────────
// Asosiy shart: bir odamga ikki marta SMS ketmasin, botda bor odamga
// umuman ketmasin va matn BITTA SMS ichiga sig'sin.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, Candidate, Client, Vacancy, outreach, vac;
const A = 'agO';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  Candidate = require('../src/models/Candidate');
  Client = require('../src/models/Client');
  Vacancy = require('../src/models/Vacancy');
  await Promise.all([Candidate.syncIndexes(), Client.syncIndexes()]);
  outreach = require('../src/services/outreach');
  vac = require('../src/services/vacancy');
});
after(async () => { await mongoose.disconnect(); if (rs) await rs.stop(); });
// Navbatga faqat OCHIQ VAKANSIYASI bor lavozim tushadi (Tarnov kabi: ofitsiant +
// ranner, salatchi (oshpaz roli), xostess). Ranner ATAYLAB birinchi yaratiladi —
// ofitsiantlarga baribir "ofitsiant" deyilishi kerak.
const VAC = [['vr', 'Ranner', 'ofitsiant'], ['vf', 'Ofitsiant', 'ofitsiant'], ['vs', 'Salatchi', 'oshpaz'], ['vh', 'Xostess', 'xostess']];
beforeEach(async () => {
  await Candidate.deleteMany({});
  await Vacancy.deleteMany({});
  let t = Date.now() - 1e6;
  for (const [id, title, role] of VAC)
    await Vacancy.create({ id, agencyId: A, clientId: 'ct', title, role, status: 'open', listed: true, createdAt: new Date(t += 1000) });
});

const cand = (id, x = {}) => Candidate.create(Object.assign({
  id, restaurantId: A, fullName: 'Karimov Dilshod Anvarovich', phone: '+998 90 123 45 67',
  role: 'ofitsiant', source: 'hh', jobStatus: 'active'
}, x));

test('navbatga faqat yozsa bo\'ladiganlar tushadi', async () => {
  await cand('ok1');
  await cand('ok2', { role: 'oshpaz' });
  await cand('x1', { source: 'anketa' });                       // o'zimizniki — botda bor
  await cand('x2', { tgChatId: '555' });                        // Telegramda — bepul yozamiz
  await cand('x3', { jobStatus: 'not_looking' });
  await cand('x4', { status: 'hired' });
  await cand('x5', { status: 'rejected' });
  await cand('x6', { phone: '' });                              // telefoni yo'q
  await cand('x7', { phone: '12345' });                         // buzuq raqam (phoneKey bo'sh)
  await cand('x8', { smsSentAt: new Date() });                  // allaqachon yozilgan
  await cand('x9', { isTest: true });
  await cand('x10', { restaurantId: 'boshqa' });                // boshqa agentlik
  await cand('x11', { role: 'menejer' });                       // menejerga vakansiya yo'q — SMS ketmasin

  const out = await outreach.list(A);
  assert.deepEqual(out.rows.map(r => r.id).sort(), ['ok1', 'ok2']);
  assert.equal(out.total, 2);
  assert.deepEqual(out.byRole.map(r => [r.role, r.n]).sort(), [['ofitsiant', 1], ['oshpaz', 1]]);

  const one = await outreach.list(A, { role: 'oshpaz' });
  assert.deepEqual(one.rows.map(r => r.id), ['ok2']);
  assert.equal((await outreach.list(A, { role: 'menejer' })).total, 0);
});

test('{lavozim} — haqiqiy vakansiya nomi: oshpazga "salatchi", ofitsiantga "ofitsiant"', async () => {
  await cand('l1'); await cand('l2', { role: 'oshpaz' }); await cand('l3', { role: 'xostess' });
  const by = Object.fromEntries((await outreach.list(A)).rows.map(r => [r.id, r]));
  assert.equal(by.l1.lavozim, 'ofitsiant');                     // Ranner birinchi bo'lsa ham
  assert.equal(by.l2.lavozim, 'salatchi');
  assert.equal(by.l3.lavozim, 'xostess');
  const sms = outreach.render(outreach.DEFAULT_TPL, { fullName: 'Karimov Dilshod', role: 'oshpaz' }, 't.me/x', by.l2.lavozim);
  assert.match(sms, /Tarnov restoraniga salatchi kerak/);
  // Vakansiya yopilsa — lavozim navbatdan chiqadi
  await Vacancy.updateMany({ role: 'oshpaz' }, { $set: { status: 'closed' } });
  assert.ok(!(await outreach.list(A)).rows.some(r => r.id === 'l2'));
});

test('telefon formatdan qat\'i nazar +998 ga keltiriladi, ism ikkinchi so\'z', async () => {
  await cand('p1', { phone: '+998 90 123 45 67' });
  await cand('p2', { phone: '901234568', fullName: 'Aziza' });
  const rows = (await outreach.list(A)).rows;
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.p1.phone, '+998901234567');
  assert.equal(by.p1.first, 'Dilshod');                         // "Familiya Ism Otasining ismi"
  assert.equal(by.p2.phone, '+998901234568');
  assert.equal(by.p2.first, 'Aziza');                           // bitta so'z bo'lsa o'zi
});

test('standart matn: GSM-7, ko\'pi bilan 2 SMS, rekruter ovozi', async () => {
  const c = { fullName: 'Karimov Dilshod', role: 'ofitsiant' };
  const text = outreach.render(outreach.DEFAULT_TPL, c, 't.me/TalentHubUzBot?start=a_HMXT37_sms');
  const i = outreach.smsInfo(text);
  assert.ok(i.parts <= 2, text);
  assert.deepEqual(i.bad, [], 'GSM-7 ga kirmaydigan belgi bo\'lmasin');
  // Kim yozyapti va raqam qayerdan — shaxsiy raqamdan kelgan SMS spamga o'xshamasin
  assert.ok(/TalentHub agentligidan/.test(text) && /Raqamingizni hh\.uz/.test(text), text);
  assert.ok(text.includes('Dilshod') && text.includes('ofitsiant') && text.includes('t.me/'));
  // Maosh, to'lov, "ariza" va "rezyume tayyor, to'ldirish shart emas" yo'q (Anas)
  assert.ok(!/ariza|so'm|tayyor|to'ldirish/i.test(text), text);

  // Bitta tire yoki qo'shtirnoq SMS'ni uchga bo'ladi — ogohlantirish shart
  const bad = outreach.smsInfo('Assalomu alaykum — TalentHub');
  assert.ok(bad.bad.includes('—'));
});

test('yuborildi: navbatdan chiqadi, "bog\'lanildi" yoziladi, qaytarish ishlaydi', async () => {
  await cand('s1');
  assert.equal((await outreach.list(A)).total, 1);

  assert.equal(await outreach.markSent(A, 's1'), true);
  let c = await Candidate.findOne({ id: 's1' }).lean();
  assert.ok(c.smsSentAt && c.firstContactAt && c.seenAt);
  assert.equal(+c.smsSentAt, +c.firstContactAt);
  assert.equal((await outreach.list(A)).total, 0);
  assert.equal((await outreach.list(A)).sentToday, 1);

  // Qaytarish: SMS ketmagan — "bog'lanildi" ham olinadi
  await outreach.markSent(A, 's1', true);
  c = await Candidate.findOne({ id: 's1' }).lean();
  assert.equal(c.smsSentAt, null);
  assert.equal(c.firstContactAt, null);
  assert.equal((await outreach.list(A)).total, 1);

  assert.equal(await outreach.markSent(A, 'yoq'), false);
});

test('qaytarish OLDINGI aloqani o\'chirmaydi', async () => {
  const earlier = new Date(Date.now() - 3 * 864e5);
  await cand('s2', { firstContactAt: earlier });
  await outreach.markSent(A, 's2');
  await outreach.markSent(A, 's2', true);
  const c = await Candidate.findOne({ id: 's2' }).lean();
  assert.equal(+c.firstContactAt, +earlier, 'oldin qo\'ng\'iroq qilingan edi — qolsin');
});

test('restoran nomi: faqat mijoz ochiq ko\'rsatishga rozi bo\'lsa', async () => {
  const v = { id: 'v1', title: 'Ofitsiant', role: 'ofitsiant', location: 'Chilonzor', confirmedAt: new Date() };
  const hidden = { id: 'c1', name: 'Chaykhana Navruz', status: 'active' };
  const shown = { id: 'c2', name: 'Tarnov', status: 'active', showName: true };
  assert.equal(vac.forCandidate(v, hidden, 'uz').employer, '');
  assert.equal(vac.forCandidate(v, shown, 'uz').employer, 'Tarnov');
});


test('har qatorda SHAXSIY havola: token bir marta yaratiladi va saqlanadi', async () => {
  await cand('t1'); await cand('t2', { role: 'xostess' });
  const a = await outreach.list(A, { bot: 'TestBot' });
  const links = a.rows.map(r => r.link);
  assert.ok(links.every(l => /^t\.me\/TestBot\?start=[A-Za-z0-9]{10}$/.test(l)), links.join(' '));
  assert.notEqual(links[0], links[1]);
  const b = await outreach.list(A, { bot: 'TestBot' });
  assert.deepEqual(b.rows.map(r => r.link).sort(), links.sort());          // qayta ochilganda o'sha havola
  const db = await Candidate.findOne({ id: 't1' }).lean();
  assert.equal(db.tgInviteChannel, 'sms');
  // Token boshqa /start turlari bilan aralashmaydi
  assert.equal(require('../src/services/survey').parsePayload(db.tgInviteToken), null);
});

// ── hh nomzodi havolani bosdi: rezyume bor, bitta tugma bilan ariza ──
test('shaxsiy havola ekrani: anketa yo\'q, lavozimidagi ish, tugma = ariza', async () => {
  const M = { Vacancy: require('../src/models/Vacancy'), Application: require('../src/models/Application'),
              Restaurant: require('../src/models/Restaurant') };
  await Promise.all([M.Vacancy.deleteMany({}), M.Application.deleteMany({}), Client.deleteMany({}), M.Restaurant.deleteMany({})]);
  await M.Restaurant.create({ id: A, name: 'TH', kind: 'agency', active: true, adminEmail: 'o@t.uz', adminPassword: 'secret1' });
  await Client.create({ id: 'ct', agencyId: A, name: 'Tarnov', showName: true, status: 'active' });
  await M.Vacancy.create({ id: 'vx', agencyId: A, clientId: 'ct', title: 'Xostess', role: 'xostess', status: 'open',
    listed: true, confirmedAt: new Date(), salaryFrom: 225000, salaryTo: 225000, salaryPeriod: 'day', location: 'Chorsu' });
  await M.Vacancy.create({ id: 'vo', agencyId: A, clientId: 'ct', title: 'Ofitsiant', role: 'ofitsiant', status: 'open',
    listed: true, confirmedAt: new Date() });
  const c = await cand('h1', { role: 'xostess', fullName: 'Yusupova Nilufar', tgChatId: '501', tgState: 'linked' });
  const tg = require('../src/services/telegram'); tg.platformToken = () => 'x'; tg.sendMessage = async () => ({ message_id: 1 });
  const ft = require('../src/services/firstTouch');

  const scr = await ft.candidateInvite({ cand: c, lang: 'uz', appBase: 'https://x' });
  assert.match(scr.text, /Assalomu alaykum, Nilufar!/);
  assert.match(scr.text, /<b>TalentHub<\/b> — Toshkentdagi restoranlar uchun ishga joylash agentligi/);
  assert.ok(!/bizda bor|to'ldirish shart emas/.test(scr.text), scr.text);
  assert.match(scr.text, /Xostess · Tarnov · 225 000/);
  assert.ok(!/Ofitsiant/.test(scr.text), 'faqat o\'z lavozimi');
  assert.equal(scr.keyboard[0][0].callback_data, 'ft:ap:vx');
  assert.ok(scr.keyboard.flat().some(b => b.callback_data === 'ft:no'));     // chiqish yo'li
  assert.ok(scr.keyboard.flat().some(b => b.callback_data === 'ft:il:ru'));  // til

  const r1 = await ft.handleCallback({ data: 'ft:ap:vx', chatId: '501', appBase: 'https://x', from: { id: 501 } });
  assert.match(r1.edit, /Arizangiz yuborildi: <b>Xostess · Tarnov<\/b>/);
  assert.equal(await M.Application.countDocuments({ candidateId: 'h1', vacancyId: 'vx' }), 1);
  const r2 = await ft.handleCallback({ data: 'ft:ap:vx', chatId: '501', appBase: 'https://x', from: { id: 501 } });
  assert.equal(r2.alert, true); assert.match(r2.text, /allaqachon/);
  assert.equal(await M.Application.countDocuments({ candidateId: 'h1' }), 1);

  // Ruschaga — o'sha ekran ruscha
  const ru = await ft.handleCallback({ data: 'ft:il:ru', chatId: '501', appBase: 'https://x', from: { id: 501 } });
  assert.match(ru.edit, /агентство по трудоустройству для ресторанов Ташкента/);
  assert.match(ru.keyboard[0][0].text, /Отправлено/);                        // allaqachon yuborilgani ko'rinadi

  // Yopilgan ish va telefoni buzuq nomzod
  await M.Vacancy.updateOne({ id: 'vo' }, { $set: { status: 'closed' } });
  const cl = await ft.handleCallback({ data: 'ft:ap:vo', chatId: '501', appBase: 'https://x', from: { id: 501 } });
  assert.equal(cl.alert, true);
  await Candidate.updateOne({ id: 'h1' }, { $set: { phone: '123' } });
  await M.Vacancy.create({ id: 'v3', agencyId: A, clientId: 'ct', title: 'Xostess 2', role: 'xostess', status: 'open', listed: true, confirmedAt: new Date() });
  const np = await ft.handleCallback({ data: 'ft:ap:v3', chatId: '501', appBase: 'https://x', from: { id: 501 } });
  assert.equal(np.alert, true);

  // Ish qidirmayapman
  await ft.handleCallback({ data: 'ft:no', chatId: '501', appBase: 'https://x', from: { id: 501 } });
  assert.equal((await Candidate.findOne({ id: 'h1' }).lean()).jobStatus, 'not_looking');
});

test('kirill ism SMS\'ni bo\'lib yubormaydi — lotinga o\'giriladi', () => {
  // 2026-11-15: "Нилуфар" bilan SMS 3 ta bo'lib ketardi (UCS-2, 70 belgi)
  assert.equal(outreach.firstName('Юсупова Нилуфар Бахтиёровна'), 'Nilufar');
  assert.equal(outreach.firstName('Ахмедова Ўғилой'), "O'g'iloy");
  // Jonli navbatda topilgan (2026-11-16): yashirin ism va KATTA harf
  assert.equal(outreach.firstName('ФИО скрыто соискателем'), '');
  assert.equal(outreach.firstName('Кудратова САИДА'), 'Saida');
  assert.equal(outreach.nameWord('Кудратова САИДА'), 'Саида');
  const hid = outreach.render(outreach.DEFAULT_TPL, { fullName: 'ФИО скрыто соискателем', role: 'xostess' }, 't.me/x');
  assert.ok(hid.startsWith('Assalomu alaykum! TalentHub'), hid);
  const tpl = "Assalomu alaykum, {ism}. Tarnov restoraniga xostess kerak, kuniga 225 000 so'm. Telegramda anketasiz ariza bering: {havola}";
  const t = outreach.render(tpl, { fullName: 'Каримов Шохруххон', role: 'xostess' }, 't.me/TalentHubUzBot?start=abcdefghij');
  const i = outreach.smsInfo(t);
  assert.deepEqual(i.bad, [], t);
  assert.equal(i.parts, 1, t);
});
