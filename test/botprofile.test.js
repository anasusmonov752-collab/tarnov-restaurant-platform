// ── Bot profili (services/botProfile): Telegram chegaralari va faqat farqni yozish ──
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tg = require('../src/services/telegram');
const bp = require('../src/services/botProfile');

test('matnlar Telegram chegarasiga sig\'adi va "bepul" va\'dasi bor', () => {
  for (const lang of ['uz', 'ru']) {
    const p = bp.PROFILE[lang];
    assert.ok(p.name.length <= bp.LIMITS.name, lang + ' name');
    assert.ok(p.short.length <= bp.LIMITS.short, lang + ' short ' + p.short.length);
    assert.ok(p.desc.length <= bp.LIMITS.desc, lang + ' desc ' + p.desc.length);
    assert.ok(p.cmds.every(c => /^[a-z0-9_]{1,32}$/.test(c.command)));
  }
  assert.match(bp.PROFILE.uz.desc, /bepul/);
  assert.match(bp.PROFILE.ru.desc, /бесплатно/);
});

test('apply: faqat farq qilganini yozadi, ikkinchi marta hech narsa', async () => {
  const store = {}, sets = [];
  const orig = tg.call;
  tg.call = async (tok, method, p) => {
    const k = (p && p.language_code) || '';
    const get = { getMyName: ['name', 'name'], getMyShortDescription: ['short', 'short_description'],
      getMyDescription: ['desc', 'description'] }[method];
    if (get) return { [get[1]]: store[get[0] + k] || '' };
    if (method === 'getMyCommands') return store['cmds' + k] || [];
    sets.push(method + (k ? ':' + k : ''));
    if (method === 'setMyName') store['name' + k] = p.name;
    if (method === 'setMyShortDescription') store['short' + k] = p.short_description;
    if (method === 'setMyDescription') store['desc' + k] = p.description;
    if (method === 'setMyCommands') store['cmds' + k] = p.commands;
    return true;
  };
  try {
    const a = await bp.apply('x');
    assert.equal(a.changed.length, 8);
    assert.equal(sets.length, 8);
    const b = await bp.apply('x');
    assert.deepEqual(b.changed, []);
    assert.equal(sets.length, 8);
  } finally { tg.call = orig; }
});
