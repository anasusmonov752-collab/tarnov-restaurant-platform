// ── Nomzod profili kartasi rangi: tekshiruv, Telegram rangi ──
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tg = require('../src/services/telegram');
const ps = require('../src/services/profileStyle');

test('rang: faqat ro\'yxatdagi 8 ta, bo\'sh — Telegram rangiga qaytish', () => {
  assert.equal(ps.COLORS.length, 8);
  assert.deepEqual(ps.clean({ color: 'graphite' }), { color: 'graphite' });
  assert.deepEqual(ps.clean({ color: '' }), { color: '' });
  assert.deepEqual(ps.clean({}), {});
  assert.throws(() => ps.clean({ color: 'pink2' }), /Rang/);
  assert.throws(() => ps.clean({ color: '<b>' }), /Rang/);
});

test('Telegram profil rangi -> eng yaqin bosiq rang', () => {
  assert.equal(ps.fromTelegram(5), 'blue');
  assert.equal(ps.fromTelegram(6), 'rose');
  assert.equal(ps.fromTelegram(14), 'rose');
  assert.equal(ps.fromTelegram(0), 'burgundy');
  assert.equal(ps.fromTelegram(null), '');
  assert.equal(ps.fromTelegram(99), '');
});

test('ko\'rinish: tanlangani > Telegram rangi > to\'q ko\'k; eski qiymatlar e\'tiborsiz', () => {
  assert.deepEqual(ps.view({}), { color: 'blue', chosen: false });
  assert.deepEqual(ps.view({ profileStyle: { tgColor: 'plum' } }), { color: 'plum', chosen: false });
  assert.deepEqual(ps.view({ profileStyle: { tgColor: 'plum', color: 'emerald' } }), { color: 'emerald', chosen: true });
  assert.deepEqual(ps.view({ profileStyle: { color: 'pink2' } }), { color: 'blue', chosen: false });
});

test('Telegram rangi bir marta o\'qiladi, xato bo\'lsa jim', async () => {
  const realGet = tg.getChat, realTok = tg.platformToken;
  let calls = 0; const updates = [];
  tg.platformToken = () => 'x';
  const mk = () => {
    const c = { _id: 1, tgChatId: '77', profileStyle: {}, set(k, v) { this.profileStyle[k.split('.')[1]] = v; } };
    c.constructor = { updateOne: async (q, u) => { updates.push(u.$set); } };
    return c;
  };
  try {
    tg.getChat = async () => { calls++; return { profile_accent_color_id: 6 }; };
    const c = mk();
    await ps.syncTelegram(c);
    assert.equal(c.profileStyle.tgColor, 'rose');
    assert.equal(updates[0]['profileStyle.tgColor'], 'rose');
    await ps.syncTelegram(c);                                        // tgCheckedAt bor — qayta so'ramaydi
    assert.equal(calls, 1);
    tg.getChat = async () => { throw new Error('chat not found'); };
    const d = mk();
    await ps.syncTelegram(d);
    assert.equal(d.profileStyle.tgColor, '');
    assert.ok(d.profileStyle.tgCheckedAt);
  } finally { tg.getChat = realGet; tg.platformToken = realTok; }
});
