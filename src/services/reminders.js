// ── CHALA ANKETA ESLATMASI ───────────────────────────────────
// vakansiya.uz kanalidan kelgan 15 kishidan 7 tasi botda /start bosib,
// anketani umuman ochmagan (2026-10-23). Bot birinchi bo'lib yozolmaydi,
// lekin /start bosgan odamga yoza oladi — shuning uchun eslatma mumkin.
//
// Qoida (bitta joyda):
//   • faqat "started" anketa, oxirgi 7 kun ichida boshlangan
//   • 1-eslatma — 2 soatdan keyin, 2-(oxirgi) eslatma — 1-sidan 22 soat keyin;
//     undan keyin jim (spam emas)
//   • tunda yozilmaydi: Toshkent 22:00–09:00
//   • odam allaqachon bazada bo'lsa (shu Telegram'ga ulangan nomzod yoki
//     mijoz) yoki boshqa anketani tugatgan bo'lsa — yozilmaydi
//   • botni bloklagan (403) — boshqa yozilmaydi
// Matn ikki xil: umuman ochmagan va yarmida qoldirgan (javoblari saqlangan).
//
// Chaqiruvchi: GitHub Actions soatlik vazifa (.github/workflows/reminders.yml)
// -> POST /api/cron/reminders. Render bepul tarifida o'z cron'imiz ishonchsiz.

const SurveyResponse = require('../models/SurveyResponse');
const Candidate = require('../models/Candidate');
const Client = require('../models/Client');
const Vacancy = require('../models/Vacancy');
const tg = require('./telegram');
const vac = require('./vacancy');
const I18N = require('../../public/js/th-i18n');

const H = 36e5;
const FIRST_AFTER = 2 * H;
const SECOND_AFTER = 22 * H;
const MAX_AGE = 7 * 24 * H;
const MAX_PER_RUN = 100;

// Toshkent (+5, yozgi vaqt yo'q): 09:00–21:59 — yozish mumkin
function quietNow(now = new Date()) {
  const h = (now.getUTCHours() + 5) % 24;
  return h < 9 || h >= 22;
}

async function openJobs(agencyId) {
  const fresh = new Date(Date.now() - vac.STALE_DAYS * 864e5);
  return Vacancy.countDocuments({ agencyId, status: 'open', listed: { $ne: false }, confirmedAt: { $gte: fresh }, isTest: { $ne: true } });
}

/** Kimga eslatma kerak — yubormasdan (panel/sinov uchun ham). */
async function due(now = new Date()) {
  const t = now.getTime();
  const rows = await SurveyResponse.find({
    status: 'started',
    remindStop: { $ne: true },
    startedAt: { $gte: new Date(t - MAX_AGE) },
    $or: [
      { reminders: { $in: [0, null] }, updatedAt: { $lte: new Date(t - FIRST_AFTER) } },
      { reminders: 1, remindedAt: { $lte: new Date(t - SECOND_AFTER) } }
    ]
  }).sort({ updatedAt: 1 }).limit(MAX_PER_RUN * 2).lean();

  const out = [];
  for (const r of rows) {
    const uid = r.tgUserId;
    // Allaqachon bazada yoki boshqa anketani tugatgan — eslatma befoyda
    const [cand, cl, done] = await Promise.all([
      Candidate.exists({ tgChatId: uid }),
      Client.exists({ tgChatId: uid }),
      SurveyResponse.exists({ tgUserId: uid, status: 'done' })
    ]);
    if (cand || cl || done) continue;
    // Bir odamga bir vaqtda bitta eslatma (bir nechta chala anketa bo'lsa — eng yangisi)
    if (out.some(x => x.tgUserId === uid)) continue;
    out.push(r);
    if (out.length >= MAX_PER_RUN) break;
  }
  return out;
}

function textFor(r, { jobs, lang }) {
  const T = (k, x) => I18N.t(lang, k, x);
  const partial = !!r.step && Object.keys(r.answers || {}).length > 0;
  const second = (r.reminders || 0) >= 1;
  const body = partial ? T('rem.partial') : T('rem.notStarted');
  const tail = jobs ? T('rem.jobs', { n: jobs }) : '';
  return {
    text: [second ? T('rem.last') : '', body, tail].filter(Boolean).join('\n\n'),
    button: partial ? T('rem.btnContinue') : T('ank.botOpen')
  };
}

/**
 * Eslatmalarni yuboradi. dry:true — faqat ro'yxat (hech narsa yuborilmaydi).
 * send — test uchun almashtiriladi (standart: Telegram).
 */
async function run({ appBase, dry = false, now = new Date(), send } = {}) {
  if (quietNow(now)) return { quiet: true, sent: 0, due: 0 };
  const list = await due(now);
  const jobsBy = {};
  const report = { quiet: false, due: list.length, sent: 0, blocked: 0, failed: 0, items: [] };
  const doSend = send || ((chat, text, opts) => tg.sendMessage(tg.platformToken(), chat, text, opts));

  for (const r of list) {
    if (jobsBy[r.agencyId] === undefined) jobsBy[r.agencyId] = await openJobs(r.agencyId);
    const lang = I18N.LANGS.includes(r.lang) ? r.lang : 'uz';
    const m = textFor(r, { jobs: jobsBy[r.agencyId], lang });
    const item = { id: r.id, channel: r.channel, kind: r.step ? 'partial' : 'notStarted', n: (r.reminders || 0) + 1 };
    report.items.push(item);
    if (dry) continue;
    try {
      await doSend(r.chatId || r.tgUserId, m.text, { reply_markup: { inline_keyboard: [[
        { text: m.button, web_app: { url: `${appBase}/anketa.html?r=${r.id}` } }
      ]] } });
      await SurveyResponse.updateOne({ id: r.id }, { $set: { remindedAt: now }, $inc: { reminders: 1 } });
      report.sent++;
    } catch (e) {
      // 403 — botni bloklagan: boshqa yozmaymiz
      if (e && e.code === 403) {
        await SurveyResponse.updateOne({ id: r.id }, { $set: { remindStop: true } });
        report.blocked++;
      } else report.failed++;
    }
  }
  return report;
}

module.exports = { run, due, quietNow, textFor, FIRST_AFTER, SECOND_AFTER };
