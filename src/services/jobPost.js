// ── VAKANSIYA KANALGA O'ZI CHIQADI + MOS NOMZODLARGA XABAR ──
// Anas e'lonni qo'lda tashlamasin. Vakansiya e'lon qilinsa (ochiq, listed,
// sinov emas) bot uni agentlik kanaliga (Restaurant.telegram.jobChannel)
// anketa havolasi bilan joylaydi — havola v_<uuid>_vakuz: nomzod anketani
// to'ldirsa, ariza shu vakansiyaga tushadi (services/survey). Shu bilan birga
// bazadagi mos nomzodlarga (Telegramdagi, ish qidirayotgan, shu lavozim)
// bot o'zi "sizga mos ish" deb yozadi.
//
// Qoidalar:
//   - Restoran nomi postda YO'Q (forCandidate kabi) — vositachilik saqlanadi.
//   - Avtomatik faqat kanal sozlangandan keyingi vakansiyalar (jobChannelSince):
//     eski 33 ta import bir zumda kanalni to'ldirmasin. Eskilari — paneldan qo'lda.
//   - Kunduzi (09-21), bir tick'da 3 tagacha (kanal "spam" bo'lmasin).
//   - Vakansiya yopilsa / e'londan olinsa — postga "Yopildi", tugma olinadi.
//   - Nomzodga 20 soatda ko'pi bilan bitta xabar, "🔕 kerak emas" tugmasi.
// Rejali qism — tick() (server.js taymeri). Takror xavfsiz: atomik bayroqlar.

const Vacancy = require('../models/Vacancy');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const Application = require('../models/Application');
const Restaurant = require('../models/Restaurant');
const tg = require('./telegram');
const vac = require('./vacancy');
const matchScore = require('./matchScore');
const { guessRole } = require('../data/roles');
const I18N = require('../../public/js/th-i18n');

