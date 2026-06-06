const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('JWT_SECRET muhit o\'zgaruvchisi o\'rnatilmagan!'); })()
    : 'tarnov-dev-only-secret'
);

function auth(roles) {
  return (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (roles && !roles.includes(decoded.role)) return res.status(403).json({ error: 'Ruxsat yo\'q' });
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Token yaroqsiz' });
    }
  };
}

module.exports = { auth, JWT_SECRET };
