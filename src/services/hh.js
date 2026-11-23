// ── hh.uz / hh.ru rasmiy API (dev.hh.ru, ilova "RestoOne HR", ariza #30261 — tasdiqlangan) ──
// Ish beruvchi akkaunti bir marta ruxsat beradi (OAuth "authorization code"), token
// agentlik yozuvida saqlanadi (Restaurant.hh, select:false) va muddati o'tsa yangilanadi.
// Kalitlar FAQAT Render env'da: HH_CLIENT_ID, HH_CLIENT_SECRET (repo ochiq — bu yerda yo'q).
// HH_REDIRECT_URI — dev.hh.ru dagi "Redirect Uri" bilan AYNAN bir xil bo'lishi shart
// (standart: <APP_URL>/api/hh/callback). HH_USER_AGENT — hh talabi: "Ilova/versiya (email)".
//
// Rezyume qidiruvi pullik "доступ к базе резюме" bilan ishlaydi; kontakt ochish
// (telefon) bu servisda YO'Q — kvota yeydi, faqat egasining qarori bilan, hh saytida.
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const Restaurant = require('../models/Restaurant');

const API = 'https://api.hh.ru';
const AUTH = 'https://hh.ru/oauth/authorize';

const cfg = () => ({
  id: process.env.HH_CLIENT_ID || '',
  secret: process.env.HH_CLIENT_SECRET || '',
  redirect: process.env.HH_REDIRECT_URI ||
    (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') + '/api/hh/callback' : ''),
  ua: process.env.HH_USER_AGENT || 'TalentHub/1.0'
});
const configured = () => { const c = cfg(); return !!(c.id && c.secret && c.redirect); };

/** state — kim ruxsat so'radi (agentlik), 15 daqiqa; CSRF himoyasi */
const makeState = agencyId => jwt.sign({ a: agencyId, p: 'hh' }, JWT_SECRET, { expiresIn: '15m' });
function readState(s) {
  try { const d = jwt.verify(String(s || ''), JWT_SECRET); return d.p === 'hh' ? d.a : null; } catch (_) { return null; }
}

function authorizeUrl(agencyId) {
  const c = cfg();
  const q = new URLSearchParams({ response_type: 'code', client_id: c.id, redirect_uri: c.redirect, state: makeState(agencyId) });
  return `${AUTH}?${q}`;
}

class HhError extends Error {
  constructor(msg, status, code) { super(msg); this.status = status; this.code = code; }
}

async function tokenRequest(form) {
  const r = await fetch(`${API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'HH-User-Agent': cfg().ua, 'User-Agent': cfg().ua },
    body: new URLSearchParams(form).toString()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new HhError('hh token olinmadi: ' + (j.error_description || j.error || r.status), r.status, j.error || '');
  }
  return j;
}

async function saveTokens(agencyId, j) {
  await Restaurant.updateOne({ id: agencyId }, { $set: {
    'hh.accessToken': j.access_token,
    'hh.refreshToken': j.refresh_token || '',
    'hh.expiresAt': new Date(Date.now() + (Number(j.expires_in) || 1209600) * 1000)
  } });
}

/** OAuth kodini tokenga almashtirish (callback) va kim ulanganini yozish */
async function connect(agencyId, code) {
  const c = cfg();
  const j = await tokenRequest({ grant_type: 'authorization_code', client_id: c.id, client_secret: c.secret, code, redirect_uri: c.redirect });
  await saveTokens(agencyId, j);
  let me = {};
  try { me = await request(agencyId, '/me'); } catch (_) {}
  await Restaurant.updateOne({ id: agencyId }, { $set: {
    'hh.connectedAt': new Date(),
    'hh.employer': (me.employer && me.employer.name) || '',
    'hh.manager': [me.first_name, me.last_name].filter(Boolean).join(' ')
  } });
  return me;
}

async function tokens(agencyId) {
  // Faqat "+" bilan: butun hujjat + yashirin tokenlar ("hh" ni qo'shish proyeksiyada to'qnashadi)
  const r = await Restaurant.findOne({ id: agencyId }).select('+hh.accessToken +hh.refreshToken').lean();
  return (r && r.hh) || {};
}

// hh: refresh faqat access muddati o'tgandan keyin ishlaydi
async function refresh(agencyId) {
  const t = await tokens(agencyId);
  if (!t.refreshToken) throw new HhError('hh ulanmagan — panelda "hh.uz ulash"', 401, 'not_connected');
  const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken });
  await saveTokens(agencyId, j);
  return j.access_token;
}

/** API so'rovi: token muddati o'tgan bo'lsa bir marta yangilab qayta urinadi.
 *  opts: { method, body } — yozuvchi so'rovlar (vakansiya qoralamasi) uchun */
async function request(agencyId, path, params = {}, retry = true, opts = {}) {
  const t = await tokens(agencyId);
  if (!t.accessToken) throw new HhError('hh ulanmagan — panelda "hh.uz ulash"', 401, 'not_connected');
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => (Array.isArray(v) ? v : [v]).forEach(x => x != null && x !== '' && qs.append(k, x)));
  const headers = { Authorization: `Bearer ${t.accessToken}`, 'HH-User-Agent': cfg().ua, 'User-Agent': cfg().ua };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${API}${path}${qs.toString() ? '?' + qs : ''}`, {
    method: opts.method || 'GET', headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (r.status === 403 && retry && JSON.stringify(j).includes('token_expired')) {
    await refresh(agencyId);
    return request(agencyId, path, params, false, opts);
  }
  if (!r.ok) {
    const e = (j.errors && j.errors[0]) || {};
    const err = new HhError(`hh API ${r.status}: ${e.value || e.type || j.description || 'xato'}`, r.status, e.value || e.type || '');
    err.details = j.errors || j.bad_arguments || null;     // maydon xatolari (qoralama/nashr)
    throw err;
  }
  return j;
}

// ── Vakansiya qoralamasi (hh /vacancies/drafts) ──
// Qoralama hh'da E'LON QILINMAYDI — ish beruvchi kabinetida "Черновики" da turadi.
// Nashr (publish) — alohida, faqat Anas tasdig'i bilan (route'da apply:true).
const DRAFT_KEYS = ['name', 'description', 'area', 'areas', 'address', 'professional_roles', 'experience', 'employment',
  'employment_form', 'schedule', 'work_format', 'work_schedule_by_days', 'working_days', 'working_hours',
  'working_time_intervals', 'working_time_modes', 'night_shifts', 'salary', 'salary_range', 'key_skills', 'languages',
  'response_letter_required', 'response_notifications', 'allow_messages', 'accept_incomplete_resumes', 'accept_temporary',
  'accept_labor_contract', 'accept_handicapped', 'accept_kids', 'test', 'contacts', 'code', 'department',
  'employer_service_id', 'vacancy_properties', 'closed_for_applicants', 'driver_license_types', 'internship',
  'civil_law_contracts', 'age_restriction', 'auto_response'];
const pickDraft = b => Object.fromEntries(Object.entries(b || {}).filter(([k]) => DRAFT_KEYS.includes(k)));
const HOST = () => ({ host: process.env.HH_HOST || 'hh.uz' });
const draftId = id => { if (!/^\d{1,15}$/.test(String(id))) throw new HhError('Qoralama id noto\'g\'ri', 400, 'bad_id'); return String(id); };

const drafts = {
  list: a => request(a, '/vacancies/drafts', Object.assign({ per_page: 50 }, HOST())),
  create: (a, body) => request(a, '/vacancies/drafts', HOST(), true, { method: 'POST', body: pickDraft(body) }),
  get: async (a, id) => request(a, '/vacancies/drafts/' + draftId(id), HOST()),
  update: async (a, id, body) => request(a, '/vacancies/drafts/' + draftId(id), HOST(), true, { method: 'PUT', body: pickDraft(body) }),
  remove: async (a, id) => request(a, '/vacancies/drafts/' + draftId(id), HOST(), true, { method: 'DELETE' }),
  publish: async (a, id) => request(a, '/vacancies/drafts/' + draftId(id) + '/publish', HOST(), true, { method: 'POST', body: {} })
};

// ── Vakansiyaga kelgan arizalar (hh /negotiations) — FAQAT O'QISH ──
// Holat (taklif/rad) bu yerdan o'zgartirilmaydi. Arizachining kontakti kvota yemaydi.
const vacId = id => { if (!/^\d{1,15}$/.test(String(id))) throw new HhError('Vakansiya id noto\'g\'ri', 400, 'bad_id'); return String(id); };
const toApplicant = n => {
  const r = n.resume || {};
  const sal = r.salary;
  return {
    negotiationId: n.id, state: n.employer_state ? n.employer_state.id : (n.state && n.state.id) || '',
    createdAt: n.created_at, hasUpdates: !!n.has_updates,
    resumeId: r.id || '', title: r.title || '', age: r.age || null,
    name: [r.last_name, r.first_name].filter(Boolean).join(' '),
    gender: r.gender ? r.gender.id : '', area: r.area ? r.area.name : '',
    totalMonths: r.total_experience ? r.total_experience.months : null,
    salary: sal && sal.amount ? `${sal.amount} ${sal.currency}` : '',
    education: r.education && r.education.level ? r.education.level.name : '',
    url: r.alternate_url || '',
    experience: (r.experience || []).slice(0, 5).map(e => ({ company: e.company, position: e.position, start: e.start, end: e.end }))
  };
};
async function applicants(agencyId, vacancyId, { collection = '', page = 0, per_page = 50 } = {}) {
  const vid = vacId(vacancyId);
  const list = await request(agencyId, '/negotiations', Object.assign({ vacancy_id: vid }, HOST()));
  const collections = (list.collections || []).map(c => ({ id: c.id, name: c.name, total: (c.counters || {}).total || 0 }));
  if (!collection) return { collections };
  if (!/^[a-z_0-9]{1,40}$/.test(String(collection))) throw new HhError('To\'plam nomi noto\'g\'ri', 400, 'bad_collection');
  const j = await request(agencyId, '/negotiations/' + collection,
    Object.assign({ vacancy_id: vid, page: Math.max(0, +page || 0), per_page: Math.min(50, Math.max(1, +per_page || 50)) }, HOST()));
  return { collections, found: j.found || 0, pages: j.pages || 0, page: j.page || 0, items: (j.items || []).map(toApplicant) };
}

/** Shu hudud va lavozim uchun mavjud nashr variantlari (tarif paketlari) */
async function publications(agencyId, { area = '2759', role = '' } = {}) {
  const me = await request(agencyId, '/me');
  const emp = me.employer && me.employer.id;
  if (!emp) throw new HhError('Ulangan akkaunt ish beruvchi emas', 403, 'not_employer');
  return request(agencyId, `/employers/${emp}/services/available_publications`,
    Object.assign({ area_id: area, professional_role_id: role }, HOST()));
}

// Qidiruv parametrlari — faqat ruxsat etilganlari (boshqasi hh'ga uzatilmaydi)
const SEARCH_KEYS = ['text', 'area', 'experience', 'age_from', 'age_to', 'gender', 'salary_from', 'salary_to',
  'currency', 'job_search_status', 'order_by', 'page', 'per_page', 'relocation', 'period', 'label', 'search_field'];

/** Rezyume qidiruvi — kontaktsiz karta ma'lumoti (kvota yemaydi) */
async function searchResumes(agencyId, q = {}) {
  const params = { area: '2759', per_page: '50', host: process.env.HH_HOST || 'hh.uz' };
  SEARCH_KEYS.forEach(k => { if (q[k] != null && q[k] !== '') params[k] = q[k]; });
  const j = await request(agencyId, '/resumes', params);
  return {
    found: j.found || 0, pages: j.pages || 0, page: j.page || 0,
    items: (j.items || []).map(x => ({
      id: x.id, title: x.title, age: x.age || null,
      area: x.area && x.area.name, gender: x.gender && x.gender.id,
      totalMonths: x.total_experience ? x.total_experience.months : null,
      salary: x.salary ? `${x.salary.amount} ${x.salary.currency}` : '',
      photo: x.photo && (x.photo.small || x.photo.medium) || '',
      updatedAt: x.updated_at, url: x.alternate_url,
      experience: (x.experience || []).slice(0, 4).map(e => ({ company: e.company, position: e.position, start: e.start, end: e.end }))
    }))
  };
}

/** Bitta rezyume (to'liq tajriba va ko'nikmalar; kontakt — ochilmagan bo'lsa yo'q) */
async function resume(agencyId, id) {
  if (!/^[a-f0-9]{20,64}$/i.test(String(id))) throw new HhError('Rezyume id noto\'g\'ri', 400, 'bad_id');
  return request(agencyId, '/resumes/' + id, { host: process.env.HH_HOST || 'hh.uz' });
}

// ── hh rezyumesini nomzodlar bazasiga qo'shish (kontaktsiz — kvota yemaydi) ──
// Ism/telefon hh'da kontakt ochilmaguncha yo'q: fullName = rezyume sarlavhasi,
// telefon bo'sh (SMS navbatiga tushmaydi). Takror: hhResumeId bo'yicha.
const MONTHS_RU = m => { const y = Math.floor(m / 12), r = m % 12; return [y ? y + ' yil' : '', r ? r + ' oy' : ''].filter(Boolean).join(' '); };
const ym = d => (d ? String(d).slice(0, 7).split('-').reverse().join('.') : '');
async function photoData(url) {
  if (!url) return '';
  try {
    const r = await fetch(url);
    if (!r.ok) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 400 * 1024) return '';
    return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch (_) { return ''; }
}
function toCandidate(j) {
  const { guessRole } = require('../data/roles');
  const months = (j.total_experience && j.total_experience.months) || 0;
  const work = (j.experience || []).slice(0, 8).map(e => ({
    company: String(e.company || '').slice(0, 120), position: String(e.position || '').slice(0, 120),
    period: [ym(e.start), e.end ? ym(e.end) : 'hozir'].filter(Boolean).join(' – '),
    description: String(e.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
  }));
  const name = [j.last_name, j.first_name, j.middle_name].filter(Boolean).join(' ');
  const about = String(j.skills || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    fullName: name || String(j.title || 'hh nomzod').slice(0, 120),
    desiredPosition: String(j.title || '').slice(0, 160),
    // Sarlavhadan, bo'lmasa ish joylaridagi lavozimlardan ("Технолог" -> oldingi "Шеф-повар")
    role: guessRole(j.title) || work.map(w => guessRole(w.position)).find(Boolean) || 'boshqa',
    age: j.age || null,
    location: (j.area && j.area.name) || '',
    salaryExpectation: j.salary && j.salary.amount ? `${j.salary.amount} ${j.salary.currency === 'UZS' ? "so'm" : j.salary.currency}` : '',
    experienceYears: Math.floor(months / 12), experienceMonths: months,
    experienceSummary: months ? MONTHS_RU(months) : '',
    workHistory: work,
    skills: (j.skill_set || []).slice(0, 20),
    languages: (j.language || []).map(l => [l.name, l.level && l.level.name].filter(Boolean).join(' — ')),
    education: (j.education && j.education.level && j.education.level.name) || '',
    summary: about.slice(0, 600),
    rawText: [j.title, about, (j.skill_set || []).join(', '), ...work.map(w => `${w.position} — ${w.company} (${w.period}). ${w.description}`)].join('\n').slice(0, 20000),
    hhResumeId: j.id, hhUrl: j.alternate_url || '',
    source: 'hh', status: 'new', aiParsed: true
  };
}
async function importResume(agencyId, id, { tag = '' } = {}) {
  const Candidate = require('../models/Candidate');
  const { v4: uuidv4 } = require('uuid');
  const ex = await Candidate.findOne({ restaurantId: agencyId, hhResumeId: id }, 'id fullName').lean();
  if (ex) return { id: ex.id, duplicate: true, name: ex.fullName };
  const j = await resume(agencyId, id);
  const data = toCandidate(j);
  const photo = await photoData(j.photo && (j.photo.medium || j.photo.small));
  const doc = await Candidate.create(Object.assign({ id: uuidv4(), restaurantId: agencyId, tags: tag ? [tag] : [],
    photo, hasPhoto: !!photo, photoAt: photo ? new Date() : null }, data));
  return { id: doc.id, created: true, name: doc.fullName };
}

module.exports = { configured, authorizeUrl, readState, connect, request, refresh, searchResumes, resume, tokens, HhError, SEARCH_KEYS, cfg,
  importResume, toCandidate, drafts, publications, DRAFT_KEYS, applicants };
