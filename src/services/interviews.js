// ── SUHBATNI AVTOMATIK KELISHISH ─────────────────────────────
// Hook: "Suhbatga kelmagan nomzod uchun pul to'lamaysiz". Menejer hech
// kimga qo'ng'iroq qilmaydi:
//   1. Mijoz Mini App'da "Suhbatga chaqirish" (kontakt ochilgan nomzod).
//   2. Nomzodga botda bo'sh vaqtlar (mijozning ivPrefs oralig'idan) —
//      o'zi tanlaydi; yoki mijoz aniq vaqt beradi.
//   3. Bir kun va 2 soat oldin "Borasizmi?" (✅ / ❌), "🚶 Yo'ldaman".
//   4. Suhbatdan 1 soat keyin ikki tomondan "keldimi?".
//   5. Kelmasa / bormasligini aytsa / vaqt tanlamasa — kredit qaytadi
//      (shortlist.refund, sabab 'no_show'). Mijoz "kelmadi", nomzod
//      "bordim" desa — conflict: kredit qaytmaydi, agentlik hal qiladi.
// Rejali qism — tick(): server ichida har 2 daqiqada (server.js) va
// soatlik cron'da zaxira sifatida. Har xabar oldidan bayroq atomik
// qo'yiladi (claim) — ikki tick bir xabarni ikki marta yubormaydi.
// Vaqt — Toshkent (UTC+5, yozgi vaqt yo'q).

const crypto = require('crypto');
const Interview = require('../models/Interview');
const Shortlist = require('../models/Shortlist');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const Restaurant = require('../models/Restaurant');
const tg = require('./telegram');
const I18N = require('../../public/js/th-i18n');

const TZ = 5 * 3600e3;
const H = 3600e3, MIN = 60e3;
const ACTIVE = ['offered', 'scheduled', 'confirmed'];
const DEFAULT_PREFS = { days: [1, 2, 3, 4, 5, 6], from: '11:00', to: '17:00' };
const LEAD = 3 * H;              // eng yaqin vaqt — hozirdan 3 soat keyin
const PER_DAY = 4, DAYS = 3;     // botda 3 kun x 4 vaqtgacha

const newId = () => crypto.randomBytes(5).toString('hex');     // 10 belgi

// ── Vaqt (Toshkent) ──
const local = d => { const x = new Date(new Date(d).getTime() + TZ);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), wd: x.getUTCDay() || 7,
    hh: x.getUTCHours(), mm: x.getUTCMinutes() }; };
const fromLocal = (y, m, d, hh, mm) => new Date(Date.UTC(y, m, d, hh, mm) - TZ);
const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? [+m[1], +m[2]] : null; };
const pad = n => String(n).padStart(2, '0');

/** Sozlamani tozalash: kunlar 1..7, vaqt HH:MM, from < to. */
function cleanPrefs(p = {}) {
  const days = [...new Set((Array.isArray(p.days) ? p.days : []).map(Number).filter(n => n >= 1 && n <= 7))].sort();
  const f = hm(p.from), t = hm(p.to);
  const ok = f && t && f[0] < 24 && t[0] < 24 && (f[0] * 60 + f[1]) + 60 <= (t[0] * 60 + t[1]);
  return {
    days: days.length ? days : DEFAULT_PREFS.days,
    from: ok ? `${pad(f[0])}:${pad(f[1])}` : DEFAULT_PREFS.from,
    to: ok ? `${pad(t[0])}:${pad(t[1])}` : DEFAULT_PREFS.to,
    address: String(p.address || '').trim().slice(0, 200)
  };
}
const prefsOf = client => {
  const p = (client && client.ivPrefs) || {};
  const c = cleanPrefs(p.days && p.days.length ? p : DEFAULT_PREFS);
  c.address = (p.address || (client && client.address) || '').trim();
  return c;
};

/**
 * Bo'sh vaqtlar: keyingi 3 ish kuni (7 kun ichida), har kuni 4 tagacha
 * soatlik vaqt, band vaqtlar (shu mijozning faol suhbatlari ±30 daq) chiqariladi.
 */
function makeSlots(prefs, now = new Date(), busy = []) {
  const p = cleanPrefs(prefs);
  const [fh, fm] = hm(p.from), [th, tm] = hm(p.to);
  const start = fh * 60 + fm, end = th * 60 + tm;
  const out = [];
  let days = 0;
  for (let i = 0; i < 8 && days < DAYS; i++) {
    const L = local(now.getTime() + i * 864e5);
    if (!p.days.includes(L.wd)) continue;
    const all = [];
    for (let t = start; t + 60 <= end; t += 60) {
      const at = fromLocal(L.y, L.m, L.d, Math.floor(t / 60), t % 60);
      if (at.getTime() < now.getTime() + LEAD) continue;
      if (busy.some(b => Math.abs(new Date(b).getTime() - at.getTime()) < 30 * MIN)) continue;
      all.push(at);
    }
    if (!all.length) continue;
    // 4 tadan ko'p bo'lsa — kun bo'ylab teng tarqatamiz
    const pick = all.length <= PER_DAY ? all
      : Array.from({ length: PER_DAY }, (_, k) => all[Math.round(k * (all.length - 1) / (PER_DAY - 1))]);
    out.push(...pick);
    days++;
  }
  return out;
}

