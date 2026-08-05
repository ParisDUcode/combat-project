import type { MonsterDefinition } from "../types";

export const flyingFireSpitter: MonsterDefinition = {
  id: "flying-fire-spitter",
  name: "Flying Fire Spitter",
  cr: "2",
  stats: {
    PHYS: 2,
    CON: 4,
    INT: 0,
    SOC: 0,
  },
  hp: 15,
  ac: 2,
  mr: 4,
  speed: 3,
  attacks: [
    {
      id: "small-fire-spit",
      name: "Small Fire Spit",
      formula: {
        diceCount: 1,
        diceSides: 4,
        stat: "PHYS",
        flatBonus: 0,
      },
      description: "A small spit of fire.",
    },
    {
      id: "melee-swipe",
      name: "Melee Swipe",
      formula: {
        diceCount: 1,
        diceSides: 4,
        stat: "PHYS",
        flatBonus: 2,
      },
      damageType: "true",
      description: "A melee swipe that deals true damage.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "flight",
      name: "Flight",
      trigger: "encounter_start",
      description: "This creature can fly.",
      effects: [],
    },
  ],
  resourcePools: [],
  tags: ["flying"],
};
