// Joy nomlari ruscha o'quvchiga kirillda (2026-11-28: ruscha botda "Sebzor, Drujba..." lotincha chiqardi)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const I18N = require('../public/js/th-i18n');

test('joy nomi: ruschada kirill, o\'zbekchada o\'zgarmaydi, bilmagani o\'z holicha', () => {
  assert.equal(I18N.place('Sebzor, Drujba, Chorsu, Keles, Istirohat', 'ru'), 'Себзар, Дружба, Чорсу, Келес, Истирохат');
  assert.equal(I18N.place('Toshkent', 'ru'), 'Ташкент');
  assert.equal(I18N.place("Mirzo Ulug'bek · Yunusobod", 'ru'), 'Мирзо-Улугбек · Юнусабад');
  assert.equal(I18N.place('Sebzor, Drujba', 'uz'), 'Sebzor, Drujba');
  assert.equal(I18N.place('Bodomzor', 'ru'), 'Bodomzor');
  assert.equal(I18N.place('', 'ru'), '');
});
