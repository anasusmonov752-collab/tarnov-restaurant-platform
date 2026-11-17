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