const H = 3600e3;
const PER_TICK = 3;
const ALERT_MAX = 40, ALERT_GAP = 20 * H, ALERT_MIN_SCORE = 55;
const T = (lang, k, v) => I18N.t(lang, k, v);
const html = s => String(s == null ? '' : s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
const daytime = now => { const h = (now.getUTCHours() + 5) % 24; return h >= 9 && h < 21; };

/** Kanal: panel sozlamasi, bo'lmasa JOB_CHANNEL muhit o'zgaruvchisi */
const channelOf = ag => String((ag && ag.telegram && ag.telegram.jobChannel) || process.env.JOB_CHANNEL || '').trim();

/** "@kanal", "t.me/kanal", "https://t.me/kanal", "-100…" -> chat_id */
function normChannel(s) {
  const t = String(s || '').trim();
  if (/^-100\d{6,}$/.test(t)) return t;
  const m = /^(?:https?:\/\/)?(?:t\.me\/|@)?([A-Za-z][A-Za-z0-9_]{3,31})$/.exec(t);
  return m ? '@' + m[1] : '';
}

/** Bot kanalda post qila oladimi? @returns {ok, chatId, title, username, error} */
async function checkChannel(input) {
  const chat = normChannel(input);
  if (!chat) return { ok: false, error: 'Kanal manzili noto\'g\'ri: @kanal yoki t.me/kanal' };
  const token = tg.platformToken();
  try {
    const [c, me] = await Promise.all([tg.getChat(token, chat), tg.getMe(token)]);
    const m = await tg.getChatMember(token, c.id, me.id);
    const canPost = m && (m.status === 'creator' || (m.status === 'administrator' && (c.type !== 'channel' || m.can_post_messages)));
    return { ok: !!canPost, chatId: c.username ? '@' + c.username : String(c.id), title: c.title || '', username: c.username || '',
      error: canPost ? '' : 'Bot kanalda "Xabar joylash" huquqli admin emas' };
  } catch (e) {
    return { ok: false, error: 'Kanal topilmadi yoki bot unga qo\'shilmagan' };
  }
}

/** Post matni (HTML) — o'zbekcha, restoran nomisiz */
function postText(v, client, { closed = false } = {}) {
  const c = vac.forCandidate(v, client, 'uz');
  const where = [c.where || 'Toshkent', c.landmark].filter(Boolean).join(' · ');
  const head = [closed ? '❌ <b>YOPILDI</b>' : '', `<b>${html(c.title)}</b>`, c.venue ? html(c.venue) : ''];
  const facts = [
    `📍 ${html(where)}`,
    `💰 ${html(c.salaryText || T('uz', 'cb.noSal'))}${c.payoutText ? ' · ' + html(c.payoutText) : ''}`,
    c.schedule || c.shift ? `🕒 ${html([c.schedule, c.shift ? T('uz', 'shift.' + c.shift) : ''].filter(Boolean).join(' · '))}` : '',
    (c.perkLabels || []).length ? `✅ ${html(c.perkLabels.join(' · '))}` : ''
  ];
  const list = (title, xs) => (xs || []).length ? `<b>${title}:</b>\n` + xs.slice(0, 3).map(d => '• ' + html(d)).join('\n') : '';
  return [
    head.filter(Boolean).join('\n'),
    facts.filter(Boolean).join('\n'),
    c.hook ? html(c.hook) : '',
    list('Vazifalar', c.duties),
    list('Talablar', c.requirements),
    closed ? T('uz', 'jp.closedNote') : T('uz', 'jp.howTo')
  ].filter(Boolean).join('\n\n');
}

async function botLink(v) {
  const bot = (await tg.platformUsername().catch(() => '')) || 'TalentHubUzBot';
  return `https://t.me/${bot}?start=v_${v.id}_vakuz`;
}

/**
 * Kanalga joylash (tick yoki paneldagi "Kanalga joylash" — u vaqt/sozlamaga qaramaydi).
 * @returns {{ ok, url?, already?, alerted?, error? }}
 */
async function post(v, { appBase = process.env.APP_URL || '', now = new Date() } = {}) {
  const ag = await Restaurant.findOne({ id: v.agencyId }, 'telegram').lean();
  const chat = normChannel(channelOf(ag));
  if (!chat) return { ok: false, error: 'Kanal sozlanmagan' };
  if (v.status !== 'open' || v.listed === false) return { ok: false, error: 'Vakansiya ochiq va e\'lon qilingan bo\'lishi kerak' };
  if (v.isTest) return { ok: false, error: 'Sinov vakansiyasi kanalga chiqmaydi' };

  // Band qilamiz — ikki tick bir vakansiyani ikki marta joylamasin
  const claimed = await Vacancy.findOneAndUpdate(
    { agencyId: v.agencyId, id: v.id, 'channelPost.postedAt': null },
    { $set: { 'channelPost.postedAt': now, 'channelPost.chatId': chat } }, { new: true }).lean();
  if (!claimed) return { ok: true, already: true, url: (v.channelPost || {}).url || '' };

  const client = await Client.findOne({ agencyId: v.agencyId, id: v.clientId }).lean();
  try {
    const msg = await tg.sendMessage(tg.platformToken(), chat, postText(claimed, client), {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: T('uz', 'jp.btn'), url: await botLink(claimed) }]] }
    });
    const username = msg && msg.chat && msg.chat.username;
    const url = username ? `https://t.me/${username}/${msg.message_id}` : '';
    await Vacancy.updateOne({ agencyId: v.agencyId, id: v.id },
      { $set: { 'channelPost.messageId': msg.message_id, 'channelPost.url': url, 'channelPost.chatId': String((msg.chat && msg.chat.id) || chat) } });

    const alerted = await alertCandidates(claimed, { appBase, now });
    // Mijozga — vakansiyasi kanalga chiqdi va nechta nomzodga yozildi
    if (client && client.tgChatId && client.status === 'active' && !client.isTest) {
      const L = I18N.resolve(client.lang, client.tgLang);
      await tg.sendMessage(tg.platformToken(), client.tgChatId,
        T(L, 'jp.clientPosted', { v: vac.titleFor(claimed, L), n: alerted }),
        url ? { reply_markup: { inline_keyboard: [[{ text: T(L, 'jp.clientSee'), url }]] } } : {}).catch(() => {});
    }
    return { ok: true, url, alerted };
  } catch (e) {
    // Joylanmadi — bayroqni qaytaramiz, keyingi tick qayta urinadi
    await Vacancy.updateOne({ agencyId: v.agencyId, id: v.id }, { $set: { 'channelPost.postedAt': null } });
    console.error('[JP] kanalga chiqmadi:', e.message);
    return { ok: false, error: 'Kanalga joylab bo\'lmadi: ' + e.message };
  }
}

/** Yopilgan / e'londan olingan vakansiya posti — "Yopildi", tugmasiz */
async function markClosed(v) {
  const cp = v.channelPost || {};
  if (!cp.messageId || cp.closedAt) return false;
  const up = await Vacancy.findOneAndUpdate({ agencyId: v.agencyId, id: v.id, 'channelPost.closedAt': null },
    { $set: { 'channelPost.closedAt': new Date() } }, { new: true }).lean();
  if (!up) return false;
  const client = await Client.findOne({ agencyId: v.agencyId, id: v.clientId }).lean();
  await tg.editMessageText(tg.platformToken(), cp.chatId, cp.messageId, postText(up, client, { closed: true }), { parse_mode: 'HTML' })
    .catch(e => console.error('[JP] postni yopib bo\'lmadi:', e.message));
  return true;
}

/**
 * Bazadagi mos nomzodlarga "sizga mos ish" xabari.
 * Faqat: Telegramda, ish qidirayotgan (not_looking emas), xabarni o'chirmagan,
 * sinov emas, shu lavozim, shu vakansiyaga ariza bermagan, 20 soatda
 * xabar olmagan, moslik bali >= 55. Ko'pi bilan 40 ta, eng moslari.
 */
