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
const VAC = [['vr', 'Ranner (ovqat tashuvchi)', 'ofitsiant'], ['vf', 'Ofitsiant', 'ofitsiant'], ['vs', 'Salatchi (sovuq oshxona)', 'oshpaz'], ['vh', 'Xostess', 'xostess']];
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

test('Toshkentdan tashqaridagilar navbatga tushmaydi (hudud bo\'sh — qoladi)', async () => {
  const L = { t1: 'Ташкент', t2: 'Toshkent', t3: 'Тинчлик', t4: 'Tinchlik, Toshkent', t5: 'Келес', t6: '',
    o1: 'Чирчик', o2: 'Фергана', o3: 'Алмалык', o4: 'Гулистан', o5: 'Газалкент', o6: 'Янгиюль', o7: 'Samarqand' };
  for (const [id, location] of Object.entries(L)) await cand(id, { location });
  const ids = (await outreach.list(A, { limit: 50 })).rows.map(r => r.id).sort();
  assert.deepEqual(ids, ['t1', 't2', 't3', 't4', 't5', 't6']);
  assert.equal((await outreach.list(A)).byRole.reduce((s, r) => s + r.n, 0), 6);
});

test('rasm: bor bo\'lsa panel havolasi (base64 emas), yo\'q bo\'lsa bo\'sh', async () => {
  await cand('p1', { hasPhoto: true, photo: 'data:image/jpeg;base64,AAAA', photoAt: new Date(5000) });
  await cand('p2');
  const by = Object.fromEntries((await outreach.list(A)).rows.map(r => [r.id, r]));
  assert.equal(by.p1.photo, '/api/recruitment/p1/photo?v=5000');
  assert.equal(by.p2.photo, '');
  assert.ok(!JSON.stringify(by).includes('base64'));
});

