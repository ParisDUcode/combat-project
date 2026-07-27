import type { MonsterDefinition } from "../types";

export const thornWitch: MonsterDefinition = {
  id: "thorn-witch",
  name: "Thorn Witch",
  cr: "2",
  stats: { PHYS: 4, CON: 3, INT: 10, SOC: 3 },
  hp: 29,
  ac: 3,
  attacks: [
    { id: "thorn-bolt", name: "Thorn Bolt", formula: { diceCount: 1, diceSides: 8, stat: "INT" } },
  ],
  activeAbilities: [
    {
      id: "vine-burst",
      name: "Vine Burst",
      target: "player",
      cooldownTurns: 2,
      resourceCost: { resourceId: "focus", amount: 1 },
      formula: { diceCount: 2, diceSides: 6, stat: "INT" },
      description: "Consumes focus to release constricting vines.",
    },
  ],
  passiveAbilities: [
    {
      id: "photosynthesis",
      name: "Photosynthesis",
      trigger: "turn_start",
      description: "Regains health each turn.",
      effects: [{ type: "heal_self", formula: { diceCount: 1, diceSides: 4, stat: "INT" } }],
    },
    {
      id: "focus-cycle",
      name: "Focus Cycle",
      trigger: "encounter_start",
      description: "Starts encounters with bonus focus.",
      effects: [{ type: "resource_gain", resourceId: "focus", formula: { diceCount: 1, diceSides: 1, flatBonus: 1 } }],
    },
  ],
  resourcePools: [{ id: "focus", name: "Focus", current: 2, max: 3 }],
  tags: ["caster", "controller"],
};
