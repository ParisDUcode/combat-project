import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTurnOrder, turnIndexAfterInsert, uniqueDisplayName } = require('../src/app/combatOrder.ts');

const m = (uid, initiative) => ({ uid, initiative });

test('inserting ahead of the active combatant keeps their turn', () => {
  const monsters = [m('a', 18), m('b', 10), m('c', 5)];
  const oldOrder = buildTurnOrder(monsters, []);
  const newOrder = buildTurnOrder([...monsters, m('new', 14)], []);
  assert.deepEqual(newOrder, ['a', 'new', 'b', 'c']);
  // active = b (index 1) -> now index 2
  assert.equal(turnIndexAfterInsert(oldOrder, 1, newOrder), 2);
});

test('inserting behind the active combatant leaves the index alone', () => {
  const monsters = [m('a', 18), m('b', 10)];
  const oldOrder = buildTurnOrder(monsters, []);
  const newOrder = buildTurnOrder([...monsters, m('new', 3)], []);
  assert.equal(turnIndexAfterInsert(oldOrder, 0, newOrder), 0);
});

test('players and monsters share one descending order', () => {
  assert.deepEqual(buildTurnOrder([m('mon', 12)], [m('p1', 15), m('p2', 12)]), ['p1', 'mon', 'p2']);
});

test('display names are numbered when duplicated', () => {
  assert.equal(uniqueDisplayName('Wolf', []), 'Wolf');
  assert.equal(uniqueDisplayName('Wolf', ['Wolf']), 'Wolf 2');
  assert.equal(uniqueDisplayName('Wolf', ['Wolf 1', 'Wolf 2']), 'Wolf 3');
});
