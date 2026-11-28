// ── BOTGA BIRINCHI KIRISH (nomzod ham, ish beruvchi ham) ─────
// Qoida: AVVAL BER, KEYIN SO'RA.
//
// Ilgari ikkala tomonda ham birinchi xabar so'rardi: nomzoddan 2 daqiqalik
// anketa, restorandan "ovozli xabarda kim kerakligini ayting". Odam esa hali
// hech narsa ko'rmagan. Restoran uchun bundan ham yomoni: hisobi "kutilmoqda"
// bo'lib qolar, yozgani AI qidiruviga ham tushmasdi — menejer qo'ng'iroq
// qilgunicha bot jim turardi.
//
// Endi birinchi javobda HAQIQIY ma'lumot ko'rsatiladi (hammasi bazadan, hech
// narsa to'qilmaydi) va bitta bosish so'raladi:
//   nomzod:  "Qaysi ish qidiryapsiz?" -> shu lavozimdagi ochiq ishlar -> anketa
//   restoran: "Kim kerak?"           -> nomzodlar soni, bozor maoshi,
//                                       3 ta ANONIM karta -> sinov / ovoz
//
// Bitta xabar o'zgarib boradi (editMessageText) — chat yangi xabar bilan
// to'lib ketmaydi, ilovaga o'xshaydi.
//
// Ovozli yo'l IKKALA tomonda ham shu yerda ko'rsatiladi: nomzodga "ovozda
// gapiring, AI anketani o'zi to'ldiradi" (services/voiceIntake), restoranga
// "ovozli xabar yuboring" (services/agent qidiruvi).

const Vacancy = require('../models/Vacancy');
const Client = require('../models/Client');
const Restaurant = require('../models/Restaurant');
const Survey = require('../models/Survey');
const SurveyResponse = require('../models/SurveyResponse');
const { v4: uuidv4 } = require('uuid');
const I18N = require('../../public/js/th-i18n');
const { ROLE_KEYS, isValidRole, roleLabel } = require('../data/roles');
const vac = require('./vacancy');
const market = require('./market');
const anonymize = require('./anonymize');
const reliability = require('./reliability');
const cs = require('./candidateSearch');
const tg = require('./telegram');

const T = (lang, k, v) => I18N.t(lang, k, v);
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const money = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Tugmalarda ko'rsatiladigan lavozimlar (data/roles tartibida, 'boshqa'siz)
const ROLES = ROLE_KEYS.filter(k => k !== 'boshqa');
const OTHER = 'boshqa';                     // ro'yxatdan tashqari ishlar guruhi (nomzod tugmasi ft:c:boshqa)
const EMOJI = { ofitsiant: '🍽', barmen: '🍸', xostess: '💁', oshpaz: '👨‍🍳', kassir: '🧾', menejer: '📋', operator: '📞' };

/**
 * Lavozim tugmalari — ikki ustun. prefix: 'ft:c:' nomzod, 'ft:e:' restoran.
 * counts berilsa (nomzod): ochiq ishi bor lavozim oldin va tugmada soni —
 * "🍽 Ofitsiant · 3". Ishi yo'q lavozim ham qoladi (anketa kelajak uchun).
 */
function roleRows(lang, prefix, counts) {
  const list = counts ? ROLES.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0)) : ROLES;
  const rows = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push(list.slice(i, i + 2).map(r => ({
      text: `${EMOJI[r] || ''} ${T(lang, 'role.' + r)}${counts && counts[r] ? ' · ' + counts[r] : ''}`.trim(),
      callback_data: prefix + r
    })));
  }
  return rows;
}

// ══ NOMZOD ═══════════════════════════════════════════════════

/** Shu lavozimdagi ochiq ishlar — nomzod kabinetidagi ro'yxat qoidasi bilan bir xil */
// 5 — eng uzun lavozim ekrani ~790 belgi < 1024 (izoh chegarasi). 2026-11-28: 3 bo'lganda Oshpaz bo'limida
// Salatchi va Shef-povar ko'rinmas va arizasiz qolardi (offerIds = ko'rsatilganlar)
async function openJobs(agencyId, role, limit = 5) {
  const fresh = new Date(Date.now() - vac.STALE_DAYS * 864e5);
  const q = { agencyId, status: 'open', listed: { $ne: false }, confirmedAt: { $gte: fresh }, isTest: { $ne: true } };
  // 'boshqa' — ro'yxatdan tashqari HAR QANDAY ish (Vacancy.role default 'boshqa', bo'sh yoki eski kalit ham)
  if (role === OTHER) q.role = { $nin: ROLE_KEYS };
  else if (role) q.role = role;
  const [n, rows] = await Promise.all([
    Vacancy.countDocuments(q),
    Vacancy.find(q).sort({ confirmedAt: -1 }).limit(limit).lean()
  ]);
  return { n, rows };
}

