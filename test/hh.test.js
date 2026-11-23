// ── hh.uz API (services/hh): OAuth, token saqlash va yangilash, qidiruv ──
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

let rs, Restaurant, hh, calls = [], realFetch;
const A = 'agHH';

before(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(rs.getUri());
  Restaurant = require('../src/models/Restaurant');
  await Restaurant.create({ id: A, name: 'TH', kind: 'agency', adminEmail: 'h@t.uz', adminPassword: 'secret12' });
  Object.assign(process.env, { HH_CLIENT_ID: 'CID', HH_CLIENT_SECRET: 'SEC', HH_REDIRECT_URI: 'https://x/api/hh/callback' });
  hh = require('../src/services/hh');
  realFetch = global.fetch;
  let n = 0;
  global.fetch = async (url, o = {}) => {
    calls.push({ url: String(url), o });
    const u = String(url);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.endsWith('/token')) {
      const b = new URLSearchParams(o.body);
      n++;
      return json(200, { access_token: 'AT' + n, refresh_token: 'RT' + n, expires_in: 1209600, grant: b.get('grant_type') });
    }
    const auth = (o.headers || {}).Authorization;
    if (u.includes('/me')) return json(200, { first_name: 'Anas', last_name: 'U', employer: { name: 'Tarnov' } });
    if (u.startsWith('https://img.hhcdn')) return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer };
    if (/\/resumes\/[a-f0-9]+/.test(u)) return json(200, { id: u.match(/\/resumes\/([a-f0-9]+)/)[1], title: 'Шеф-повар национальной узбекской кухни',
      first_name: null, last_name: null, age: 59, area: { name: 'Ташкент' }, salary: { amount: 1200, currency: 'USD' },
      total_experience: { months: 266 }, skill_set: ['Санпин', 'Плов'], skills: '<p>Узбекская кухня</p>', photo: { medium: 'https://img.hhcdn.ru/p.jpg' },
      alternate_url: 'https://hh.uz/resume/x', experience: [{ company: 'Самарканд', position: 'Шеф-повар', start: '2022-01-01', end: null, description: 'Плов, самса' }] });
    if (u.includes('/resumes?')) {
      if (auth === 'Bearer AT1' && calls.filter(c => c.url.includes('/resumes?')).length === 1) {
        return json(403, { errors: [{ type: 'oauth', value: 'token_expired' }] });
      }
      return json(200, { found: 1, pages: 1, page: 0, items: [{ id: 'abc123abc123abc123abc1', title: 'Шеф-повар', age: 41,
        area: { name: 'Ташкент' }, total_experience: { months: 150 }, salary: { amount: 1200, currency: 'USD' },
        alternate_url: 'https://hh.uz/resume/x', experience: [{ company: 'Rayhon', position: 'Шеф-повар', start: '2015-01-01', end: null }] }] });
    }
    return json(404, {});
  };
});
after(async () => { global.fetch = realFetch; await mongoose.disconnect(); if (rs) await rs.stop(); });

test('ruxsat havolasi: client_id, redirect va imzolangan state', () => {
  const u = new URL(hh.authorizeUrl(A));
  assert.equal(u.origin + u.pathname, 'https://hh.ru/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'), 'CID');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://x/api/hh/callback');
  assert.equal(hh.readState(u.searchParams.get('state')), A);
  assert.equal(hh.readState('soxta'), null);
});

test('ulash: kod tokenga almashadi, token oddiy so\'rovda chiqmaydi', async () => {
  await hh.connect(A, 'CODE1');
  const tok = calls.find(c => c.url.endsWith('/token'));
  assert.equal(new URLSearchParams(tok.o.body).get('code'), 'CODE1');
  assert.equal(new URLSearchParams(tok.o.body).get('client_secret'), 'SEC');
  const plain = await Restaurant.findOne({ id: A }).lean();
  assert.equal(plain.hh.accessToken, undefined);                 // select:false
  assert.equal(plain.hh.employer, 'Tarnov');
  assert.equal((await hh.tokens(A)).accessToken, 'AT1');
});

