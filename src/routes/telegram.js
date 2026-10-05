// ── TELEGRAM BOT ─────────────────────────────────────────────
// BITTA platforma boti (TalentHub) barcha mijoz restoranlarga xizmat qiladi.
// Token va webhook siri muhit o'zgaruvchilarida — bazada saqlanmaydi va
// hech qanday API javobida chiqmaydi.
//
// Har restoranning O'Z admini bor: nomzod javobi o'sha nomzod tegishli
// restoran adminiga boradi. Ya'ni bot bitta, adminlar ko'p.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Restaurant = require('../models/Restaurant');
const Candidate = require('../models/Candidate');
const BotMessage = require('../models/BotMessage');
const tg = require('../services/telegram');
const relay = require('../services/botRelay');
const outreach = require('../services/outreach');
const candidateSearch = require('../services/candidateSearch');

const router = express.Router();
const guard = auth(['restaurant']);

// Render bepul tarifda uxlab qolgach Telegram update'ni QAYTA yuboradi.
// update_id'ni eslab qolamiz — bir xil xabar ikki marta qayta ishlanmasin.
const seenUpdates = new Set();
function alreadySeen(id) {
  if (seenUpdates.has(id)) return true;
  seenUpdates.add(id);
  if (seenUpdates.size > 1000) {
    for (const k of seenUpdates) { seenUpdates.delete(k); if (seenUpdates.size <= 800) break; }
  }
  return false;
}

function publicBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

// ══ 1. WEBHOOK ══════════════════════════════════════════════

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.json({ ok: true })   // Telegram'ga 429 bermaymiz
});