// "Buyurtma yig'uvchi (saboy, dostavka)" -> ["Buyurtma yig'uvchi", "saboy, dostavka"]
function splitTitle(t) {
  const m = /^(.*?)\s*\((.+)\)\s*$/.exec(String(t || ''));
  return m ? [m[1], m[2]] : [String(t || ''), ''];
}

/**
 * Botdagi ish ro'yxati — HAR ISH ALOHIDA BLOK (Anas, 2026-11-16: "nom, filiallar,
 * to'lov ketma-ket bir qatorda — tushunish juda qiyin"; "Ofitsiant" sarlavhasi
 * lavozimga teng bo'lgani uchun yashirilib, qator filiallardan boshlanardi):
 *   1. <b>Buyurtma yig'uvchi</b> · Tarnov
 *   <i>saboy, dostavka</i>
 *   💰 225 000 so'm / kun · Har 10 kunda to'lanadi
 * Filiallar hammasida bir xil bo'lsa — ro'yxat ostida BIR MARTA. Lavozimning
 * o'zi ("Ofitsiant") birinchi. emp — ko'rsatishga rozi restoran nomlari (showName).
 * @returns {{ text, rows, mixed }} rows — ko'rsatilgan tartibda (tugmalar uchun),
 *   mixed — lavozim nomi bilan boshlanmaydigan ish bor ("Ofitsiant va yaqin ishlar")
 */
function jobBlocks(rows, lang, { role = '', emp = {} } = {}) {
  const label = role ? T(lang, 'role.' + role).toLowerCase() : '';
  const own = v => !!label && splitTitle(vac.titleFor(v, lang))[0].toLowerCase().startsWith(label);
  const sorted = rows.slice().sort((a, b) => own(b) - own(a));
  const locs = [...new Set(sorted.map(v => I18N.place(String(v.location || '').trim(), lang)))];
  const oneLoc = locs.length === 1 ? locs[0] : '';
  const blocks = sorted.map((v, i) => {
    const [main, note] = splitTitle(vac.titleFor(v, lang));
    const money = [vac.salaryText(v, lang), vac.payoutText(v, lang)].filter(Boolean).join(' · ');
    return [
      `${i + 1}. <b>${esc(main)}</b>${emp[v.clientId] ? ' · ' + esc(emp[v.clientId]) : ''}`,
      note ? `<i>${esc(note)}</i>` : '',
      money ? '💰 ' + esc(money) : '',
      !oneLoc && v.location ? '📍 ' + esc(I18N.place(v.location, lang)) : ''
    ].filter(Boolean).join('\n');
  });
  if (oneLoc) blocks.push('📍 ' + esc(oneLoc));
  return { text: blocks.join('\n\n'), rows: sorted, mixed: !!label && sorted.some(v => !own(v)) };
}

/** Ko'rsatishga rozi restoranlar nomi: { clientId: 'Tarnov' } (Client.showName) */
async function employerNames(agencyId, rows) {
  const ids = [...new Set(rows.map(v => v.clientId))];
  if (!ids.length) return {};
  const cl = await Client.find({ agencyId, id: { $in: ids }, showName: true }, 'id name').lean();
  return Object.fromEntries(cl.map(c => [c.id, c.name]));
}

/**
 * Nomzod lavozimni tanladi: shu lavozimdagi ishlar + anketa/ovoz tugmasi.
 * Anketa shu lavozimniki bo'lsa (konstruktorda yaratilgan) — lavozim
 * savoli umuman so'ralmaydi, forma qisqaradi.
 */