test('qidiruv: muddati o\'tgan token bir marta yangilanadi, natija ixcham', async () => {
  const r = await hh.searchResumes(A, { text: 'шеф-повар', experience: 'moreThan6', evil: 'x' });
  assert.equal(r.found, 1);
  assert.equal(r.items[0].totalMonths, 150);
  assert.equal(r.items[0].experience[0].company, 'Rayhon');
  assert.equal((await hh.tokens(A)).accessToken, 'AT2');          // refresh ishladi
  const q = calls.filter(c => c.url.includes('/resumes?')).pop().url;
  assert.match(q, /area=2759/); assert.match(q, /host=hh\.uz/); assert.ok(!/evil/.test(q));
});

test('bazaga qo\'shish: kontaktsiz nomzod, rasm bilan, takror qo\'shilmaydi', async () => {
  const Candidate = require('../src/models/Candidate');
  const id = 'c4bd1eca0010669c6200a7f90d4f7a56336449';
  const a = await hh.importResume(A, id, { tag: 'shef-milliy' });
  assert.equal(a.created, true);
  const c = await Candidate.findOne({ id: a.id }).lean();
  assert.equal(c.fullName, 'Шеф-повар национальной узбекской кухни');   // ism yashirin — sarlavha
  assert.equal(c.role, 'oshpaz');
  assert.equal(c.experienceYears, 22); assert.equal(c.salaryExpectation, '1200 USD');
  assert.equal(c.phone, ''); assert.equal(c.hhResumeId, id); assert.ok(c.hasPhoto);
  assert.equal(c.workHistory[0].period, '01.2022 – hozir');
  assert.deepEqual(c.tags, ['shef-milliy']);
  const b = await hh.importResume(A, id);
  assert.equal(b.duplicate, true);
  assert.equal(await Candidate.countDocuments({ hhResumeId: id }), 1);
});

test('vakansiya qoralamasi: POST JSON, faqat ruxsat etilgan maydonlar; nashr alohida yo\'l', async () => {
  const seen = [];
  const prev = global.fetch;
  global.fetch = async (url, o = {}) => {
    seen.push({ url: String(url), method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null, ct: (o.headers || {})['Content-Type'] });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (String(url).includes('/vacancies/drafts/77/publish')) return json(201, { vacancies: [{ id: '555' }] });
    if (/\/vacancies\/drafts\/77/.test(String(url))) return o.method === 'DELETE' ? { ok: true, status: 204, json: async () => ({}) } : json(200, { id: '77', name: 'Рекрутер' });
    if (String(url).includes('/vacancies/drafts')) return json(201, { id: '77' });
    return json(404, {});
  };
  try {
    const r = await hh.drafts.create(A, { name: 'Рекрутер', description: '<p>x</p>', salary_range: { from: 6000000, to: 8000000, currency: 'UZS' }, evil: 1 });
    assert.equal(r.id, '77');
    const c = seen[0];
    assert.equal(c.method, 'POST'); assert.equal(c.ct, 'application/json');
    assert.match(c.url, /\/vacancies\/drafts\?host=hh\.uz$/);
    assert.equal(c.body.name, 'Рекрутер'); assert.equal(c.body.salary_range.to, 8000000); assert.equal(c.body.evil, undefined);
    assert.equal((await hh.drafts.get(A, '77')).name, 'Рекрутер');
    await assert.rejects(hh.drafts.get(A, '../me'), /id noto/);
    assert.deepEqual(await hh.drafts.remove(A, '77'), {});
    assert.ok(!seen.some(s => s.url.includes('/publish')));        // yaratish/ko'rish nashr qilmaydi
    const p = await hh.drafts.publish(A, '77');
    assert.equal(p.vacancies[0].id, '555'); assert.equal(seen.pop().method, 'POST');
  } finally { global.fetch = prev; }
});
