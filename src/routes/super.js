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
    totalRevenue: restaurants.reduce((s, r) => s + (r.planPrice || 0), 0),
    restaurants: restaurants.map(r => ({
      id: r.id, name: r.name, location: r.location, active: r.active,
      plan: r.plan, planPrice: r.planPrice, adminEmail: r.adminEmail,
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

router.patch('/restaurants/:id/toggle', guard, asyncHandler(async (req, res) => {
  const r = await Restaurant.findOne({ id: req.params.id });
  if (!r) return res.status(404).json({ error: 'Restoran topilmadi' });
  r.active = !r.active;
  await r.save();
  res.json({ success: true, active: r.active });
}));

module.exports = router;