// ── Matn ──
const langCl = c => I18N.resolve(c && c.lang, c && c.tgLang);
const langCa = c => I18N.resolve(c && c.lang, c && c.tgLang);
const T = (lang, k, v) => I18N.t(lang, k, v);
const dayName = (d, lang) => T(lang, 'ivx.wd').split(',')[local(d).wd - 1];
const timeOf = d => { const L = local(d); return `${pad(L.hh)}:${pad(L.mm)}`; };
function dateOf(d, lang) {
  const L = local(d);
  const m = T(lang, 'cb.months').split(',')[L.m];
  return T(lang, 'cb.dateFmt', { d: L.d, m });
}
const whenOf = (d, lang) => `${dayName(d, lang)}, ${dateOf(d, lang)}, ${timeOf(d)}`;
const mapUrl = a => 'https://yandex.uz/maps/?text=' + encodeURIComponent(a);
const placeLines = (iv, client, lang) => [
  `🏢 ${client.name}`,
  iv.address ? `📍 ${iv.address}` : '',
  iv.address ? `🗺 ${mapUrl(iv.address)}` : ''
].filter(Boolean).join('\n');

const cb = (op, iv, arg) => `iv:${op}:${iv.id}` + (arg != null ? ':' + arg : '');
const kb = rows => (rows && rows.length ? { reply_markup: { inline_keyboard: rows } } : {});
const send = (chatId, text, opts) => chatId
  ? tg.sendMessage(tg.platformToken(), chatId, text, opts || {}).catch(e => { console.error('[IV] xabar ketmadi:', e.message); return null; })
  : Promise.resolve(null);

async function adminSay(agencyId, text) {
  try {
    const ag = await Restaurant.findOne({ id: agencyId }, 'telegram').lean();
    const chat = ag && ag.telegram && ag.telegram.adminChatId;
    if (chat) await send(chat, text);
  } catch (e) { /* jim */ }
}

async function partiesOf(iv) {
  const [client, cand] = await Promise.all([
    Client.findOne({ agencyId: iv.agencyId, id: iv.clientId }).lean(),
    Candidate.findOne({ restaurantId: iv.agencyId, id: iv.candidateId }, 'id fullName publicCode tgChatId tgState lang tgLang').lean()
  ]);
  return { client: client || {}, cand: cand || {} };
}
const reachable = c => !!(c && c.tgChatId && !['blocked', 'stopped'].includes(c.tgState));
const candName = c => c.fullName || c.publicCode || '—';

// Tanlovdagi holat: kontakt ochilgan yoki suhbat belgilangan bo'lishi kerak
async function itemOf(agencyId, shortlistId, candidateId, clientId) {
  const sl = await Shortlist.findOne({ agencyId, id: shortlistId, ...(clientId ? { clientId } : {}) }).lean();
  const it = sl && (sl.items || []).find(i => i.candidateId === candidateId);
  return { sl, it };
}

/** Tanlov elementini "suhbat" ga o'tkazadi (vaqt bilan). Yakuniy holatga tegmaydi. */
async function markItem(iv, at) {
  const now = new Date();
  const r = await Shortlist.updateOne(
    { agencyId: iv.agencyId, id: iv.shortlistId,
      items: { $elemMatch: { candidateId: iv.candidateId, state: { $in: ['revealed', 'interview'] } } } },
    { $set: { 'items.$.state': 'interview', 'items.$.interviewAt': at, updatedAt: now } });
  if (r.modifiedCount) {
    // Kanban oldinga (pipeline.STATE_TO_KANBAN: interview)
    try {
      const pipeline = require('../data/pipeline');
      const c = await Candidate.findOne({ restaurantId: iv.agencyId, id: iv.candidateId }, 'status').lean();
      if (c && pipeline.isForward(c.status, 'interview')) {
        await Candidate.updateOne({ restaurantId: iv.agencyId, id: iv.candidateId }, { $set: { status: 'interview', updatedAt: now } });
      }
    } catch (e) { /* kanban — ikkinchi darajali */ }
  }
}

