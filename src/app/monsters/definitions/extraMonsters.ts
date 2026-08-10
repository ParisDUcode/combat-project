import type { MonsterDefinition } from "../types";

export const boar: MonsterDefinition = {
  id: "boar",
  name: "Boar",
  cr: "1",
  stats: { PHYS: 3, CON: 3, INT: 0, SOC: 0 },
  hp: 13,
  ac: 2,
  mr: 0,
  speed: 6,
  attacks: [
    {
      id: "boar-tusk-gore",
      name: "Tusk Gore",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 3 },
      description: "Melee strike dealing 1d6 + 3 physical damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "boar-relentless-charge",
      name: "Relentless Charge",
      trigger: "attack",
      description: "Deals +2 bonus damage if moving at least 2 spaces before attacking.",
      effects: [],
    },
  ],
  tags: ["beast", "move-6", "mr-0"],
};

export const viper: MonsterDefinition = {
  id: "viper",
  name: "Viper",
  cr: "1",
  stats: { PHYS: 2, CON: 1, INT: 0, SOC: 0 },
  hp: 7,
  ac: 2,
  mr: 0,
  speed: 7,
  attacks: [
    {
      id: "viper-quick-strike",
      name: "Quick Strike",
      formula: { diceCount: 1, diceSides: 4, flatBonus: 2 },
      description: "Melee strike dealing 1d4 + 2 physical damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "viper-slowing-bite",
      name: "Slowing Bite",
      trigger: "hit",
      description: "Successful hits reduce target's Speed by 2 for 1 turn.",
      effects: [],
    },
  ],
  tags: ["beast", "move-7", "mr-0"],
};

export const caveBear: MonsterDefinition = {
  id: "cave-bear",
  name: "Cave Bear",
  cr: "2",
  stats: { PHYS: 4, CON: 4, INT: 0, SOC: 0 },
  hp: 22,
  ac: 3,
  mr: 0,
  speed: 5,
  attacks: [
    {
      id: "cave-bear-heavy-maul",
      name: "Heavy Maul",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 4 },
      description: "Melee strike dealing 1d6 + 4 physical damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "cave-bear-enrage",
      name: "Enrage",
      trigger: "attack",
      description: "Deals +2 bonus damage on attacks while at or below 11 HP.",
      effects: [],
    },
  ],
  tags: ["beast", "move-5", "mr-0"],
};

export const banditCutthroat: MonsterDefinition = {
  id: "bandit-cutthroat",
  name: "Bandit Cutthroat",
  cr: "1",
  stats: { PHYS: 3, CON: 2, INT: 1, SOC: 0 },
  hp: 11,
  ac: 2,
  mr: 0,
  speed: 6,
  attacks: [
    {
      id: "bandit-jagged-dagger",
      name: "Jagged Dagger",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 3 },
      description: "Melee strike dealing 1d6 + 3 physical damage.",
    },
  ],
  activeAbilities: [
    {
      id: "bandit-hook-and-snare",
      name: "Hook & Snare",
      target: "player",
      cooldownTurns: 2,
      maxCharges: 1,
      formula: { diceCount: 0, diceSides: 0, flatBonus: 0 },
      description: "Pulls a target 1 space closer.",
      effects: [],
    },
  ],
  passiveAbilities: [],
  tags: ["humanoid", "move-6", "mr-0"],
};

export const orderInitiate: MonsterDefinition = {
  id: "order-initiate",
  name: "Order Initiate",
  cr: "1",
  stats: { PHYS: 2, CON: 2, INT: 2, SOC: 1 },
  hp: 12,
  ac: 1,
  mr: 3,
  speed: 5,
  attacks: [
    {
      id: "order-radiant-bolt",
      name: "Radiant Bolt",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 2 },
      description: "Ranged spell attack dealing 1d6 + 2 radiant damage.",
    },
  ],
  activeAbilities: [
    {
      id: "order-aegis-ward",
      name: "Aegis Ward",
      target: "ally",
      cooldownTurns: 2,
      maxCharges: 1,
      formula: { diceCount: 0, diceSides: 0, flatBonus: 0 },
      description: "Grants self or an ally +2 AC for 1 turn.",
      effects: [],
    },
  ],
  passiveAbilities: [],
  tags: ["humanoid", "move-5", "mr-3"],
};

