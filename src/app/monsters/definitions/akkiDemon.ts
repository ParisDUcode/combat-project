import type { MonsterDefinition } from "../types";

export const akkiDemon: MonsterDefinition = {
  id: "akki-demon",
  name: "Akki Demon",
  cr: "1",
  stats: {
    PHYS: 2,
    CON: 1,
    INT: 0,
    SOC: 0,
  },
  hp: 6,
  ac: 1,
  attacks: [
    {
      id: "akki-way-strike",
      name: "Akki's Way Strike",
      formula: {
        diceCount: 1,
        diceSides: 1,
        stat: "PHYS",
        flatBonus: 1,
      },
      description: "Melee strike wielding Akki's Way.",
    },
    {
      id: "akki-projectile",
      name: "Demonic Projectile",
      formula: {
        diceCount: 1,
        diceSides: 4,
        flatBonus: 2,
      },
      description: "Ranged attack dealing 1d4 + 2 damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [],
  resourcePools: [],
  tags: ["demon", "akki", "low-tier"],
};