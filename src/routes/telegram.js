// ── TELEGRAM BOT ─────────────────────────────────────────────
// Ikki qism:
//   1) Webhook — Telegram'dan keladi, cookie yo'q, SIR orqali tekshiriladi
//   2) Admin endpointlari — odatdagi restaurant guard ostida

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

const router = express.Router();
const guard = auth(['restaurant']);

// Render bepul tarifda uxlab qolgach Telegram update'ni QAYTA yuboradi.
// update_id'ni eslab qolamiz — bir xil xabar ikki marta qayta ishlanmasin.
const seenUpdates = new Set();
function alreadySeen(id) {
  if (seenUpdates.has(id)) return true;
  seenUpdates.add(id);
  if (seenUpdates.size > 1000) {
    // eng eskilarini tashlaymiz (Set kiritish tartibini saqlaydi)
    for (const k of seenUpdates) { seenUpdates.delete(k); if (seenUpdates.size <= 800) break; }
  }
  return false;
}

// So'rovdan ilovaning tashqi manzilini aniqlaymiz (Render proxy orqali keladi)
function publicBase(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

// Tokenni hech qachon tashqariga chiqarmaymiz
function publicTg(t = {}) {
  return {
    enabled: !!t.enabled,
    botUsername: t.botUsername || '',
    hasToken: !!t.botToken,
    adminLinked: !!t.adminChatId,
    connectedAt: t.connectedAt || null
  };
}

// ══ 1. WEBHOOK ══════════════════════════════════════════════

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Telegram'ga 429 qaytarmaymiz — u qayta yuboraveradi
  handler: (req, res) => res.json({ ok: true })
});

router.post('/webhook/:restaurantId/:secret', webhookLimiter, asyncHandler(async (req, res) => {
  // Telegram'ga DOIM 200 qaytaramiz. Aks holda u xabarni qayta-qayta
  // yuboraveradi va navbat tiqilib qoladi. Xatolar logga yoziladi.
  res.json({ ok: true });

  try {
    const { restaurantId, secret } = req.params;
    const restaurant = await Restaurant.findOne({ id: restaurantId, active: true });
    if (!restaurant || !restaurant.telegram || !restaurant.telegram.enabled) return;

    const t = restaurant.telegram;
    if (!t.webhookSecret || t.webhookSecret !== secret) {
      console.warn('[TG] webhook: sir mos kelmadi', restaurantId);
      return;
    }
    // setWebhook'da berilgan secret_token shu header'da qaytib keladi
    if (req.get('X-Telegram-Bot-Api-Secret-Token') !== t.webhookSecret) {
      console.warn('[TG] webhook: header siri mos kelmadi', restaurantId);
      return;
    }

    const update = req.body || {};
    if (update.update_id != null && alreadySeen(update.update_id)) return;

    const msg = update.message;
    if (!msg || !msg.chat) return;

    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    if (!text) return;

    // ── /start <token> ──
    if (text.startsWith('/start')) {
      const payload = text.slice(6).trim();

      // Admin o'zini bog'layapti
      if (payload && payload === ('admin_' + (t.adminLinkToken || '')) && t.adminLinkToken) {
        t.adminChatId = chatId;
        t.adminLinkToken = '';            // bir martalik
        await restaurant.save();
        await tg.sendMessage(t.botToken, chatId,
          `Ulandi. Endi nomzodlarning javoblari shu yerga keladi.\n\n` +
          `Javob berish uchun nomzod xabariga reply qiling.`);
        return;
      }

      if (!payload) {
        await tg.sendMessage(t.botToken, chatId,
          `Salom! Bu ${restaurant.name} HR boti.\n\n` +
          `Bog'lanish uchun sizga yuborilgan havoladan kiring.`);
        return;
      }

      const cand = await Candidate.findOne({ restaurantId, tgInviteToken: payload });
      if (!cand) {
        await tg.sendMessage(t.botToken, chatId,
          'Havola eskirgan yoki ishlatilgan. HR bilan bog\'laning.');
        return;
      }

      cand.tgChatId    = chatId;
      cand.tgUsername  = (msg.from && msg.from.username) || '';
      cand.tgState     = 'linked';
      cand.tgLinkedAt  = new Date();
      cand.tgInviteToken = '';            // bir martalik — kuydiriladi
      cand.updatedAt   = new Date();
      await cand.save();

      await tg.sendMessage(t.botToken, chatId,
        `Assalomu alaykum, ${relay.displayName(cand)}!\n\n` +
        `${restaurant.name} HR bo'limiga xush kelibsiz. Suhbat vaqti va ` +
        `savollaringiz bo'yicha shu yerda yozishamiz.`);

      await relay.logMsg({
        restaurantId, candidateId: cand.id,
        direction: 'in', kind: 'system', sentBy: 'system',
        text: 'Nomzod Telegramga ulandi'
      });

      if (t.adminChatId) {
        await tg.sendMessage(t.botToken, t.adminChatId,
          `${relay.displayName(cand)} Telegramga ulandi.`);
      }
      return;
    }

    // ── /stop — yozishmadan chiqish ──
    if (text === '/stop') {
      const cand = await Candidate.findOne({ restaurantId, tgChatId: chatId });
      if (cand) {
        cand.tgState = 'stopped';
        await cand.save();
        await tg.sendMessage(t.botToken, chatId,
          'Siz yozishmadan chiqdingiz. Boshqa xabar yubormaymiz.');
      }
      return;
    }

    // ── Admin reply qildi -> nomzodga yo'naltiramiz ──
    if (t.adminChatId && chatId === t.adminChatId) {
      const replyTo = msg.reply_to_message && msg.reply_to_message.message_id;
      if (!replyTo) {
        await tg.sendMessage(t.botToken, chatId,
          'Javob berish uchun nomzod xabariga reply qiling.');
        return;
      }
      const orig = await BotMessage.findOne({ restaurantId, adminMsgId: replyTo });
      if (!orig) {
        await tg.sendMessage(t.botToken, chatId, 'Bu xabar qaysi nomzodniki ekani topilmadi.');
        return;
      }
      const cand = await Candidate.findOne({ restaurantId, id: orig.candidateId });
      try {
        await relay.sendToCandidate(restaurant, cand, text, 'telegram');
        await tg.sendMessage(t.botToken, chatId, `Yuborildi -> ${relay.displayName(cand)}`);
      } catch (e) {
        await tg.sendMessage(t.botToken, chatId, `Yuborilmadi: ${e.message}`);
      }
      return;
    }

    // ── Nomzoddan oddiy xabar ──
    const cand = await Candidate.findOne({ restaurantId, tgChatId: chatId });
    if (!cand) return;

    const adminMsgId = await relay.forwardToAdmin(restaurant, cand, text);
    await relay.logMsg({
      restaurantId, candidateId: cand.id,
      direction: 'in', kind: 'text', sentBy: 'telegram',
      text, tgMessageId: msg.message_id, adminMsgId
    });
    cand.tgUnread = (cand.tgUnread || 0) + 1;
    cand.tgLastMsgAt = new Date();
    await cand.save();

  } catch (e) {
    console.error('[TG] webhook xatosi:', e.message);
  }
}));

