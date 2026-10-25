// ── Nomzod profili bezagi: rang/naqsh tekshiruvi, Telegram rangi ──
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tg = require('../src/services/telegram');
const ps = require('../src/services/profileStyle');

test('rang va naqsh: faqat ro\'yxatdagilar, bo\'sh rang — qaytarish', () => {
  assert.deepEqual(ps.clean({ color: 'pink2', pattern: 'coffee' }), { color: 'pink2', pattern: 'coffee' });
  assert.deepEqual(ps.clean({ color: '' }), { color: '' });
  assert.deepEqual(ps.clean({}), {});
  assert.throws(() => ps.clean({ color: 'gold' }), /Rang/);
  assert.throws(() => ps.clean({ pattern: '<script>' }), /Naqsh/);
  assert.equal(ps.COLORS.length, 16);
});

test('Telegram profil rangi -> bizning rang', () => {
  assert.equal(ps.fromTelegram(5), 'blue');
  assert.equal(ps.fromTelegram(6), 'pink');
  assert.equal(ps.fromTelegram(14), 'pink2');
  assert.equal(ps.fromTelegram(null), '');
  assert.equal(ps.fromTelegram(99), '');
});

test('ko\'rinish: tanlangani > Telegram rangi > ko\'k', () => {
  assert.deepEqual(ps.view({}), { color: 'blue', pattern: '', chosen: false });
  assert.deepEqual(ps.view({ profileStyle: { tgColor: 'violet' } }), { color: 'violet', pattern: '', chosen: false });
  assert.deepEqual(ps.view({ profileStyle: { tgColor: 'violet', color: 'green', pattern: 'star' } }), { color: 'green', pattern: 'star', chosen: true });
});

test('Telegram rangi bir marta o\'qiladi, xato bo\'lsa jim', async () => {
  const realGet = tg.getChat, realTok = tg.platformToken;
  let calls = 0, updates = [];
  tg.platformToken = () => 'x';
  const mk = () => {
    const c = { _id: 1, tgChatId: '77', profileStyle: {}, set(k, v) { const [, f] = k.split('.'); this.profileStyle[f] = v; } };
    c.constructor = { updateOne: async (q, u) => { updates.push(u.$set); } };
    return c;
  };
  try {
    tg.getChat = async () => { calls++; return { profile_accent_color_id: 6 }; };
    const c = mk();
    await ps.syncTelegram(c);
    assert.equal(c.profileStyle.tgColor, 'pink');
    assert.equal(updates[0]['profileStyle.tgColor'], 'pink');
    await ps.syncTelegram(c);                                        // tgCheckedAt bor — qayta so'ramaydi
    assert.equal(calls, 1);
    tg.getChat = async () => { throw new Error('chat not found'); };
    const d = mk();
    await ps.syncTelegram(d);
    assert.equal(d.profileStyle.tgColor, '');
    assert.ok(d.profileStyle.tgCheckedAt);
  } finally { tg.getChat = realGet; tg.platformToken = realTok; }
});
