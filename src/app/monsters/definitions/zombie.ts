import type { MonsterDefinition } from "../types";

export const zombie: MonsterDefinition = {
  id: "zombie",
  name: "Zombie",
  cr: "1",
  stats: {
    PHYS: 2,
    CON: 0,
    INT: 0,
    SOC: 0,
  },
  hp: 5,
  ac: 4,
  speed: 3,
  attacks: [
    {
      id: "zombie-slam",
      name: "Slam",
      formula: {
        diceCount: 1,
        diceSides: 6,
        stat: "PHYS",
        flatBonus: 0,
      },
      description: "A relentless, heavy slam.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "zombie-mindless-hunger",
      name: "Mindless Hunger",
      trigger: "turn_start",
      description: "The zombie is driven by instinct and always attacks the nearest enemy.",
      effects: [
        {
          type: "note",
          note: "Targeting behavior override: Force attack on nearest enemy.",
        },
      ],
    },
  ],
  resourcePools: [
    {
      id: "actions",
      name: "Actions",
      current: 1,
      max: 1,
    },
  ],
  tags: ["undead", "move-3", "mr-0"],
};
