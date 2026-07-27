import type { MonsterDefinition } from "./types";

export const MONSTER_TEMPLATE_INSTRUCTIONS = [
  "Copy MONSTER_TEMPLATE into a new file under src/app/monsters/definitions/ and edit values.",
  "Always keep stable id strings so encounter saves remain predictable.",
  "Attacks and abilities are stat-driven through formula.stat + formula.flatBonus.",
  "Use passive triggers for autonomous effects at encounter and turn checkpoints.",
].join("\n");

export const MONSTER_TEMPLATE: MonsterDefinition = {
  id: "template-monster",
  name: "Template Monster",
  cr: "1",
  stats: {
    PHYS: 6,
    CON: 3,
    INT: 4,
    SOC: 1,
  },
  hp: 18,
  ac: 2,
  attacks: [
    {
      id: "template-strike",
      name: "Template Strike",
      formula: {
        diceCount: 1,
        diceSides: 8,
        stat: "PHYS",
        flatBonus: 0,
      },
      description: "Baseline attack that scales with PHYS.",
    },
  ],
  activeAbilities: [
    {
      id: "template-burst",
      name: "Template Burst",
      target: "player",
      cooldownTurns: 2,
      maxCharges: 2,
      formula: {
        diceCount: 1,
        diceSides: 6,
        stat: "INT",
        flatBonus: 1,
      },
      description: "Reusable active ability with cooldown and charges.",
      effects: [
        {
          type: "note",
          note: "Add status text if this ability applies secondary effects.",
        },
      ],
    },
  ],
  passiveAbilities: [
    {
      id: "template-regen",
      name: "Template Regeneration",
      trigger: "turn_start",
      description: "Restores HP at the start of each turn.",
      effects: [
        {
          type: "heal_self",
          formula: {
            diceCount: 1,
            diceSides: 4,
            stat: "CON",
          },
        },
      ],
    },
  ],
  resourcePools: [
    {
      id: "focus",
      name: "Focus",
      current: 2,
      max: 2,
    },
  ],
  tags: ["template", "copy-me"],
};
