// ── BIRINCHI HAFTA PAKETI (yangi xodimga) ────────────────────
// Yangi xodimlarning 30–43% i birinchi 90 kunda ketadi; ko'pi — birinchi
// kunlarda "qayerga, qachon, nima olib kelaman" noaniqligidan. Menejer har
// safar tushuntirmasin: ishga olinganda (placements.create) bot xodimga
// birinchi kun ma'lumotini (mijoz bir marta kiritadi — Client.onboard) va
// 5 savollik xizmat standartlari testini yuboradi. Natija mijozga ham boradi.
// Tugmalar: ob:s:<placementId> (boshlash), ob:a:<placementId>:<savol>:<variant>.

const Placement = require('../models/Placement');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const Vacancy = require('../models/Vacancy');
const tg = require('./telegram');
const QUIZ = require('../data/onboardQuiz');
const I18N = require('../../public/js/th-i18n');

const T = (lang, k, v) => I18N.t(lang, k, v);
const langOf = x => I18N.resolve(x && x.lang, x && x.tgLang);
const reachable = c => !!(c && c.tgChatId && !['blocked', 'stopped'].includes(c.tgState));
const send = (chatId, text, opts) => tg.sendMessage(tg.platformToken(), chatId, text, opts || {})
  .catch(e => { console.error('[OB] xabar ketmadi:', e.message); return null; });

/** Mijozning birinchi kun ma'lumoti (tozalangan) */
function clean(b = {}) {
  const s = (x, n) => String(x || '').trim().slice(0, n);
  return { address: s(b.address, 200), time: s(b.time, 40), contact: s(b.contact, 120), dress: s(b.dress, 160), bring: s(b.bring, 200), note: s(b.note, 300) };
}
const infoOf = client => {
  const o = (client && client.onboard) || {};
  return Object.assign(clean(o), { address: (o.address || (client.ivPrefs && client.ivPrefs.address) || client.address || '').trim() });
};

async function roleOf(p) {
  const v = p.vacancyId ? await Vacancy.findOne({ agencyId: p.agencyId, id: p.vacancyId }, 'role').lean() : null;
  if (v && v.role) return v.role;
  const c = await Candidate.findOne({ restaurantId: p.agencyId, id: p.candidateId }, 'role').lean();
  return (c && c.role) || '';
}

/** Ishga olindi — xodimga paket. Yiqilsa jim: ishga olish allaqachon bajarilgan. */
async function sendPack(p) {
  try {
    const [client, cand] = await Promise.all([
      Client.findOne({ agencyId: p.agencyId, id: p.clientId }).lean(),
      Candidate.findOne({ restaurantId: p.agencyId, id: p.candidateId }, 'id fullName tgChatId tgState lang tgLang').lean()
    ]);
    if (!client || !reachable(cand)) return false;
    const L = langOf(cand), i = infoOf(client);
    const lines = [
      T(L, 'ob.hello', { c: client.name }), '',
      i.address ? `📍 ${T(L, 'ob.addr')}: ${i.address}` : '',
      i.time ? `🕘 ${T(L, 'ob.time')}: ${i.time}` : '',
      i.contact ? `👤 ${T(L, 'ob.contact')}: ${i.contact}` : '',
      i.dress ? `👔 ${T(L, 'ob.dress')}: ${i.dress}` : '',
      i.bring ? `📋 ${T(L, 'ob.bring')}: ${i.bring}` : '',
      i.note ? `ℹ️ ${i.note}` : '',
      '', T(L, 'ob.quizInvite')
    ].filter((x, k, arr) => x !== '' || (arr[k - 1] !== '' && k > 0));
    await send(cand.tgChatId, lines.join('\n').replace(/\n{3,}/g, '\n\n'),
      { reply_markup: { inline_keyboard: [[{ text: T(L, 'ob.start'), callback_data: `ob:s:${p.id}` }]] } });
    await Placement.updateOne({ _id: p._id }, { $set: { packAt: new Date() } });
    return true;
  } catch (e) { console.error('[OB] paket ketmadi:', e.message); return false; }
}

function questionMsg(p, quiz, qi, L) {
  const q = quiz[qi];
  return [`${qi + 1}/${quiz.length}. ${q[L] || q.uz}`,
    { inline_keyboard: q.opts.map((o, oi) => [{ text: o[L] || o.uz, callback_data: `ob:a:${p.id}:${qi}:${oi}` }]) }];
}

const CB_RE = /^ob:(s|a):([0-9a-f]{10})(?::(\d):(\d))?$/;

/** Bot tugmasi — {ok, text, alert?, edit?, keyboard?} (iv/ps/pl bilan bir xil shakl) */
async function handleCallback({ data, chatId }) {
  const m = CB_RE.exec(String(data || ''));
  if (!m) return { ok: false, text: '' };
  const [, op, id, qi, oi] = m;
  const p = await Placement.findOne({ id }).lean();
  if (!p) return { ok: false, text: 'Topilmadi / Не найдено', alert: true };
  const cand = await Candidate.findOne({ restaurantId: p.agencyId, id: p.candidateId }, 'id fullName tgChatId lang tgLang').lean();
  const L = langOf(cand);
  if (!cand || String(cand.tgChatId) !== String(chatId)) return { ok: false, text: T(L, 'ivx.notYours'), alert: true };
  const quiz = QUIZ.forRole(await roleOf(p));

  if (op === 's') {
    if (p.quizDoneAt) return { ok: true, text: '✓', edit: T(L, 'ob.already', { a: p.quizScore || 0, b: quiz.length }) };
    await Placement.updateOne({ _id: p._id }, { $set: { quizStep: 0, quizScore: 0 } });
    const [text, kb] = questionMsg(p, quiz, 0, L);
    return { ok: true, text: '▶️', edit: text, keyboard: kb.inline_keyboard };
  }

  // a — javob: faqat joriy savolga (takror bosish ball qo'shmasin)
  const step = +qi, ans = +oi;
  const up = await Placement.findOneAndUpdate({ _id: p._id, quizStep: step, quizDoneAt: null },
    { $set: { quizStep: step + 1 }, $inc: { quizScore: quiz[step] && quiz[step].c === ans ? 1 : 0 } }, { new: true }).lean();
  if (!up) return { ok: true, text: '✓' };
  const right = quiz[step].c === ans;
  const fb = right ? T(L, 'ob.right') : T(L, 'ob.wrong', { a: quiz[step].opts[quiz[step].c][L] || quiz[step].opts[quiz[step].c].uz });
  if (step + 1 < quiz.length) {
    const [text, kb] = questionMsg(up, quiz, step + 1, L);
    return { ok: true, text: right ? '✅' : '❌', edit: fb + '\n\n' + text, keyboard: kb.inline_keyboard };
  }
  await Placement.updateOne({ _id: p._id }, { $set: { quizDoneAt: new Date() } });
  // Mijozga — yangi xodim standartlarni bilishi
  try {
    const client = await Client.findOne({ agencyId: p.agencyId, id: p.clientId }, 'tgChatId lang tgLang').lean();
    if (client && client.tgChatId) await send(client.tgChatId, T(langOf(client), 'ob.toClient',
      { n: cand.fullName || '—', a: up.quizScore, b: quiz.length }));
  } catch (e) { /* jim */ }
  return { ok: true, text: right ? '✅' : '❌', edit: fb + '\n\n' + T(L, up.quizScore >= quiz.length - 1 ? 'ob.doneGood' : 'ob.doneOk', { a: up.quizScore, b: quiz.length }) };
}

module.exports = { sendPack, handleCallback, clean, infoOf, CB_RE };
