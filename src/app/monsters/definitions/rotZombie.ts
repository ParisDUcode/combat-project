import type { MonsterDefinition } from "../types";

export const rotZombie: MonsterDefinition = {
  id: "rot-zombie",
  name: "Rot Zombie",
  cr: "1/2",
  stats: { PHYS: 6, CON: 5, INT: 1, SOC: 0 },
  hp: 24,
  ac: 2,
  attacks: [
    { id: "slam", name: "Slam", formula: { diceCount: 1, diceSides: 8, stat: "PHYS" } },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "undead-fortitude",
      name: "Undead Fortitude",
      trigger: "on_threshold",
      description: "When near defeat, mends itself through raw stamina.",
      effects: [{ type: "heal_self", formula: { diceCount: 1, diceSides: 6, stat: "CON" } }],
    },
  ],
  tags: ["undead", "bruiser"],
};
