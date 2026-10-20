function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  const status = err.status || 500;
  // Faqat haqiqiy server xatosi (500) egasiga boradi — 400/401/404 —
  // foydalanuvchi xatosi, ular bilan Telegram to'lib ketardi
  if (status >= 500) require('../services/alert').report(`${req.method} ${req.path}`, err);
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Server xatosi yuz berdi'
    : err.message;
  res.status(status).json({ error: message });
}

module.exports = { asyncHandler, errorHandler };