async function candidateRole({ agencyId, role, lang, tgUserId, chatId, appBase, isTest, name, username, chosenLang = '' }) {
  const { n, rows } = await openJobs(agencyId, role);
  // Shu lavozim anketasi bo'lsa o'sha, bo'lmasa umumiy (surveyForVacancy qoidasi)
  const survey = await Survey.findOne({ agencyId, role, active: true, isDefault: false }).lean()
    || await require('./survey').ensureDefault(agencyId);

  // /start da ochilgan yozuvning o'zi (kanal — story, SMS... — va tavsiya saqlanadi).
  // Ilgari bu yerda yangi yozuv 'bot' kanali bilan ochilardi (survey.openResponse izohi)
  // Yozuvga faqat TANLANGAN til (chosenLang) tushadi: `lang` bu yerda Telegram interfeysidan
  // TAXMIN bo'lishi mumkin — yozuvga tushsa anketa til ekranini o'tkazib yuborardi va ruscha
  // telefonli o'zbek butun anketani ruscha to'ldirardi (2026-11-20 tekshiruvi).
  const r = await require('./survey').openResponse({ agencyId, tgUserId, chatId, surveyId: survey.id,
    isTest: !!isTest, lang: I18N.LANGS.includes(chosenLang) ? chosenLang : '' });
  // Lavozim anketaga o'tadi (qayta so'ralmaydi) va ko'rsatilgan ishlarga ariza anketa
  // tugagach o'zi ketadi (survey.finalize). Javobi bor anketada ham yangilanadi —
  // odam boshqa lavozimni tanlab qaytgan bo'lishi mumkin.
  r.role = role; r.offerIds = rows.map(v => v.id); r.updatedAt = new Date();
  await r.save();
  // Nomzod yo'li: qaysi lavozimni qidiryapti (services/track)
  require('./track').track('role', { agencyId, tgUserId, ref: role, rid: r.id, channel: r.channel, username,
    name, isTest: r.isTest || !!isTest });

  // Ro'yxatdan tashqari ishlar ('boshqa'): sarlavha — ishning o'z nomi yoki "Boshqa ishlar"
  const other = role === 'boshqa';
  const label = other
    ? (n === 1 && rows[0] ? splitTitle(vac.titleFor(rows[0], lang))[0] : T(lang, 'ft.cOtherJobs'))
    : T(lang, 'role.' + role);
  const head = `${EMOJI[role] || ''} <b>${esc(label)}</b>`.trim();
  const jb = jobBlocks(rows, lang, { role: other ? '' : role, emp: await employerNames(agencyId, rows) });
  const text = [
    n ? T(lang, jb.mixed ? 'ft.cJobsMix' : 'ft.cJobs', { head, n }) : T(lang, 'ft.cNoJobs', { head }),
    rows.length ? '' : null,
    rows.length ? jb.text : null,
    '',
    n > rows.length ? T(lang, 'ft.cMore', { n: n - rows.length }) : '',
    // Ochiq ish yo'q bo'lsa "ariza berish uchun" deyish noto'g'ri — ariza
    // beradigan vakansiya yo'q; anketa KELAJAKDAGI ish uchun qoldiriladi
    T(lang, n ? 'ft.cAsk' : 'ft.cAskNoJobs'),
    '',
    T(lang, 'ft.cVoiceHint')
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');

  const keyboard = [
    [{ text: T(lang, 'ft.cStart'), web_app: { url: `${appBase}/anketa.html?r=${r.id}` } }],
    [require('./voiceIntake').entryButton(r, lang)],
    [{ text: T(lang, 'ft.back'), callback_data: 'ft:cb' }]
  ];
  return { text, keyboard };
}

/** Lavozimlar bo'yicha ochiq ishlar: "ofitsiant 13 · oshpaz 12" (bazadan) */
async function openByRole(agencyId, lang) {
  const fresh = new Date(Date.now() - vac.STALE_DAYS * 864e5);
  const rows = await Vacancy.aggregate([
    { $match: { agencyId, status: 'open', listed: { $ne: false }, confirmedAt: { $gte: fresh }, isTest: { $ne: true } } },
    { $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { n: -1 } }
  ]);
  return {
    n: rows.reduce((s, x) => s + x.n, 0),
    // Ro'yxatda yo'q lavozim — 'boshqa' guruhiga (openJobs ham shunday qidiradi), son yo'qolmasin
    counts: rows.reduce((o, x) => {
      const k = isValidRole(x._id) ? x._id : OTHER;
      o[k] = (o[k] || 0) + x.n; return o;
    }, {})
  };
}

/**
 * Birinchi ekran tugmalari — FAQAT ochiq ishi bor lavozimlar, soni bilan
 * (Anas, 2026-11-27: "aji-buji lavozimlar chiqishi shartmi boshida?"). Ilgari
 * 7 ta lavozimning hammasi chiqardi: ishi yo'q Barmen/Kassir bosilsa — bo'sh
 * ekran, ro'yxatdan tashqari ish (role 'boshqa', masalan HR-rekruter) esa
 * umuman tugmasiz edi. Endi u ham tugma oladi: bitta bo'lsa o'z nomi bilan.
 * Uzun nom ("Call-markaz operatori · 1") alohida qatorda — telefonda kesilmasin.
 * Ish umuman yo'q bo'lsa — eski ro'yxat (anketa kelajakdagi ish uchun).
 */
const LONG = 15;
function pickRows(lang, counts, otherLabel) {
  const keys = ROLES.filter(r => counts[r]).sort((a, b) => counts[b] - counts[a]);
  if (counts.boshqa) keys.push('boshqa');
  const btns = keys.map(r => ({
    text: `${r === 'boshqa' ? otherLabel : T(lang, 'role.' + r)} · ${counts[r]}`,
    callback_data: 'ft:c:' + r
  }));
  const rows = [];
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i], nx = btns[i + 1];
    if (b.text.length > LONG || !nx || nx.text.length > LONG) rows.push([b]);
    else { rows.push([b, nx]); i++; }
  }
  return rows;
}

