import type { MonsterDefinition } from "../types";

export const cryptSkeleton: MonsterDefinition = {
  id: "crypt-skeleton",
  name: "Crypt Skeleton",
  cr: "1/4",
  stats: { PHYS: 6, CON: 0, INT: 2, SOC: 0 },
  hp: 14,
  ac: 3,
  attacks: [
    { id: "rusted-blade", name: "Rusted Blade", formula: { diceCount: 1, diceSides: 6, stat: "PHYS" } },
    { id: "bone-shot", name: "Bone Shot", formula: { diceCount: 1, diceSides: 6, stat: "PHYS" }, description: "Ranged 60 ft." },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "bone-guard",
      name: "Bone Guard",
      trigger: "on_damaged",
      description: "Reforms some bone plating when struck.",
      effects: [{ type: "heal_self", formula: { diceCount: 1, diceSides: 2 } }],
    },
  ],
  tags: ["undead", "frontline"],
};
