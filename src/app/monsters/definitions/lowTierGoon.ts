import type { MonsterDefinition } from "../types";

export const lowTierGoon: MonsterDefinition = {
  id: "low-tier-goon",
  name: "Low Tier Goon",
  cr: "1",
  stats: {
    PHYS: 2,
    CON: 1,
    INT: 0,
    SOC: 0,
  },
  hp: 4,
  ac: 1,
  attacks: [
    {
      id: "goon-melee",
      name: "Melee Strike",
      formula: {
        diceCount: 1,
        diceSides: 6,
        stat: "PHYS",
        flatBonus: 0,
      },
      description: "A straightforward clubbing blow or physical strike.",
    },
    {
      id: "goon-projectile",
      name: "Projectile Shot",
      formula: {
        diceCount: 1,
        diceSides: 4,
        stat: "PHYS",
        flatBonus: 0,
      },
      description: "A quick ranged attack targeting distant foes.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [],
  resourcePools: [
    {
      id: "actions",
      name: "Actions",
      current: 1,
      max: 1,
    },
  ],
  tags: ["humanoid", "move-4", "mr-1"],
};
