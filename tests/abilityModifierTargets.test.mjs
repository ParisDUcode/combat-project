import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveAbilityModifierTarget } = require('../src/app/abilityModifierTargets.ts');

test('resolves stat aliases', () => {
  assert.deepEqual(resolveAbilityModifierTarget('STR'), { kind: 'stat', target: 'PHYS' });
  assert.deepEqual(resolveAbilityModifierTarget('CHA'), { kind: 'stat', target: 'SOC' });
});

test('resolves derived aliases for armor, magic resist, and speed', () => {
  assert.deepEqual(resolveAbilityModifierTarget('AC'), { kind: 'derived', target: 'AC' });
  assert.deepEqual(resolveAbilityModifierTarget('Magic Resist'), { kind: 'derived', target: 'MR' });
  assert.deepEqual(resolveAbilityModifierTarget('Speed'), { kind: 'derived', target: 'SPEED' });
});

test('returns null for unsupported labels', () => {
  assert.equal(resolveAbilityModifierTarget('Unknown Label'), null);
});
