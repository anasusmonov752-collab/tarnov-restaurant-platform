// ── Botdagi o'zimizning rasmlar (services/telegram sendLocalPhoto / editLocalPhoto) ──
// 2026-11-17 jonli: rasm URL bilan berilganda Telegram uni bepul Render'dan yuklay olmadi
// ("failed to get HTTP URL content") — ruscha tugma bosilganda rasm o'rniga yangi matnli
// xabar ketdi. Endi fayl o'zimiz yuklanadi (multipart), keyin file_id ishlatiladi.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

let tg, realFetch, calls = [], reply;

before(() => {
  tg = require('../src/services/telegram');
  realFetch = global.fetch;
  global.fetch = async (url, o = {}) => {
    const e = { method: String(url).split('/').pop(), form: o.body instanceof FormData };
    if (e.form) {
      e.fields = {};
      for (const [k, v] of o.body.entries()) e.fields[k] = typeof v === 'string' ? v : { size: v.size, type: v.type, name: v.name };
    } else e.json = JSON.parse(o.body);
    calls.push(e);
    const body = reply ? reply(e) : { ok: true, result: { message_id: 7, photo: [{ file_id: 'small' }, { file_id: 'BIG' }] } };
    return { ok: body.ok, status: body.ok ? 200 : 400, json: async () => body };
  };
});
after(() => { global.fetch = realFetch; });

test('birinchi marta — faylning o\'zi (URL emas), keyin — file_id', async () => {
  const kb = { inline_keyboard: [[{ text: 'Ishlarni ko\'rish', callback_data: 'x' }]] };
  await tg.sendLocalPhoto('T', '1', 'img/bot-welcome-uz.jpg', '<b>Salom</b>', { parse_mode: 'HTML', reply_markup: kb });
  const a = calls[0];
  assert.equal(a.method, 'sendPhoto');
  assert.equal(a.form, true);
  assert.ok(a.fields.photo.size > 10000, 'rasm baytlari yuborilgan');
  assert.equal(a.fields.photo.type, 'image/jpeg');
  assert.equal(a.fields.caption, '<b>Salom</b>');
  assert.equal(a.fields.parse_mode, 'HTML');
  assert.deepEqual(JSON.parse(a.fields.reply_markup), kb);           // tugmalar ham yetadi

  await tg.sendLocalPhoto('T', '2', 'img/bot-welcome-uz.jpg', 'Salom', {});
  assert.equal(calls[1].form, false);
  assert.equal(calls[1].json.photo, 'BIG');                           // eng katta o'lcham file_id
});

test('til almashganda: yangi rasm attach:// bilan, izoh va tugmalar media ichida', async () => {
  calls = [];
  const kb = { inline_keyboard: [[{ text: 'O\'zbekcha', callback_data: 'ft:il:uz' }]] };
  await tg.editLocalPhoto('T', '1', 7, 'img/bot-welcome-ru.jpg', '<b>Сейчас</b>', { parse_mode: 'HTML', reply_markup: kb });
  const e = calls[0];
  assert.equal(e.method, 'editMessageMedia');
  assert.equal(e.form, true);
  const media = JSON.parse(e.fields.media);
  assert.equal(media.media, 'attach://photo');
  assert.equal(media.caption, '<b>Сейчас</b>');
  assert.equal(media.parse_mode, 'HTML');
  assert.equal(e.fields.photo.name, 'bot-welcome-ru.jpg');
  assert.deepEqual(JSON.parse(e.fields.reply_markup), kb);
  assert.equal(e.fields.parse_mode, undefined);                       // parse_mode faqat media ichida

  // Ikkinchi marta — file_id, fayl qayta yuklanmaydi
  await tg.editLocalPhoto('T', '1', 7, 'img/bot-welcome-ru.jpg', 'x', {});
  assert.equal(calls[1].form, false);
  assert.equal(calls[1].json.media.media, 'BIG');
});

test('eskirgan file_id — fayl bilan qayta; boshqa xato — yashirilmaydi', async () => {
  calls = [];
  reply = e => e.form ? { ok: true, result: { photo: [{ file_id: 'NEW' }] } }
    : { ok: false, error_code: 400, description: 'Bad Request: wrong file identifier/HTTP URL specified' };
  await tg.sendLocalPhoto('T', '1', 'img/bot-welcome-uz.jpg', 'x', {});
  assert.deepEqual(calls.map(c => c.form), [false, true]);
  calls = [];
  await tg.sendLocalPhoto('T', '1', 'img/bot-welcome-uz.jpg', 'x', {});
  assert.equal(calls[0].json.photo, 'NEW');

  reply = () => ({ ok: false, error_code: 400, description: 'Bad Request: message is not modified' });
  await assert.rejects(() => tg.editLocalPhoto('T', '1', 7, 'img/bot-welcome-ru.jpg', 'x', {}), /not modified/);
  reply = null;
});

test('faqat public/img ichidagi rasm — begona yo\'l rad etiladi', async () => {
  calls = [];
  await assert.rejects(() => tg.sendLocalPhoto('T', '1', '../server.js', 'x'), /yo'li/);
  await assert.rejects(() => tg.sendLocalPhoto('T', '1', 'img/../../.env', 'x'), /yo'li/);
  assert.equal(calls.length, 0);
});
