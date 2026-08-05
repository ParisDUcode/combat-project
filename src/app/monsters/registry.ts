import type { MonsterDefinition } from "./types";
import { normalizeMonsterCollection, normalizeMonsterDefinition } from "./types";
import { akkiDemon } from "./definitions/akkiDemon";
import { animatedArmor } from "./definitions/animatedArmor";
import { animatronic } from "./definitions/animatronic";
import { flyingFireSpitter } from "./definitions/flyingFireSpitter";
import { lowTierGoon } from "./definitions/lowTierGoon";
import { wolf } from "./definitions/wolf";
import { zombie } from "./definitions/zombie";

const RAW_MONSTERS: MonsterDefinition[] = [
  akkiDemon,
  wolf,
  animatedArmor,
  zombie,
  animatronic,
  lowTierGoon,
  flyingFireSpitter,
];

export const BASE_MONSTER_REGISTRY = normalizeMonsterCollection(RAW_MONSTERS);

export const findMonsterById = (id: string): MonsterDefinition | undefined =>
  BASE_MONSTER_REGISTRY.find((monster) => monster.id === id);

export const hydrateMonsterFromSave = (monster: unknown): MonsterDefinition => normalizeMonsterDefinition(monster);
