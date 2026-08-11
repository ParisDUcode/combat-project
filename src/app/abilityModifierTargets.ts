export type AbilityModifierTargetKind = 'stat' | 'derived';

export interface AbilityModifierTarget {
  kind: AbilityModifierTargetKind;
  target: 'PHYS' | 'CON' | 'INT' | 'SOC' | 'AC' | 'MR' | 'SPEED';
}

export interface AbilityModifierLike {
  label: string;
  value: string;
}

export interface AbilityDerivedModifierTotals {
  ac: number;
  mr: number;
  speed: number;
}

const STAT_ALIASES: Record<string, 'PHYS' | 'CON' | 'INT' | 'SOC'> = {
  PHYS: 'PHYS',
  STR: 'PHYS',
  DEX: 'PHYS',
  CON: 'CON',
  INT: 'INT',
  WIS: 'INT',
  SOC: 'SOC',
  SOCIAL: 'SOC',
  CHA: 'SOC',
};

const DERIVED_ALIASES: Record<string, 'AC' | 'MR' | 'SPEED'> = {
  AC: 'AC',
  ARMOR: 'AC',
  ARMOUR: 'AC',
  MR: 'MR',
  'MAGIC RESIST': 'MR',
  'MAGIC RESISTANCE': 'MR',
  SPEED: 'SPEED',
  MOVE: 'SPEED',
  MOVEMENT: 'SPEED',
};

export const resolveAbilityModifierTarget = (value: unknown): AbilityModifierTarget | null => {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase();
  if (!key) return null;

  const statTarget = STAT_ALIASES[key];
  if (statTarget) return { kind: 'stat', target: statTarget };

  const derivedTarget = DERIVED_ALIASES[key];
  if (derivedTarget) return { kind: 'derived', target: derivedTarget };

  return null;
};

export const collectAbilityDerivedModifierTotals = (
  modifiers: AbilityModifierLike[] | undefined,
  parseModifierValue: (value: string) => number,
): AbilityDerivedModifierTotals => {
  return (modifiers ?? []).reduce<AbilityDerivedModifierTotals>((acc, mod) => {
    const target = resolveAbilityModifierTarget(mod.label);
    if (target?.kind !== 'derived') return acc;

    const value = parseModifierValue(mod.value);
    if (target.target === 'AC') acc.ac += value;
    if (target.target === 'MR') acc.mr += value;
    if (target.target === 'SPEED') acc.speed += value;

    return acc;
  }, { ac: 0, mr: 0, speed: 0 });
};
