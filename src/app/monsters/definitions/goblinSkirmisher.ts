import type { MonsterDefinition } from "../types";

export const goblinSkirmisher: MonsterDefinition = {
  id: "goblin-skirmisher",
  name: "Goblin Skirmisher",
  cr: "1/4",
  stats: { PHYS: 6, CON: 2, INT: 2, SOC: 1 },
  hp: 9,
  ac: 2,
  attacks: [
    { id: "scimitar", name: "Scimitar", formula: { diceCount: 1, diceSides: 6, stat: "PHYS" } },
    { id: "shortbow", name: "Shortbow", formula: { diceCount: 1, diceSides: 6, stat: "PHYS", flatBonus: 1 }, description: "Ranged 60 ft." },
  ],
  activeAbilities: [
    {
      id: "dirty-feint",
      name: "Dirty Feint",
      target: "player",
      cooldownTurns: 2,
      formula: { diceCount: 1, diceSides: 4, stat: "PHYS" },
      description: "Quick strike after a misdirection.",
    },
  ],
  passiveAbilities: [
    {
      id: "mob-pressure",
      name: "Mob Pressure",
      trigger: "on_attack_hit",
      description: "Deals bonus chip damage on successful attacks.",
      effects: [{ type: "damage", formula: { diceCount: 1, diceSides: 2 } }],
    },
  ],
  tags: ["humanoid", "skirmisher"],
};
