const test = require('node:test');
const assert = require('node:assert/strict');
const { paginate, PAGE_SIZE } = require('../utils');

test('paginate: page 1 sur une liste vide', () => {
  const res = paginate([], 1);
  assert.deepEqual(res.data, []);
  assert.equal(res.total, 0);
  assert.equal(res.page, 1);
  assert.equal(res.totalPages, 1);
});

test('paginate: renvoie PAGE_SIZE éléments par page', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);
  const res = paginate(rows, 1);
  assert.equal(res.data.length, PAGE_SIZE);
  assert.deepEqual(res.data, rows.slice(0, PAGE_SIZE));
  assert.equal(res.totalPages, 3);
});

test('paginate: dernière page peut avoir moins de PAGE_SIZE éléments', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);
  const res = paginate(rows, 3);
  assert.equal(res.data.length, 5);
  assert.deepEqual(res.data, rows.slice(20, 25));
});

test('paginate: une page hors bornes retombe sur la dernière page valide', () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  const res = paginate(rows, 99);
  assert.equal(res.page, 2);
  assert.equal(res.data.length, 2);
});

test('paginate: une page invalide (0, négative, non numérique) retombe sur la page 1', () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  assert.equal(paginate(rows, 0).page, 1);
  assert.equal(paginate(rows, -5).page, 1);
  assert.equal(paginate(rows, 'abc').page, 1);
});