// ══ 2. ADMIN ENDPOINTLARI ═══════════════════════════════════

// Bot tokenini saqlash, getMe bilan tekshirish, webhook o'rnatish
router.post('/setup', guard, asyncHandler(async (req, res) => {
  const botToken = String((req.body && req.body.botToken) || '').trim();
  if (!botToken) return res.status(400).json({ error: 'Bot tokeni kiritilmadi' });

  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  let me;
  try {
    me = await tg.getMe(botToken);
  } catch (e) {
    return res.status(400).json({ error: 'Token yaroqsiz: ' + e.message });
  }

  const t = restaurant.telegram || {};
  t.botToken      = botToken;
  t.botUsername   = me.username;
  t.webhookSecret = t.webhookSecret || relay.makeSecret();
  t.enabled       = true;
  t.connectedAt   = new Date();
  restaurant.telegram = t;

  const url = `${publicBase(req)}/api/tg/webhook/${restaurant.id}/${t.webhookSecret}`;
  try {
    await tg.setWebhook(botToken, url, t.webhookSecret);
  } catch (e) {
    return res.status(400).json({ error: 'Webhook o\'rnatilmadi: ' + e.message });
  }

  await restaurant.save();
  res.json({ ok: true, telegram: publicTg(t), webhookUrl: url });
}));

router.get('/status', guard, asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  const t = restaurant.telegram || {};
  const out = { telegram: publicTg(t), channels: outreach.available(), smsBalance: null };

  if (t.enabled && t.botToken) {
    try {
      const info = await tg.getWebhookInfo(t.botToken);
      out.webhook = {
        url: info.url || '',
        pending: info.pending_update_count || 0,
        lastError: info.last_error_message || ''
      };
    } catch (e) { out.webhook = { error: e.message }; }
  }
  out.smsBalance = await outreach.balance();
  res.json(out);
}));

// Adminning o'zini botga bog'lash havolasi
router.get('/admin-link', guard, asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  const t = restaurant.telegram || {};
  if (!t.enabled || !t.botUsername) return res.status(400).json({ error: 'Avval bot tokenini ulang' });

  t.adminLinkToken = relay.makeToken();
  restaurant.telegram = t;
  await restaurant.save();

  res.json({ link: tg.deepLink(t.botUsername, 'admin_' + t.adminLinkToken) });
}));

// Botni uzish
router.post('/disconnect', guard, asyncHandler(async (req, res) => {
  const restaurant = await Restaurant.findOne({ id: req.user.restaurantId });
  if (!restaurant) return res.status(404).json({ error: 'Restoran topilmadi' });

  const t = restaurant.telegram || {};
  if (t.botToken) { try { await tg.deleteWebhook(t.botToken); } catch {} }
  restaurant.telegram = { enabled: false };
  await restaurant.save();
  res.json({ ok: true });
}));

module.exports = router;