// ── Nomzodga vaqtlar ──
function slotsKeyboard(iv, lang) {
  const rows = [];
  let cur = null, row = [];
  iv.slots.forEach((s, i) => {
    const day = local(s).d;
    if (cur !== null && day !== cur) { rows.push(row); row = []; }
    cur = day;
    row.push({ text: `${dayName(s, lang)} ${timeOf(s)}`, callback_data: cb('p', iv, i) });
  });
  if (row.length) rows.push(row);
  rows.push([{ text: T(lang, 'ivx.kNone'), callback_data: cb('x', iv) }]);
  return kb(rows);
}
function slotsText(iv, client, lang, again) {
  const days = [...new Set(iv.slots.map(s => `${dayName(s, lang)} — ${dateOf(s, lang)}`))];
  return [
    T(lang, again ? 'ivx.kOfferAgain' : 'ivx.kOffer', { c: client.name }),
    '', placeLines(iv, client, lang), '',
    T(lang, 'ivx.kPick'), ...days.map(d => '• ' + d)
  ].join('\n');
}

/**
 * Mijoz suhbatga chaqiradi.
 * @param mode 'pick' — nomzod botda tanlaydi | 'fixed' — aniq vaqt (at)
 */
async function offer({ agencyId, clientId, shortlistId, candidateId, mode = 'pick', at = null, prefs = null, address = '', now = new Date() }) {
  const client = await Client.findOne({ agencyId, id: clientId });
  if (!client) throw new Error('Mijoz topilmadi');
  const { sl, it } = await itemOf(agencyId, shortlistId, candidateId, clientId);
  if (!sl || !it) throw new Error('Tanlov yoki nomzod topilmadi');
  if (!['revealed', 'interview'].includes(it.state)) throw new Error('Bu nomzod uchun hali kontakt ochilmagan yoki qaror qabul qilingan');
  const cand = await Candidate.findOne({ restaurantId: agencyId, id: candidateId }, 'id fullName publicCode tgChatId tgState lang tgLang').lean();
  if (!reachable(cand)) throw Object.assign(new Error('Nomzod Telegramda emas — vaqtni telefonda kelishing'), { code: 'no_tg' });

  // Sozlama saqlanadi — keyingi safar so'ralmaydi
  if (prefs) {
    const p = cleanPrefs(Object.assign({}, prefs, { address: address || prefs.address || '' }));
    client.ivPrefs = p;
    await client.save();
  }
  const P = prefsOf(client.toObject());
  const addr = String(address || P.address || client.address || '').trim().slice(0, 200);

  // Shu nomzod bilan oldingi faol taklif bekor (yangi vaqt bilan almashtiriladi)
  await Interview.updateMany({ agencyId, shortlistId, candidateId, status: { $in: ACTIVE } },
    { $set: { status: 'cancelled', updatedAt: now } });

  const busy = (await Interview.find({ clientId, status: { $in: ['scheduled', 'confirmed'] }, at: { $gte: now } }, 'at').lean()).map(x => x.at);
  const doc = { id: newId(), agencyId, clientId, candidateId, shortlistId, vacancyId: sl.vacancyId || '',
    mode, address: addr, offeredAt: now, createdAt: now, updatedAt: now };

  const lang = langCa(cand);
  if (mode === 'fixed') {
    const d = at ? new Date(at) : null;
    if (!d || isNaN(d.getTime())) throw new Error('Suhbat sanasi noto\'g\'ri');
    if (d.getTime() < now.getTime() + 30 * MIN) throw new Error('Suhbat vaqti kamida 30 daqiqadan keyin bo\'lsin');
    Object.assign(doc, { status: 'scheduled', at: d, scheduledAt: now });
    const iv = await Interview.create(doc);
    await markItem(iv, d);
    await send(cand.tgChatId, [T(lang, 'ivx.kFixed', { c: client.name, w: whenOf(d, lang) }), '', placeLines(iv, client, lang), '', T(lang, 'ivx.kFixedQ')].join('\n'),
      kb([[{ text: T(lang, 'ivx.kYes'), callback_data: cb('y', iv) }, { text: T(lang, 'ivx.kNo'), callback_data: cb('n', iv) }]]));
    await adminSay(agencyId, `📅 ${client.name}: ${candName(cand)} — suhbat ${whenOf(d, 'uz')}`);
    return view(iv);
  }

  const slots = makeSlots(P, now, busy);
  if (!slots.length) throw new Error('Yaqin 7 kunda bo\'sh vaqt yo\'q — suhbat kunlari yoki soatlarini kengaytiring');
  Object.assign(doc, { status: 'offered', slots });
  const iv = await Interview.create(doc);
  await send(cand.tgChatId, slotsText(iv, client, lang), slotsKeyboard(iv, lang));
  return view(iv);
}

/** Mijoz bekor qiladi */
async function cancel({ agencyId, clientId, id, now = new Date() }) {
  const iv = await Interview.findOneAndUpdate({ agencyId, clientId, id, status: { $in: ACTIVE } },
    { $set: { status: 'cancelled', updatedAt: now } }, { new: true }).lean();
  if (!iv) throw new Error('Faol suhbat topilmadi');
  const { client, cand } = await partiesOf(iv);
  if (reachable(cand)) await send(cand.tgChatId, T(langCa(cand), 'ivx.kCancelled', { c: client.name }));
  return view(iv);
}

