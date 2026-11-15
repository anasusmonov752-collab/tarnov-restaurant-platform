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
const EMOJI = { ofitsiant: '🍽', barmen: '🍸', xostess: '💁', oshpaz: '👨‍🍳', kassir: '🧾', menejer: '📋', operator: '📞' };

/** Lavozim tugmalari — ikki ustun. prefix: 'ft:c:' nomzod, 'ft:e:' restoran */
function roleRows(lang, prefix) {
  const rows = [];
  for (let i = 0; i < ROLES.length; i += 2) {
    rows.push(ROLES.slice(i, i + 2).map(r => ({
      text: `${EMOJI[r] || ''} ${T(lang, 'role.' + r)}`.trim(),
      callback_data: prefix + r
    })));
  }
  return rows;
}

// ══ NOMZOD ═══════════════════════════════════════════════════

/** Shu lavozimdagi ochiq ishlar — nomzod kabinetidagi ro'yxat qoidasi bilan bir xil */
async function openJobs(agencyId, role, limit = 3) {
  const fresh = new Date(Date.now() - vac.STALE_DAYS * 864e5);
  const q = { agencyId, status: 'open', listed: { $ne: false }, confirmedAt: { $gte: fresh }, isTest: { $ne: true } };
  if (role) q.role = role;
  const [n, rows] = await Promise.all([
    Vacancy.countDocuments(q),
    Vacancy.find(q).sort({ confirmedAt: -1 }).limit(limit).lean()
  ]);
  return { n, rows };
}

/** "Chilonzor · 4–5 mln" — restoran NOMISIZ (kontaktgacha ko'rinmaydi) */
// Sarlavha lavozimning o'zi bo'lsa takrorlanmaydi: ro'yxat allaqachon
// tanlangan lavozim ostida turibdi
function jobLine(v, lang, role) {
  const title = vac.titleFor(v, lang);
  const same = role && title && title.toLowerCase() === T(lang, 'role.' + role).toLowerCase();
  const parts = [same ? '' : title, v.location || T(lang, 'cb.tashkent'), vac.salaryText(v, lang)];
  return '• ' + parts.filter(Boolean).map(esc).join(' · ');
}

/**
 * Nomzod lavozimni tanladi: shu lavozimdagi ishlar + anketa/ovoz tugmasi.
 * Anketa shu lavozimniki bo'lsa (konstruktorda yaratilgan) — lavozim
 * savoli umuman so'ralmaydi, forma qisqaradi.
 */
async function candidateRole({ agencyId, role, lang, tgUserId, chatId, appBase, isTest, name }) {
  const { n, rows } = await openJobs(agencyId, role);
  // Shu lavozim anketasi bo'lsa o'sha, bo'lmasa umumiy (surveyForVacancy qoidasi)
  const survey = await Survey.findOne({ agencyId, role, active: true, isDefault: false }).lean()
    || await require('./survey').ensureDefault(agencyId);

  let r = await SurveyResponse.findOne({ agencyId, tgUserId, surveyId: survey.id, vacancyId: '', status: 'started' })
    .sort({ updatedAt: -1 });
  if (!r) {
    r = await SurveyResponse.create({ id: uuidv4(), agencyId, surveyId: survey.id, vacancyId: '',
      channel: 'bot', tgUserId, chatId, status: 'started', isTest: !!isTest, lang });
  }
  // Nomzod yo'li: qaysi lavozimni qidiryapti (services/track)
  require('./track').track('role', { agencyId, tgUserId, ref: role, rid: r.id, channel: r.channel,
    name, isTest: r.isTest || !!isTest });

  const head = `${EMOJI[role] || ''} <b>${esc(T(lang, 'role.' + role))}</b>`.trim();
  const text = [
    n ? T(lang, 'ft.cJobs', { head, n }) : T(lang, 'ft.cNoJobs', { head }),
    rows.length ? '' : null,
    ...rows.map(v => jobLine(v, lang, role)),
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
    top: rows.filter(x => isValidRole(x._id) && x._id !== 'boshqa').slice(0, 5)
      .map(x => `${T(lang, 'role.' + x._id).toLowerCase()} ${x.n}`).join(' \u00b7 ')
  };
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
  const { n, top } = await openByRole(agencyId, lang);
  const text = [
    T(lang, 'ank.hookHi', { name: name ? ', ' + esc(name) : '' }), '',
    closed ? T(lang, 'ank.hookClosed') : '',
    closed ? '' : null,
    n ? T(lang, 'ft.cPick', { n, top: esc(top) }) : T(lang, 'ft.cPick0')
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');

  const keyboard = roleRows(lang, 'ft:c:');
  // Chiqish yo'li: lavozimi ro'yxatda bo'lmagan odam ham o'tib keta olsin
  if (rid && appBase) keyboard.push([{ text: T(lang, 'ft.cOther'), web_app: { url: `${appBase}/anketa.html?r=${rid}` } }]);
  if (rid) keyboard.push([langSwitchBtn(lang, rid)]);
  return { text, keyboard };
}

// Til tugmasi — BITTA, faqat ikkinchi til (o'z tilida yozilgan, tanimagan
// ham topadi). Telegram interfeysi tili yolg'on taxmin beradi: O'zbekistonda
// ko'p telefon ruscha sozlangan holda sotiladi, egasi esa o'zbekcha gapiradi.
const langSwitchBtn = (lang, rid) => lang === 'ru'
  ? { text: '\ud83c\uddfa\ud83c\uddff O\'zbekcha', callback_data: 'ft:lang:uz:' + rid }
  : { text: '\ud83c\uddf7\ud83c\uddfa \u0420\u0443\u0441\u0441\u043a\u0438\u0439', callback_data: 'ft:lang:ru:' + rid };

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
      return { edit: r.text, keyboard: r.keyboard, html: true };
    }
    if (!isValidRole(arg)) return { text: '' };
    const isTest = (await require('./testMode').modeOf(tgUserId)) === 'candidate';
    const r = await candidateRole({ agencyId: survey.agencyId, role: arg, lang, tgUserId, chatId, appBase, isTest,
      name: from && from.first_name });
    return { edit: r.text, keyboard: r.keyboard, html: true };
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
  candidatePick, candidateRole, openByRole, langSwitchBtn,
  employerIntro, employerRole, baseCounts,
  DEMO_LIMIT, demoLeft, noteDemo, demoKeyboard,
  handleCallback
};
