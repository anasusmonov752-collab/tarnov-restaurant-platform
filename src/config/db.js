const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tarnov';
  await mongoose.connect(uri);
  console.log('✦ MongoDB connected');
  await seedSuperAdmin();
}

async function seedSuperAdmin() {
  const SuperAdmin = require('../models/SuperAdmin');
  const existing = await SuperAdmin.findOne({ email: 'admin@tarnov.uz' });
  if (!existing) {
    const hashed = await bcrypt.hash('Tarnov2024!', 10);
    await SuperAdmin.create({ email: 'admin@tarnov.uz', password: hashed, name: 'Super Admin' });
    console.log('✦ Super Admin created: admin@tarnov.uz');
  }
}

module.exports = { connectDB };