// ── Kredit qaytishi ("kelmagan nomzod uchun to'lamaysiz") ──
async function refundNoShow(iv, why) {
  const claimed = await Interview.findOneAndUpdate({ _id: iv._id, refundedAt: null },
    { $set: { refundedAt: new Date() } }, { new: true }).lean();
  if (!claimed) return null;
  try {
    const r = await require('./shortlist').refund({ agencyId: iv.agencyId, shortlistId: iv.shortlistId,
      candidateId: iv.candidateId, reason: 'no_show' });
    const { client, cand } = await partiesOf(iv);
    await adminSay(iv.agencyId, `↩️ ${client.name}: ${candName(cand)} — ${why}. Kredit qaytdi${r.credited ? '' : ' (yechilmagan edi)'}.`);
    return r;
  } catch (e) {
    // Qaytarib bo'lmadi (masalan allaqachon ishga olingan) — bayroqni tushiramiz
    await Interview.updateOne({ _id: iv._id }, { $set: { refundedAt: null } });
    console.error('[IV] kredit qaytmadi:', e.message);
    return null;
  }
}

// Mijozga "keyingi qadam" tugmasi — Mini App (Tanlovlar)
const cabBtn = (lang, appBase) => appBase
  ? [[{ text: T(lang, 'ivx.cOpen'), web_app: { url: `${appBase}/miniapp.html` } }]] : [];

// ── Bot tugmalari: iv:<op>:<id>[:<arg>] ──
const CB_RE = /^iv:([a-z]{1,2}):([A-Za-z0-9]{6,16})(?::([a-z0-9_]{1,20}))?$/;

/**
 * @returns {Promise<{ok:boolean, text:string, alert?:boolean, edit?:string}>}
 *   text — callback javobi, edit — xabar matni o'rniga (tugmalar olinadi)
 */