router.post('/webhook/:secret', webhookLimiter, asyncHandler(async (req, res) => {
  // Telegram'ga DOIM 200. Aks holda u xabarni qayta-qayta yuboraveradi.
  res.json({ ok: true });

  try {
    const secret = tg.platformSecret();
    if (!secret || req.params.secret !== secret) return;
    if (req.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return;

    const update = req.body || {};
    if (update.update_id != null && alreadySeen(update.update_id)) return;

    const msg = update.message;
    if (!msg || !msg.chat) return;

    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    const voice = msg.voice || msg.audio;   // ovozli xabar yoki audio fayl
    if (!text && !voice) return;
    const token = tg.platformToken();

    // ── /start <payload> ──
    if (text.startsWith('/start')) {
      const payload = text.slice(6).trim();

      if (!payload) {
        await tg.sendMessage(token, chatId,
          'Salom! Bu TalentHub HR boti.\n\nBog\'lanish uchun sizga yuborilgan havoladan kiring.');
        return;
      }

      // Admin o'zini bog'layapti — token barcha restoranlar bo'ylab qidiriladi
      if (payload.startsWith('admin_')) {
        const linkToken = payload.slice(6);
        const r = linkToken && await Restaurant.findOne({ 'telegram.adminLinkToken': linkToken, active: true });
        if (!r) {
          await tg.sendMessage(token, chatId, 'Havola eskirgan. Admin panelidan yangisini oling.');
          return;
        }
        r.telegram.adminChatId = chatId;
        r.telegram.adminLinkToken = '';          // bir martalik
        r.telegram.enabled = true;
        r.telegram.connectedAt = new Date();
        await r.save();
        await tg.sendMessage(token, chatId,
          `Ulandi — ${r.name}.\n\nEndi nomzodlarning javoblari shu yerga keladi. ` +
          `Javob berish uchun nomzod xabariga reply qiling.`);
        return;
      }

      // Nomzod — token global unikal (22 belgi tasodifiy)
      const cand = await Candidate.findOne({ tgInviteToken: payload });
      if (!cand) {
        await tg.sendMessage(token, chatId, 'Havola eskirgan yoki ishlatilgan. HR bilan bog\'laning.');
        return;
      }
      const rest = await Restaurant.findOne({ id: cand.restaurantId });
      if (!rest) return;

      cand.tgChatId      = chatId;
      cand.tgUsername    = (msg.from && msg.from.username) || '';
      cand.tgState       = 'linked';
      cand.tgLinkedAt    = new Date();
      cand.tgInviteToken = '';                   // bir martalik — kuydiriladi
      cand.updatedAt     = new Date();
      await cand.save();

      await tg.sendMessage(token, chatId,
        `Assalomu alaykum, ${relay.displayName(cand)}!\n\n` +
        `${rest.name} HR bo'limiga xush kelibsiz. Suhbat vaqti va ` +
        `savollaringiz bo'yicha shu yerda yozishamiz.`);

      await relay.logMsg({
        restaurantId: rest.id, candidateId: cand.id,
        direction: 'in', kind: 'system', sentBy: 'system',
        text: 'Nomzod Telegramga ulandi'
      });

      if (rest.telegram && rest.telegram.adminChatId) {
        await tg.sendMessage(token, rest.telegram.adminChatId,
          `${rest.name} · ${relay.displayName(cand)} Telegramga ulandi.`);
      }
      return;
    }

    // ── /stop — yozishmadan chiqish ──
    if (text === '/stop') {
      const cand = await Candidate.findOne({ tgChatId: chatId });
      if (cand) {
        cand.tgState = 'stopped';
        await cand.save();
        await tg.sendMessage(token, chatId, 'Siz yozishmadan chiqdingiz. Boshqa xabar yubormaymiz.');
      }
      return;
    }

    // ── Admin chati ──
    // reply bo'lsa -> nomzodga javob;  reply bo'lmasa -> nomzod qidiruvi
    const adminRest = await Restaurant.findOne({ 'telegram.adminChatId': chatId, active: true });
    if (adminRest) {
      const replyTo = msg.reply_to_message && msg.reply_to_message.message_id;
      if (!replyTo) {
        await handleSearch(adminRest, chatId, { text, voice });
        return;
      }
      const orig = await BotMessage.findOne({ restaurantId: adminRest.id, adminMsgId: replyTo });
      if (!orig) {
        await tg.sendMessage(token, chatId, 'Bu xabar qaysi nomzodniki ekani topilmadi.');
        return;
      }
      const cand = await Candidate.findOne({ restaurantId: adminRest.id, id: orig.candidateId });
      try {
        await relay.sendToCandidate(adminRest, cand, text, 'telegram');
        await tg.sendMessage(token, chatId, `Yuborildi -> ${relay.displayName(cand)}`);
      } catch (e) {
        await tg.sendMessage(token, chatId, `Yuborilmadi: ${e.message}`);
      }
      return;
    }

    // ── Nomzoddan oddiy xabar ──
    const cand = await Candidate.findOne({ tgChatId: chatId });
    if (!cand) return;
    const rest = await Restaurant.findOne({ id: cand.restaurantId });
    if (!rest) return;

    // Nomzod ovozli xabar yuborishi mumkin — uni matnga aylantirmaymiz
    // (bu adminning qidiruvi emas), lekin adminga xabar beramiz.
    const body = text || '[ovozli xabar — Telegramda tinglang]';
    const adminMsgId = await relay.forwardToAdmin(rest, cand, body);
    await relay.logMsg({
      restaurantId: rest.id, candidateId: cand.id,
      direction: 'in', kind: text ? 'text' : 'system', sentBy: 'telegram',
      text: body, tgMessageId: msg.message_id, adminMsgId
    });
    cand.tgUnread = (cand.tgUnread || 0) + 1;
    cand.tgLastMsgAt = new Date();
    await cand.save();

  } catch (e) {
    console.error('[TG] webhook xatosi:', e.message);
  }
}));

// ── Nomzod qidiruvi (matn yoki ovoz) ─────────────────────────
// Admin reply qilmasdan yozsa — bu qidiruv so'rovi deb qabul qilinadi.
async function handleSearch(restaurant, chatId, { text, voice }) {
  const token = tg.platformToken();

  if (text && text.startsWith('/')) {
    await tg.sendMessage(token, chatId,
      'Nomzod qidirish uchun shunchaki yozing yoki ovozli xabar yuboring.\n\n' +
      'Masalan: "menejer kerak, 2 yildan ortiq tajribali, ingliz tili biladigan"\n\n' +
      'Nomzodga javob berish uchun uning xabariga reply qiling.');
    return;
  }

  await tg.sendMessage(token, chatId, voice ? 'Ovoz tinglanmoqda…' : 'Qidirilmoqda…');

  try {
    let input;
    if (voice) {
      const f = await tg.getFileBase64(token, voice.file_id, { maxBytes: 10 * 1024 * 1024 });
      input = { audio: { mimeType: voice.mime_type || 'audio/ogg', data: f.base64 } };
    } else {
      input = { text };
    }

    const criteria = await candidateSearch.parseQuery(input, restaurant.id);
    const rows = await candidateSearch.search(criteria, restaurant.id);
    await tg.sendMessage(token, chatId, candidateSearch.format(criteria, rows));

  } catch (e) {
    console.error('[TG] qidiruv xatosi:', e.message);
    const msg = e.code === 'AI_NOT_CONFIGURED'
      ? 'AI sozlanmagan — qidiruv ishlamaydi.'
      : `Qidirib bo'lmadi: ${e.message}`;
    await tg.sendMessage(token, chatId, msg);
  }
}

// ══ 2. ADMIN ENDPOINTLARI ═══════════════════════════════════

// Bot holati. Token hech qachon qaytarilmaydi — faqat sozlanganmi yo'qmi.
router.get('/status', guard, asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  const t = restaurant.telegram || {};
  const out = {
    platformReady: tg.isPlatformReady(),
    botUsername: '',
    adminLinked: !!t.adminChatId,
    connectedAt: t.connectedAt || null,
    channels: outreach.available(),
    smsBalance: await outreach.balance()
  };

  if (tg.isPlatformReady()) {
    try { out.botUsername = await tg.platformUsername(); } catch (e) { out.error = e.message; }
    try {
      const info = await tg.getWebhookInfo(tg.platformToken());
      out.webhook = {
        set: !!info.url,
        pending: info.pending_update_count || 0,
        lastError: info.last_error_message || ''
      };
    } catch (e) { out.webhook = { error: e.message }; }
  }
  res.json(out);
}));