test('{lavozim} — haqiqiy vakansiya nomi: oshpazga "salatchi", ofitsiantga "ofitsiant"', async () => {
  await cand('l1'); await cand('l2', { role: 'oshpaz' }); await cand('l3', { role: 'xostess' });
  const by = Object.fromEntries((await outreach.list(A)).rows.map(r => [r.id, r]));
  assert.equal(by.l1.lavozim, 'ofitsiant');                     // Ranner birinchi bo'lsa ham
  assert.equal(by.l2.lavozim, 'salatchi');
  assert.equal(by.l3.lavozim, 'xostess');
  // Standart matnda {lavozim} endi yo'q, lekin o'z matnida ishlatsa — haqiqiy nom
  const sms = outreach.render('Tarnovga {lavozim}lar kerak: {havola}', { fullName: 'Karimov Dilshod', role: 'oshpaz' }, 't.me/x', by.l2.lavozim);
  assert.equal(sms, 'Tarnovga salatchilar kerak: t.me/x');
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

test('standart matn: ikki tilda, havola alohida qatorda, umumiy taklif', async () => {
  const c = { fullName: 'Karimov Dilshod', role: 'ofitsiant' };
  const link = 't.me/TalentHubUzBot?start=Ab12Cd34Ef';
  const text = outreach.render(outreach.DEFAULT_TPL, c, link);
  const [uz, ru] = text.split('\n\n');                           // o'rtada bo'sh qator
  assert.ok(uz && ru, text);
  assert.ok(uz.startsWith('Assalomu alaykum, Dilshod! TalentHub agentligidan yozyapman'), uz);
  assert.ok(uz.split('\n').includes(link), 'havola o\'z qatorida — bosish qulay');
  assert.ok(ru.startsWith('Здравствуйте! Агентство TalentHub') && /по ссылке выше/.test(ru), ru);
  // Kim yozyapti va raqam qayerdan; UMUMIY — lavozim, restoran, Toshkent, va'da yo'q (Anas, 2026-11-16)
  assert.ok(/raqamingiz hh\.uz/.test(text) && /номер из вашего резюме на hh\.uz/.test(text), text);
  assert.ok(!/ofitsiant|Tarnov|Toshkent|ariza|so'm|tayyor|taklif qilmoqchi/i.test(text), text);
  // Ruscha kirillda — ataylab UCS-2; eng uzun ism bilan ham 5 SMS dan oshmasin
  const long = outreach.render(outreach.DEFAULT_TPL, { fullName: 'Karimov Muhammadabdulloh' }, link);
  const i = outreach.smsInfo(long);
  assert.ok(i.ucs2 && i.parts <= 5, `${i.parts} SMS`);
  // Ismi yashirin — ismsiz salom, qatorlar buzilmaydi
  const hid = outreach.render(outreach.DEFAULT_TPL, { fullName: 'ФИО скрыто соискателем' }, link);
  assert.ok(hid.startsWith('Assalomu alaykum! TalentHub') && hid.includes('\n\nЗдравствуйте!'), hid);

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

  // 2026-11-16 (Anas): lavozimlar ro'yxati yo'q — ochiq ishlar soni va maosh oralig'i (bazadan)
  await M.Vacancy.create({ id: 'vm', agencyId: A, clientId: 'ct', title: 'Menejer', role: 'menejer', status: 'open',
    listed: true, confirmedAt: new Date(), salaryFrom: 7500000, salaryTo: 13000000, salaryPeriod: 'month' });
  const scr = await ft.candidateInvite({ cand: c, lang: 'uz', appBase: 'https://x' });
  assert.match(scr.text, /Assalomu alaykum, Nilufar!/);
  assert.match(scr.text, /hozir <b>3 ta ochiq ish<\/b> — maoshi <b>kuniga 225 000 so'mdan oyiga 13 mln so'mgacha<\/b>/);
  assert.match(scr.text, /<b>TalentHub<\/b> — ishga joylash agentligi/);
  assert.ok(!/bizda bor|to'ldirish shart emas|💰|1\. /.test(scr.text), scr.text);   // ro'yxat va emoji yo'q
  assert.ok(!/Xostess|Ofitsiant|Menejer/.test(scr.text), 'lavozimlar yo\'q');
  assert.equal(scr.keyboard[0][0].web_app.url, 'https://x/profil.html#jobs');       // bitta asosiy harakat
  await M.Vacancy.deleteOne({ id: 'vm' });
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
  assert.match(ru.edit, /кадровое агентство/);
  assert.match(ru.edit, /<b>2 открытые вакансии<\/b> — зарплата <b>от 225 000 сум в день<\/b>/);
  assert.match(ru.keyboard[0][0].text, /Смотреть вакансии/);

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

// 2026-11-16 jonli: Anas SMS'dagi havolani o'zi bosdi — Telegrami hh nomzodiga ulanib,
// o'z profili uzildi, nomzod havolasi kuydi
test('shaxsiy havolani boshqa odam bossa — bog\'lanmaydi', async () => {
  const hh = await cand('n1', { role: 'xostess', phone: '+998 90 111 22 33', tgInviteToken: 'AbCdEfGhIj' });
  await cand('me', { source: 'anketa', phone: '+998 91 692 09 99', tgChatId: '700', tgState: 'linked' });
  await cand('dup', { source: 'anketa', phone: '+998901112233', tgChatId: '800', tgState: 'linked' });
  assert.equal((await outreach.inviteClaim(hh, '999', '999')).mode, 'admin');         // agentlik admini
  const o = await outreach.inviteClaim(hh, '700', '999');
  assert.equal(o.mode, 'other'); assert.equal(o.me.id, 'me');                          // boshqa telefon
  assert.equal((await outreach.inviteClaim(hh, '800', '999')).mode, 'bind');          // o'sha odamning 2-yozuvi
  assert.equal((await outreach.inviteClaim(hh, '555', '999')).mode, 'bind');          // yangi akkaunt

  // Paneldagi "Havola yaratish" SMS'dagi tokenni almashtirmaydi (yangisi SMS havolasini o'ldirardi)
  const tg = require('../src/services/telegram');
  tg.isPlatformReady = () => true; tg.platformUsername = async () => 'TestBot';
  const r = await require('../src/services/botRelay').invite({ id: A, name: 'TH' }, hh);
  assert.equal(r.link, 'https://t.me/TestBot?start=AbCdEfGhIj');
  assert.equal(r.manual, true);
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
