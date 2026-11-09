// ── ISHGA OLINGANDAN KEYIN: 1/7/30-KUN KUZATUV VA KAFOLAT ────
// Restoranning eng katta qo'rquvi — yangi xodim birinchi haftada ketib
// qolishi. Hech kim qo'ng'iroq qilmaydi, bot o'zi:
//   1-kun:  mijozga "ishga chiqdimi?", nomzodga "birinchi kun qanday?"
//   7-kun:  ikkalasiga "hali ham ishlayaptimi / ish qanday?"
//   30-kun: oxirgi so'rov; ijobiy bo'lsa — done (ishonchlilik tarixi)
// Nomzod "😐 Muammo bor" — agentlikka darhol (qo'ng'iroq qilib ushlab qolish).
// 30 kun ichida ketsa — KAFOLAT: vakansiya qayta ochiladi (kanalga yangi
// post, mos nomzodlarga xabar — services/jobPost), mijozga +1 kredit
// (keyingi kontakt bepul), nomzod qayta "ish qidiryapti". O'chirish:
// REPLACE_GUARANTEE=0 (muhit o'zgaruvchisi).
// Yaratish — shortlist.setClientState ('hired'). Rejali — tick() (server.js).

const crypto = require('crypto');
const Placement = require('../models/Placement');
const Shortlist = require('../models/Shortlist');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const Vacancy = require('../models/Vacancy');
const Restaurant = require('../models/Restaurant');
const tg = require('./telegram');
const I18N = require('../../public/js/th-i18n');

const H = 3600e3, DAY = 24 * H;
const STEPS = [1, 7, 30];
const T = (lang, k, v) => I18N.t(lang, k, v);
const langOf = x => I18N.resolve(x && x.lang, x && x.tgLang);
const reachable = c => !!(c && c.tgChatId && !['blocked', 'stopped'].includes(c.tgState));
const daytime = now => { const h = (now.getUTCHours() + 5) % 24; return h >= 10 && h < 20; };
const guaranteeOn = () => process.env.REPLACE_GUARANTEE !== '0';
// Kafolatga kirmaydigan lavozimlar (oferta: "Oshpaz va menejer lavozimlari kafolatga kirmaydi")
const NO_GUARANTEE_ROLES = ['oshpaz', 'menejer'];
const kb = rows => ({ reply_markup: { inline_keyboard: rows } });
const cb = (op, p, step) => `pl:${op}:${p.id}:${step}`;
const send = (chatId, text, opts) => chatId
  ? tg.sendMessage(tg.platformToken(), chatId, text, opts || {}).catch(e => { console.error('[PL] xabar ketmadi:', e.message); return null; })
  : Promise.resolve(null);

async function adminSay(agencyId, text) {
  try {
    const ag = await Restaurant.findOne({ id: agencyId }, 'telegram').lean();
    const chat = ag && ag.telegram && ag.telegram.adminChatId;
    if (chat) await send(chat, text);
  } catch (e) { /* jim */ }
}

/** Ishga olindi — yozuv (takror xavfsiz: unique indeks) */
async function create({ agencyId, shortlistId, candidateId, hiredAt = new Date() }) {
  try {
    if (await Placement.exists({ agencyId, shortlistId, candidateId })) return null;
    const sl = await Shortlist.findOne({ agencyId, id: shortlistId }, 'clientId vacancyId').lean();
    if (!sl) return null;
    return await Placement.create({ id: crypto.randomBytes(5).toString('hex'), agencyId, clientId: sl.clientId,
      candidateId, shortlistId, vacancyId: sl.vacancyId || '', hiredAt });
  } catch (e) {
    if (e.code !== 11000) console.error('[PL] yaratilmadi:', e.message);
    return null;
  }
}

async function partiesOf(p) {
  const [client, cand] = await Promise.all([
    Client.findOne({ agencyId: p.agencyId, id: p.clientId }).lean(),
    Candidate.findOne({ restaurantId: p.agencyId, id: p.candidateId }, 'id fullName publicCode phone role tgChatId tgState lang tgLang').lean()
  ]);
  return { client: client || {}, cand: cand || {} };
}
const nameOf = c => c.fullName || c.publicCode || '—';

