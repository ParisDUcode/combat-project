import type { MonsterDefinition } from "../types";

export const animatronic: MonsterDefinition = {
  id: "animatronic",
  name: "Animatronic",
  cr: "3",
  stats: {
    PHYS: 0,
    CON: 3,
    INT: 0,
    SOC: 0,
  },
  hp: 16,
  ac: 4,
  speed: 3,
  attacks: [
    {
      id: "animatronic-bite",
      name: "Bite",
      formula: {
        diceCount: 1,
        diceSides: 6,
        stat: "CON",
        flatBonus: 0,
      },
      description: "A devastating clamp of mechanical jaws.",
    },
  ],
  activeAbilities: [],
  passiveAbilities: [
    {
      id: "stalking-acceleration",
      name: "Stalking Acceleration",
      trigger: "turn_start",
      description: "Increases hunger_ticks by 1 at turn start. If hunger_ticks >= 2, speed doubles to 4 until a successful hit resets hunger_ticks to 0.",
      effects: [
        {
          type: "note",
          note: "Check hunger_ticks pool. If >= 2, set speed tag to move-4. Reset to move-2 on hit.",
        },
      ],
    },
  ],
  resourcePools: [
    {
      id: "actions",
      name: "Actions",
      current: 1,
      max: 1,
    },
    {
      id: "hunger_ticks",
      name: "Turns Since Last Hit",
      current: 0,
      max: 2,
    },
  ],
  tags: ["construct", "move-2", "mr-0"],
};
