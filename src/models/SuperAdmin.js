const mongoose = require('mongoose');

const SuperAdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  name: String
});

module.exports = mongoose.model('SuperAdmin', SuperAdminSchema);