async function handleCallback({ data, chatId, appBase = '', now = new Date() }) {
  const m = CB_RE.exec(String(data || ''));
  if (!m) return { ok: false, text: '' };
  const [, op, id, arg] = m;
  const iv = await Interview.findOne({ id }).lean();
  if (!iv) return { ok: false, text: 'Topilmadi / Не найдено', alert: true };
  const { client, cand } = await partiesOf(iv);
  const isCand = String(cand.tgChatId || '') === String(chatId);
  const isClient = String(client.tgChatId || '') === String(chatId);
  const Lk = langCa(cand), Lc = langCl(client);
  const nm = candName(cand);

  // ── Nomzod ──
  if (['p', 'y', 'n', 'r', 'x', 'w', 'kg', 'km'].includes(op)) {
    if (!isCand) return { ok: false, text: T(Lk, 'ivx.notYours'), alert: true };

    if (op === 'p') {                                   // vaqt tanladi
      const at = iv.slots[+arg];
      if (iv.status !== 'offered' || !at) return { ok: false, text: T(Lk, 'ivx.kStale'), alert: true };
      if (new Date(at).getTime() < now.getTime() + 30 * MIN) {
        // Vaqt o'tib ketgan — yangi vaqtlar
        await reoffer(iv, client, cand, now, true);
        return { ok: true, text: T(Lk, 'ivx.kPast'), alert: true };
      }
      const taken = await Interview.exists({ clientId: iv.clientId, status: { $in: ['scheduled', 'confirmed'] },
        at: { $gt: new Date(new Date(at).getTime() - 30 * MIN), $lt: new Date(new Date(at).getTime() + 30 * MIN) }, id: { $ne: iv.id } });
      if (taken) { await reoffer(iv, client, cand, now, true); return { ok: true, text: T(Lk, 'ivx.kTaken'), alert: true }; }
      const up = await Interview.findOneAndUpdate({ _id: iv._id, status: 'offered' },
        { $set: { status: 'scheduled', at, scheduledAt: now, updatedAt: now } }, { new: true }).lean();
      if (!up) return { ok: false, text: T(Lk, 'ivx.kStale'), alert: true };
      await markItem(up, at);
      await send(client.tgChatId, T(Lc, 'ivx.cPicked', { n: nm, w: whenOf(at, Lc) }), kb(cabBtn(Lc, appBase)));
      await adminSay(iv.agencyId, `📅 ${client.name}: ${nm} — suhbat ${whenOf(at, 'uz')}`);
      return { ok: true, text: '✅', edit: [T(Lk, 'ivx.kBooked', { w: whenOf(at, Lk) }), '', placeLines(up, client, Lk), '', T(Lk, 'ivx.kWillRemind')].join('\n') };
    }

    if (op === 'y') {                                   // boraman
      if (!['scheduled', 'confirmed'].includes(iv.status)) return { ok: false, text: T(Lk, 'ivx.kStale'), alert: true };
      await Interview.updateOne({ _id: iv._id }, { $set: { status: 'confirmed', confirmedAt: iv.confirmedAt || now, updatedAt: now } });
      if (iv.status !== 'confirmed') await send(client.tgChatId, T(Lc, 'ivx.cConfirmed', { n: nm, w: whenOf(iv.at, Lc) }));
      return { ok: true, text: '✅', edit: [T(Lk, 'ivx.kConfirmed', { w: whenOf(iv.at, Lk) }), '', placeLines(iv, client, Lk)].join('\n'),
        keyboard: [[{ text: T(Lk, 'ivx.kOnWay'), callback_data: cb('w', iv) }]] };
    }

    if (op === 'n') {                                   // bora olmayman -> boshqa vaqt yoki umuman yo'q
      if (!ACTIVE.includes(iv.status)) return { ok: false, text: T(Lk, 'ivx.kStale'), alert: true };
      return { ok: true, text: '', edit: T(Lk, 'ivx.kWhyNo'),
        keyboard: [[{ text: T(Lk, 'ivx.kOther'), callback_data: cb('r', iv) }], [{ text: T(Lk, 'ivx.kNone'), callback_data: cb('x', iv) }]] };
    }

    if (op === 'r') {                                   // boshqa vaqt
      if (!ACTIVE.includes(iv.status)) return { ok: false, text: T(Lk, 'ivx.kStale'), alert: true };
      const ok = await reoffer(iv, client, cand, now, true);
      if (ok && iv.status !== 'offered') await send(client.tgChatId, T(Lc, 'ivx.cResched', { n: nm }));
      return { ok: true, text: ok ? '🕒' : T(Lk, 'ivx.kNoSlots'), alert: !ok, edit: ok ? T(Lk, 'ivx.kNewSent') : undefined };
    }

    if (op === 'x') {                                   // umuman bormayman
      const up = await Interview.findOneAndUpdate({ _id: iv._id, status: { $in: ACTIVE } },
        { $set: { status: 'declined', declinedAt: now, updatedAt: now } }, { new: true }).lean();
      if (!up) return { ok: false, text: T(Lk, 'ivx.kStale'), alert: true };
      await send(client.tgChatId, T(Lc, 'ivx.cDeclined', { n: nm }), kb(cabBtn(Lc, appBase)));
      await refundNoShow(up, 'nomzod bormasligini aytdi');
      return { ok: true, text: '', edit: T(Lk, 'ivx.kDeclinedOk') };
    }

    if (op === 'w') {                                   // yo'ldaman
      if (!['scheduled', 'confirmed'].includes(iv.status)) return { ok: false, text: T(Lk, 'ivx.kStale'), alert: true };
      const first = !iv.onWayAt;
      await Interview.updateOne({ _id: iv._id }, { $set: { onWayAt: iv.onWayAt || now, status: 'confirmed', confirmedAt: iv.confirmedAt || now, updatedAt: now } });
      if (first) await send(client.tgChatId, T(Lc, 'ivx.cOnWay', { n: nm }));
      return { ok: true, text: T(Lk, 'ivx.kOnWayOk'), edit: T(Lk, 'ivx.kOnWayOk') + '\n\n' + placeLines(iv, client, Lk) };
    }

    if (op === 'kg' || op === 'km') {                   // bordim / bormadim
      if (iv.candSaid) return { ok: true, text: '✓' };
      const said = op === 'kg' ? 'went' : 'missed';
      const up = await Interview.findOneAndUpdate({ _id: iv._id, candSaid: '' }, { $set: { candSaid: said, updatedAt: now } }, { new: true }).lean();
      if (!up) return { ok: true, text: '✓' };
      await settle(up, appBase);
      return { ok: true, text: '✓', edit: T(Lk, said === 'went' ? 'ivx.kWentOk' : 'ivx.kMissedOk') };
    }
  }

  // ── Mijoz ──
  if (['cc', 'cn', 'h1', 'h0', 'hn'].includes(op)) {
    if (!isClient) return { ok: false, text: T(Lc, 'ivx.notYours'), alert: true };
    if (op === 'cc' || op === 'cn') return clientSays(iv, op === 'cc', { appBase, now, fromBot: true });
    if (op === 'h1') {
      try {
        await require('./shortlist').setClientState({ agencyId: iv.agencyId, shortlistId: iv.shortlistId,
          clientId: iv.clientId, candidateId: iv.candidateId, state: 'hired' });
        await adminSay(iv.agencyId, `✅ ${client.name}: ${nm} ISHGA OLINDI`);
        return { ok: true, text: '🎉', edit: T(Lc, 'ivx.cHiredOk', { n: nm }) };
      } catch (e) { return { ok: false, text: I18N.errText(Lc, e.message), alert: true }; }
    }
    if (op === 'h0') return { ok: true, text: '', edit: T(Lc, 'ivx.cThinkOk') };
    if (op === 'hn') {
      const reason = ['experience', 'language', 'salary_ask', 'other'].includes(arg) ? arg : 'other';
      try {
        await require('./shortlist').setClientState({ agencyId: iv.agencyId, shortlistId: iv.shortlistId,
          clientId: iv.clientId, candidateId: iv.candidateId, state: 'not_fit', reason });
        return { ok: true, text: '✓', edit: T(Lc, 'ivx.cNotFitOk') };
      } catch (e) { return { ok: false, text: I18N.errText(Lc, e.message), alert: true }; }
    }
  }
  return { ok: false, text: '' };
}