async function ask(p, step) {
  const { client, cand } = await partiesOf(p);
  const Lc = langOf(client), Lk = langOf(cand), n = nameOf(cand);
  await send(client.tgChatId, step === 1 ? T(Lc, 'pl.cQ1', { n }) : T(Lc, 'pl.cQ', { n, d: step }), kb([[
    { text: T(Lc, step === 1 ? 'pl.cYes1' : 'pl.cYes'), callback_data: cb('cw', p, step) },
    { text: T(Lc, step === 1 ? 'pl.cNo1' : 'pl.cNo'), callback_data: cb('cl', p, step) }]]));
  if (reachable(cand)) {
    await send(cand.tgChatId, step === 1 ? T(Lk, 'pl.kQ1', { c: client.name }) : T(Lk, 'pl.kQ', { c: client.name, d: step }), kb([
      [{ text: T(Lk, 'pl.kGood'), callback_data: cb('kg', p, step) }],
      [{ text: T(Lk, 'pl.kProblem'), callback_data: cb('kp', p, step) }],
      [{ text: T(Lk, 'pl.kLeft'), callback_data: cb('kl', p, step) }]]));
  }
}

/**
 * Ketdi. 30 kun ichida bo'lsa — kafolat: vakansiya qayta, +1 kredit.
 * @returns {boolean} kafolat ishga tushdimi
 */
async function markLeft(p, by, { appBase = process.env.APP_URL || '', now = new Date() } = {}) {
  const up = await Placement.findOneAndUpdate({ _id: p._id, status: { $ne: 'left' } },
    { $set: { status: 'left', leftAt: now, leftBy: by, updatedAt: now } }, { new: true }).lean();
  if (!up) return false;
  // Nomzod yana ish qidiryapti — qidiruv va "mos ish" xabarlarida chiqadi
  await Candidate.updateOne({ restaurantId: p.agencyId, id: p.candidateId },
    { $set: { jobStatus: 'active', jobStatusAt: now, updatedAt: now } });
  const { client, cand } = await partiesOf(up);
  const within = now.getTime() - new Date(up.hiredAt).getTime() <= 30 * DAY;
  if (!within || !guaranteeOn()) {
    await adminSay(p.agencyId, `ℹ️ ${client.name}: ${nameOf(cand)} ketdi (${Math.floor((now - new Date(up.hiredAt)) / DAY)} kun).`);
    return false;
  }
  const claimed = await Placement.findOneAndUpdate({ _id: up._id, replacedAt: null }, { $set: { replacedAt: now } }, { new: true }).lean();
  if (!claimed) return false;

  // Vakansiya qayta ochiladi — kanalga YANGI post va mos nomzodlarga xabar (jobPost.tick)
  let v = null;
  if (up.vacancyId) {
    v = await Vacancy.findOneAndUpdate({ agencyId: up.agencyId, id: up.vacancyId },
      { $set: { status: 'open', listed: true, confirmedAt: now, updatedAt: now,
        'channelPost.postedAt': null, 'channelPost.closedAt': null, 'channelPost.messageId': 0, 'channelPost.url': '' } },
      { new: true }).lean();
  }
  // +1 kredit — keyingi kontakt bepul. Oshpaz va menejer kafolatga kirmaydi
  // (oferta 5-band, data/plans) — ularda faqat vakansiya qayta ochiladi.
  const role = (v && v.role) || cand.role || '';
  const covered = !NO_GUARANTEE_ROLES.includes(role);
  let balance = null;
  if (covered) {
    try {
      const r = await require('./credits').bonus({ agencyId: up.agencyId, clientId: up.clientId, amount: 1, note: 'Kafolat: 30 kun ichida almashtirish' });
      balance = r && r.balance;
    } catch (e) { console.error('[PL] kafolat krediti:', e.message); }
  }

  const Lc = langOf(client);
  const base = String(appBase || '').replace(/\/+$/, '');
  await send(client.tgChatId, T(Lc, covered ? 'pl.guarantee' : 'pl.reopened', { n: nameOf(cand), v: v ? require('./vacancy').titleFor(v, Lc) : '—' }),
    base ? kb([[{ text: T(Lc, 'ivx.cOpen'), web_app: { url: `${base}/miniapp.html` } }]]) : {});
  await adminSay(up.agencyId, `🛡 Kafolat: ${client.name} — ${nameOf(cand)} ${Math.floor((now - new Date(up.hiredAt)) / DAY)} kunda ketdi. Vakansiya qayta ochildi`
    + (covered ? `, +1 kredit${balance != null ? ' (balans ' + balance + ')' : ''}.` : ` (${role} — kreditsiz, kafolatga kirmaydi).`));
  return true;
}

const CB_RE = /^pl:(cw|cl|kg|kp|kl):([0-9a-f]{10}):(1|7|30)$/;

