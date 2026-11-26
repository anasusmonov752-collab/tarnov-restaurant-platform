// ── ARIZA BERISH — YAGONA YO'L ───────────────────────────────
// Ikki kirish bor: nomzod kabinetidagi "Ariza berish" (routes/candidate)
// va anketa vakansiya havolasidan to'ldirilganda (services/survey).
// Ikkalasi SHU yerdan o'tadi: ariza, nomzod holati, agentlik va mijozga
// xabar bir xil bo'lsin — biri xabar yuborib, ikkinchisi unutib qo'ymasin.

const { v4: uuidv4 } = require('uuid');
const Application = require('../models/Application');
const Client = require('../models/Client');
const Restaurant = require('../models/Restaurant');
const tg = require('./telegram');
const vac = require('./vacancy');
const { isValidRole } = require('../data/roles');
const { placeLabel } = require('../utils/labels');
const I18N = require('../../public/js/th-i18n');

/**
 * @param {object} cand     Candidate (mongoose hujjati — jobStatus saqlanadi)
 * @param {object} v        Vacancy (lean)
 * @param {string} message  nomzodning qisqa xati
 * @param {string} appBase  Mini App manzili (mijozdagi "Ko'rish" tugmasi)
 * @param {string} via      agentlik xabarida ko'rinadi: 'kabinet' | 'anketa'
 * @throws code 11000 — takroriy ariza (unique indeks)
 */
async function submit({ cand: c, vacancy: v, message = '', appBase, via = 'kabinet', prescreen = true }) {
  // Nomzod o'zi qaytarib olgan arizasi bo'lsa — o'sha yozuv QAYTA ochiladi (noyob indeks
  // {vacancyId, candidateId} ikkinchisini yaratishga yo'l qo'ymaydi; qaytarib olish abadiy emas)
  const now = new Date();
  const a = await Application.findOneAndUpdate(
    { vacancyId: v.id, candidateId: c.id, state: 'rejected', reason: 'withdrawn' },
    { $set: { state: 'new', reason: '', decidedAt: null, contactedAt: null, agencySeenAt: null, seenAt: null,
              slaWarnAt: null, slaLateAt: null, createdAt: now,
              message: String(message || '').trim().slice(0, 500) } },
    { new: true }
  ) || await Application.create({
    id: uuidv4(),
    agencyId: c.restaurantId,
    vacancyId: v.id,
    candidateId: c.id,
    clientId: v.clientId,
    isTest: !!c.isTest,                       // sinov nomzodining arizasi
    message: String(message || '').trim().slice(0, 500)
  });
  // Nomzod yo'li: ariza berdi. Telegramsiz (panel) nomzod ham vakansiya
  // sanog'iga kirsin — kalit nomzod id'si bo'yicha
  require('./track').track('apply', { agencyId: c.restaurantId, tgUserId: c.tgChatId || ('cand:' + c.id),
    ref: v.id, candidateId: c.id, name: c.fullName, channel: c.channel, isTest: !!c.isTest });

  // Ariza bergan odam ish qidiryapti — holatini shunga keltiramiz
  if (c.jobStatus !== 'active') {
    c.jobStatus = 'active';
    c.jobStatusAt = new Date();
    await c.save();
  }

  // Agentlikka
  try {
    const agency = await Restaurant.findOne({ id: c.restaurantId });
    const chat = agency && agency.telegram && agency.telegram.adminChatId;
    if (chat) {
      await tg.sendMessage(tg.platformToken(), chat,
        // Profil lavozimi faqat ariza ishidan FARQ qilsa ("Xostess" arizasi — profili "Ofitsiant");
        // ilgari "Ofitsiant — Ofitsiant / Ofitsiant" kabi takror chiqardi (2026-11-23 oqim auditi)
        [`${c.isTest ? '🧪 SINOV · ' : ''}📨 Yangi ariza${via === 'anketa' ? ' (anketa)' : ''}`, '',
         `${c.fullName || 'Nomsiz'} — ${v.title}`,
         [c.desiredPosition && c.desiredPosition.toLowerCase() !== String(v.title || '').toLowerCase() ? 'Profili: ' + c.desiredPosition : '',
          c.experienceYears ? c.experienceYears + ' yil tajriba' : ''].filter(Boolean).join(' · '),
         c.phone || ''].filter((x, i) => i < 2 || x).join('\n'));
    }
  } catch (e) { console.error('[APP] ariza xabari ketmadi:', e.message); }

  // Mijozga — ilgari umuman xabar bormasdi: vakansiya ichiga kirmaguncha
  // ariza kelganini bilmasdi. Matn ANONIM (ism, telefon yo'q) — kontakt
  // faqat ochilganda. "Ko'rish" to'g'ridan-to'g'ri shu vakansiya arizalarini
  // ochadi (?apps= — hash emas: Telegram launch parametrlarini hash'ga qo'yadi).
  try {
    const cl = await Client.findOne({ agencyId: c.restaurantId, id: v.clientId }, 'tgChatId status lang tgLang isTest').lean();
    // Sinov nomzodining arizasi haqiqiy mijozga bormaydi (test rejimi, hh nomzod)
    if (cl && cl.tgChatId && cl.status === 'active' && appBase && (!c.isTest || cl.isTest)) {
      // Mijoz tilida (Mini App bilan bir xil yozuv)
      const lang = I18N.resolve(cl.lang, cl.tgLang);
      const T = (k, x) => I18N.t(lang, k, x);
      const who = [isValidRole(c.role) ? T('role.' + c.role) : (c.desiredPosition || T('role.candidate')),
                   c.experienceYears ? T('fact.exp', { n: c.experienceYears }) : T('fact.noExp'),
                   placeLabel(c.location, lang)].filter(Boolean).join(' · ');
      await tg.sendMessage(tg.platformToken(), cl.tgChatId,
        `${T('na.title', { v: vac.titleFor(v, lang) })}\n\n${who}`,
        { reply_markup: { inline_keyboard: [[
          { text: T('bot.view'), web_app: { url: `${appBase}/miniapp.html?apps=${encodeURIComponent(v.id)}` } }
        ]] } });
    }
  } catch (e) { console.error('[APP] mijozga ariza xabari ketmadi:', e.message); }

  // Nomzodga botda 3 ta qisqa savol (HR qo'ng'irog'i o'rniga) — services/prescreen.
  // Yiqilsa jim: ariza allaqachon tushgan.
  if (prescreen) await require('./prescreen').start({ app: a, cand: c, vacancy: v });

  return a;
}