export const iceSprite: MonsterDefinition = {
  id: "ice-sprite",
  name: "Ice Sprite",
  cr: "1",
  stats: { PHYS: 1, CON: 1, INT: 3, SOC: 0 },
  hp: 7,
  ac: 2,
  mr: 2,
  speed: 6,
  attacks: [
    {
      id: "ice-sprite-frost-ray",
      name: "Frost Ray",
      formula: { diceCount: 1, diceSides: 4, flatBonus: 3 },
      description: "Ranged attack dealing 1d4 + 3 cold damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "ice-sprite-chilling-touch",
      name: "Chilling Touch",
      trigger: "hit",
      description: "Successful hits reduce target's Speed by 2 for 1 turn.",
      effects: [],
    },
  ],
  tags: ["fey", "move-6", "mr-2"],
};

export const frostHound: MonsterDefinition = {
  id: "frost-hound",
  name: "Frost Hound",
  cr: "1",
  stats: { PHYS: 3, CON: 2, INT: 0, SOC: 0 },
  hp: 11,
  ac: 2,
  mr: 1,
  speed: 6,
  attacks: [
    {
      id: "frost-hound-glacial-bite",
      name: "Glacial Bite",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 3 },
      description: "Melee strike dealing 1d6 + 3 physical damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "frost-hound-frostbite",
      name: "Frostbite",
      trigger: "hit",
      description: "Successful hits reduce target's Speed by 2 for 1 turn.",
      effects: [],
    },
  ],
  tags: ["beast", "move-6", "mr-1"],
};

export const snowGolem: MonsterDefinition = {
  id: "snow-golem",
  name: "Snow Golem",
  cr: "1",
  stats: { PHYS: 3, CON: 3, INT: 0, SOC: 0 },
  hp: 16,
  ac: 2,
  mr: 1,
  speed: 4,
  attacks: [
    {
      id: "snow-golem-frozen-slam",
      name: "Frozen Slam",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 3 },
      description: "Melee strike dealing 1d6 + 3 physical damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "snow-golem-shatter-burst",
      name: "Shatter Burst",
      trigger: "death",
      description: "Explodes on 0 HP, dealing 2 flat cold damage and -2 Speed to all adjacent targets.",
      effects: [],
    },
  ],
  tags: ["construct", "move-4", "mr-1"],
};

export const leechSwarm: MonsterDefinition = {
  id: "leech-swarm",
  name: "Leech Swarm",
  cr: "1",
  stats: { PHYS: 2, CON: 2, INT: 0, SOC: 0 },
  hp: 8,
  ac: 1,
  mr: 0,
  speed: 5,
  attacks: [
    {
      id: "leech-swarm-bite",
      name: "Swarm Bite",
      formula: { diceCount: 1, diceSides: 4, flatBonus: 2 },
      description: "Melee strike dealing 1d4 + 2 physical damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "leech-swarm-life-drain",
      name: "Life Drain",
      trigger: "hit",
      description: "Restores 2 HP to self on a successful hit.",
      effects: [],
    },
  ],
  tags: ["beast", "move-5", "mr-0"],
};

export const muckLurker: MonsterDefinition = {
  id: "muck-lurker",
  name: "Muck Lurker",
  cr: "1",
  stats: { PHYS: 3, CON: 3, INT: 0, SOC: 0 },
  hp: 14,
  ac: 2,
  mr: 0,
  speed: 5,
  attacks: [
    {
      id: "muck-lurker-silt-snap",
      name: "Silt Snap",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 3 },
      description: "Melee strike dealing 1d6 + 3 physical damage.",
    },
  ],
  activeAbilities: [
    {
      id: "muck-lurker-drag-under",
      name: "Drag Under",
      target: "player",
      cooldownTurns: 2,
      maxCharges: 1,
      formula: { diceCount: 0, diceSides: 0, flatBonus: 0 },
      description: "Pulls a target 1 space closer.",
      effects: [],
    },
  ],
  passiveAbilities: [],
  tags: ["beast", "move-5", "mr-0"],
};

export const smugglerDeckhand: MonsterDefinition = {
  id: "smuggler-deckhand",
  name: "Smuggler Deckhand",
  cr: "1",
  stats: { PHYS: 3, CON: 2, INT: 1, SOC: 0 },
  hp: 12,
  ac: 2,
  mr: 0,
  speed: 5,
  attacks: [
    {
      id: "smuggler-cutlass-slash",
      name: "Cutlass Slash",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 3 },
      description: "Melee strike dealing 1d6 + 3 physical damage.",
    },
  ],
  activeAbilities: [
    {
      id: "smuggler-grappling-hook",
      name: "Grappling Hook",
      target: "player",
      cooldownTurns: 2,
      maxCharges: 1,
      formula: { diceCount: 0, diceSides: 0, flatBonus: 0 },
      description: "Pulls a target 1 space closer or moves self 1 space closer to target.",
      effects: [],
    },
  ],
  passiveAbilities: [],
  tags: ["humanoid", "move-5", "mr-0"],
};

