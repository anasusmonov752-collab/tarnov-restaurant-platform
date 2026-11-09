// ── AI ovozi: VoiceLab kaliti (vlk_) — boshqa API (services/tts) ──
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

let calls, realFetch;
beforeEach(() => {
  calls = [];
  realFetch = global.fetch;
  delete require.cache[require.resolve('../src/services/tts')];
});
afterEach(() => { global.fetch = realFetch; delete process.env.AISHA_API_KEY; delete process.env.VOICELAB_VOICE_UZ; });

const res = (status, body, type = 'application/json') => new Response(
  typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), { status, headers: { 'Content-Type': type } });

test('vlk_ kaliti: Bearer, ovoz katalogdan (bir marta), JSON so\'rov, 200 -> WAV', async () => {
  process.env.AISHA_API_KEY = 'vlk_test';
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/v1/voices')) return res(200, { data: [{ id: 'voice_A', kind: 'system' }] });
    if (String(url).endsWith('/v1/tts')) return res(200, new Uint8Array([82, 73, 70, 70]), 'audio/wav');
    return res(404, 'x');
  };
  const tts = require('../src/services/tts');
  assert.equal(tts.isVoiceLab(), true);
  const wav = await tts.synth('Salom', 'uz');
  assert.equal(wav.length, 4);
  await tts.synth('Yana', 'uz');
  assert.equal(calls.filter(c => c.url.includes('/v1/voices')).length, 1);      // ovoz keshlanadi
  const post = calls.find(c => c.url.endsWith('/v1/tts'));
  assert.equal(post.url, 'https://api.voicelab.uz/v1/tts');
  assert.equal(post.opts.headers.Authorization, 'Bearer vlk_test');
  assert.match(post.opts.headers['Idempotency-Key'], /^th-/);
  assert.deepEqual(JSON.parse(post.opts.body), { text: 'Salom', language: 'uz', voice_id: 'voice_A', speed: 1 });
});

test('vlk_: env ovozi katalogsiz; ruxsat yo\'q bo\'lsa tushunarli xato', async () => {
  process.env.AISHA_API_KEY = 'vlk_test';
  process.env.VOICELAB_VOICE_UZ = 'voice_ENV';
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).endsWith('/v1/tts')) return res(403, { error: { code: 'insufficient_permissions' } });
    return res(404, 'x');
  };
  const tts = require('../src/services/tts');
  await assert.rejects(tts.synth('Salom', 'uz'), /VoiceLab TTS 403/);
  assert.equal(calls.some(c => c.url.includes('/v1/voices')), false);
  assert.equal(JSON.parse(calls[0].opts.body).voice_id, 'voice_ENV');
});

test('eski Aisha kaliti — eski manzil', async () => {
  process.env.AISHA_API_KEY = 'oldkey';
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).endsWith('/tts/post/')) return res(201, { audio_path: '/media/a.wav' });
    return res(200, new Uint8Array([1, 2]), 'audio/wav');
  };
  const tts = require('../src/services/tts');
  assert.equal(tts.isVoiceLab(), false);
  assert.equal((await tts.synth('Salom', 'uz')).length, 2);
  assert.equal(calls[0].url, 'https://back.aisha.group/api/v1/tts/post/');
  assert.equal(calls[0].opts.headers['X-Api-Key'], 'oldkey');
});

test('vlk_: ovoz NOMI bo\'yicha — Gulnoza alifboda birinchi bo\'lmasa ham; env nomi ustun', async () => {
  process.env.AISHA_API_KEY = 'vlk_test';
  const list = { data: [{ id: 'voice_AB', display_name: 'Abdulhay Otaxo\'jayev' }, { id: 'voice_GU', display_name: 'Gulnoza', kind: 'system' },
    { id: 'voice_SA', display_name: 'Sardor', kind: 'system' }] };
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/v1/voices')) return res(200, list);
    return res(200, new Uint8Array([1]), 'audio/wav');
  };
  let tts = require('../src/services/tts');
  assert.equal(await tts.voiceFor('uz'), 'voice_GU');
  delete require.cache[require.resolve('../src/services/tts')];
  process.env.VOICELAB_VOICE_UZ = 'sardor';
  tts = require('../src/services/tts');
  assert.equal(await tts.voiceFor('uz'), 'voice_SA');
});