async function alertCandidates(v, { appBase = process.env.APP_URL || '', now = new Date() } = {}) {
  if (!v.role) return 0;
  const base = String(appBase || '').replace(/\/+$/, '');
  const rows = await Candidate.find({
    restaurantId: v.agencyId, tgChatId: { $nin: ['', null] }, tgState: { $nin: ['blocked', 'stopped'] },
    jobAlertsOff: { $ne: true }, jobStatus: { $ne: 'not_looking' }, isTest: { $ne: true },
    $and: [{ $or: [{ jobAlertAt: null }, { jobAlertAt: { $lt: new Date(now.getTime() - ALERT_GAP) } }] }]
  }, 'id role desiredPosition experienceYears experienceMonths salaryExpectation shift location tgChatId lang tgLang').lean();
  const applied = new Set((await Application.find({ vacancyId: v.id }, 'candidateId').lean()).map(a => a.candidateId));
  const ranked = rows
    .filter(c => !applied.has(c.id) && ((c.role && c.role !== 'boshqa' ? c.role : guessRole(c.desiredPosition || '')) === v.role))
    .map(c => ({ c, s: matchScore.score(c, v).score }))
    .filter(x => x.s >= ALERT_MIN_SCORE)
    .sort((a, b) => b.s - a.s)
    .slice(0, ALERT_MAX);

  const client = await Client.findOne({ agencyId: v.agencyId, id: v.clientId }, 'id location status').lean();
  let n = 0;
  for (const { c } of ranked) {
    // Atomik: shu oraliqda boshqa vakansiya xabari ketgan bo'lsa — o'tkazamiz
    const ok = await Candidate.updateOne({ _id: c._id, $or: [{ jobAlertAt: null }, { jobAlertAt: { $lt: new Date(now.getTime() - ALERT_GAP) } }] },
      { $set: { jobAlertAt: now } });
    if (!ok.modifiedCount) continue;
    const L = I18N.resolve(c.lang, c.tgLang);
    const fc = vac.forCandidate(v, client, L);
    const line = [fc.title, [fc.where, fc.landmark].filter(Boolean).join(' · '), fc.salaryText].filter(Boolean).join('\n');
    const rows = [];
    if (base) rows.push([{ text: T(L, 'jp.aOpen'), web_app: { url: `${base}/profil.html#v=${v.id}` } }]);
    rows.push([{ text: T(L, 'jp.aOff'), callback_data: 'ja:off' }]);
    const sent = await tg.sendMessage(tg.platformToken(), c.tgChatId, T(L, 'jp.alert', { x: line }), { reply_markup: { inline_keyboard: rows } })
      .catch(e => { console.error('[JP] nomzodga ketmadi:', e.message); return null; });
    if (sent) n++;
  }
  if (n) await Vacancy.updateOne({ agencyId: v.agencyId, id: v.id }, { $set: { alertedAt: now }, $inc: { alertedN: n } });
  return n;
}

/** "🔕 Bunday xabarlar kerak emas" */
async function alertsOff(chatId) {
  const r = await Candidate.updateMany({ tgChatId: String(chatId) }, { $set: { jobAlertsOff: true } });
  return r.modifiedCount > 0 || r.matchedCount > 0;
}

/** Rejali: yangi e'lonlarni joylash va yopilganlarni belgilash */
async function tick(now = new Date(), { appBase = process.env.APP_URL || '' } = {}) {
  const out = { posted: 0, closed: 0, alerted: 0 };
  // Yopilganlar — kechasi ham (eskirgan e'lon osilib turmasin)
  const toClose = await Vacancy.find({ 'channelPost.messageId': { $gt: 0 }, 'channelPost.closedAt': null,
    $or: [{ status: { $ne: 'open' } }, { listed: false }] }).limit(20).lean();
  for (const v of toClose) if (await markClosed(v)) out.closed++;

  if (!daytime(now)) return out;
  const ags = await Restaurant.find({ 'telegram.jobChannel': { $nin: ['', null] }, 'telegram.jobChannelAuto': { $ne: false },
    'telegram.jobChannelSince': { $ne: null } }, 'id telegram').lean();
  for (const ag of ags) {
    const since = ag.telegram.jobChannelSince;
    const rows = await Vacancy.find({ agencyId: ag.id, status: 'open', listed: { $ne: false }, isTest: { $ne: true },
      'channelPost.postedAt': null, $or: [{ createdAt: { $gte: since } }, { confirmedAt: { $gte: since } }] })
      .sort({ createdAt: 1 }).limit(PER_TICK - out.posted).lean();
    for (const v of rows) {
      const r = await post(v, { appBase, now });
      if (r.ok && !r.already) { out.posted++; out.alerted += r.alerted || 0; }
    }
    if (out.posted >= PER_TICK) break;
  }
  return out;
}

module.exports = { post, markClosed, alertCandidates, alertsOff, tick, checkChannel, normChannel, postText, channelOf };
