// ── ARIZANING HAYOT YO'LI ────────────────────────────────────
// Nomzod "Ariza berish"ni bosgach nima bo'layotganini bilishi kerak.
// Ilgari "Arizalarim"da faqat "Ko'rib chiqilmoqda" turardi va uni faqat
// mijoz o'zgartirardi — kanaldan olingan (tizimga kirmaydigan) restoran
// vakansiyasida u abadiy qotib qolardi. Agentlikning ishi esa ko'rinmasdi.
//
// Bosqichlar ikki manbadan YIG'ILADI, alohida saqlanmaydi:
//   Application — yuborildi, HR ko'rdi, HR bog'landi, taklif / rad
//   Shortlist elementi (tanlovga o'tgach) — suhbat, natija
// Shunda panel, mijoz Mini App va nomzod bir xil haqiqatni ko'radi.

const tg = require('./telegram');

const STEP_LABEL = {
  sent:      'Ariza yuborildi',
  reviewed:  'HR ko\'rib chiqdi',
  contacted: 'HR siz bilan bog\'landi',
  proposed:  'Ish beruvchiga taklif qilindi',
  interview: 'Suhbat',
  hired:     'Ishga qabul qilindingiz',
  closed:    'Bu safar boshqa nomzod tanlandi'
};
// Tanlovdagi holatdan nomzod ko'radigan natija (pipeline.STATES)
const FINAL_BAD = ['candidate_no', 'not_fit', 'refunded'];

/**
 * Nomzod uchun bosqichlar: [{ key, label, at, done }] va joriy holat.
 * @param {object} a     Application (lean)
 * @param {object} item  Shortlist elementi (ixtiyoriy)
 */
function stepsFor(a, item) {
  const s = [];
  const add = (key, at, label) => s.push({ key, label: label || STEP_LABEL[key], at: at || null, done: true });
  add('sent', a.createdAt);
  const seen = a.agencySeenAt || a.seenAt;
  if (seen || a.contactedAt || a.state === 'shortlisted' || a.state === 'rejected') add('reviewed', seen);
  if (a.contactedAt) add('contacted', a.contactedAt);

  let final = '';
  if (a.state === 'rejected') final = 'closed';
  if (a.state === 'shortlisted') {
    add('proposed', a.decidedAt);
    if (item) {
      if (item.interviewAt && ['interview', 'hired', 'not_fit'].includes(item.state)) add('interview', item.interviewAt);
      if (item.state === 'hired') final = 'hired';
      else if (FINAL_BAD.includes(item.state)) final = 'closed';
    }
  }
  if (final) add(final, a.state === 'rejected' ? a.decidedAt : (item && item.decidedAt));

  const last = s[s.length - 1];
  return {
    steps: s,
    stage: last.key,
    stageLabel: last.key === 'interview' && last.at ? `${STEP_LABEL.interview}: ${fmt(last.at)}` : last.label,
    final: !!final,
    tone: final === 'hired' ? 'ok' : final === 'closed' ? 'no' : (last.key === 'sent' ? 'wait' : 'go')
  };
}

// "24-oktabr, 15:00" — Toshkent vaqti (+5), server qayerda bo'lmasin
const OYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
function fmt(d) {
  const x = new Date(new Date(d).getTime() + 5 * 3600e3);
  const hh = String(x.getUTCHours()).padStart(2, '0'), mm = String(x.getUTCMinutes()).padStart(2, '0');
  return `${x.getUTCDate()}-${OYLAR[x.getUTCMonth()]}, ${hh}:${mm}`;
}

// ── Nomzodga xabar ──
// Faqat nomzod uchun ma'noli o'zgarishlarda: taklif qilindi va rad.
// Rad matni yumshoq va keyingi qadam bilan — "rad etildi" deb tashlab
// qo'ymaymiz. Yiqilsa throw qilmaydi: asosiy amal allaqachon bajarilgan.
async function notify(cand, kind, { vacTitle = '', appBase = '' } = {}) {
  try {
    if (!cand || !cand.tgChatId || ['blocked', 'stopped'].includes(cand.tgState)) return;
    const text = kind === 'proposed'
      ? `✅ «${vacTitle}» — arizangiz ish beruvchiga taklif qilindi.\n\nSuhbat belgilansa xabar beramiz. Holatni "Arizalarim" bo'limida kuzatib boring.`
      : `«${vacTitle}» bo'yicha bu safar boshqa nomzod tanlandi.\n\nProfilingiz bazada qoladi — mos ish chiqsa o'zimiz yozamiz. Boshqa vakansiyalarni ham ko'ring.`;
    const opts = appBase ? { reply_markup: { inline_keyboard: [[
      { text: kind === 'proposed' ? '📋 Arizalarim' : '💼 Ish o\'rinlari', web_app: { url: `${appBase}/profil.html#${kind === 'proposed' ? 'apps' : 'jobs'}` } }
    ]] } } : {};
    await tg.sendMessage(tg.platformToken(), cand.tgChatId, text, opts);
  } catch (e) {
    console.error('[APP] nomzodga holat xabari ketmadi:', e.message);
  }
}

module.exports = { stepsFor, notify, STEP_LABEL, fmt };
