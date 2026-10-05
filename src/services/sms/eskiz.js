// ── ESKIZ.UZ SMS ─────────────────────────────────────────────
// Hujjat: https://documenter.getpostman.com/view/663428/RzfmES4z?version=latest
//
// Token ~30 kun yashaydi — har yuborishda qayta login qilish shart emas,
// xotirada saqlaymiz va muddati yaqinlashganda yangilaymiz.
//
// Test rejimida (shartnomasiz) FAQAT quyidagi uchta matn o'tadi:
//   "Это тест от Eskiz" | "Bu Eskiz dan test" | "This is test from Eskiz"
// Haqiqiy matn uchun yuridik shaxs shartnomasi va matn moderatsiyasi kerak.

const BASE = 'https://notify.eskiz.uz/api';

// Jo'natuvchi: 4546 — Eskiz'ning umumiy raqami, bepul.
// Brendlangan alfa-nom (masalan "TARNOV") operatorlarga oyiga ~550 ming
// so'm turadi va 1-2 oy tasdiqlanadi — HR hajmi uchun mantiqsiz.
const FROM = process.env.SMS_FROM || '4546';

const TOKEN_TTL = 25 * 24 * 60 * 60 * 1000;   // 25 kun (30 dan zapas bilan)

let token = null;
let tokenAt = 0;

function isConfigured() {
  return !!(process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD);
}

async function req(path, { method = 'GET', body, auth = true, retried = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) headers['Authorization'] = 'Bearer ' + (await getToken());

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  let res, data;
  try {
    res = await fetch(BASE + path, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Eskiz javob bermadi (timeout)' : e.message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Token eskirgan bo'lsa keshni tashlab, BIR MARTA qayta urinamiz.
    // (auth:false bilan urinish befoyda edi — Eskiz tokensiz javob bermaydi.)
    if (res.status === 401 && auth && !retried) {
      token = null;
      return req(path, { method, body, auth: true, retried: true });
    }
    throw new Error(data.message || `Eskiz xatosi (${res.status})`);
  }
  return data;
}

async function getToken() {
  if (token && Date.now() - tokenAt < TOKEN_TTL) return token;
  if (!isConfigured()) throw new Error('ESKIZ_EMAIL / ESKIZ_PASSWORD sozlanmagan');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  let data;
  try {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ESKIZ_EMAIL,
        password: process.env.ESKIZ_PASSWORD
      }),
      signal: ctl.signal
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Eskiz login xatosi');
  } finally {
    clearTimeout(timer);
  }

  token = data && data.data && data.data.token;
  if (!token) throw new Error('Eskiz token qaytarmadi');
  tokenAt = Date.now();
  return token;
}

// Eskiz raqamni 998XXXXXXXXX ko'rinishida kutadi (plyus va bo'shliqsiz)
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;                   // 901234567
  if (d.length === 12 && d.startsWith('998')) return d;
  throw new Error('Telefon raqami noto\'g\'ri: ' + raw);
}

async function send({ to, text }) {
  const data = await req('/message/sms/send', {
    method: 'POST',
    body: { mobile_phone: normalizePhone(to), message: text, from: FROM }
  });
  return { messageId: String(data.id || data.message_id || '') };
}

async function balance() {
  const data = await req('/user/get-limit');
  return (data && data.data && data.data.balance) != null ? data.data.balance : null;
}

async function status(messageId) {
  return req(`/message/sms/status_by_id/${messageId}`);
}

module.exports = { send, balance, status, isConfigured, normalizePhone, FROM };