/** Yangi vaqtlar (boshqa vaqt / o'tib ketgan / band) */
async function reoffer(iv, client, cand, now, again) {
  const busy = (await Interview.find({ clientId: iv.clientId, status: { $in: ['scheduled', 'confirmed'] }, at: { $gte: now }, id: { $ne: iv.id } }, 'at').lean()).map(x => x.at);
  const slots = makeSlots(prefsOf(client), now, busy);
  if (!slots.length) return false;
  const up = await Interview.findOneAndUpdate({ _id: iv._id, status: { $in: ACTIVE } },
    { $set: { status: 'offered', slots, at: null, scheduledAt: null, confirmedAt: null, offeredAt: now,
      offerRemindAt: null, r24At: null, r2At: null, warnAt: null, updatedAt: now } }, { new: true }).lean();
  if (!up) return false;
  const lang = langCa(cand);
  await send(cand.tgChatId, slotsText(up, client, lang, again), slotsKeyboard(up, lang));
  return true;
}

/**
 * Mijoz "keldi"/"kelmadi" (botdan yoki Mini App'dan).
 * Kelmadi + nomzod "bordim" demagan — kredit qaytadi; "bordim" degan — conflict.
 */
async function clientSays(iv, came, { appBase = '', now = new Date(), fromBot = false } = {}) {
  const { client, cand } = await partiesOf(iv);
  const Lc = langCl(client), nm = candName(cand);
  if (iv.clientSaid) return { ok: true, text: '✓' };             // allaqachon javob bergan
  if (!['scheduled', 'confirmed'].includes(iv.status) || !iv.at || new Date(iv.at).getTime() > now.getTime() + 15 * MIN) {
    return { ok: false, text: T(Lc, 'ivx.cTooEarly'), alert: true };
  }
  const up = await Interview.findOneAndUpdate({ _id: iv._id, clientSaid: '' },
    { $set: { clientSaid: came ? 'came' : 'noshow', updatedAt: now } }, { new: true }).lean();
  if (!up) return { ok: true, text: '✓' };
  const res = await settle(up, appBase);
  if (came) {
    return { ok: true, text: '✓', edit: T(Lc, 'ivx.cHireQ', { n: nm }), keyboard: [
      [{ text: T(Lc, 'ivx.cHireYes'), callback_data: cb('h1', up) }, { text: T(Lc, 'ivx.cHireThink'), callback_data: cb('h0', up) }],
      [{ text: T(Lc, 'ivx.cNoExp'), callback_data: cb('hn', up, 'experience') }, { text: T(Lc, 'ivx.cNoSalary'), callback_data: cb('hn', up, 'salary_ask') }],
      [{ text: T(Lc, 'ivx.cNoOther'), callback_data: cb('hn', up, 'other') }]
    ], status: 'done' };
  }
  return { ok: true, text: '✓', edit: T(Lc, res === 'conflict' ? 'ivx.cConflict' : 'ivx.cNoShowOk', { n: nm }), status: res };
}

/** Ikki tomon javobidan natija. Takror xavfsiz. */
async function settle(iv, appBase = '') {
  const { client, cand } = await partiesOf(iv);
  if (iv.clientSaid === 'came' || (iv.candSaid === 'went' && !iv.clientSaid)) {
    if (iv.clientSaid === 'came') await Interview.updateOne({ _id: iv._id, status: { $in: ['scheduled', 'confirmed', 'noshow'] } }, { $set: { status: 'done', updatedAt: new Date() } });
    return 'done';
  }
  if (iv.clientSaid === 'noshow' && iv.candSaid === 'went') {
    const up = await Interview.findOneAndUpdate({ _id: iv._id, status: { $ne: 'conflict' } }, { $set: { status: 'conflict', updatedAt: new Date() } });
    if (up) await adminSay(iv.agencyId, `⚠️ ${client.name}: «${candName(cand)} kelmadi» dedi, nomzod esa «bordim» dedi. Kredit qaytmadi — tekshiring.`);
    return 'conflict';
  }
  if (iv.clientSaid === 'noshow' || iv.candSaid === 'missed') {
    await Interview.updateOne({ _id: iv._id }, { $set: { status: 'noshow', updatedAt: new Date() } });
    if (iv.refundedAt) return 'noshow';
    const r = await refundNoShow(iv, iv.candSaid === 'missed' ? 'nomzod bormaganini aytdi' : 'suhbatga kelmadi');
    if (r && iv.candSaid === 'missed' && !iv.clientSaid) {
      const Lc = langCl(client);
      await send(client.tgChatId, T(Lc, 'ivx.cNoShowCand', { n: candName(cand) }), kb(cabBtn(Lc, appBase)));
    }
    return 'noshow';
  }
  return '';
}

