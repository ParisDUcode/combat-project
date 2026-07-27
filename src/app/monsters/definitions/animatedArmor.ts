import type { MonsterDefinition } from "../types";

export const animatedArmor: MonsterDefinition = {
  id: "animated-armor",
  name: "Animated Armor",
  cr: "1",
  stats: {
    PHYS: 2,
    CON: 0,
    INT: 0,
    SOC: 0,
  },
  hp: 5,
  ac: 1,
  attacks: [
    {
      id: "animated-armor-slam",
      name: "Slam",
      formula: {
        diceCount: 1,
        diceSides: 4,
        stat: "PHYS",
        flatBonus: 0,
      },
      description: "A heavy, metal-fisted slam.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [],
  resourcePools: [
    {
      id: "actions",
      name: "Actions",
      current: 2,
      max: 2,
    },
  ],
  tags: ["construct", "move-4", "mr-2"],
};
