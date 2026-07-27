import type { MonsterDefinition } from "../types";

export const cavernTroll: MonsterDefinition = {
  id: "cavern-troll",
  name: "Cavern Troll",
  cr: "5",
  stats: { PHYS: 11, CON: 8, INT: 3, SOC: 1 },
  hp: 84,
  ac: 4,
  attacks: [
    { id: "claw", name: "Claw", formula: { diceCount: 1, diceSides: 6, stat: "PHYS", flatBonus: 2 } },
    { id: "bite", name: "Bite", formula: { diceCount: 1, diceSides: 8, stat: "PHYS" } },
  ],
  activeAbilities: [
    {
      id: "hurl",
      name: "Hurl Boulder",
      target: "player",
      cooldownTurns: 2,
      formula: { diceCount: 2, diceSides: 8, stat: "PHYS" },
      description: "Throws debris at distant targets.",
    },
  ],
  passiveAbilities: [
    {
      id: "regeneration",
      name: "Regeneration",
      trigger: "turn_start",
      description: "Regains HP at the start of its turn.",
      effects: [{ type: "heal_self", formula: { diceCount: 1, diceSides: 6, stat: "CON", flatBonus: 1 } }],
    },
  ],
  tags: ["giant", "boss"],
};