/** Bot tugmasi — {ok, text, alert?, edit?} (iv/ps bilan bir xil shakl) */
async function handleCallback({ data, chatId, appBase = '', now = new Date() }) {
  const m = CB_RE.exec(String(data || ''));
  if (!m) return { ok: false, text: '' };
  const [, op, id] = m;
  const p = await Placement.findOne({ id }).lean();
  if (!p) return { ok: false, text: 'Topilmadi / Не найдено', alert: true };
  const { client, cand } = await partiesOf(p);
  const isClient = String(client.tgChatId || '') === String(chatId);
  const isCand = String(cand.tgChatId || '') === String(chatId);
  const Lc = langOf(client), Lk = langOf(cand), n = nameOf(cand);

  if (op === 'cw' || op === 'cl') {
    if (!isClient) return { ok: false, text: T(Lc, 'ivx.notYours'), alert: true };
    if (p.status === 'left') return { ok: true, text: '✓', edit: T(Lc, 'pl.cLeft', { n }) };
    if (op === 'cw') {
      await Placement.updateOne({ _id: p._id }, { $set: { clientOk: now, updatedAt: now } });
      return { ok: true, text: '✓', edit: T(Lc, 'pl.cOk', { n }) };
    }
    const g = await markLeft(p, 'client', { appBase, now });
    return { ok: true, text: '✓', edit: T(Lc, g ? 'pl.cLeftG' : 'pl.cLeft', { n }) };
  }

  if (!isCand) return { ok: false, text: T(Lk, 'ivx.notYours'), alert: true };
  if (p.status === 'left') return { ok: true, text: '✓', edit: T(Lk, 'pl.kLeftOk') };
  if (op === 'kg') {
    await Placement.updateOne({ _id: p._id }, { $set: { candOk: now, updatedAt: now } });
    return { ok: true, text: '👍', edit: T(Lk, 'pl.kGoodOk') };
  }
  if (op === 'kp') {
    const first = !p.problemAt;
    await Placement.updateOne({ _id: p._id }, { $set: { problemAt: now, updatedAt: now } });
    if (first) await adminSay(p.agencyId, `⚠️ ${n} (${cand.phone || '—'}) ${client.name}dagi ishida «muammo bor» dedi — qo'ng'iroq qilib, ushlab qoling.`);
    return { ok: true, text: '✓', edit: T(Lk, 'pl.kProblemOk') };
  }
  // kl — ketdim
  await markLeft(p, 'candidate', { appBase, now });
  return { ok: true, text: '✓', edit: T(Lk, 'pl.kLeftOk') };
}

/** Rejali: 1/7/30-kun so'rovlari; 30 kundan o'tib "ketdi" demaganlar — done */
async function tick(now = new Date()) {
  const out = { asked: 0, done: 0 };
  // 33 kundan o'tgan, ketmagan — sinovdan o'tdi
  const r = await Placement.updateMany({ status: 'active', hiredAt: { $lte: new Date(now.getTime() - 33 * DAY) } },
    { $set: { status: 'done', updatedAt: now } });
  out.done = r.modifiedCount || 0;
  if (!daytime(now)) return out;
  for (const step of STEPS) {
    const f = 'd' + step + 'At';
    // Faqat shu bosqich vaqti kelgan va keyingisi hali kelmaganlar (eski bosqichni o'tkazib yuboramiz)
    const next = STEPS[STEPS.indexOf(step) + 1];
    const q = { status: 'active', [f]: null, hiredAt: { $lte: new Date(now.getTime() - step * DAY) } };
    if (next) q.hiredAt.$gt = new Date(now.getTime() - next * DAY);
    for (const p of await Placement.find(q).limit(50).lean()) {
      const up = await Placement.findOneAndUpdate({ _id: p._id, [f]: null }, { $set: { [f]: now, updatedAt: now } }, { new: true }).lean();
      if (!up) continue;
      await ask(up, step);
      out.asked++;
    }
  }
  return out;
}

/** Mini App kartasi uchun: { "<shortlistId>:<candidateId>": {status, days} } */
async function forItems(agencyId, clientId, pairs, now = new Date()) {
  if (!pairs.length) return {};
  const rows = await Placement.find({ agencyId, clientId, shortlistId: { $in: [...new Set(pairs.map(x => x[0]))] } }).lean();
  return Object.fromEntries(rows.map(p => [p.shortlistId + ':' + p.candidateId,
    { status: p.status, days: Math.max(1, Math.floor(((p.leftAt || now) - new Date(p.hiredAt)) / DAY) + 1), replaced: !!p.replacedAt }]));
}

module.exports = { create, markLeft, handleCallback, tick, forItems, CB_RE };
