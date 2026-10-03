import type {
  ActiveAbility,
  MonsterCombatRuntime,
  MonsterDefinition,
  MonsterEffect,
  PassiveTrigger,
  RollFormula,
  RollableAttack,
} from "./types";

export interface RollOutcome {
  diceResults: number[];
  statBonus: number;
  flatBonus: number;
  total: number;
}

export interface PassiveResolution {
  runtime: MonsterCombatRuntime;
  healing: number;
  bonusDamage: number;
  logLines: string[];
}

export interface AttackResolution {
  runtime: MonsterCombatRuntime;
  damage: number;
  selfHealing: number;
  logLine: string;
  effectLines: string[];
}

// Stepped, diminishing-returns mitigation: 1:1 up to 3 defense, then 2 defense per +1 mitigation.
const computeMitigation = (defense: number): number => {
  const def = Math.max(0, Math.floor(defense));
  return def <= 3 ? def : 3 + Math.floor((def - 3) / 2);
};

const applyDamageTypeResistance = (
  rawDamage: number,
  damageType: MonsterDefinition["attacks"][number]["damageType"] | ActiveAbility["damageType"] | MonsterEffect["damageType"],
  monster: MonsterDefinition,
): number => {
  if (damageType === "magic") {
    return Math.max(0, rawDamage - computeMitigation(monster.mr));
  }
  if (damageType === "physical") {
    return Math.max(0, rawDamage - computeMitigation(monster.ac));
  }
  return rawDamage;
};

export interface AbilityResolution {
  runtime: MonsterCombatRuntime;
  canUse: boolean;
  damage: number;
  selfHealing: number;
  logLine: string;
  effectLines: string[];
}

export const rollDie = (sides: number): number => {
  if (sides <= 0) return 0;
  return Math.floor(Math.random() * sides) + 1;
};

const applyFormula = (formula: RollFormula | undefined, stats: MonsterDefinition["stats"]): RollOutcome => {
  const safeFormula: RollFormula = formula ?? { diceCount: 1, diceSides: 4 };
  const diceCount = Math.max(0, safeFormula.diceCount);
  const diceSides = Math.max(1, safeFormula.diceSides);
  const diceResults: number[] = [];
  for (let i = 0; i < diceCount; i += 1) {
    diceResults.push(rollDie(diceSides));
  }
  const diceSum = diceResults.reduce((sum, value) => sum + value, 0);
  const statBonus = safeFormula.stat ? stats[safeFormula.stat] : 0;
  const flatBonus = safeFormula.flatBonus ?? 0;
  const preliminary = diceSum + statBonus + flatBonus;
  const total = safeFormula.minTotal !== undefined ? Math.max(safeFormula.minTotal, preliminary) : preliminary;
  return { diceResults, statBonus, flatBonus, total };
};

const applyEffect = (
  effect: MonsterEffect,
  stats: MonsterDefinition["stats"],
  runtime: MonsterCombatRuntime,
): { runtime: MonsterCombatRuntime; damage: number; selfHealing: number; logLine?: string } => {
  const roll = applyFormula(effect.formula, stats);
  if (effect.type === "damage") {
    return { runtime, damage: roll.total, selfHealing: 0, logLine: effect.note };
  }
  if (effect.type === "heal_self") {
    return { runtime, damage: 0, selfHealing: roll.total, logLine: effect.note };
  }
  if (effect.type === "resource_gain" && effect.resourceId) {
    const maxCurrent = runtime.resources[effect.resourceId] ?? 0;
    const gained = Math.max(0, roll.total);
    return {
      runtime: {
        ...runtime,
        resources: {
          ...runtime.resources,
          [effect.resourceId]: maxCurrent + gained,
        },
      },
      damage: 0,
      selfHealing: 0,
      logLine: effect.note ?? `gains ${gained} ${effect.resourceId}`,
    };
  }
  return { runtime, damage: 0, selfHealing: 0, logLine: effect.note };
};

export const buildMonsterRuntime = (monster: MonsterDefinition): MonsterCombatRuntime => {
  const cooldowns: Record<string, number> = {};
  const charges: Record<string, number> = {};
  const resources: Record<string, number> = {};

  monster.activeAbilities.forEach((ability) => {
    cooldowns[ability.id] = 0;
    if (ability.maxCharges) charges[ability.id] = ability.maxCharges;
  });

  monster.resourcePools?.forEach((resource) => {
    resources[resource.id] = resource.current;
  });

  return { cooldowns, charges, resources };
};

export const tickMonsterCooldowns = (runtime: MonsterCombatRuntime): MonsterCombatRuntime => {
  const nextCooldowns: Record<string, number> = {};
  Object.entries(runtime.cooldowns).forEach(([abilityId, turns]) => {
    nextCooldowns[abilityId] = Math.max(0, turns - 1);
  });
  return { ...runtime, cooldowns: nextCooldowns };
};

