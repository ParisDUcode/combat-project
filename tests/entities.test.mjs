import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildMonsterEntity,
  buildCustomEntity,
  clearCustomEntities,
  dismissEntity,
  keepEquippedCompanions,
  applyLongRestToEntities,
  findMonsterByQuery,
  normalizeEntities,
} = require('../src/app/entities.ts');

const def = (id, hp = 10) => ({ id, name: id, hp, ac: 2, mr: 1, speed: 3, attacks: [], stats: {} });

test('by-id spawns get indexed uids', () => {
  const first = buildMonsterEntity(def('ice-skeleton'), []);
  const second = buildMonsterEntity(def('ice-skeleton'), [first]);
  assert.equal(first.uid, 'ice-skeleton-1');
  assert.equal(second.uid, 'ice-skeleton-2');
  assert.equal(second.isPermanent, false);
});

test('dismiss removes the card; clear custom keeps permanent companions', () => {
  const fenrir = buildMonsterEntity(def('fenrir', 20), [], { companionId: 'fenrir', currentHp: 5 });
  const block = buildCustomEntity({ name: 'Ice Block', maxHp: 20, armor: 4, magicResist: 4 }, [fenrir], 1);
  assert.equal(fenrir.currentHp, 5);
  assert.deepEqual(clearCustomEntities([fenrir, block]).map((e) => e.uid), ['fenrir-1']);
  assert.deepEqual(dismissEntity([fenrir, block], 'fenrir-1').map((e) => e.uid), [block.uid]);
});

test('unequip removes only the matching permanent companion', () => {
  const fenrir = buildMonsterEntity(def('fenrir'), [], { companionId: 'fenrir' });
  const block = buildCustomEntity({ name: 'Block', maxHp: 5, armor: 0, magicResist: 0 }, [], 2);
  assert.deepEqual(keepEquippedCompanions([fenrir, block], new Set()).map((e) => e.uid), [block.uid]);
  assert.equal(keepEquippedCompanions([fenrir, block], new Set(['fenrir'])).length, 2);
});

test('long rest wipes temporary entities and resets companion HP', () => {
  const fenrir = buildMonsterEntity(def('fenrir', 20), [], { companionId: 'fenrir', currentHp: 3 });
  const block = buildCustomEntity({ name: 'Block', maxHp: 5, armor: 0, magicResist: 0 }, [], 2);
  const result = applyLongRestToEntities(
    [fenrir, block],
    { fenrir: { currentHp: 3 }, louis: { currentHp: 1 } },
    (id) => (id === 'fenrir' ? 20 : undefined),
  );
  assert.deepEqual(result.companions, { fenrir: { currentHp: 20 }, louis: { currentHp: 1 } });
  assert.deepEqual(result.entities.map((e) => [e.uid, e.currentHp]), [['fenrir-1', 20]]);
});

test('lookup matches id or normalized name, case-insensitively', () => {
  const list = [def('ice-skeleton')];
  assert.ok(findMonsterByQuery(list, 'Ice Skeleton'));
  assert.equal(findMonsterByQuery(list, 'nope'), undefined);
});

test('normalizeEntities tolerates bad input', () => {
  assert.deepEqual(normalizeEntities(undefined), []);
  assert.deepEqual(normalizeEntities([null, { uid: 1 }]), []);
});