// ── Rejali qism ──
async function claim(filter, set) {
  return Interview.findOneAndUpdate(filter, { $set: Object.assign({ updatedAt: new Date() }, set) }, { new: true }).lean();
}
const daytime = now => { const h = local(now).hh; return h >= 9 && h < 21; };

async function tick(now = new Date(), { appBase = process.env.APP_URL || '' } = {}) {
  const base = String(appBase || '').replace(/\/+$/, '');
  const out = { offerRemind: 0, expired: 0, r24: 0, r2: 0, warn: 0, asked: 0, reasked: 0 };
  const t = now.getTime();

  // 1. 24 soatda tanlamadi — yopiladi, kredit qaytadi. Eslatmadan OLDIN:
  //    aks holda eslatma eskirgan taklifni "yangilab" muddatni cho'zardi.
  for (const iv of await Interview.find({ status: 'offered', offeredAt: { $lte: new Date(t - 24 * H) } }).limit(50).lean()) {
    const up = await claim({ _id: iv._id, status: 'offered', offeredAt: { $lte: new Date(t - 24 * H) } }, { status: 'expired' });
    if (!up) continue;
    const { client, cand } = await partiesOf(up);
    const Lc = langCl(client);
    await send(client.tgChatId, T(Lc, 'ivx.cExpired', { n: candName(cand) }), kb(cabBtn(Lc, base)));
    await refundNoShow(up, 'vaqt tanlamadi (24 soat)');
    out.expired++;
  }

  // 2. Vaqt tanlamagan nomzodga bitta eslatma (4 soatdan keyin, kunduzi).
  //    Muddat (offeredAt) o'zgarmaydi — 24 soat birinchi taklifdan sanaladi.
  if (daytime(now)) {
    for (const iv of await Interview.find({ status: 'offered', offerRemindAt: null, offeredAt: { $lte: new Date(t - 4 * H) } }).limit(50).lean()) {
      const up = await claim({ _id: iv._id, status: 'offered', offerRemindAt: null }, { offerRemindAt: now });
      if (!up) continue;
      const { client, cand } = await partiesOf(up);
      // Eskirgan vaqtlar bo'lsa — yangilari
      if (up.slots.some(s => new Date(s).getTime() < t + LEAD)) await reoffer(up, client, cand, now, true);
      else if (reachable(cand)) await send(cand.tgChatId, slotsText(up, client, langCa(cand), true), slotsKeyboard(up, langCa(cand)));
      await Interview.updateOne({ _id: up._id }, { $set: { offerRemindAt: now, offeredAt: up.offeredAt } });
      out.offerRemind++;
    }
  }

  // 3. Bir kun oldin (oldindan, kamida 25 soat avval belgilangan bo'lsa)
  for (const iv of await Interview.find({ status: { $in: ['scheduled', 'confirmed'] }, r24At: null,
    at: { $gt: new Date(t + 3 * H), $lte: new Date(t + 24 * H) } }).limit(50).lean()) {
    if (iv.scheduledAt && new Date(iv.at).getTime() - new Date(iv.scheduledAt).getTime() < 25 * H) {
      await Interview.updateOne({ _id: iv._id }, { $set: { r24At: now } });     // yaqinda belgilangan — kerak emas
      continue;
    }
    const up = await claim({ _id: iv._id, r24At: null }, { r24At: now });
    if (!up) continue;
    const { client, cand } = await partiesOf(up);
    const L = langCa(cand);
    if (reachable(cand)) await send(cand.tgChatId, [T(L, 'ivx.kR24', { w: whenOf(up.at, L) }), '', placeLines(up, client, L)].join('\n'),
      kb([[{ text: T(L, 'ivx.kYes'), callback_data: cb('y', up) }, { text: T(L, 'ivx.kNo'), callback_data: cb('n', up) }]]));
    out.r24++;
  }

  // 4. 2 soat oldin
  for (const iv of await Interview.find({ status: { $in: ['scheduled', 'confirmed'] }, r2At: null,
    at: { $gt: now, $lte: new Date(t + 2 * H) } }).limit(50).lean()) {
    const up = await claim({ _id: iv._id, r2At: null }, { r2At: now });
    if (!up) continue;
    const { client, cand } = await partiesOf(up);
    const L = langCa(cand);
    const rows = up.status === 'confirmed'
      ? [[{ text: T(L, 'ivx.kOnWay'), callback_data: cb('w', up) }], [{ text: T(L, 'ivx.kNo'), callback_data: cb('n', up) }]]
      : [[{ text: T(L, 'ivx.kYes'), callback_data: cb('y', up) }, { text: T(L, 'ivx.kNo'), callback_data: cb('n', up) }]];
    if (reachable(cand)) await send(cand.tgChatId, [T(L, 'ivx.kR2', { t: timeOf(up.at) }), '', placeLines(up, client, L)].join('\n'), kb(rows));
    out.r2++;
  }

  // 5. 30 daqiqa qoldi, nomzod tasdiqlamagan — mijozga ogohlantirish
  for (const iv of await Interview.find({ status: 'scheduled', warnAt: null, r2At: { $ne: null },
    at: { $gt: now, $lte: new Date(t + 30 * MIN) } }).limit(50).lean()) {
    const up = await claim({ _id: iv._id, status: 'scheduled', warnAt: null }, { warnAt: now });
    if (!up) continue;
    const { client, cand } = await partiesOf(up);
    await send(client.tgChatId, T(langCl(client), 'ivx.cWarn', { n: candName(cand), t: timeOf(up.at) }));
    out.warn++;
  }

  // 6. Suhbatdan 1 soat keyin — ikki tomondan "keldimi?"
  for (const iv of await Interview.find({ status: { $in: ['scheduled', 'confirmed'] }, askedAt: null,
    at: { $lte: new Date(t - H) } }).limit(50).lean()) {
    const up = await claim({ _id: iv._id, askedAt: null }, { askedAt: now });
    if (!up) continue;
    const { client, cand } = await partiesOf(up);
    const Lc = langCl(client), Lk = langCa(cand), nm = candName(cand);
    await send(client.tgChatId, T(Lc, 'ivx.cAsk', { n: nm, w: whenOf(up.at, Lc) }),
      kb([[{ text: T(Lc, 'ivx.cCame'), callback_data: cb('cc', up) }, { text: T(Lc, 'ivx.cNoShow'), callback_data: cb('cn', up) }]]));
    if (reachable(cand)) await send(cand.tgChatId, T(Lk, 'ivx.kAsk', { c: client.name }),
      kb([[{ text: T(Lk, 'ivx.kWent'), callback_data: cb('kg', up) }, { text: T(Lk, 'ivx.kMissed'), callback_data: cb('km', up) }]]));
    out.asked++;
  }

  // 7. Mijoz javob bermadi — ertasi kuni bir marta qayta (kunduzi)
  if (daytime(now)) {
    for (const iv of await Interview.find({ status: { $in: ['scheduled', 'confirmed'] }, clientSaid: '', reaskAt: null,
      askedAt: { $lte: new Date(t - 20 * H) } }).limit(50).lean()) {
      const up = await claim({ _id: iv._id, clientSaid: '', reaskAt: null }, { reaskAt: now });
      if (!up) continue;
      const { client, cand } = await partiesOf(up);
      const Lc = langCl(client);
      await send(client.tgChatId, T(Lc, 'ivx.cAsk', { n: candName(cand), w: whenOf(up.at, Lc) }),
        kb([[{ text: T(Lc, 'ivx.cCame'), callback_data: cb('cc', up) }, { text: T(Lc, 'ivx.cNoShow'), callback_data: cb('cn', up) }]]));
      out.reasked++;
    }
  }
  return out;
}

