import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collectAbilityDerivedModifierTotals, resolveAbilityModifierTarget } = require('../src/app/abilityModifierTargets.ts');

test('resolves stat aliases', () => {
  assert.deepEqual(resolveAbilityModifierTarget('STR'), { kind: 'stat', target: 'PHYS' });
  assert.deepEqual(resolveAbilityModifierTarget('CHA'), { kind: 'stat', target: 'SOC' });
});

test('resolves derived aliases for armor, magic resist, and speed', () => {
  assert.deepEqual(resolveAbilityModifierTarget('AC'), { kind: 'derived', target: 'AC' });
  assert.deepEqual(resolveAbilityModifierTarget('Armor'), { kind: 'derived', target: 'AC' });
  assert.deepEqual(resolveAbilityModifierTarget('Magic Resist'), { kind: 'derived', target: 'MR' });
  assert.deepEqual(resolveAbilityModifierTarget('Speed'), { kind: 'derived', target: 'SPEED' });
});

test('collects derived totals from modifiers', () => {
  const totals = collectAbilityDerivedModifierTotals(
    [{ label: 'AC', value: '2' }, { label: 'Magic Resist', value: '1' }, { label: 'Speed', value: '3' }],
    (value) => Number(value),
  );

  assert.deepEqual(totals, { ac: 2, mr: 1, speed: 3 });
});

test('returns null for unsupported labels', () => {
  assert.equal(resolveAbilityModifierTarget('Unknown Label'), null);
});
