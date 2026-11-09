// ── ANKETA TUGADI: NOMZODGA RAHMAT VA AGENTLIKKA XABAR ───────
// Ikki yo'l bitta joydan: anketa.html (routes/anketa /submit) va ovozli
// anketa (services/voiceIntake). Biri xabar yuborib, ikkinchisi unutmasin.

const Vacancy = require('../models/Vacancy');
const Restaurant = require('../models/Restaurant');
const tg = require('./telegram');
const vac = require('./vacancy');
const I18N = require('../../public/js/th-i18n');

/**
 * @param r    SurveyResponse
 * @param out  survey.finalize natijasi { candidate, created, applied, vacancy }
 * @returns {Promise<{jobs:number, matches:number, next:string}>}
 */
async function afterFinalize(r, out, { appBase, lang, via = 'anketa' }) {
  const c = out.candidate;
  // Ochiq ishlar soni — nomzod kabineti ro'yxati qoidasi bilan bir xil (routes/candidate /vacancies)
  const fresh = new Date(Date.now() - vac.STALE_DAYS * 864e5);
  const vq = { agencyId: r.agencyId, status: 'open', listed: { $ne: false }, confirmedAt: { $gte: fresh } };
  if (!r.isTest) vq.isTest = { $ne: true };               // sinov vakansiyasi — faqat sinov nomzodiga
  const [jobs, matches] = await Promise.all([
    Vacancy.countDocuments(vq),
    c.role && c.role !== 'boshqa' ? Vacancy.countDocuments(Object.assign({ role: c.role }, vq)) : 0
  ]);
  const next = out.applied ? 'apps' : 'jobs';

  // Nomzodga — rahmat va TUGMA bilan
  try {
    const token = tg.platformToken();
    const chat = r.chatId || r.tgUserId;
    await tg.setChatMenuButton(token, chat, I18N.t(lang, 'ank.menu'), `${appBase}/profil.html`)
      .catch(e => console.error('[ANKETA] menyu tugmasi:', e.message));
    await tg.sendMessage(token, chat,
      I18N.t(lang, 'ank.botThanks2', { name: (c.fullName || '').split(' ')[0] || '',
        jobs: matches ? I18N.t(lang, 'ank.botThanksJobs', { n: matches }) : '' }),
      { reply_markup: { inline_keyboard: [[
        { text: I18N.t(lang, 'ank.botJobs'), web_app: { url: `${appBase}/profil.html#jobs` } },
        { text: I18N.t(lang, 'ank.botProfile'), web_app: { url: `${appBase}/profil.html` } }
      ]] } });
  } catch (e) { console.error('[ANKETA] rahmat xabari ketmadi:', e.message); }

  // Agentlikka. Ariza bo'lsa applications.submit o'zi xabar bergan — ikkinchisini yubormaymiz.
  if (!out.applied) {
    try {
      const agency = await Restaurant.findOne({ id: r.agencyId });
      const chat = agency && agency.telegram && agency.telegram.adminChatId;
      if (chat) {
        const CH = require('./survey').CHANNELS;
        await tg.sendMessage(tg.platformToken(), chat,
          `${via === 'voice' ? '🎤' : '📝'} ${out.created ? (via === 'voice' ? 'Yangi ovozli rezyume' : 'Yangi anketa') : 'Anketa yangilandi'}` +
          (r.channel ? ` · ${CH[r.channel] || r.channel}` : '') + `\n\n` +
          `${c.fullName || 'Nomsiz'} — ${c.desiredPosition || ''}\n` +
          `${c.phone || ''}${c.phoneVerifiedAt ? ' ✓' : ' (qo\'lda)'}`);
      }
    } catch (e) { console.error('[ANKETA] agentlik xabari ketmadi:', e.message); }
  }
  return { jobs, matches, next };
}

module.exports = { afterFinalize };
