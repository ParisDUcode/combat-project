import type { MonsterDefinition } from "./types";
import { normalizeMonsterCollection, normalizeMonsterDefinition } from "./types";
import { animatedArmor } from "./definitions/animatedArmor";
import { animatronic } from "./definitions/animatronic";
import { lowTierGoon } from "./definitions/lowTierGoon";
import { wolf } from "./definitions/wolf";
import { zombie } from "./definitions/zombie";

const RAW_MONSTERS: MonsterDefinition[] = [
  wolf,
  animatedArmor,
  zombie,
  animatronic,
  lowTierGoon,
];

export const BASE_MONSTER_REGISTRY = normalizeMonsterCollection(RAW_MONSTERS);

export const findMonsterById = (id: string): MonsterDefinition | undefined =>
  BASE_MONSTER_REGISTRY.find((monster) => monster.id === id);

export const hydrateMonsterFromSave = (monster: unknown): MonsterDefinition => normalizeMonsterDefinition(monster);
