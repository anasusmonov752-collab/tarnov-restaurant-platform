const mongoose = require('mongoose');

// Kunlik AI so'rovlari hisobi — bepul tarif kvotasini kuzatish uchun.
// Har (sana, model) juftligi uchun bitta hujjat.
const AiUsageSchema = new mongoose.Schema({
  date:  { type: String, required: true },   // 'YYYY-MM-DD' (kvota reset zonasida)
  model: { type: String, required: true },   // 'gemini-2.5-flash' va h.k.
  count: { type: Number, default: 0 },

  // Qaysi restoran qancha sarfladi — kelajakda tarif/limit uchun kerak bo'ladi
  byRestaurant: { type: Map, of: Number, default: () => ({}) },

  updatedAt: { type: Date, default: Date.now }
});

AiUsageSchema.index({ date: 1, model: 1 }, { unique: true });

module.exports = mongoose.model('AiUsage', AiUsageSchema);