/** Ro'yxatdan tashqari ishlar nomi: bitta bo'lsa o'zi ("HR-rekruter"), ko'p bo'lsa "Boshqa ishlar" */
async function otherLabel(agencyId, lang, n) {
  if (n !== 1) return T(lang, 'ft.cOtherJobs');
  const { rows } = await openJobs(agencyId, 'boshqa', 1);
  return rows[0] ? splitTitle(vac.titleFor(rows[0], lang))[0] : T(lang, 'ft.cOtherJobs');
}

/**
 * Nomzodning birinchi ekrani — /start ham, "Orqaga" ham AYNAN shu.
 *
 * Matn nomzod uchun yozilgan (docs/auditoriya.md): u ish va maosh qidiryapti,
 * agentlik qanday ishlashi uni qiziqtirmaydi. Shuning uchun bu yerda
 * "xodim tanlash xizmati", "restoranlar bizga murojaat qiladi", "tavsiya
 * qilamiz" yo'q — faqat HOZIR nechta ish borligi va bitta savol.
 * Ish bo'lmasa raqam to'qilmaydi: o'rniga uchta foyda (bepul, rezyume
 * yozmaysiz, HR o'zi qo'ng'iroq qiladi).
 */
async function candidatePick({ agencyId, lang, name, rid, appBase, closed }) {
  const { n, counts } = await openByRole(agencyId, lang);
  // Lavozimlar taqsimoti matnda YO'Q — u tugmalarni takrorlardi ("oshpaz 5 · ofitsiant 3 ·
  // call-markaz operatori 1 · ..."); son endi tugmaning o'zida
  const text = [
    T(lang, 'ank.hookHi', { name: name ? ', ' + esc(name) : '' }),
    T(lang, 'ft.cIntro'), '',
    closed ? T(lang, 'ank.hookClosed') : '',
    closed ? '' : null,
    n ? T(lang, 'ft.cPick', { n }) : T(lang, 'ft.cPick0')
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');

  const keyboard = n
    ? pickRows(lang, counts, counts.boshqa ? await otherLabel(agencyId, lang, counts.boshqa) : '')
    : roleRows(lang, 'ft:c:', counts);
  // Chiqish yo'li: lavozimi ro'yxatda bo'lmagan odam ham o'tib keta olsin
  // g=1 — UMUMIY anketa: oldin lavozim tanlagan bo'lsa, javobsiz yozuv umumiyga qaytadi (routes/anketa)
  if (rid && appBase) keyboard.push([{ text: T(lang, 'ft.cOther'), web_app: { url: `${appBase}/anketa.html?r=${rid}&g=1` } }]);
  if (rid) keyboard.push([langSwitchBtn(lang, rid)]);
  // Brend rasmi ("Talab bormi? Talant bor!" + "O'zingizga mos ishni toping") — SMS ekrani bilan bitta
  // rasm (Anas, 2026-11-27: "birinchi start bosganda chiqsin"). Izoh — shu matn, tugmalar rasm ostida.
  return { text, keyboard, photo: welcomePhoto(lang) };
}
const welcomePhoto = lang => `img/bot-welcome-${lang === 'ru' ? 'ru' : 'uz'}.jpg`;

// Til tugmasi — BITTA, faqat ikkinchi til (o'z tilida yozilgan, tanimagan
// ham topadi). Telegram interfeysi tili yolg'on taxmin beradi: O'zbekistonda
// ko'p telefon ruscha sozlangan holda sotiladi, egasi esa o'zbekcha gapiradi.
const langSwitchBtn = (lang, rid) => lang === 'ru'
  ? { text: '\ud83c\uddfa\ud83c\uddff O\'zbekcha', callback_data: 'ft:lang:uz:' + rid }
  : { text: '\ud83c\uddf7\ud83c\uddfa \u0420\u0443\u0441\u0441\u043a\u0438\u0439', callback_data: 'ft:lang:ru:' + rid };

// ══ hh NOMZODI: SHAXSIY HAVOLA (SMS) ═══════════════════════════
// hh.uz rezyumesi bizda bor — uni anketaga yuborish noto'g'ri (o'zi bilgan
// narsani qayta yozadi va yarmida tashlab ketadi). Shaxsiy havola bosilganda
// bot odamni taniydi va LAVOZIMIDAGI ishlarni bitta tugma bilan beradi:
// tugma = ariza (kabinet bilan bir xil tekshiruv, keyin prescreen o'zi).
const Application = require('../models/Application');

// Maosh oralig'i OYLIK — BAZADAN: "oyiga 6–13 mln so'm" (Anas qarori, 2026-11-16:
// "6 mln deb yoz, 215 ming kerak emas"). Kunlik stavka oyga 26 ish kuni, smena 15 smena
// deb aylantiriladi; pastki chegara butun millionga yaxlitlanadi, yuqorisi — aniq.
const MONTH_K = { day: 26, shift: 15 };
function payRange(rows, lang) {
  const mln = x => String(Math.round(x / 1e5) / 10).replace('.', ',');
  const lo = [], hi = [];
  rows.forEach(v => {
    if (v.salaryCurrency === 'usd') return;            // dollardagi maosh so'mli oraliqqa kirmaydi
    const k = MONTH_K[v.salaryPeriod] || 1;
    const a = v.salaryFrom || v.salaryTo, b = v.salaryTo || v.salaryFrom;
    if (a) lo.push(a * k);
    if (b) hi.push(b * k);
  });
  if (!lo.length) return '';
  const min = Math.max(1, Math.round(Math.min(...lo) / 1e6)), max = Math.max(...hi);
  return max / 1e6 > min ? T(lang, 'ft.payMM', { a: min, b: mln(max) }) : T(lang, 'ft.payM', { m: mln(max) });
}

async function candidateInvite({ cand, lang, appBase }) {
  // Anas, 2026-11-16: "lavozimlar kerak emas bu joyda, oylik oralig'ini yozish kerak, kreativroq;
  // xabar bachkana" — ro'yxat, raqamlangan bloklar va har qatorda 💰 olib tashlandi. Bitta asosiy
  // harakat: ishlarni kabinetda ko'rish (u yerda ariza tugmasi bor). "Rezyumengiz tayyor" — yo'q.
  let { n, rows } = await openJobs(cand.restaurantId, '', 50);
  if (!cand.isTest) rows = rows.filter(v => !v.isTest);
  const name = require('./outreach').nameWord(cand.fullName);
  const pay = payRange(rows, lang);
  // 2026-11-17 (Anas: "g'alati, jalb qilmaydi, eng ko'p yo'qotish shu yerda — professional
  // agentlik sifatida ko'rinishimiz kerak"): xabar BREND RASMI bilan (shior "Talab bormi? Talant
  // bor!", kimligimiz va va'dalar rasmda), matn esa 3 qator: salom, kimdan, raqam — va bitta harakat.
  const text = [
    T(lang, 'ft.iHi', { name: esc(name) }).replace(/,\s*!/, '!'), '',
    T(lang, 'ft.iIntro'), '',
    n ? T(lang, 'ft.iLead2', { n, pay: pay ? ' · ' + pay : '' }) : T(lang, 'ft.iNoJobs'),
    n ? '' : null,
    n ? T(lang, 'ft.iPick') : null
  ].filter(x => x !== null).join('\n');

  const keyboard = [];
  if (appBase && n) keyboard.push([{ text: T(lang, 'ft.iSee'), web_app: { url: `${appBase}/profil.html#jobs` } }]);
  else if (appBase) keyboard.push([{ text: T(lang, 'ft.iProfile'), web_app: { url: `${appBase}/profil.html` } }]);
  keyboard.push([lang === 'ru'
    ? { text: '🇺🇿 O\'zbekcha', callback_data: 'ft:il:uz' }
    : { text: '🇷🇺 Русский', callback_data: 'ft:il:ru' }]);
  keyboard.push([{ text: T(lang, 'ft.iNo'), callback_data: 'ft:no' }]);
  // Rasm — public/ ichidagi yo'l: bot faylni Telegram'ga o'zi yuklaydi (URL bersak, Telegram
  // bepul Render'dan yuklay olmay qolardi — 2026-11-17 jonli), keyin file_id ishlatiladi
  return { text, keyboard, photo: welcomePhoto(lang) };
}

/** Botdagi bir tugmali ariza — kabinet (routes/candidate apply) bilan bir xil shartlar */
async function inviteApply({ cand, vacancyId, lang, appBase }) {
  const v = await Vacancy.findOne({ agencyId: cand.restaurantId, id: vacancyId, status: 'open', listed: { $ne: false },
    ...(cand.isTest ? {} : { isTest: { $ne: true } }) }).lean();
  if (!v) return { alert: T(lang, 'ft.iClosed') };
  const validPhone = require('./applyReveal').validPhone;
  if (!String(cand.fullName || '').trim() || !cand.phone || !validPhone(cand.phone)) return { alert: T(lang, 'ft.iNoPhone') };
  try {
    await require('./applications').submit({ cand, vacancy: v, appBase, via: 'bot' });
  } catch (e) {
    if (e.code === 11000) return { alert: T(lang, 'ft.iAlready') };
    throw e;
  }
  const cl = await Client.findOne({ agencyId: cand.restaurantId, id: v.clientId }, 'name showName').lean();
  const title = [vac.titleFor(v, lang), cl && cl.showName ? cl.name : ''].filter(Boolean).join(' · ');
  return { ok: true, edit: T(lang, 'ft.iSent', { v: esc(title) }) };
}

// ══ ISH BERUVCHI ═════════════════════════════════════════════

/** Bazadagi nomzodlar — lavozim bo'yicha (sinov yozuvlari hisoblanmaydi) */
async function baseCounts(agencyId) {
  const Candidate = require('../models/Candidate');
  const rows = await Candidate.aggregate([
    { $match: { restaurantId: agencyId, isTest: { $ne: true }, jobStatus: { $ne: 'not_looking' } } },
    { $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { n: -1 } }
  ]);
  return { total: rows.reduce((s, x) => s + x.n, 0), rows: rows.filter(x => isValidRole(x._id)) };
}

/** Restoranning birinchi ekrani: va'dalar + JONLI baza raqamlari + "Kim kerak?" */
async function employerIntro({ agencyId, lang }) {
  const { total, rows } = await baseCounts(agencyId);
  const top = rows.slice(0, 3).map(x => `${T(lang, 'role.' + x._id).toLowerCase()} ${x.n}`).join(' · ');
  const text = [
    T(lang, 'ft.eHi'), '',
    T(lang, 'ft.ePoints'), '',
    total ? T(lang, 'ft.eBase', { n: total, top: esc(top) }) : '',
    '',
    T(lang, 'ft.eAsk'), '',
    T(lang, 'ft.eVoiceHint')
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');
  return { text, keyboard: roleRows(lang, 'ft:e:') };
}

/** Bitta anonim karta: kod · tajriba · hudud · maosh · ishonch belgilari */
// Kod hali berilmagan bo'lsa (mijozga birinchi marta ko'rinyapti) lavozim
// yoziladi — birinchi tanishuvda kodning o'zi hech narsa bermaydi.
function cardLine(c, rel, lang) {
  const bits = [`<b>${esc(c.publicCode && c.publicCode !== '—' ? c.publicCode : T(lang, 'role.' + c.role))}</b>`];
  if (c.experienceYears) bits.push(T(lang, 'cb.yrs', { n: c.experienceYears }));
  else if (c.experienceMonths) bits.push(T(lang, 'cb.lt1y'));
  if (c.location) bits.push(esc(String(c.location).split(',').pop().trim()));
  if (c.salaryExpectation) bits.push(esc(c.salaryExpectation));
  // Ishonch belgilari — services/reliability: {came, total, stayed}
  const marks = [];
  if (c.phoneVerified) marks.push(T(lang, 'ft.mVerified'));
  if (rel && rel.total) marks.push(T(lang, 'ft.mCame', { a: rel.came, b: rel.total }));
  if (rel && rel.stayed) marks.push(T(lang, 'ft.mStayed'));
  return '• ' + bits.join(' · ') + (marks.length ? '\n  ' + marks.join(' · ') : '');
}

/**
 * Restoran lavozimni tanladi: nechta nomzod bor, bozor maoshi va 3 ta
 * ANONIM karta. Ism/telefon yo'q — ular faqat kontakt ochilganda.
 */
async function employerRole({ agencyId, role, lang }) {
  const criteria = Object.assign({}, cs.EMPTY, { role });
  const [count, st, found] = await Promise.all([
    cs.countFor(criteria, agencyId),
    market.stats(agencyId, { role }).catch(() => null),
    cs.search(criteria, agencyId, { limit: 3 })
  ]);
  // candidateSearch yengil ro'yxat uchun cheklangan maydon qaytaradi
  // (publicCode, phoneVerifiedAt yo'q) — kartaga keraklisini o'zimiz olamiz
  const ids = (found.rows || []).map(c => c.id);
  const rows = ids.length ? await require('../models/Candidate').find(
    { restaurantId: agencyId, id: { $in: ids } },
    'id publicCode role experienceYears experienceMonths location salaryExpectation phoneVerifiedAt source jobStatus'
  ).lean() : [];
  const rel = ids.length ? await reliability.forCandidates(agencyId, ids).catch(() => ({})) : {};
  const cards = rows.map(c => cardLine(anonymize.forClient(c), rel[c.id], lang));

  const head = `${EMOJI[role] || ''} <b>${esc(T(lang, 'role.' + role))}</b>`.trim();
  const text = [
    T(lang, 'ft.eCount', { head, n: count }),
    st && st.median ? T(lang, 'ft.eMarket', { m: money(st.median), a: money(st.p25), b: money(st.p75) }) : '',
    '',
    cards.length ? T(lang, 'ft.eCards') : T(lang, 'ft.eEmpty'),
    ...cards,
    '',
    cards.length ? T(lang, 'ft.eHidden') : ''
  ].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n');

  const keyboard = [
    [{ text: T(lang, 'ft.eTrial'), callback_data: 'ft:t:' + role }],
    [{ text: T(lang, 'ft.eVoice'), callback_data: 'ft:v' }],
    [{ text: T(lang, 'ft.back'), callback_data: 'ft:eb' }]
  ];
  return { text, keyboard };
}

// ══ NAMOYISH QIDIRUVI (tasdiqlanmagan restoran) ══════════════
// Tasdiqlanmagan ("kutilmoqda") restoran yozsa yoki ovoz yuborsa — avval
// jim qolardi. Endi AI qidiruvi ishlaydi, lekin FAQAT anonim natija va
// cheklangan sonda: kontakt ochish baribir faol hisob va kredit talab
// qiladi (tugmalar `status: 'active'` bilan himoyalangan).
const DEMO_LIMIT = 3;
const demoLeft = client => Math.max(0, DEMO_LIMIT - (client.demoSearches || 0));

async function noteDemo(client) {
  await Client.updateOne({ agencyId: client.agencyId, id: client.id },
    { $inc: { demoSearches: 1 }, $set: { lastSeenAt: new Date() } });
}

/** Namoyish natijasi ostidagi tugmalar */
function demoKeyboard(lang) {
  return { reply_markup: { inline_keyboard: [
    [{ text: T(lang, 'ft.eTrial'), callback_data: 'ft:t:' }],
    [{ text: T(lang, 'ft.back'), callback_data: 'ft:eb' }]
  ] } };
}

// ══ TUGMALAR ═════════════════════════════════════════════════
// Boshqa servislar bilan bir xil shakl: {text, alert, edit, keyboard}

async function handleCallback({ data, chatId, appBase, from }) {
  const parts = data.split(':');          // ft:<amal>[:<arg>]
  const act = parts[1] || '';
  const arg = parts.slice(2).join(':');
  const tgUserId = String((from && from.id) || chatId);

  // ── Nomzod tomoni ──
  if (act === 'c' || act === 'cb') {
    const survey = await Survey.findOne({ isDefault: true, active: true }, 'agencyId').lean();
    if (!survey) return { text: '' };
    const cand = await require('../models/Candidate').findOne({ tgChatId: chatId }, 'lang tgLang').lean();
    // Til ustunligi: botda TANLANGAN (anketa yozuvida) > nomzod profili >
    // Telegram interfeysi. Aks holda til tugmasi bosilgani keyingi ekranda
    // yo'qolib ketardi (2026-11-15).
    const open = await SurveyResponse.findOne({ tgUserId, status: 'started' }, 'id lang')
      .sort({ updatedAt: -1 }).lean();
    const lang = I18N.resolve((open && open.lang) || (cand && cand.lang),
      (cand && cand.tgLang) || (from && from.language_code));
    if (act === 'cb') {
      // Orqaga qaytgan ekran /start dagi bilan AYNAN bir xil bo'lishi kerak —
      // til tugmasi va zaxira yo'l ham qoladi (ilgari ular yo'qolardi)
      const r = await candidatePick({ agencyId: survey.agencyId, lang,
        name: String((from && from.first_name) || '').trim().slice(0, 30),
        rid: open && open.id, appBase });
      return { edit: r.text, keyboard: r.keyboard, html: true, photo: r.photo };
    }
    if (!isValidRole(arg) && arg !== OTHER) return { text: '' };
    const isTest =(await require('./testMode').modeOf(tgUserId)) === 'candidate';
    // chosenLang — faqat odam O'ZI tanlagan til (bot tugmasi yoki profil); Telegram taxmini emas
    const r = await candidateRole({ agencyId: survey.agencyId, role: arg, lang, tgUserId, chatId, appBase, isTest,
      name: from && from.first_name, username: from && from.username, chosenLang: (open && open.lang) || (cand && cand.lang) || '' });
    return { edit: r.text, keyboard: r.keyboard, html: true };
  }

  // ── hh nomzodi: shaxsiy havoladan keyingi ekran (candidateInvite) ──
  if (act === 'ap' || act === 'il' || act === 'no') {
    const Candidate = require('../models/Candidate');
    const cand = await Candidate.findOne({ tgChatId: chatId });
    if (!cand) return { text: '' };
    let lang = I18N.resolve(cand.lang, cand.tgLang || (from && from.language_code));
    if (act === 'il' && I18N.LANGS.includes(arg)) {
      lang = arg;
      await Candidate.updateOne({ _id: cand._id }, { $set: { lang } });
      const r = await candidateInvite({ cand, lang, appBase });
      // photo — rasmli xabarda rasm ham shu tilga almashadi (telegram.js dispatcher)
      return { text: T(lang, 'bot.langToast'), edit: r.text, keyboard: r.keyboard, html: true, photo: r.photo };
    }
    if (act === 'no') {
      await Candidate.updateOne({ _id: cand._id }, { $set: { jobStatus: 'not_looking', jobStatusAt: new Date() } });
      const ag = await Restaurant.findOne({ id: cand.restaurantId }, 'telegram').lean();
      const adm = ag && ag.telegram && ag.telegram.adminChatId;
      if (adm) tg.sendMessage(tg.platformToken(), adm, `${cand.fullName || 'Nomzod'} — SMS havolasidan: hozir ish qidirmayapti`).catch(() => {});
      return { text: '✓', edit: T(lang, 'ft.iNoDone'), html: true };
    }
    const r = await inviteApply({ cand, vacancyId: arg, lang, appBase });
    if (r.alert) return { text: r.alert, alert: true };
    return { text: '✓', edit: r.edit, html: true };
  }

  // ── Restoran tomoni ──
  const client = await Client.findOne({ tgChatId: chatId });
  if (!client) return { text: '' };
  const lang = I18N.resolve(client.lang, client.tgLang || (from && from.language_code));

  if (act === 'eb') {
    const r = await employerIntro({ agencyId: client.agencyId, lang });
    return { edit: r.text, keyboard: r.keyboard, html: true };
  }
  if (act === 'e') {
    if (!isValidRole(arg)) return { text: '' };
    const r = await employerRole({ agencyId: client.agencyId, role: arg, lang });
    return { edit: r.text, keyboard: r.keyboard, html: true };
  }
  if (act === 'v') return { text: T(lang, 'ft.eVoiceTip'), alert: true };

  // Bepul sinov so'rovi — kreditni AGENTLIK beradi (panel yoki bot).
  // Avtomatik bermaymiz: raqobatchi restoran niqobida kirib bazani
  // ko'rmasin (Anas qarori bilan avtomatga o'tkazish mumkin).
  if (act === 't') {
    if (client.status === 'active') return { text: T(lang, 'ft.eAlready'), alert: true };
    const already = !!client.trialAskedAt;
    if (!already) {
      await Client.updateOne({ agencyId: client.agencyId, id: client.id },
        { $set: { trialAskedAt: new Date(), trialAskedRole: isValidRole(arg) ? arg : '' } });
      const ag = await Restaurant.findOne({ id: client.agencyId }, 'telegram').lean();
      const adm = ag && ag.telegram && ag.telegram.adminChatId;
      if (adm) {
        await tg.sendMessage(tg.platformToken(), adm,
          `🎁 Bepul sinov so'raldi: «${client.name}»${client.tgUsername ? ' @' + client.tgUsername : ''}` +
          (isValidRole(arg) ? `\nLavozim: ${roleLabel(arg)}` : '') +
          `\n\nPanel → Mijozlar: ma'lumotini to'ldirib faollashtiring va 3 kredit bering.`).catch(() => {});
      }
    }
    return { text: T(lang, already ? 'ft.eTrialWait' : 'ft.eTrialOk'), alert: true };
  }
  return { text: '' };
}

module.exports = {
  ROLES, roleRows, openJobs,
  candidatePick, candidateRole, openByRole, langSwitchBtn, candidateInvite, inviteApply,
  employerIntro, employerRole, baseCounts,
  DEMO_LIMIT, demoLeft, noteDemo, demoKeyboard,
  handleCallback
};
