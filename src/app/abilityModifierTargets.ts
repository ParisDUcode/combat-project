export type AbilityModifierTargetKind = 'stat' | 'derived';

export interface AbilityModifierTarget {
  kind: AbilityModifierTargetKind;
  target: 'PHYS' | 'CON' | 'INT' | 'SOC' | 'AC' | 'MR' | 'SPEED';
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
