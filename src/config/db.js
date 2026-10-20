const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tarnov';
  await mongoose.connect(uri);
  console.log('✦ MongoDB connected');
  await seedSuperAdmin();
}

// Superadmin paroli FAQAT Render env'idan (SUPERADMIN_PASSWORD). Ilgari
// boshlang'ich parol shu faylda ochiq yozilgan edi — repo ochiq, demak
// uni hamma biladi. Ilovada parolni almashtirish oynasi yo'q, shuning
// uchun env berilsa bazadagi parol har ishga tushishda unga tenglashadi:
// almashtirish = Render'da qiymatni o'zgartirish (server qayta ishga tushadi).
async function seedSuperAdmin() {
  const SuperAdmin = require('../models/SuperAdmin');
  const email = 'admin@tarnov.uz';
  const pass = process.env.SUPERADMIN_PASSWORD || '';
  const existing = await SuperAdmin.findOne({ email });
  if (!pass) {
    console.warn(existing
      ? '⚠ SUPERADMIN_PASSWORD berilmagan — superadmin eski paroli bilan qoldi'
      : '⚠ SUPERADMIN_PASSWORD berilmagan — superadmin yaratilmadi');
    return;
  }
  if (pass.length < 12) {
    console.error('⚠ SUPERADMIN_PASSWORD 12 belgidan qisqa — parol o\'zgartirilmadi');
    return;
  }
  if (!existing) {
    await SuperAdmin.create({ email, password: await bcrypt.hash(pass, 10), name: 'Super Admin' });
    console.log('✦ Super Admin yaratildi: ' + email);
  } else if (!(await bcrypt.compare(pass, existing.password))) {
    existing.password = await bcrypt.hash(pass, 10);
    await existing.save();
    console.log('✦ Super Admin paroli env bo\'yicha yangilandi');
  }
}


module.exports = { connectDB };
