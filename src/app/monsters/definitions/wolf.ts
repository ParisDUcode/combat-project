import type { MonsterDefinition } from "../types";

export const wolf: MonsterDefinition = {
  id: "wolf",
  name: "Wolf",
  cr: "1",
  stats: {
    PHYS: 2,
    CON: 0,
    INT: 0,
    SOC: 0,
  },
  hp: 6,
  ac: 2,
  attacks: [
    {
      id: "wolf-bite",
      name: "Bite",
      formula: {
        diceCount: 1,
        diceSides: 4,
        stat: "PHYS",
        flatBonus: 0,
      },
      description: "A swift, snapping bite using agility.",
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
  tags: ["beast", "move-6", "mr-0"],
};