export const resolvePassiveTrigger = (
  monster: MonsterDefinition,
  runtime: MonsterCombatRuntime,
  trigger: PassiveTrigger,
): PassiveResolution => {
  let nextRuntime = runtime;
  let healing = 0;
  let bonusDamage = 0;
  const logLines: string[] = [];

  monster.passiveAbilities
    .filter((passive) => passive.trigger === trigger)
    .forEach((passive) => {
      passive.effects.forEach((effect) => {
        const outcome = applyEffect(effect, monster.stats, nextRuntime);
        nextRuntime = outcome.runtime;
        healing += outcome.selfHealing;
        bonusDamage += outcome.damage;
        if (outcome.logLine) {
          logLines.push(`${monster.name} - ${passive.name}: ${outcome.logLine}`);
        } else {
          logLines.push(`${monster.name} - ${passive.name} triggers.`);
        }
      });
    });

  return { runtime: nextRuntime, healing, bonusDamage, logLines };
};

export const resolveMonsterAttack = (
  monster: MonsterDefinition,
  runtime: MonsterCombatRuntime,
  attack: RollableAttack,
): AttackResolution => {
  const roll = applyFormula(attack.formula, monster.stats);
  const passive = resolvePassiveTrigger(monster, runtime, "on_attack_hit");
  const rawDamage = Math.max(0, roll.total + passive.bonusDamage);
  const totalDamage = applyDamageTypeResistance(rawDamage, attack.damageType, monster);
  const logLine = `${monster.name}: ${totalDamage} Damage`;

  const effectLines: string[] = [];
  attack.effects?.forEach((effect) => {
    const outcome = applyEffect(effect, monster.stats, passive.runtime);
    // Effects still resolve mechanically; only non-damage notes (heals, resource gains) surface.
    if (outcome.logLine && effect.type !== "damage") effectLines.push(outcome.logLine);
  });

  let selfHealing = passive.healing;
  if (attack.omnivamp && attack.omnivamp > 0 && totalDamage > 0) {
    const omniHeal = Math.round((totalDamage * attack.omnivamp) / 100);
    selfHealing += omniHeal;
  }
  if (selfHealing > 0) {
    effectLines.push(`${monster.name} restores ${selfHealing} HP.`);
  }

  return {
    runtime: passive.runtime,
    damage: totalDamage,
    selfHealing,
    logLine,
    effectLines,
  };
};

export const canUseActiveAbility = (
  runtime: MonsterCombatRuntime,
  ability: ActiveAbility,
): boolean => {
  const cooldown = runtime.cooldowns[ability.id] ?? 0;
  if (cooldown > 0) return false;
  if (ability.maxCharges && (runtime.charges[ability.id] ?? ability.maxCharges) <= 0) return false;
  if (ability.resourceCost) {
    const available = runtime.resources[ability.resourceCost.resourceId] ?? 0;
    if (available < ability.resourceCost.amount) return false;
  }
  return true;
};

export const resolveActiveAbility = (
  monster: MonsterDefinition,
  runtime: MonsterCombatRuntime,
  ability: ActiveAbility,
): AbilityResolution => {
  if (!canUseActiveAbility(runtime, ability)) {
    return {
      runtime,
      canUse: false,
      damage: 0,
      selfHealing: 0,
      logLine: `${monster.name} cannot use ${ability.name} right now.`,
      effectLines: [],
    };
  }

  let nextRuntime: MonsterCombatRuntime = {
    ...runtime,
    cooldowns: { ...runtime.cooldowns },
    charges: { ...runtime.charges },
    resources: { ...runtime.resources },
  };

  if (ability.cooldownTurns && ability.cooldownTurns > 0) {
    nextRuntime.cooldowns[ability.id] = ability.cooldownTurns;
  }

  if (ability.maxCharges) {
    const current = nextRuntime.charges[ability.id] ?? ability.maxCharges;
    nextRuntime.charges[ability.id] = Math.max(0, current - 1);
  }

  if (ability.resourceCost) {
    const current = nextRuntime.resources[ability.resourceCost.resourceId] ?? 0;
    nextRuntime.resources[ability.resourceCost.resourceId] = Math.max(0, current - ability.resourceCost.amount);
  }

  const roll = applyFormula(ability.formula, monster.stats);
  let damage = ability.target === "player" ? Math.max(0, roll.total) : 0;
  const baseDamageType = ability.damageType;
  let selfHealing = ability.target === "self" ? Math.max(0, roll.total) : 0;
  const effectLines: string[] = [];

  ability.effects?.forEach((effect) => {
    const outcome = applyEffect(effect, monster.stats, nextRuntime);
    nextRuntime = outcome.runtime;
    damage += outcome.damage;
    selfHealing += outcome.selfHealing;
    if (outcome.logLine && effect.type !== "damage") effectLines.push(outcome.logLine);
  });

  const resistedDamage = applyDamageTypeResistance(damage, baseDamageType, monster);

  const logLine = ability.target === "player"
    ? `${monster.name}: ${resistedDamage} Damage`
    : ability.target === "self"
      ? `${monster.name} restores ${selfHealing} HP.`
      : `${monster.name} uses ${ability.name}.`;

  return {
    runtime: nextRuntime,
    canUse: true,
    damage: resistedDamage,
    selfHealing,
    logLine,
    effectLines,
  };
};
