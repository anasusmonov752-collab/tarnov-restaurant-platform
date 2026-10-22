const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Restaurant = require('../models/Restaurant');

const router = express.Router();
const guard = auth(['superadmin']);

router.get('/dashboard', guard, asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find();
  res.json({
    total: restaurants.length,
    active: restaurants.filter(r => r.active).length,
    inactive: restaurants.filter(r => !r.active).length,
    totalWaiters: restaurants.reduce((s, r) => s + r.waiters.length, 0),
    totalMenuItems: restaurants.reduce((s, r) => s + r.menu.length, 0),
    // Faol tariflar yig'indisi (rejalashtirilgan oylik / MRR) — haqiqiy kassa emas
    totalRevenue: restaurants.filter(r => r.active).reduce((s, r) => s + (r.planPrice || 0), 0),
    restaurants: restaurants.map(r => ({
      id: r.id, name: r.name, location: r.location, active: r.active,
      plan: r.plan, planPrice: r.planPrice, adminEmail: r.adminEmail, kind: r.kind || 'restaurant',
      waitersCount: r.waiters.length, menuCount: r.menu.length,
      questionsCount: r.questions.length, createdAt: r.createdAt
    }))
  });
}));

router.post('/restaurants', guard, asyncHandler(async (req, res) => {
  const { name, location, adminEmail, adminPassword, plan, planPrice } = req.body;
  if (!name || !adminEmail || !adminPassword) return res.status(400).json({ error: 'Ism, email va parol majburiy' });
  const existing = await Restaurant.findOne({ adminEmail });
  if (existing) return res.status(400).json({ error: 'Bu email allaqachon mavjud' });
  const restaurant = await Restaurant.create({
    id: uuidv4(), name, location: location || '', active: true,
    plan: plan || 'basic', planPrice: parseInt(planPrice) || 0,
    adminEmail, adminPassword: await bcrypt.hash(adminPassword, 10)
  });
  res.json({ success: true, restaurant: { id: restaurant.id, name: restaurant.name, adminEmail: restaurant.adminEmail } });
}));

router.put('/restaurants/:id', guard, asyncHandler(async (req, res) => {
  const { name, location, plan, planPrice, active, adminPassword, adminEmail } = req.body;
  const update = {};
  if (name) update.name = name;
  if (location !== undefined) update.location = location;
  if (plan) update.plan = plan;
  if (planPrice !== undefined) update.planPrice = parseInt(planPrice);
  if (active !== undefined) update.active = Boolean(active);
  if (adminEmail) {
    const normalized = adminEmail.toLowerCase().trim();
    const duplicate = await Restaurant.findOne({ adminEmail: normalized, id: { $ne: req.params.id } });
    if (duplicate) return res.status(400).json({ error: 'Bu email boshqa restoranda allaqachon mavjud' });
    update.adminEmail = normalized;
  }
  if (adminPassword) update.adminPassword = await bcrypt.hash(adminPassword, 10);
  await Restaurant.updateOne({ id: req.params.id }, update);
  res.json({ success: true });
}));

router.delete('/restaurants/:id', guard, asyncHandler(async (req, res) => {
  await Restaurant.deleteOne({ id: req.params.id });
  res.json({ success: true });
}));

// ── TalentHub'ni restoran akkauntidan ajratish (2026-10-22) ──
// TalentHub ma'lumoti Tarnov akkaunti ichida edi. Bu amal hammasini
// tanlangan akkauntga (oldindan super-admin'da yaratiladi — o'z email va
// paroli bilan) ko'chiradi va uni 'agency' qiladi. Restoranning trening
// ma'lumoti (menyu, ofitsiantlar, testlar, mentor) joyida qoladi.
//   apply:false — nima ko'chishini sanaydi, hech narsa yozmaydi
//   apply:true  — ko'chiradi. Takror ishga tushirish xavfsiz: yarim yo'lda
//                 to'xtagan bo'lsa qolganini ko'chiradi
const AGENCY_DATA = [
  ['Candidate', 'restaurantId'], ['BotMessage', 'restaurantId'],
  ['Client', 'agencyId'], ['CreditLedger', 'agencyId'], ['Shortlist', 'agencyId'],
  ['Vacancy', 'agencyId'], ['Application', 'agencyId'], ['SearchSession', 'agencyId'],
  ['Conversation', 'agencyId'], ['ChatThread', 'agencyId'], ['ChatMessage', 'agencyId'],
  ['Survey', 'agencyId'], ['SurveyResponse', 'agencyId']
];
router.post('/agency-split', guard, asyncHandler(async (req, res) => {
  const { fromId, toId, apply } = req.body || {};
  if (!fromId || !toId || fromId === toId) return res.status(400).json({ error: 'Ikki xil akkaunt tanlang' });
  const [from, to] = await Promise.all([Restaurant.findOne({ id: fromId }), Restaurant.findOne({ id: toId })]);
  if (!from || !to) return res.status(404).json({ error: 'Akkaunt topilmadi' });
  if (from.kind === 'agency') return res.status(400).json({ error: `"${from.name}" o'zi agentlik — undan ko'chirilmaydi` });
  const Survey = require('../models/Survey');

  const plan = [];
  for (const [model, key] of AGENCY_DATA) {
    const M = require('../models/' + model);
    plan.push({ model, from: await M.countDocuments({ [key]: fromId }), to: await M.countDocuments({ [key]: toId }) });
  }
  const targetDefaults = await Survey.countDocuments({ agencyId: toId, isDefault: true });
  const tgFrom = from.telegram || {};
  const summary = {
    from: { id: from.id, name: from.name }, to: { id: to.id, name: to.name, kind: to.kind || 'restaurant' },
    plan, telegram: !!tgFrom.adminChatId, targetDefaults
  };
  if (!apply) return res.json({ applied: false, ...summary });

  // Yangi akkauntda allaqachon umumiy anketa yaratilgan bo'lsa (panelni
  // ochib qo'yilgan) — u bo'sh nusxa, ko'chayotganniki asosiy: unikal
  // indeks (agentlikka bitta umumiy anketa) to'qnashmasin
  if (targetDefaults && await Survey.exists({ agencyId: fromId, isDefault: true })) {
    await Survey.updateMany({ agencyId: toId, isDefault: true },
      { $set: { isDefault: false, active: false, updatedAt: new Date() } });
  }
  const moved = {};
  for (const [model, key] of AGENCY_DATA) {
    const r = await require('../models/' + model).updateMany({ [key]: fromId }, { $set: { [key]: toId } });
    moved[model] = r.modifiedCount;
  }
  // Bot sozlamasi (admin chati) agentlik bilan birga ketadi
  if (tgFrom.adminChatId || tgFrom.enabled) {
    to.telegram = { adminChatId: tgFrom.adminChatId || '', adminLinkToken: '', enabled: !!tgFrom.enabled,
                    connectedAt: tgFrom.connectedAt || null };
    from.telegram = { adminChatId: '', adminLinkToken: '', enabled: false, connectedAt: null };
    await from.save();
  }
  to.kind = 'agency';
  await to.save();
  require('../middleware/agency').invalidate();
  res.json({ applied: true, ...summary, moved });
}));

router.patch('/restaurants/:id/toggle', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.params.id });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  r.active = !r.active;
  await r.save();
  res.json({ success: true, active: r.active });
}));

module.exports = router;