/**
 * Agentlik arizani rad etadi — panel "Arizalar" va "Qo'ng'iroqlar" ("Mos emas") shu yerdan.
 * Atomik: qaror qilingan arizaga tegilmaydi (ikki bosish ikki xabar yubormaydi).
 * Nomzodga yumshoq xabar (appLife.notify 'rejected').
 * @returns {object|null} yangilangan ariza yoki null (allaqachon qaror qilingan / topilmadi)
 */
async function agencyReject({ agencyId, appId, appBase }) {
  const now = new Date();
  const a = await Application.findOneAndUpdate(
    { agencyId, id: appId, state: { $nin: ['shortlisted', 'rejected'] } },
    { $set: { state: 'rejected', reason: 'agency', decidedAt: now } }, { returnDocument: 'after' });
  if (!a) return null;
  if (!a.agencySeenAt) await Application.updateOne({ _id: a._id, agencySeenAt: null }, { $set: { agencySeenAt: now } });
  const Vacancy = require('../models/Vacancy');
  const Candidate = require('../models/Candidate');
  const [v0, cand] = await Promise.all([
    Vacancy.findOne({ agencyId, id: a.vacancyId }, 'title role shift').lean(),
    Candidate.findOne({ restaurantId: agencyId, id: a.candidateId }, 'id tgChatId tgState lang tgLang').lean()
  ]);
  await require('./appLife').notify(cand, 'rejected', { vacancy: v0, vacTitle: v0 && v0.title, appBase });
  return a;
}

module.exports = { submit, agencyReject };