export const gloomBat: MonsterDefinition = {
  id: "gloom-bat",
  name: "Gloom Bat",
  cr: "1",
  stats: { PHYS: 2, CON: 1, INT: 0, SOC: 0 },
  hp: 8,
  ac: 2,
  mr: 1,
  speed: 7,
  attacks: [
    {
      id: "gloom-bat-wing-buffet",
      name: "Wing Buffet",
      formula: { diceCount: 1, diceSides: 4, flatBonus: 2 },
      description: "Melee strike dealing 1d4 + 2 physical damage.",
    },
  ],
  activeAbilities: [
    {
      id: "gloom-bat-gust-push",
      name: "Gust Push",
      target: "player",
      cooldownTurns: 2,
      maxCharges: 1,
      formula: { diceCount: 0, diceSides: 0, flatBonus: 0 },
      description: "Knocks target back 1 space.",
      effects: [],
    },
  ],
  passiveAbilities: [],
  tags: ["beast", "move-7", "mr-1"],
};

export const manaLeech: MonsterDefinition = {
  id: "mana-leech",
  name: "Mana Leech",
  cr: "1",
  stats: { PHYS: 1, CON: 1, INT: 3, SOC: 0 },
  hp: 8,
  ac: 2,
  mr: 2,
  speed: 5,
  attacks: [
    {
      id: "mana-leech-arcane-siphon",
      name: "Arcane Siphon",
      formula: { diceCount: 1, diceSides: 4, flatBonus: 3 },
      description: "Melee strike dealing 1d4 + 3 magic damage.",
    },
  ],
  activeAbilities: [
    {
      id: "mana-leech-drain-power",
      name: "Drain Power",
      target: "player",
      cooldownTurns: 2,
      maxCharges: 1,
      formula: { diceCount: 0, diceSides: 0, flatBonus: 0 },
      description: "Drains 1 spell slot level or 1 item charge from target on hit.",
      effects: [],
    },
  ],
  passiveAbilities: [],
  tags: ["aberration", "move-5", "mr-2"],
};

export const magmin: MonsterDefinition = {
  id: "magmin",
  name: "Magmin",
  cr: "1",
  stats: { PHYS: 2, CON: 2, INT: 1, SOC: 0 },
  hp: 10,
  ac: 2,
  mr: 1,
  speed: 4,
  attacks: [
    {
      id: "magmin-searing-touch",
      name: "Searing Touch",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 2 },
      description: "Melee strike dealing 1d6 + 2 fire damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "magmin-death-burst",
      name: "Death Burst",
      trigger: "death",
      description: "Explodes on 0 HP, dealing 2 flat fire damage to all adjacent targets.",
      effects: [],
    },
  ],
  tags: ["elemental", "move-4", "mr-1"],
};

export const needleBlight: MonsterDefinition = {
  id: "needle-blight",
  name: "Needle Blight",
  cr: "1",
  stats: { PHYS: 3, CON: 2, INT: 0, SOC: 0 },
  hp: 11,
  ac: 2,
  mr: 0,
  speed: 5,
  attacks: [
    {
      id: "needle-blight-volley",
      name: "Needle Volley",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 3 },
      description: "Ranged attack dealing 1d6 + 3 physical damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "needle-blight-thorns",
      name: "Thorns",
      trigger: "damage_taken",
      description: "Deals 1 flat damage back to melee attackers when hit by a melee attack.",
      effects: [],
    },
  ],
  tags: ["plant", "move-5", "mr-0"],
};

export const skeletonWarrior: MonsterDefinition = {
  id: "skeleton-warrior",
  name: "Skeleton Warrior",
  cr: "1",
  stats: { PHYS: 3, CON: 2, INT: 0, SOC: 0 },
  hp: 12,
  ac: 3,
  mr: 0,
  speed: 5,
  attacks: [
    {
      id: "skeleton-bone-strike",
      name: "Bone Strike",
      formula: { diceCount: 1, diceSides: 6, flatBonus: 3 },
      description: "Melee/Ranged strike dealing 1d6 + 3 physical damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "skeleton-reassemble",
      name: "Reassemble",
      trigger: "death",
      description: "When reduced to 0 HP, reassembles with 1 HP at the start of its next turn unless completely destroyed.",
      effects: [],
    },
  ],
  tags: ["undead", "move-5", "mr-0"],
};
