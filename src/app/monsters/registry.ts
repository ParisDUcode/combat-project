import type { MonsterDefinition } from "./types";
import { normalizeMonsterCollection, normalizeMonsterDefinition } from "./types";
import { akkiDemon } from "./definitions/akkiDemon";
import { animatedArmor } from "./definitions/animatedArmor";
import { animatronic } from "./definitions/animatronic";
import {
  absoluteArcanist,
  alphaWolf,
  banditCutthroat,
  banditEnforcer,
  bloodRaptor,
  boar,
  caveBear,
  caveViper,
  direBoar,
  frostDrakeWhelp,
  frostHound,
  glassSentry,
  gloomBat,
  harpyScreamer,
  highwayCaptain,
  iceSprite,
  leechSwarm,
  lesserMinotaur,
  lightningElemental,
  magmin,
  manaLeech,
  muckLurker,
  needleBlight,
  orderInitiate,
  rokuganVeteran,
  rogueMarksman,
  shadowAssassin,
  shadowBladeAssassin,
  shadowPanther,
  skeletonWarrior,
  smugglerDeckhand,
  snowGolem,
  stoneGolem,
  swampTroll,
  viper,
  wightKnight,
} from "./definitions/extraMonsters";
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
  boar,
  viper,
  caveBear,
  banditCutthroat,
  orderInitiate,
  iceSprite,
  frostHound,
  snowGolem,
  leechSwarm,
  muckLurker,
  smugglerDeckhand,
  gloomBat,
  manaLeech,
  magmin,
  needleBlight,
  skeletonWarrior,
  shadowPanther,
  bloodRaptor,
  caveViper,
  rogueMarksman,
  absoluteArcanist,
  shadowBladeAssassin,
  lightningElemental,
  glassSentry,
  direBoar,
  alphaWolf,
  banditEnforcer,
  rokuganVeteran,
  wightKnight,
  lesserMinotaur,
  swampTroll,
  harpyScreamer,
  stoneGolem,
  frostDrakeWhelp,
  shadowAssassin,
  highwayCaptain,
];

export const BASE_MONSTER_REGISTRY = normalizeMonsterCollection(RAW_MONSTERS);

export const findMonsterById = (id: string): MonsterDefinition | undefined =>
  BASE_MONSTER_REGISTRY.find((monster) => monster.id === id);

export const hydrateMonsterFromSave = (monster: unknown): MonsterDefinition => normalizeMonsterDefinition(monster);