// Webhook'ni o'rnatish. Token env'dan olinadi — so'rovda uzatilmaydi.
router.post('/setup-webhook', guard, asyncHandler(async (req, res) => {
  if (!tg.isPlatformReady()) {
    return res.status(400).json({
      error: 'TELEGRAM_BOT_TOKEN yoki TELEGRAM_WEBHOOK_SECRET sozlanmagan'
    });
  }
  const url = `${publicBase(req)}/api/tg/webhook/${tg.platformSecret()}`;
  try {
    await tg.setWebhook(tg.platformToken(), url, tg.platformSecret());
    const username = await tg.platformUsername();
    res.json({ ok: true, botUsername: username, webhookSet: true });
  } catch (e) {
    res.status(400).json({ error: 'Webhook o\'rnatilmadi: ' + e.message });
  }
}));

// Adminning o'zini botga bog'lash havolasi
router.get('/admin-link', guard, asyncHandler(async (req, res) => {
  if (!tg.isPlatformReady()) return res.status(400).json({ error: 'Bot sozlanmagan' });

  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  const t = restaurant.telegram || {};
  t.adminLinkToken = relay.makeToken();
  restaurant.telegram = t;
  await restaurant.save();

  res.json({ link: tg.deepLink(await tg.platformUsername(), 'admin_' + t.adminLinkToken) });
}));

// Adminni botdan uzish (restoran darajasida — bot ishlayveradi)
router.post('/unlink-admin', guard, asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  restaurant.telegram = Object.assign({}, restaurant.telegram, {
    adminChatId: '', adminLinkToken: '', enabled: false
  });
  await restaurant.save();
  res.json({ ok: true });
}));

module.exports = router;
