// data/roles.js guessRole — yagona lavozim aniqlovchi (rezyume, vakansiya, qidiruv)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { guessRole } = require('../src/data/roles');

test('roles: shashlikchi/mangalchi — oshxona lavozimi (story\'dan tez vakansiya, 2026-11-27)', () => {
  assert.equal(guessRole('Shashlikchi'), 'oshpaz');
  assert.equal(guessRole('Шашлычник'), 'oshpaz');
  assert.equal(guessRole('Mangalchi (kechki smena)'), 'oshpaz');
  assert.equal(guessRole('Кебабщик'), 'oshpaz');
});

test('roles: restoran NOMIdagi "shashlik"/"kabob" lavozim emas', () => {
  assert.equal(guessRole("Shashlik House'da ofitsiant"), 'ofitsiant');
  assert.equal(guessRole('Kabob markazi, kassir'), 'kassir');
  assert.equal(guessRole('Shashlik House'), '');
});

test('roles: eski lavozimlar o\'zgarmadi', () => {
  assert.equal(guessRole('Ofitsiant'), 'ofitsiant');
  assert.equal(guessRole('Oshpaz (turk taomlari)'), 'oshpaz');
  assert.equal(guessRole('Servis menejeri'), 'menejer');
  assert.equal(guessRole('Xostess'), 'xostess');
});