// ── Mini App uchun ko'rinish ──
function view(iv) {
  if (!iv) return null;
  return { id: iv.id, status: iv.status, mode: iv.mode, at: iv.at, slots: (iv.slots || []).length,
    confirmed: !!iv.confirmedAt, onWay: !!iv.onWayAt, clientSaid: iv.clientSaid || '', candSaid: iv.candSaid || '',
    refunded: !!iv.refundedAt, address: iv.address || '',
    canAnswer: ['scheduled', 'confirmed'].includes(iv.status) && !iv.clientSaid && !!iv.at && new Date(iv.at).getTime() <= Date.now() + 15 * MIN };
}

/** Tanlov elementlari uchun oxirgi suhbatlar: { "<shortlistId>:<candidateId>": view } */
async function latestFor(agencyId, clientId, pairs) {
  if (!pairs.length) return {};
  const rows = await Interview.find({ agencyId, clientId, shortlistId: { $in: [...new Set(pairs.map(p => p[0]))] },
    status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean();
  const out = {};
  for (const r of rows) { const k = r.shortlistId + ':' + r.candidateId; if (!out[k]) out[k] = view(r); }
  return out;
}

module.exports = { offer, cancel, handleCallback, clientSays, tick, makeSlots, cleanPrefs, prefsOf, latestFor, view,
  reachable, CB_RE, DEFAULT_PREFS, ACTIVE };
