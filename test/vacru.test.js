// ── Vakansiyaning ruscha matni (Vacancy.ru, 2026-11-18) ──
// Rus tilidagi nomzod ruscha nusxani ko'radi; bo'sh maydon — o'zbekcha.
// Ruschasiz forma o'zbekcha matnni o'zgartirsa — eskirgan ruscha nusxa o'chadi.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vac = require('../src/services/vacancy');

const V = {
  id: 'v1', title: 'Ranner (ovqat tashuvchi)', role: 'ofitsiant', status: 'open',
  venue: '5 ta filial', landmark: '', hook: 'Tajribasiz ham olinadi', schedule: '6/1, 12 soat',
  conditions: 'Ovqat', duties: ['Taomni stolga olib borish'], requirements: [],
  ru: { title: 'Раннер (разносчик блюд)', venue: '5 филиалов', landmark: '', hook: '', schedule: '6/1, 12 часов',
        conditions: '', duties: ['Подача блюд к столу'], requirements: [] }
};

test('rus tilida — ruscha nusxa, bo\'sh maydon — o\'zbekcha', () => {
  const c = vac.forCandidate(V, null, 'ru');
  assert.equal(c.title, 'Раннер (разносчик блюд)');
  assert.equal(c.venue, '5 филиалов');
  assert.equal(c.hook, 'Tajribasiz ham olinadi');          // ruschasi yo'q
  assert.equal(c.schedule, '6/1, 12 часов');
  assert.deepEqual(c.duties, ['Подача блюд к столу']);
  assert.deepEqual(c.requirements, []);
  assert.equal(c.conditions, 'Питание');                   // ma'lum so'z perksText bilan
});

test('o\'zbek tilida va panelda — asosiy matn', () => {
  const c = vac.forCandidate(V, null, 'uz');
  assert.equal(c.title, 'Ranner (ovqat tashuvchi)');
  assert.equal(c.venue, '5 ta filial');
  assert.deepEqual(c.duties, ['Taomni stolga olib borish']);
  const f = vac.full(V);
  assert.equal(f.title, 'Ranner (ovqat tashuvchi)');
  assert.equal(f.venue, '5 ta filial');
  assert.equal(f.ru.venue, '5 филиалов');
  assert.equal(f.hasRu, true);
  assert.equal(vac.full({ title: 'X', role: 'xostess' }).hasRu, false);
});

test('clean: ru tozalanadi; ruschasiz forma o\'zgargan maydonning ruschasini o\'chiradi', () => {
  const a = vac.clean({ ru: { title: '  Повар ', duties: '• Готовить\n\n- Убирать', bogus: 'x' } });
  assert.equal(a.ru.title, 'Повар');
  assert.deepEqual(a.ru.duties, ['Готовить', 'Убирать']);
  assert.equal(a.ru.bogus, undefined);

  // Mijoz Mini App'ida faqat grafikni o'zgartirdi, sarlavha o'sha
  const b = vac.clean({ title: V.title, schedule: '5/2', duties: V.duties }, V);
  assert.equal(b.ru.schedule, '');
  assert.equal(b.ru.title, 'Раннер (разносчик блюд)');
  assert.deepEqual(b.ru.duties, ['Подача блюд к столу']);

  // Hech narsa o'zgarmasa ru tegilmaydi
  assert.equal(vac.clean({ title: V.title, venue: V.venue }, V).ru, undefined);
});

test('tarjima: AI javobi tozalanadi, asl matni bo\'sh maydon bo\'sh qoladi', async () => {
  const ai = require('../src/services/ai');
  const orig = ai.complete;
  ai.complete = async () => ({ title: 'Хостес', venue: 'Придумано', landmark: '', hook: 'Х', schedule: '6/1',
    conditions: '', duties: ['Встречать гостей', ''], requirements: ['Лишнее'] });
  try {
    const r = await vac.translateRu({ title: 'Xostess', hook: 'Y', schedule: '6/1', duties: 'Mehmonni kutib olish' }, 'ag');
    assert.equal(r.title, 'Хостес');
    assert.equal(r.venue, '');                     // aslida bo'sh edi
    assert.deepEqual(r.duties, ['Встречать гостей']);
    assert.deepEqual(r.requirements, []);
  } finally { ai.complete = orig; }
});
