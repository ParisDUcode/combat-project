import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Extract the getActionType function source from App.tsx and evaluate it in isolation.
const __dirname = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(__dirname, '../src/app/App.tsx'), 'utf8').replace(/\r\n/g, '\n');

// Pull the exact function body (between the marker comment and the next top-level const).
const start = appSource.indexOf('const getActionType =');
const end = appSource.indexOf('const getActionCost =');
assert.notEqual(start, -1, 'getActionType should exist in App.tsx');
assert.notEqual(end, -1, 'getActionCost should follow getActionType');
const fnSource = appSource.slice(start, end);

// Evaluate: strip TypeScript type annotations so plain JS can run it.
const jsSource = fnSource
  .replace(/const getActionType = \(entry\?: string \| Record<string, any> \| null\): ActionCost =>/, 'const getActionType = (entry) =>')
  .replace(/\(value: any, acc: string\[\]\): void/, '(value, acc)')
  .replace(/const parts: string\[\] = \[\];/, 'const parts = [];');

const getActionType = new Function(`${jsSource}; return getActionType;`)();

test('bonus action via "bonus action" phrase in first 4 words', () => {
  assert.equal(getActionType('Bonus action: cast'), 'bonus');
  assert.equal(getActionType('Cast as bonus action now'), 'bonus');
  assert.equal(getActionType({ description: 'Use: Bonus Action to dash' }), 'bonus');
});

test('no bonus when trigger words appear after the first 4 words', () => {
  assert.equal(getActionType('Cast as a bonus action'), 'action');
  assert.equal(getActionType('Swing your weapon, then as a reaction strike back'), 'action');
  assert.equal(getActionType({ description: 'A long description that eventually mentions a reaction much later on' }), 'action');
});

test('bonus via "reaction" keyword', () => {
  assert.equal(getActionType('Reaction: interrupt an enemy'), 'bonus');
  assert.equal(getActionType({ description: 'Shield — reaction when hit' }), 'bonus');
});

test('default action fallback', () => {
  assert.equal(getActionType('Fireball: hurl a bead of flame'), 'action');
  assert.equal(getActionType('Misty Step: teleport up to 30 feet'), 'action');
  assert.equal(getActionType(undefined), 'action');
  assert.equal(getActionType(''), 'action');
});

test('passive special-case preserved', () => {
  assert.equal(getActionType('Passive: always on'), 'passive');
});

test('scans actionType and type fields', () => {
  assert.equal(getActionType({ actionType: 'reaction' }), 'bonus');
  assert.equal(getActionType({ type: 'bonus action' }), 'bonus');
  assert.equal(getActionType({ type: 'Ability', description: 'strike hard' }), 'action');
});

test('scans attack sub-descriptions and title', () => {
  assert.equal(
    getActionType({ name: 'Riposte', attacks: [{ description: 'make a reaction strike' }] }),
    'bonus',
  );
  assert.equal(getActionType({ name: 'Quick bonus action jab', description: '' }), 'bonus');
  assert.equal(getActionType({ name: 'Slash', description: 'a normal swing' }), 'action');
  // trigger word buried past the first 4 words of a sub-description -> action
  assert.equal(
    getActionType({ name: 'Slash', attacks: [{ description: 'a mighty swing that counts as a reaction' }] }),
    'action',
  );
});

test('case-insensitive matching', () => {
  assert.equal(getActionType('BONUS ACTION: surge'), 'bonus');
  assert.equal(getActionType('REACTION strike'), 'bonus');
});
