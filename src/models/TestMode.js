// ── ADMIN TEST REJIMI HOLATI ─────────────────────────────────
// Bitta Telegram akkauntdan mijoz / nomzod / admin bo'lib sinash
// (services/testMode.js). Bot va Mini App'lar odamni tgChatId bo'yicha
// taniydi — rejim almashganda sinov yozuvlari shu akkauntga qayta ulanadi,
// bu yerda esa qaysi rejim va oldin nimaga ulangani (tiklash uchun) turadi.
const mongoose = require('mongoose');

const TestModeSchema = new mongoose.Schema({
  tgUserId:    { type: String, required: true, unique: true },
  agencyId:    { type: String, required: true },
  mode:        { type: String, default: 'admin' },     // admin | client | candidate
  clientId:    { type: String, default: '' },          // sinov mijozi (isTest)
  candidateId: { type: String, default: '' },          // sinov nomzodi (isTest), anketadan
  // Test rejimidan oldin shu akkauntga ulangan yozuvlar — admin rejimida qaytariladi
  saved: {
    clients:    { type: [String], default: [] },
    candidates: { type: [String], default: [] }
  },
  updatedAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('TestMode', TestModeSchema);
