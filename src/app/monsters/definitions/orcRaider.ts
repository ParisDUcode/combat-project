import type { MonsterDefinition } from "../types";

export const orcRaider: MonsterDefinition = {
  id: "orc-raider",
  name: "Orc Raider",
  cr: "1/2",
  stats: { PHYS: 8, CON: 5, INT: 3, SOC: 1 },
  hp: 18,
  ac: 3,
  attacks: [
    { id: "greataxe", name: "Greataxe", formula: { diceCount: 1, diceSides: 12, stat: "PHYS" } },
    { id: "javelin", name: "Javelin", formula: { diceCount: 1, diceSides: 6, stat: "PHYS" }, description: "Ranged 30 ft." },
  ],
  activeAbilities: [
    {
      id: "war-cry",
      name: "War Cry",
      target: "player",
      cooldownTurns: 3,
      formula: { diceCount: 1, diceSides: 6, stat: "SOC" },
      description: "A brutal shout followed by a lunge.",
    },
  ],
  passiveAbilities: [],
  tags: ["humanoid", "bruiser"],
};
