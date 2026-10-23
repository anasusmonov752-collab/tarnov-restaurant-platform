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
async function submit({ cand: c, vacancy: v, message = '', appBase, via = 'kabinet' }) {
  const a = await Application.create({
    id: uuidv4(),
    agencyId: c.restaurantId,
    vacancyId: v.id,
    candidateId: c.id,
    clientId: v.clientId,
    isTest: !!c.isTest,                       // sinov nomzodining arizasi
    message: String(message || '').trim().slice(0, 500)
  });

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
        `📨 Yangi ariza${via === 'anketa' ? ' (anketa)' : ''}\n\n${c.fullName || 'Nomsiz'} — ${v.title}\n` +
        `${c.desiredPosition || ''}${c.experienceYears ? ' · ' + c.experienceYears + ' yil' : ''}\n` +
        `${c.phone || ''}`);
    }
  } catch (e) { console.error('[APP] ariza xabari ketmadi:', e.message); }

  // Mijozga — ilgari umuman xabar bormasdi: vakansiya ichiga kirmaguncha
  // ariza kelganini bilmasdi. Matn ANONIM (ism, telefon yo'q) — kontakt
  // faqat ochilganda. "Ko'rish" to'g'ridan-to'g'ri shu vakansiya arizalarini
  // ochadi (?apps= — hash emas: Telegram launch parametrlarini hash'ga qo'yadi).
  try {
    const cl = await Client.findOne({ agencyId: c.restaurantId, id: v.clientId }, 'tgChatId status lang tgLang').lean();
    if (cl && cl.tgChatId && cl.status === 'active' && appBase) {
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

  return a;
}

module.exports = { submit };
