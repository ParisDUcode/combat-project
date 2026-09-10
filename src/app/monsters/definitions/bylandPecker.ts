import type { MonsterDefinition } from "../types";

export const bylandPecker: MonsterDefinition = {
  id: "byland-pecker",
  name: "Byland Pecker",
  cr: "1",
  stats: {
    PHYS: 1,
    CON: 1,
    INT: 0,
    SOC: 0,
  },
  hp: 6,
  ac: 2,
  mr: 0,
  speed: 7,
  attacks: [],
  activeAbilities: [
    {
      id: "kamikaze-dash",
      name: "Kamikaze Dash",
      target: "none",
      description: "Action. Moves up to full Speed directly toward the nearest enemy and immediately triggers Volatile Cluck.",
      effects: [
        {
          type: "note",
          note: "After moving, deal 2d6 Magic damage to all creatures within 2 spaces (10 ft).",
        },
      ],
    },
  ],
  passiveAbilities: [
    {
      id: "volatile-cluck",
      name: "Volatile Cluck",
      trigger: "on_defeated",
      description: "When reduced to 0 HP or upon using its Action to Detonate, it explodes violently. Deals 2d6 Magic damage to all creatures within 2 spaces (10 ft).",
      effects: [
        {
          type: "damage",
          formula: {
            diceCount: 2,
            diceSides: 6,
          },
          damageType: "magic",
          note: "Deals 2d6 Magic damage to all creatures within 2 spaces (10 ft).",
        },
      ],
    },
  ],
  resourcePools: [],
  tags: [],
};