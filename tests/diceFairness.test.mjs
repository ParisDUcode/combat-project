// Dice fairness audit — verifies the exact rollD/rollDie implementations used by the app.
// 1) Asserts the source files still contain the audited expression.
// 2) Runs 100,000 rolls per die and applies a chi-square uniformity test.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// ─── 1. Source-level assertions ─────────────────────────────────────────────
const appSrc = readFileSync(join(root, "src/app/App.tsx"), "utf8").replace(/\r\n/g, "\n");
const engineSrc = readFileSync(join(root, "src/app/monsters/engine.ts"), "utf8").replace(/\r\n/g, "\n");

const EXPECTED_EXPR = "Math.floor(Math.random() * sides) + 1";
const appHas = appSrc.includes(`function rollD(sides: number) {\n  return ${EXPECTED_EXPR};`);
const engineHas = engineSrc.includes(EXPECTED_EXPR);

console.log("Source assertions:");
console.log(`  App.tsx rollD uses '${EXPECTED_EXPR}':        ${appHas ? "MATCH" : "MISMATCH — re-audit needed"}`);
console.log(`  engine.ts rollDie uses same expression:       ${engineHas ? "MATCH" : "MISMATCH — re-audit needed"}`);
console.log();

// ─── 2. Exact replicas of the audited implementations ───────────────────────
// App.tsx rollD:
const rollD = (sides) => Math.floor(Math.random() * sides) + 1;
// engine.ts rollDie:
const rollDie = (sides) => (sides <= 0 ? 0 : Math.floor(Math.random() * sides) + 1);

// ─── 3. Simulation + chi-square uniformity test ─────────────────────────────
const ROLLS = 100_000;
// Chi-square critical values at p = 0.001 for df = sides-1 (conservative threshold).
const CHI_CRIT = { 4: 16.27, 6: 20.52, 8: 24.32, 10: 27.88, 12: 31.26, 20: 43.82, 100: 135.81 };

function auditDie(label, sides, fn) {
  const counts = new Array(sides).fill(0);
  for (let i = 0; i < ROLLS; i++) {
    const v = fn(sides);
    if (v < 1 || v > sides) {
      console.log(`${label}: FAIL — out-of-range value ${v}`);
      return false;
    }
    counts[v - 1]++;
  }
  const expected = ROLLS / sides;
  const chi2 = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
  const crit = CHI_CRIT[sides];
  const pass = chi2 < crit;
  const pcts = counts.map((c) => (100 * c) / ROLLS);
  console.log(
    `${label}: χ²=${chi2.toFixed(2)} (crit ${crit}) — ${pass ? "PASS" : "FAIL"} | per-face %: ` +
      pcts.map((p) => p.toFixed(2)).join(" ")
  );
  return pass;
}

console.log(`Simulation: ${ROLLS.toLocaleString()} rolls per die`);
let allPass = true;
for (const sides of [4, 6, 8, 10, 12, 20]) {
  allPass = auditDie(`d${sides} (App rollD)   `.slice(0, 20), sides, rollD) && allPass;
}
// engine.ts rollDie spot-check on d20 + full custom-dice tray d100 via App rollD
allPass = auditDie("d20 (engine rollDie)".slice(0, 20), 20, rollDie) && allPass;
allPass = auditDie("d100 (App rollD)  ".slice(0, 20), 100, rollD) && allPass;

console.log();
console.log(`VERDICT: ${appHas && engineHas && allPass ? "FAIR" : "NOT FAIR"}`);
process.exit(appHas && engineSrc && allPass ? 0 : 1);
