import { useState, useRef, useEffect } from "react";
import { Sword, Shield, Zap, Heart, Scroll, Package, X, Plus, Footprints } from "lucide-react";
import {
  buildMonsterRuntime,
  canUseActiveAbility,
  resolveActiveAbility,
  resolveMonsterAttack,
  resolvePassiveTrigger,
  tickMonsterCooldowns,
} from "./monsters/engine";
import { BASE_MONSTER_REGISTRY } from "./monsters/registry";
import { MONSTER_TEMPLATE, MONSTER_TEMPLATE_INSTRUCTIONS } from "./monsters/template";
import type {
  ActiveAbility,
  MonsterCombatRuntime,
  MonsterDefinition,
  RollableAttack,
} from "./monsters/types";
import { normalizeMonsterCollection } from "./monsters/types";

type StatKey = "PHYS" | "CON" | "INT" | "SOC";
type ClassName = "Fighter" | "Wizard";
type ItemType = "weapon" | "armor" | "accessory" | "consumable";
type EquipSlot = "head" | "chest" | "pants" | "boots" | "weapon1" | "weapon2" | "accessory1" | "accessory2" | "accessory3" | "accessory4";

type DamageModifier = "none";
type AbilityType = "Feat" | "Scar" | "Ability";

interface AbilityModifier { label: string; value: string; }

interface WeaponAttack {
  name: string;
  die?: number;
  stat?: string; // single key "PHYS" or compound "PHYS+INT" — listed stats are summed
  formula?: string; // full formula, e.g. "2*PHYS + 1d8 + 4"
  damageBonus?: number;
  consumesCharge?: boolean; // if true, using this attack spends 1 weapon charge
  description?: string;
}

interface AbilityAction {
  name: string;
  die?: number;
  stat?: string;
  formula?: string;
  damageBonus?: number;
  consumesTally?: boolean; // if true, spends 1 tally use when action succeeds
  description?: string;
}

interface Ability {
  id: number;
  name: string;
  type: AbilityType;
  description: string;
  tally?: { total: number; used: number };
  tallyFormula?: string; // e.g. "level", "floor(level/2)", "level + INT"
  modifiers?: AbilityModifier[];
  actions?: AbilityAction[];
}

const isPassiveAbility = (ability: Ability | null | undefined): boolean =>
  !ability?.actions || ability.actions.length === 0;

interface Spell extends Ability {
  isSpell: true;
  damageDie?: number;
  damageStat?: StatKey;
  statModifiers?: AbilityModifier[];
  slotCost?: number;
  slotCostMax?: number;
  scaleDamageBySlots?: boolean;
}

interface SacrificeReward {
  name: string;
  amount?: number | string;
  description?: string;
}

const ABILITY_TYPE_COLORS: Record<AbilityType, string> = {
  Feat:    "#c4853a",
  Scar:    "#c43a3a",
  Ability: "#9a8acc",
};

const PLACEHOLDER_ABILITIES: Ability[] = [];
interface InventoryItem {
  id: number;
  name: string;
  type: ItemType;
  icon?: string;
  slot?: EquipSlot;
  slots?: EquipSlot[];
  die?: number;
  stat?: string;
  weaponFormula?: string;
  damageBonus?: number;
  acBonus?: number;
  magicResistBonus?: number;
  statBonus?: Partial<Record<StatKey, number>>;
  speedBonus?: number;
  description?: string;
  // extended weapon fields
  heal?: number; // flat heal to player when using this weapon
  healDie?: number; // roll this die to heal
  healStat?: StatKey; // add this stat to heal roll
  extraDamage?: number; // flat extra damage when using this weapon
  extraDice?: number; // number of extra dice to roll
  extraDie?: number; // sides of extra dice
  // multi-attack + charges
  attacks?: WeaponAttack[];   // if present, overrides die/stat for attack logic
  maxCharges?: number;        // max resource charges (shown as dots, restored on long rest)
  currentCharges?: number;    // remaining charges
  sacrificeRewards?: SacrificeReward[];
}

const BASE_CHEST: InventoryItem = {
  id: -1, name: "Leather Tunic", type: "armor", slot: "chest", acBonus: 2, description: "A simple leather chest piece.",
};
const BASE_PANTS: InventoryItem = {
  id: -2, name: "Basic Trousers", type: "armor", slot: "pants", magicResistBonus: 1, description: "Sturdy traveling trousers.",
};
const BASE_BOOTS: InventoryItem = {
  id: -3, name: "Leather Shoes", type: "armor", slot: "boots", speedBonus: 1, description: "Worn but reliable footwear.",
};

interface Equipment {
  head: InventoryItem | null;
  chest: InventoryItem | null;
  pants: InventoryItem | null;
  boots: InventoryItem | null;
  weapon1: InventoryItem | null;
  weapon2: InventoryItem | null;
  accessory1: InventoryItem | null;
  accessory2: InventoryItem | null;
  accessory3: InventoryItem | null;
  accessory4: InventoryItem | null;
}

interface Stats {
  PHYS: number; CON: number; INT: number; SOC: number;
}

interface LogEntry {
  id: number;
  text: string;
  type: "hit" | "miss" | "crit" | "heal" | "info";
}

interface JournalEntry {
  id: number;
  text: string;
}

const CLASS_COLORS: Record<ClassName, string> = {
  Fighter: "#c4853a", Wizard: "#6a9ae0",
};
const CLASS_ATTACK_DIE: Record<ClassName, number> = {
  Fighter: 8, Wizard: 4,
};
const CLASS_HIT_DIE: Record<ClassName, number> = {
  Fighter: 8, Wizard: 6,
};

const STAT_LABELS: StatKey[] = ["PHYS", "CON", "INT", "SOC"];
const STAT_COLORS: Record<StatKey, string> = {
  PHYS: "#c4853a", CON: "#e05050", INT: "#6a9ae0", SOC: "#e0b040",
};

const TYPE_ICONS: Record<ItemType, string> = {
  weapon: "⚔", armor: "🛡", accessory: "✦", consumable: "⬡",
};
const TYPE_COLORS: Record<ItemType, string> = {
  weapon: "#c4853a", armor: "#6a9ae0", accessory: "#b06adb", consumable: "#6aaa6a",
};

const getItemIcon = (item: InventoryItem) => item.icon ?? TYPE_ICONS[item.type];
const hasWeaponAttackProfile = (item: InventoryItem | null | undefined): boolean => Boolean(item && (
  (Array.isArray(item.attacks) && item.attacks.length > 0)
  || (typeof item.weaponFormula === "string" && item.weaponFormula.trim())
  || (item.die !== undefined && item.stat !== undefined)
));
const usesWeaponLogic = (item: InventoryItem | null | undefined) => Boolean(item && (
  item.type === "weapon"
  || item.die !== undefined
  || item.stat !== undefined
  || item.weaponFormula !== undefined
  || item.damageBonus !== undefined
  || item.extraDamage !== undefined
  || item.extraDice !== undefined
  || item.extraDie !== undefined
  || item.attacks?.length
  || item.maxCharges !== undefined
  || item.currentCharges !== undefined
  || item.heal !== undefined
  || item.healDie !== undefined
  || item.healStat !== undefined
));

const ActionCostBadge = ({ cost }: { cost: "action" | "bonus" }) => (
  <span
    className="text-[10px] uppercase tracking-[0.2em]"
    style={{
      color: cost === "bonus" ? "#c4853a" : "#6a9ae0",
      fontFamily: "'Cinzel', serif",
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
    }}
  >
    <span>{cost === "bonus" ? "▲" : "■"}</span>
    <span>{cost === "bonus" ? "Bonus action" : "Action"}</span>
  </span>
);

const STAT_DESCRIPTIONS: Record<StatKey, string> = {
  PHYS: "Physicality — governs physical offense and combat tempo. Added directly to Basic Attack and Initiative.",
  CON: "Constitution — added to HP per level. The higher your CON, the more punishment you can take.",
  INT: "Intellect — powers spell attacks and learned techniques.",
  SOC: "Social — force of personality, influence, and social pressure.",
};

const SECONDARY_DESCRIPTIONS: Record<string, string> = {
  physAC:      "Armor — mitigates physical damage 1 to 1. Each point of Armor absorbs one point of incoming physical damage before it reaches your HP.",
  magicResist: "Magic Resist — mitigates magical damage 1 to 1. Each point absorbs one point of incoming magic damage before it reaches your HP.",
  Initiative:  "Initiative — equals your PHYS score. Determines who acts first when combat begins.",
  Speed:       "Speed — base movement. Fighter starts at 3, Wizard starts at 2, then increases from boots and other gear. Used by the DM to determine range.",
};

const EQUIP_SLOTS: { key: EquipSlot; label: string; accepts: ItemType[] }[] = [
  { key: "head",    label: "Head",    accepts: ["weapon", "armor", "accessory"] },
  { key: "chest",   label: "Chest",   accepts: ["weapon", "armor", "accessory"] },
  { key: "pants",   label: "Legs",    accepts: ["weapon", "armor", "accessory"] },
  { key: "boots",   label: "Boots",   accepts: ["weapon", "armor", "accessory"] },
  { key: "weapon1", label: "Weapon 1", accepts: ["weapon", "accessory"] },
  { key: "weapon2", label: "Weapon 2", accepts: ["weapon", "accessory"] },
  { key: "accessory1", label: "Accessory 1", accepts: ["weapon", "accessory"] },
  { key: "accessory2", label: "Accessory 2", accepts: ["weapon", "accessory"] },
  { key: "accessory3", label: "Accessory 3", accepts: ["weapon", "accessory"] },
  { key: "accessory4", label: "Accessory 4", accepts: ["weapon", "accessory"] },
];

// ─── Monster / Fight types ────────────────────────────────────────────────────
type MonsterDef = MonsterDefinition;
type MonsterAttack = RollableAttack;

interface CombatMonster {
  uid: string;
  def: MonsterDef;
  side: "ally" | "enemy";
  currentHp: number;
  initiative: number;
  runtime: MonsterCombatRuntime;
}

interface CombatPlayer {
  uid: string;
  name: string;
  currentHp: number;
  maxHp: number;
  initiative: number;
}

function monsterPower(m: MonsterDef): number {
  const statSum = Object.values(m.stats).reduce((a, b) => a + b, 0);
  return statSum + Math.round(m.hp / 5) + m.ac;
}

function difficultyLabel(power: number): { label: string; color: string } {
  if (power <= 20) return { label: "Easy", color: "#6aaa6a" };
  if (power <= 40) return { label: "Medium", color: "#c4853a" };
  if (power <= 70) return { label: "Hard", color: "#e05050" };
  return { label: "Deadly", color: "#8b1c1c" };
}

function rollD(sides: number) {
  return Math.floor(Math.random() * sides) + 1;
}

const EMPTY_STATS: Stats = { PHYS: 0, CON: 0, INT: 0, SOC: 0 };

const canonicalStatKey = (value: unknown): StatKey | null => {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  if (key === "PHYS" || key === "STR" || key === "DEX") return "PHYS";
  if (key === "CON") return "CON";
  if (key === "INT" || key === "WIS") return "INT";
  if (key === "SOC" || key === "SOCIAL" || key === "CHA") return "SOC";
  return null;
};

const normalizeFormulaStatTokens = (formula: string): string =>
  formula
    .replace(/\bSTR\s*\+\s*DEX\b/gi, "PHYS")
    .replace(/\bDEX\s*\+\s*STR\b/gi, "PHYS")
    .replace(/\bSTR\b/gi, "PHYS")
    .replace(/\bDEX\b/gi, "PHYS")
    .replace(/\bWIS\b/gi, "INT")
    .replace(/\bCHA\b/gi, "SOC")
    .replace(/\bSOCIAL\b/gi, "SOC");

const normalizeStatsObject = (value: unknown): Stats => {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<string, unknown>>;
  const toNum = (n: unknown): number => {
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    PHYS: toNum(raw.PHYS) + toNum(raw.STR) + toNum(raw.DEX),
    CON: toNum(raw.CON),
    INT: toNum(raw.INT) + toNum(raw.WIS),
    SOC: toNum(raw.SOC) + toNum(raw.SOCIAL) + toNum(raw.CHA),
  };
};

const normalizeStatExpression = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.toUpperCase().replace(/\s+/g, "");
  if (!normalized) return undefined;
  const parts = normalized.split("+").filter(Boolean);
  if (parts.length === 0) return undefined;
  const mapped: StatKey[] = [];
  parts.forEach((part) => {
    const key = canonicalStatKey(part);
    if (!key) return;
    if (!mapped.includes(key)) mapped.push(key);
  });
  if (mapped.length === 0) return undefined;
  return mapped.join("+");
};

// Safely evaluate a formula string with level + stat variables
function evaluateFormula(formula: string, lvl: number, s: Stats): number {
  try {
    const expr = normalizeFormulaStatTokens(formula.trim())
      .replace(/^\+/, "")
      .replace(/\blevel\b/gi, String(lvl))
      .replace(/\bPHYS\b/gi, String(s.PHYS))
      .replace(/\bCON\b/g, String(s.CON))
      .replace(/\bINT\b/g, String(s.INT))
      .replace(/\bSOC\b/gi, String(s.SOC))
      .replace(/\bfloor\b/g, "Math.floor")
      .replace(/\bceil\b/g, "Math.ceil")
      .replace(/\bround\b/g, "Math.round")
      .replace(/\bmax\b/g, "Math.max")
      .replace(/\bmin\b/g, "Math.min")
      .replace(/\babs\b/g, "Math.abs");
    // After substitution only numbers/operators/Math.* should remain
    const stripped = expr.replace(/Math\.(floor|ceil|round|max|min|abs)/g, "0");
    if (/[a-zA-Z_$]/.test(stripped)) return 0;
    // eslint-disable-next-line no-new-func
    return Number(new Function("Math", `"use strict"; return (${expr});`)(Math)) || 0;
  } catch { return 0; }
}

interface WeaponFormulaResult {
  ok: boolean;
  total: number;
  detail: string;
}

// Supports arithmetic + parentheses + dice tokens (NdM) + stat keys.
function evaluateWeaponFormula(formula: string, s: Stats): WeaponFormulaResult {
  try {
    const base = normalizeFormulaStatTokens(formula.trim());
    if (!base) return { ok: false, total: 0, detail: "" };

    let expr = base;
    let detail = base;

    expr = expr.replace(/(\d*)d(\d+)/gi, (match, countRaw: string, sidesRaw: string) => {
      const count = Number(countRaw || 1);
      const sides = Number(sidesRaw);
      if (!Number.isFinite(count) || !Number.isFinite(sides) || count <= 0 || sides <= 0) return "0";
      let sum = 0;
      const rolls: number[] = [];
      for (let i = 0; i < Math.floor(count); i++) {
        const roll = rollD(Math.floor(sides));
        rolls.push(roll);
        sum += roll;
      }
      detail = detail.replace(match, `${Math.floor(count)}d${Math.floor(sides)}(${rolls.join("+") || "0"})`);
      return String(sum);
    });

    STAT_LABELS.forEach((stat) => {
      const value = String(s[stat]);
      const re = new RegExp(`\\b${stat}\\b`, "gi");
      expr = expr.replace(re, value);
      detail = detail.replace(re, `${stat}(${value})`);
    });

    if (/[^0-9+\-*/().\s]/.test(expr)) return { ok: false, total: 0, detail: "" };
    if (/[*]{2,}|[/]{2,}/.test(expr)) return { ok: false, total: 0, detail: "" };

    // eslint-disable-next-line no-new-func
    const raw = Number(new Function("Math", `"use strict"; return (${expr});`)(Math));
    if (!Number.isFinite(raw)) return { ok: false, total: 0, detail: "" };
    const total = Math.max(0, Math.floor(raw));
    return { ok: true, total, detail: `${detail} = ${total}` };
  } catch {
    return { ok: false, total: 0, detail: "" };
  }
}

const BASE_EQUIPMENT: Equipment = {
  head: null,
  chest: BASE_CHEST,
  pants: BASE_PANTS,
  boots: BASE_BOOTS,
  weapon1: null,
  weapon2: null,
  accessory1: null,
  accessory2: null,
  accessory3: null,
  accessory4: null,
};

export default function App() {
  const [characterName, setCharacterName] = useState("");
  const [portrait, setPortrait] = useState("");
  const [portraitInput, setPortraitInput] = useState("");
  const [portraitValid, setPortraitValid] = useState(false);
  const [portraitError, setPortraitError] = useState("");
  const [selectedClass, setSelectedClass] = useState<ClassName | null>(null);
  const [level, setLevel] = useState<number | "">(1);
  const [xpDiamonds, setXpDiamonds] = useState(0);

  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [statBonuses, setStatBonuses] = useState<Stats>(EMPTY_STATS);

  const [maxHp, setMaxHp] = useState<number | "">("");
  const [currentHp, setCurrentHp] = useState<number | "">("");

  const [equipment, setEquipment] = useState<Equipment>(BASE_EQUIPMENT);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [nextItemId, setNextItemId] = useState(1);
  const [gold, setGold] = useState(0);
  const [abilities, setAbilities] = useState<Ability[]>(PLACEHOLDER_ABILITIES);
  const [nextAbilityId, setNextAbilityId] = useState(1);
  const [importJsonText, setImportJsonText] = useState("");
  const [importJsonOpen, setImportJsonOpen] = useState(false);
  
  const [spells, setSpells] = useState<Spell[]>([]);
  const [nextSpellId, setNextSpellId] = useState(1);
  const [importSpellJsonText, setImportSpellJsonText] = useState("");
  const [importSpellJsonOpen, setImportSpellJsonOpen] = useState(false);
  const [spellSlotSelections, setSpellSlotSelections] = useState<Record<number, number>>({});
  const [characterLoadJsonText, setCharacterLoadJsonText] = useState("");
  const [characterLoadJsonOpen, setCharacterLoadJsonOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [statPopup, setStatPopup] = useState<StatKey | "AC" | "Initiative" | "Speed" | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [dodgePopup, setDodgePopup] = useState<string | null>(null);

  // ─── Class abilities ──────────────────────────────────────────────────────
  const [secondWindUses, setSecondWindUses] = useState(2);
  const [wizardSpellSlots, setWizardSpellSlots] = useState(2);

  const [damageInput, setDamageInput] = useState("");
  const [healInput, setHealInput] = useState("");
  const [damageType, setDamageType] = useState<"physical" | "magic" | "true">("physical");

  // ─── Combat action tracker ────────────────────────────────────────────────
  const [actionUsedSlots, setActionUsedSlots] = useState<boolean[]>([false]);
  const [bonusActionUsed, setBonusActionUsed] = useState(false);

  // ─── Long rest ────────────────────────────────────────────────────────────
  type LongRestStep = "confirm" | "result" | "party" | null;
  const [longRestStep, setLongRestStep] = useState<LongRestStep>(null);
  const [longRestRoll, setLongRestRoll] = useState(0);
  const [longRestSafe, setLongRestSafe] = useState(false);

  // ─── Fight menu ───────────────────────────────────────────────────────────
  const [fightMenuOpen, setFightMenuOpen] = useState(false);
  const [fightAllies, setFightAllies] = useState<MonsterDef[]>([]);
  const [fightCombatants, setFightCombatants] = useState<MonsterDef[]>([]);
  const fightDragId = useRef<string | null>(null);
  const fightDragFrom = useRef<"roster" | "allies" | "combatants">("roster");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── Combat ───────────────────────────────────────────────────────────────
  const [initiativePhase, setInitiativePhase] = useState(false);
  const [combatActive, setCombatActive] = useState(false);
  const [combatMonsters, setCombatMonsters] = useState<CombatMonster[]>([]);
  const [combatPlayers, setCombatPlayers] = useState<CombatPlayer[]>([
    { uid: "cp1", name: "Player 1", currentHp: 0, maxHp: 0, initiative: 0 },
  ]);
  const [round, setRound] = useState(1);
  const [turnIndex, setTurnIndex] = useState(0);
  const [combatLog, setCombatLog] = useState<string[]>([]);
  const combatAttackDrag = useRef<{ monsterId: string; attack: MonsterAttack } | null>(null);
  const [loadItemOpen, setLoadItemOpen] = useState(false);
  const [itemImportText, setItemImportText] = useState("");
  const [itemForm, setItemForm] = useState<{
    name: string; type: ItemType; slot: EquipSlot | ""; die: number; stat: StatKey; damageBonus: number; acBonus: number; description: string;
  }>({ name: "", type: "weapon", slot: "", die: 8, stat: "PHYS", damageBonus: 0, acBonus: 0, description: "" });

  const [dragOverSlot, setDragOverSlot] = useState<EquipSlot | null>(null);
  const dragItemId = useRef<number | null>(null);
  const dragFromSlot = useRef<EquipSlot | null>(null);
  const [chargeInputDrafts, setChargeInputDrafts] = useState<Record<string, string>>({});
  const [chargeInputHints, setChargeInputHints] = useState<Record<string, string>>({});
  const chargeInputTimers = useRef<Record<string, number>>({});

  const [log, setLog] = useState<LogEntry[]>([]);
  const [nextId, setNextId] = useState(1);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([{ id: 1, text: "" }]);
  const [currentJournalIndex, setCurrentJournalIndex] = useState(0);
  const [nextJournalEntryId, setNextJournalEntryId] = useState(2);

  // ─── Save / Load ─────────────────────────────────────────────────────────
  const saveCharacter = async () => {
    // gather a comprehensive snapshot of character state
    const data = {
      version: 1,
      characterName,
      portrait,
      portraitInput,
      portraitValid,
      selectedClass,
      level,
      xpDiamonds,
      stats,
      statBonuses,
      maxHp,
      currentHp,
      // derived values included for completeness (will be recomputed on load)
      ac,
      initiative,
      speed,
      log,
      nextId,
      journalEntries,
      currentJournalIndex,
      nextJournalEntryId,
      equipment,
      inventory,
      nextItemId,
      gold,
      abilities,
      nextAbilityId,
      importJsonText,
      importJsonOpen,
      spells,
      nextSpellId,
      importSpellJsonText,
      importSpellJsonOpen,
      spellSlotSelections,
      characterLoadJsonText,
      characterLoadJsonOpen,
      selectedItem,
      statPopup,
      adminOpen,
      // class ability counters + miscellaneous
      secondWindUses,
      wizardSpellSlots,
      damageInput,
      healInput,
      damageType,
      actionUsedSlots,
      bonusActionUsed,
      longRestStep,
      longRestRoll,
      longRestSafe,
      fightMenuOpen,
      fightAllies,
      fightCombatants,
      combatPlayers,
      round,
      turnIndex,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${characterName || "character"} ${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyCharacterData = (d: any) => {
    const normalizeLoadedItem = (item: InventoryItem): InventoryItem => ({
      ...item,
      ...(item.stat ? { stat: normalizeStatExpression(item.stat) ?? item.stat } : {}),
      ...(item.weaponFormula ? { weaponFormula: normalizeFormulaStatTokens(item.weaponFormula) } : {}),
      ...(item.healStat ? { healStat: canonicalStatKey(item.healStat) ?? undefined } : {}),
      ...(item.statBonus ? { statBonus: normalizeStatsObject(item.statBonus) } : {}),
      ...(Array.isArray(item.attacks)
        ? {
            attacks: item.attacks.map((attack) => ({
              ...attack,
              ...(attack.stat ? { stat: normalizeStatExpression(attack.stat) ?? attack.stat } : {}),
              ...(attack.formula ? { formula: normalizeFormulaStatTokens(attack.formula) } : {}),
            })),
          }
        : {}),
    });

    const normalizeLoadedAbility = (ability: Ability): Ability => ({
      ...ability,
      ...(Array.isArray(ability.modifiers)
        ? {
            modifiers: ability.modifiers.map((modifier) => ({
              ...modifier,
              label: canonicalStatKey(modifier.label) ?? modifier.label,
            })),
          }
        : {}),
      ...(Array.isArray(ability.actions)
        ? {
            actions: ability.actions.map((action) => ({
              ...action,
              ...(action.stat ? { stat: normalizeStatExpression(action.stat) ?? action.stat } : {}),
              ...(action.formula ? { formula: normalizeFormulaStatTokens(action.formula) } : {}),
            })),
          }
        : {}),
    });

    const normalizeLoadedSpell = (spell: Partial<Spell> | any): Spell => ({
      id: Number(spell?.id) || 0,
      name: typeof spell?.name === "string" ? spell.name : "Unnamed Spell",
      type: "Ability" as AbilityType,
      description: typeof spell?.description === "string" ? spell.description : "",
      isSpell: true,
      ...(spell?.damageDie !== undefined ? { damageDie: Number(spell.damageDie) } : {}),
      ...(canonicalStatKey(spell?.damageStat) ? { damageStat: canonicalStatKey(spell.damageStat) as StatKey } : {}),
      ...(Array.isArray(spell?.statModifiers)
        ? {
            statModifiers: spell.statModifiers.map((modifier: AbilityModifier) => ({
              ...modifier,
              label: canonicalStatKey(modifier.label) ?? modifier.label,
            })),
          }
        : {}),
      ...(spell?.slotCost !== undefined ? { slotCost: Math.max(1, Number(spell.slotCost) || 1) } : {}),
      ...(spell?.slotCostMax !== undefined ? { slotCostMax: Math.max(1, Number(spell.slotCostMax) || 1) } : {}),
      ...(spell?.scaleDamageBySlots !== undefined ? { scaleDamageBySlots: Boolean(spell.scaleDamageBySlots) } : {}),
    });

    const normalizeJournalEntries = (raw: any): JournalEntry[] => {
      if (!Array.isArray(raw)) return [{ id: 1, text: "" }];
      const normalized = raw.map((entry: any, index: number) => {
        const parsedId = Number(entry?.id);
        return {
          id: Number.isFinite(parsedId) && parsedId > 0 ? Math.floor(parsedId) : index + 1,
          text: typeof entry?.text === "string" ? entry.text : "",
        };
      });
      return normalized.length > 0 ? normalized : [{ id: 1, text: "" }];
    };

    if (d.characterName !== undefined) setCharacterName(d.characterName);
    if (d.selectedClass !== undefined) {
      const incomingClass = d.selectedClass as string;
      setSelectedClass(incomingClass === "Fighter" || incomingClass === "Wizard" ? incomingClass : null);
    }
    if (d.level !== undefined) setLevel(d.level);
    if (d.xpDiamonds !== undefined) setXpDiamonds(d.xpDiamonds);
    if (d.stats !== undefined) setStats(normalizeStatsObject(d.stats));
    if (d.statBonuses !== undefined) setStatBonuses(normalizeStatsObject(d.statBonuses));
    if (d.maxHp !== undefined) setMaxHp(d.maxHp);
    if (d.currentHp !== undefined) setCurrentHp(d.currentHp);
    if (d.log !== undefined) setLog(d.log);
    if (d.nextId !== undefined) setNextId(d.nextId);
    const incomingJournalEntries = d.journalEntries !== undefined
      ? normalizeJournalEntries(d.journalEntries)
      : journalEntries;
    if (d.journalEntries !== undefined) setJournalEntries(incomingJournalEntries);

    if (d.currentJournalIndex !== undefined || d.journalEntries !== undefined) {
      const rawIndex = Number(d.currentJournalIndex);
      const fallbackIndex = d.currentJournalIndex !== undefined && Number.isFinite(rawIndex)
        ? Math.floor(rawIndex)
        : 0;
      setCurrentJournalIndex(Math.max(0, Math.min(incomingJournalEntries.length - 1, fallbackIndex)));
    }

    const journalFallbackNextId = Math.max(1, ...incomingJournalEntries.map((entry) => entry.id)) + 1;
    if (d.nextJournalEntryId !== undefined || d.journalEntries !== undefined) {
      const rawNextId = Number(d.nextJournalEntryId);
      const parsedNextId = d.nextJournalEntryId !== undefined && Number.isFinite(rawNextId)
        ? Math.floor(rawNextId)
        : journalFallbackNextId;
      setNextJournalEntryId(Math.max(journalFallbackNextId, parsedNextId));
    }

    if (d.portrait !== undefined) { setPortrait(d.portrait); setPortraitInput(d.portrait); setPortraitValid(!!d.portrait); }
    if (d.equipment !== undefined) {
      const eq = d.equipment as Partial<Record<EquipSlot, InventoryItem | null>>;
      const normalized = { ...BASE_EQUIPMENT };
      (Object.keys(BASE_EQUIPMENT) as EquipSlot[]).forEach((slot) => {
        const incoming = eq[slot];
        normalized[slot] = incoming ? normalizeWeaponCharges(normalizeLoadedItem(incoming as InventoryItem)) : null;
      });
      setEquipment(normalized);
    }
    if (d.inventory !== undefined) {
      const inv = Array.isArray(d.inventory) ? d.inventory : [];
      setInventory(inv.map((item: InventoryItem) => normalizeWeaponCharges(normalizeLoadedItem(item))));
    }
    if (d.nextItemId !== undefined) setNextItemId(d.nextItemId);
    if (d.gold !== undefined) setGold(d.gold);
    if (d.abilities !== undefined) {
      const loadedAbilities = Array.isArray(d.abilities) ? d.abilities : [];
      setAbilities(loadedAbilities.map((ability: Ability) => normalizeLoadedAbility(ability)));
    }
    if (d.nextAbilityId !== undefined) setNextAbilityId(d.nextAbilityId);
    if (d.wizardSpellSlots !== undefined) setWizardSpellSlots(d.wizardSpellSlots);
    if (d.spellSlotSelections !== undefined) setSpellSlotSelections(d.spellSlotSelections);
    if (d.spells !== undefined) {
      const loadedSpells = Array.isArray(d.spells) ? d.spells : [];
      setSpells(loadedSpells.map((spell: Spell) => normalizeLoadedSpell(spell)));
    }
    if (d.nextSpellId !== undefined) setNextSpellId(d.nextSpellId);
    if (d.portraitInput !== undefined) setPortraitInput(d.portraitInput);
    if (d.portraitValid !== undefined) setPortraitValid(d.portraitValid);
    if (d.importJsonText !== undefined) setImportJsonText(d.importJsonText);
    if (d.importJsonOpen !== undefined) setImportJsonOpen(d.importJsonOpen);
    if (d.importSpellJsonText !== undefined) setImportSpellJsonText(d.importSpellJsonText);
    if (d.importSpellJsonOpen !== undefined) setImportSpellJsonOpen(d.importSpellJsonOpen);
    if (d.characterLoadJsonText !== undefined) setCharacterLoadJsonText(d.characterLoadJsonText);
    if (d.characterLoadJsonOpen !== undefined) setCharacterLoadJsonOpen(d.characterLoadJsonOpen);
    if (d.selectedItem !== undefined) setSelectedItem(d.selectedItem);
    if (d.statPopup !== undefined) setStatPopup(d.statPopup);
    if (d.adminOpen !== undefined) setAdminOpen(d.adminOpen);
    if (d.secondWindUses !== undefined) setSecondWindUses(d.secondWindUses);
    if (d.damageInput !== undefined) setDamageInput(d.damageInput);
    if (d.healInput !== undefined) setHealInput(d.healInput);
    if (d.damageType !== undefined) setDamageType(d.damageType);
    if (d.actionUsedSlots !== undefined) setActionUsedSlots(d.actionUsedSlots);
    if (d.bonusActionUsed !== undefined) setBonusActionUsed(d.bonusActionUsed);
    if (d.longRestStep !== undefined) setLongRestStep(d.longRestStep);
    if (d.longRestRoll !== undefined) setLongRestRoll(d.longRestRoll);
    if (d.longRestSafe !== undefined) setLongRestSafe(d.longRestSafe);
    if (d.fightMenuOpen !== undefined) setFightMenuOpen(d.fightMenuOpen);
    if (d.fightAllies !== undefined) setFightAllies(normalizeMonsterCollection(d.fightAllies));
    if (d.fightCombatants !== undefined) setFightCombatants(normalizeMonsterCollection(d.fightCombatants));
    if (d.combatPlayers !== undefined) setCombatPlayers(d.combatPlayers);
    if (d.round !== undefined) setRound(d.round);
    if (d.turnIndex !== undefined) setTurnIndex(d.turnIndex);
  };

  const loadCharacterFromText = () => {
    try {
      const d = JSON.parse(characterLoadJsonText);
      applyCharacterData(d);
      setCharacterLoadJsonText("");
      setCharacterLoadJsonOpen(false);
    } catch {}
  };

  const openCharacterFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleCharacterFile = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result));
        applyCharacterData(d);
      } catch {}
    };
    reader.readAsText(file);
    e.currentTarget.value = "";
  };

  // ─── HP ──────────────────────────────────────────────────────────────────
  const addLog = (text: string, type: LogEntry["type"]) => {
    setLog((prev) => [{ id: nextId, text, type }, ...prev].slice(0, 40));
    setNextId((n) => n + 1);
  };

  const updateCurrentJournalEntry = (text: string) => {
    setJournalEntries((prev) => prev.map((entry, index) => (
      index === currentJournalIndex ? { ...entry, text } : entry
    )));
  };

  const goToNextJournalEntry = () => {
    const atLastEntry = currentJournalIndex === journalEntries.length - 1;
    if (!atLastEntry) {
      setCurrentJournalIndex((prev) => prev + 1);
      return;
    }

    setJournalEntries((prev) => [...prev, { id: nextJournalEntryId, text: "" }]);
    setCurrentJournalIndex(journalEntries.length);
    setNextJournalEntryId((prev) => prev + 1);
  };

  const goToPreviousJournalEntry = () => {
    if (currentJournalIndex === 0) return;

    const currentEntry = journalEntries[currentJournalIndex];
    const shouldDeleteCurrentEntry = !currentEntry || currentEntry.text.trim() === "";
    if (shouldDeleteCurrentEntry) {
      setJournalEntries((prev) => prev.filter((_, index) => index !== currentJournalIndex));
    }

    setCurrentJournalIndex((prev) => Math.max(0, prev - 1));
  };

  const adjustHp = (delta: number) => {
    const cur = typeof currentHp === "number" ? currentHp : 0;
    const max = typeof maxHp === "number" ? maxHp : 0;
    setCurrentHp(Math.max(0, Math.min(max || Infinity, cur + delta)));
    if (delta > 0) addLog(`Healed ${Math.abs(delta)} HP.`, "heal");
    else addLog(`Took ${Math.abs(delta)} damage.`, "hit");
  };

  const applyIncomingDamage = (raw: number, type: "physical" | "magic" | "true") => {
    if (type === "true") {
      adjustHp(-raw);
      addLog(`True damage: ${raw} damage taken.`, "hit");
      return;
    }

    // Dodge roll: 1% per Speed point
    try {
      const dodgeChance = Math.max(0, Math.min(100, speed || 0));
      if (dodgeChance > 0) {
        const roll = Math.random() * 100;
        if (roll < dodgeChance) {
          const msg = `Dodged ${type} damage (${raw}).`;
          addLog(msg, "info");
          setDodgePopup(msg);
          setTimeout(() => setDodgePopup(null), 2500);
          return;
        }
      }
    } catch (e) {}

    const resistance = type === "physical" ? physAC : magicResist;
    const typeLabel = type === "physical" ? "Physical" : "Magic";
    const afterResistance = Math.max(0, raw - resistance);
    const resistanceLabel = resistance > 0 ? ` − ${resistance} ${typeLabel === "Physical" ? "AC" : "MR"} = ${afterResistance}` : "";

    adjustHp(-afterResistance);
    addLog(`${typeLabel}: ${raw}${resistanceLabel} damage taken.`, afterResistance > 0 ? "hit" : "miss");
  };

  const parseModifierValue = (value: string) => {
    const normalized = value.trim().replace(/^\+/, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
    // formula value — use base stats to avoid circularity with effectiveStats
    const lvl = level === "" ? 1 : Number(level);
    return evaluateFormula(normalized, lvl, stats);
  };
  const abilityScoreModifiers = abilities.reduce((acc, ability) => {
    ability.modifiers?.forEach((mod) => {
      const stat = canonicalStatKey(mod.label);
      if (stat) {
        acc[stat] += parseModifierValue(mod.value);
      }
    });
    return acc;
  }, { ...EMPTY_STATS } as Stats);
  const equipmentScoreBonuses = Array.from(
    new Map(
      (Object.values(equipment).filter(Boolean) as InventoryItem[]).map((item) => [item.id, item]),
    ).values(),
  ).reduce((acc, item) => {
    if (!item.statBonus) return acc;
    STAT_LABELS.forEach((stat) => {
      const value = Number(item.statBonus?.[stat] ?? 0);
      if (Number.isFinite(value)) acc[stat] += value;
    });
    return acc;
  }, { ...EMPTY_STATS } as Stats);
  const effectiveStats: Stats = {
    PHYS: stats.PHYS + abilityScoreModifiers.PHYS + equipmentScoreBonuses.PHYS,
    CON: stats.CON + abilityScoreModifiers.CON + equipmentScoreBonuses.CON,
    INT: stats.INT + abilityScoreModifiers.INT + equipmentScoreBonuses.INT,
    SOC: stats.SOC + abilityScoreModifiers.SOC + equipmentScoreBonuses.SOC,
  };

  useEffect(() => {
    if (!selectedClass) return;
    const hitDie = CLASS_HIT_DIE[selectedClass];
    const lvl = level === "" ? 1 : Number(level);
    const defaultHp = hitDie + Math.max(0, lvl - 1) * (hitDie / 4);
    const conHp = lvl * effectiveStats.CON;
    const computed = Math.max(1, Math.round(defaultHp + conHp));
    setMaxHp(computed);
    setCurrentHp((prev) => (prev === "" ? computed : Math.min(Number(prev), computed)));
  }, [selectedClass, level, effectiveStats.CON]);

  useEffect(() => {
    if (selectedClass !== "Wizard") return;
    const lvl = level === "" ? 1 : Number(level);
    setWizardSpellSlots(Math.max(1, lvl + 1));
  }, [selectedClass, level]);

  // ─── Stat points ─────────────────────────────────────────────────────────
  const totalPoints = level === "" ? 0 : Number(level);
  const spentPoints = STAT_LABELS.reduce((s, k) => s + statBonuses[k], 0);
  const availablePoints = totalPoints - spentPoints;

  const spendPoint = (stat: StatKey) => {
    if (availablePoints <= 0) return;
    setStats((p) => ({ ...p, [stat]: p[stat] + 1 }));
    setStatBonuses((p) => ({ ...p, [stat]: p[stat] + 1 }));
  };
  const refundPoint = (stat: StatKey) => {
    if (statBonuses[stat] <= 0) return;
    setStats((p) => ({ ...p, [stat]: p[stat] - 1 }));
    setStatBonuses((p) => ({ ...p, [stat]: p[stat] - 1 }));
  };

  // ─── Attacks ─────────────────────────────────────────────────────────────
  const attackDie = selectedClass ? CLASS_ATTACK_DIE[selectedClass] : 4;

  // resolve e.g. "PHYS" or "PHYS+INT" to a summed effective-stat number
  const resolveStatValue = (statExpr: string): number =>
    (normalizeStatExpression(statExpr)?.split("+") ?? []).reduce((sum, key) => {
      const k = key as StatKey;
      return sum + (STAT_LABELS.includes(k) ? effectiveStats[k] : 0);
    }, 0);

  const toChargeValue = (value: unknown): number | undefined => {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const normalizeWeaponCharges = (item: InventoryItem): InventoryItem => {
    if (item.type !== "weapon") return item;
    const max = toChargeValue(item.maxCharges);
    if (!max) return { ...item, maxCharges: undefined, currentCharges: undefined };
    const currentRaw = Math.floor(Number(item.currentCharges ?? max));
    const current = Number.isFinite(currentRaw) ? Math.max(0, Math.min(max, currentRaw)) : max;
    return { ...item, maxCharges: max, currentCharges: current };
  };

  // safely adjust charges on an item whether it lives in equipment or inventory
  const updateItemCharges = (itemId: number, delta: number) => {
    const clamp = (item: InventoryItem): InventoryItem => {
      const normalized = normalizeWeaponCharges(item);
      const max = normalized.maxCharges ?? 0;
      if (max <= 0) return normalized;
      const cur = normalized.currentCharges ?? max;
      return { ...normalized, currentCharges: Math.max(0, Math.min(max, cur + delta)) };
    };
    setEquipment((prev) => {
      const next = { ...prev };
      (Object.keys(next) as EquipSlot[]).forEach((slot) => {
        if (next[slot]?.id === itemId) next[slot] = clamp(next[slot]!);
      });
      return next;
    });
    setInventory((prev) => prev.map((item) => item.id === itemId ? clamp(item) : item));
  };

  const setItemCurrentCharges = (itemId: number, value: number) => {
    const applyCurrent = (item: InventoryItem): InventoryItem => {
      if (item.id !== itemId) return item;
      const normalized = normalizeWeaponCharges(item);
      const max = normalized.maxCharges ?? 0;
      if (max <= 0) return normalized;
      const nextRaw = Math.floor(Number(value));
      const next = Number.isFinite(nextRaw) ? Math.max(0, Math.min(max, nextRaw)) : normalized.currentCharges ?? max;
      return { ...normalized, currentCharges: next };
    };
    setEquipment((prev) => {
      const next = { ...prev };
      (Object.keys(next) as EquipSlot[]).forEach((slot) => {
        if (next[slot]?.id === itemId) next[slot] = applyCurrent(next[slot]!);
      });
      return next;
    });
    setInventory((prev) => prev.map((item) => applyCurrent(item)));
  };

  const setItemMaxCharges = (itemId: number, value: number) => {
    const applyMax = (item: InventoryItem): InventoryItem => {
      if (item.id !== itemId) return item;
      if (item.type !== "weapon") return item;
      const nextMaxRaw = Math.floor(Number(value));
      if (!Number.isFinite(nextMaxRaw) || nextMaxRaw <= 0) {
        return { ...item, maxCharges: undefined, currentCharges: undefined };
      }
      const normalized = normalizeWeaponCharges(item);
      const nextMax = nextMaxRaw;
      const curRaw = Math.floor(Number(normalized.currentCharges ?? nextMax));
      const nextCurrent = Number.isFinite(curRaw) ? Math.max(0, Math.min(nextMax, curRaw)) : nextMax;
      return { ...normalized, maxCharges: nextMax, currentCharges: nextCurrent };
    };
    setEquipment((prev) => {
      const next = { ...prev };
      (Object.keys(next) as EquipSlot[]).forEach((slot) => {
        if (next[slot]?.id === itemId) next[slot] = applyMax(next[slot]!);
      });
      return next;
    });
    setInventory((prev) => prev.map((item) => applyMax(item)));
  };

  const getChargeDraftKey = (itemId: number, field: "cur" | "max") => `${itemId}:${field}`;

  const clearChargeInputsForItem = (itemId: number) => {
    setChargeInputDrafts((prev) => {
      const next = { ...prev };
      delete next[getChargeDraftKey(itemId, "cur")];
      delete next[getChargeDraftKey(itemId, "max")];
      return next;
    });
    setChargeInputHints((prev) => {
      const next = { ...prev };
      delete next[String(itemId)];
      return next;
    });
  };

  const nudgeItemCharges = (itemId: number, delta: number) => {
    updateItemCharges(itemId, delta);
    clearChargeInputsForItem(itemId);
  };

  const enableItemCharges = (itemId: number) => {
    setItemMaxCharges(itemId, 1);
    clearChargeInputsForItem(itemId);
  };

  const getChargeInputValue = (itemId: number, field: "cur" | "max", fallback: number) => {
    const key = getChargeDraftKey(itemId, field);
    return chargeInputDrafts[key] ?? String(fallback);
  };

  const queueChargeInputApply = (
    itemId: number,
    field: "cur" | "max",
    rawValue: string,
    currentCharges: number,
    maxCharges: number,
  ) => {
    if (field === "max") {
      setChargeInputHints((prev) => ({ ...prev, [String(itemId)]: "Max charges are fixed for weapons." }));
      setChargeInputDrafts((prev) => ({
        ...prev,
        [getChargeDraftKey(itemId, "max")]: String(maxCharges),
      }));
      return;
    }

    const key = getChargeDraftKey(itemId, field);
    setChargeInputDrafts((prev) => ({ ...prev, [key]: rawValue }));
    const active = chargeInputTimers.current[key];
    if (active) window.clearTimeout(active);

    chargeInputTimers.current[key] = window.setTimeout(() => {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        setChargeInputHints((prev) => ({ ...prev, [String(itemId)]: "" }));
        return;
      }

      const parsed = Math.floor(Number(trimmed));
      if (!Number.isFinite(parsed)) {
        setChargeInputHints((prev) => ({ ...prev, [String(itemId)]: "Enter a valid number." }));
        return;
      }

      if (field === "cur") {
        const clamped = Math.max(0, Math.min(maxCharges, parsed));
        setItemCurrentCharges(itemId, clamped);
        setChargeInputDrafts((prev) => ({ ...prev, [key]: String(clamped) }));
        const hint = clamped !== parsed ? `Clamped to ${clamped} (min 0, max ${maxCharges}).` : "";
        setChargeInputHints((prev) => ({ ...prev, [String(itemId)]: hint }));
        return;
      }

      const clampedMax = Math.max(1, parsed);
      const clampedCurrent = Math.max(0, Math.min(clampedMax, currentCharges));
      setItemMaxCharges(itemId, clampedMax);
      setItemCurrentCharges(itemId, clampedCurrent);
      setChargeInputDrafts((prev) => ({
        ...prev,
        [getChargeDraftKey(itemId, "max")]: String(clampedMax),
        [getChargeDraftKey(itemId, "cur")]: String(clampedCurrent),
      }));
      const hints: string[] = [];
      if (clampedMax !== parsed) hints.push(`Max clamped to ${clampedMax} (min 1).`);
      if (clampedCurrent !== currentCharges) hints.push(`Current clamped to ${clampedCurrent}.`);
      setChargeInputHints((prev) => ({ ...prev, [String(itemId)]: hints.join(" ") }));
    }, 250);
  };

  useEffect(() => {
    return () => {
      Object.values(chargeInputTimers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const applyDamage = (raw: number, label: string) => {
    addLog(`${label} — ${raw} damage dealt`, raw > 0 ? "hit" : "miss");
  };

  const doBasicAttack = () => {
    const phys = effectiveStats.PHYS;
    const roll = rollD(attackDie);
    applyDamage(roll + phys, `⚔ Basic Attack (${roll} + ${phys})`);
  };

  const rollAbilityCheck = (stat: StatKey) => {
    const roll = rollD(20);
    const total = roll + effectiveStats[stat];
    addLog(`${stat} check — d20 (${roll}) + ${effectiveStats[stat]} = ${total}`, "info");
  };

  const rollInitiative = () => {
    const roll = rollD(20);
    const total = roll + effectiveStats.PHYS;
    if (combatActive) {
      logCombat(`Initiative roll — d20 (${roll}) + PHYS (${effectiveStats.PHYS}) = ${total}`);
    } else {
      addLog(`Initiative — d20 (${roll}) + PHYS (${effectiveStats.PHYS}) = ${total}`, "info");
    }
  };

  const applyWeaponHealing = (item: InventoryItem) => {
    if (typeof item.heal === "number" && item.heal > 0) {
      adjustHp(item.heal);
      addLog(`${item.name} healed ${item.heal} HP.`, "heal");
    }
    if (item.healDie) {
      const healRoll = rollD(item.healDie);
      const healStat = item.healStat && STAT_LABELS.includes(item.healStat) ? effectiveStats[item.healStat] : 0;
      const healAmount = healRoll + healStat;
      adjustHp(healAmount);
      addLog(`${item.name} healed ${healAmount} HP (d${item.healDie} ${healRoll} + ${item.healStat ?? "stat"} ${healStat}).`, "heal");
    }
  };

  const doWeaponAttack = (item: InventoryItem, atkIdx?: number) => {
    const chargedItem = normalizeWeaponCharges(item);

    // ── multi-attack path ──────────────────────────────────────────────────────────
    if (chargedItem.attacks && chargedItem.attacks.length > 0) {
      const atk = chargedItem.attacks[atkIdx ?? 0];
      if (!atk) return;
      if (atk.consumesCharge && chargedItem.maxCharges) {
        const charges = chargedItem.currentCharges ?? chargedItem.maxCharges;
        if (charges <= 0) { addLog(`${chargedItem.name} — no charges remaining.`, "info"); return; }
        updateItemCharges(chargedItem.id, -1);
      }
      const formula = typeof atk.formula === "string" && atk.formula.trim()
        ? atk.formula.trim()
        : atk.die && atk.stat
          ? `1d${atk.die} + ${atk.stat}${atk.damageBonus ? ` + ${atk.damageBonus}` : ""}`
          : "";

      if (formula) {
        const outcome = evaluateWeaponFormula(formula, effectiveStats);
        if (outcome.ok) {
          applyDamage(outcome.total, `⚔ ${chargedItem.name} — ${atk.name} (${outcome.detail})`);
          return;
        }
      }

      if (!atk.die || !atk.stat) {
        addLog(`${chargedItem.name} — ${atk.name} has no valid damage formula.`, "info");
        return;
      }

      const sv = resolveStatValue(atk.stat);
      const roll = rollD(atk.die);
      const bonus = atk.damageBonus || 0;
      const total = roll + sv + bonus;
      const detail = bonus > 0
        ? `${roll} + ${atk.stat}(${sv}) + ${bonus}`
        : `${roll} + ${atk.stat}(${sv})`;
      applyDamage(total, `⚔ ${chargedItem.name} — ${atk.name} (${detail})`);
      return;
    }

    // ── legacy single-attack path ──────────────────────────────────────────────
    const formula = typeof chargedItem.weaponFormula === "string" && chargedItem.weaponFormula.trim()
      ? chargedItem.weaponFormula.trim()
      : chargedItem.die && chargedItem.stat
        ? `1d${chargedItem.die} + ${chargedItem.stat}${chargedItem.damageBonus ? ` + ${chargedItem.damageBonus}` : ""}`
          + `${chargedItem.extraDice && chargedItem.extraDie ? ` + ${chargedItem.extraDice}d${chargedItem.extraDie}` : ""}`
          + `${chargedItem.extraDamage ? ` + ${chargedItem.extraDamage}` : ""}`
        : "";

    if (formula) {
      const outcome = evaluateWeaponFormula(formula, effectiveStats);
      if (outcome.ok) {
        applyDamage(outcome.total, `⚔ ${chargedItem.name} (${outcome.detail})`);
        applyWeaponHealing(chargedItem);
        return;
      }
    }

    if (!chargedItem.die || !chargedItem.stat) {
      addLog(`${chargedItem.name} has no valid damage formula.`, "info");
      return;
    }

    const sv = resolveStatValue(chargedItem.stat);
    const baseRoll = rollD(chargedItem.die);
    const bonus = chargedItem.damageBonus || 0;
    let total = baseRoll + sv + bonus;
    let detailParts: string[] = [`${baseRoll}`, `${chargedItem.stat}(${sv})`];
    if (bonus) detailParts.push(`+${bonus}`);

    if (chargedItem.extraDice && chargedItem.extraDie) {
      let extraSum = 0;
      for (let i = 0; i < chargedItem.extraDice; i++) extraSum += rollD(chargedItem.extraDie);
      total += extraSum;
      detailParts.push(`${chargedItem.extraDice}d${chargedItem.extraDie}(${extraSum})`);
    }
    if (chargedItem.extraDamage) {
      total += chargedItem.extraDamage;
      detailParts.push(`+${chargedItem.extraDamage}`);
    }

    applyDamage(total, `⚔ ${chargedItem.name} (${detailParts.join(" + ")})`);
    applyWeaponHealing(chargedItem);
  };

  const doAbilityAction = (ability: Ability, actionIdx: number) => {
    if (isPassiveAbility(ability)) {
      addLog(`${ability.name} is passive and cannot be used as an action.`, "info");
      return;
    }
    const action = ability.actions?.[actionIdx];
    if (!action) return;

    const computedTotal = ability.tallyFormula
      ? Math.max(1, evaluateFormula(ability.tallyFormula, levelNumber, effectiveStats))
      : (ability.tally?.total ?? 1);
    const used = ability.tally?.used ?? 0;
    const remaining = Math.max(0, computedTotal - used);

    if (action.consumesTally && remaining <= 0) {
      addLog(`${ability.name} — no tally uses remaining.`, "info");
      return;
    }

    const formula = typeof action.formula === "string" && action.formula.trim()
      ? action.formula.trim()
      : action.die && action.stat
        ? `1d${action.die} + ${action.stat}${action.damageBonus ? ` + ${action.damageBonus}` : ""}`
        : "";

    let total = 0;
    let detail = "";

    if (formula) {
      const outcome = evaluateWeaponFormula(formula, effectiveStats);
      if (outcome.ok) {
        total = outcome.total;
        detail = outcome.detail;
      }
    }

    if (!detail && action.die && action.stat) {
      const sv = resolveStatValue(action.stat);
      const roll = rollD(action.die);
      const bonus = action.damageBonus || 0;
      total = roll + sv + bonus;
      detail = bonus > 0
        ? `${roll} + ${action.stat}(${sv}) + ${bonus}`
        : `${roll} + ${action.stat}(${sv})`;
    }

    if (!detail) {
      addLog(`${ability.name} — ${action.name} has no valid roll formula.`, "info");
      return;
    }

    if (action.consumesTally) {
      setAbilities((prev) => prev.map((entry) => {
        if (entry.id !== ability.id) return entry;
        const totalForEntry = entry.tallyFormula
          ? Math.max(1, evaluateFormula(entry.tallyFormula, levelNumber, effectiveStats))
          : (entry.tally?.total ?? 1);
        const usedForEntry = entry.tally?.used ?? 0;
        return {
          ...entry,
          tally: {
            total: totalForEntry,
            used: Math.min(totalForEntry, usedForEntry + 1),
          },
        };
      }));
    }

    applyDamage(total, `✦ ${ability.name} — ${action.name} (${detail})`);
  };


  // ─── Inventory ───────────────────────────────────────────────────────────
  const importItemsFromText = () => {
    try {
      const data = JSON.parse(itemImportText);
      const itemsData = Array.isArray(data) ? data : [data];
      const importedItems = itemsData
        .filter((entry): entry is Record<string, any> => entry && typeof entry === "object")
        .map((entry, index) => {
          const itemType = entry.type && ["weapon", "armor", "accessory", "consumable"].includes(entry.type)
            ? entry.type
            : "weapon";
          const icon = typeof entry.icon === "string" && entry.icon.trim() ? entry.icon.trim() : undefined;
          return {
                id: nextItemId + index,
                name: entry.name?.trim() || `Imported ${itemType}`,
                type: itemType as ItemType,
                ...(icon ? { icon } : {}),
                ...(entry.slot ? { slot: entry.slot as EquipSlot } : {}),
                ...(Array.isArray(entry.slots)
                  ? {
                      slots: entry.slots.filter((slot: unknown): slot is EquipSlot =>
                        typeof slot === "string" && EQUIP_SLOTS.some((s) => s.key === slot as EquipSlot),
                      ),
                    }
                  : {}),
                ...(entry.die !== undefined ? { die: Number(entry.die) || 8 } : {}),
                ...(entry.stat !== undefined ? { stat: normalizeStatExpression(entry.stat) ?? "PHYS" } : {}),
                ...(entry.weaponFormula !== undefined ? { weaponFormula: normalizeFormulaStatTokens(String(entry.weaponFormula)) } : {}),
                ...(entry.damageBonus !== undefined ? { damageBonus: Number(entry.damageBonus) || 0 } : {}),
                ...(entry.acBonus !== undefined ? { acBonus: Number(entry.acBonus) || 0 } : {}),
                ...(entry.magicResistBonus !== undefined ? { magicResistBonus: Number(entry.magicResistBonus) || 0 } : {}),
                ...(entry.heal !== undefined ? { heal: Number(entry.heal) } : {}),
                ...(entry.healDie !== undefined ? { healDie: Number(entry.healDie) } : {}),
                ...(entry.healStat !== undefined && canonicalStatKey(entry.healStat) ? { healStat: canonicalStatKey(entry.healStat) as StatKey } : {}),
                ...(entry.extraDamage !== undefined ? { extraDamage: Number(entry.extraDamage) } : {}),
                ...(entry.extraDice !== undefined ? { extraDice: Number(entry.extraDice) } : {}),
                ...(entry.extraDie !== undefined ? { extraDie: Number(entry.extraDie) } : {}),
                ...(Array.isArray(entry.attacks) ? {
                  attacks: entry.attacks
                    .filter((attack: unknown): attack is Record<string, unknown> => Boolean(attack && typeof attack === "object"))
                    .map((attack) => {
                      const attackStat = normalizeStatExpression(attack.stat);
                      return {
                        name: String(attack.name ?? "Attack"),
                        ...(attack.die !== undefined ? { die: Number(attack.die) || 0 } : {}),
                        ...(attackStat ? { stat: attackStat } : {}),
                        ...(attack.formula !== undefined ? { formula: normalizeFormulaStatTokens(String(attack.formula)) } : {}),
                        ...(attack.damageBonus !== undefined ? { damageBonus: Number(attack.damageBonus) || 0 } : {}),
                        ...(attack.consumesCharge !== undefined ? { consumesCharge: Boolean(attack.consumesCharge) } : {}),
                        ...(attack.description !== undefined ? { description: String(attack.description) } : {}),
                      } as WeaponAttack;
                    }),
                } : {}),
                ...(entry.maxCharges !== undefined ? {
                  maxCharges: toChargeValue(entry.maxCharges),
                  currentCharges: entry.currentCharges !== undefined ? Math.max(0, Number(entry.currentCharges) || 0) : toChargeValue(entry.maxCharges),
                } : {}),
                ...(entry.statBonus ? { statBonus: normalizeStatsObject(entry.statBonus) } : {}),
                ...(entry.speedBonus !== undefined ? { speedBonus: Number(entry.speedBonus) || 0 } : {}),
                ...(Array.isArray(entry.sacrificeRewards)
                  ? {
                      sacrificeRewards: entry.sacrificeRewards
                        .filter((reward: unknown): reward is Record<string, unknown> => Boolean(reward && typeof reward === "object"))
                        .map((reward) => ({
                          name: String(reward.name ?? "Reward"),
                          ...(reward.amount !== undefined
                            ? { amount: typeof reward.amount === "number" ? reward.amount : String(reward.amount) }
                            : {}),
                          ...(reward.description ? { description: String(reward.description) } : {}),
                        })),
                    }
                  : {}),
                ...(entry.description ? { description: entry.description } : {}),
              } as InventoryItem;
        });

      if (importedItems.length === 0) return;
      setInventory((prev) => [...prev, ...importedItems]);
      setNextItemId((n) => n + importedItems.length);
      setItemImportText("");
      setLoadItemOpen(false);
    } catch {}
  };

  const isWeaponSlot = (slot: EquipSlot) =>
    slot === "weapon1"
    || slot === "weapon2"
    || slot === "head"
    || slot === "chest"
    || slot === "pants"
    || slot === "boots"
    || slot === "accessory1"
    || slot === "accessory2"
    || slot === "accessory3"
    || slot === "accessory4";

  const getSlotsForItemPlacement = (item: InventoryItem, targetSlot: EquipSlot): EquipSlot[] => {
    if (item.slots && item.slots.length > 0) {
      const valid = item.slots.filter((slot): slot is EquipSlot =>
        EQUIP_SLOTS.some((s) => s.key === slot),
      );
      return Array.from(new Set(valid));
    }
    return [targetSlot];
  };

  const canPlaceItemInSlot = (item: InventoryItem, slot: EquipSlot): boolean => {
    const slotDef = EQUIP_SLOTS.find((s) => s.key === slot);
    if (!slotDef || !slotDef.accepts.includes(item.type)) return false;
    if (!item.slot) return true;
    if (isWeaponSlot(item.slot)) return isWeaponSlot(slot);
    return item.slot === slot;
  };

  const clearItemFromEquipment = (eq: Equipment, itemId: number): Equipment => {
    const next = { ...eq };
    (Object.keys(next) as EquipSlot[]).forEach((slot) => {
      if (next[slot]?.id === itemId) next[slot] = null;
    });
    return next;
  };

  const findFirstEquippedSlot = (itemId: number): EquipSlot | null => {
    for (const slot of Object.keys(equipment) as EquipSlot[]) {
      if (equipment[slot]?.id === itemId) return slot;
    }
    return null;
  };

  const unequipTobag = (slot: EquipSlot) => {
    const item = equipment[slot];
    if (!item) return;
    setInventory((prev) => [...prev, item]);
    setEquipment((prev) => clearItemFromEquipment(prev, item.id));
  };

  const removeFromBag = (id: number) => {
    setInventory((prev) => prev.filter((i) => i.id !== id));
    if (selectedItem?.id === id) setSelectedItem(null);
  };

  // ─── Drag & drop ─────────────────────────────────────────────────────────
  const onItemDragStart = (item: InventoryItem) => {
    dragItemId.current = item.id;
    dragFromSlot.current = null;
  };

  const onSlotDragStart = (slot: EquipSlot) => {
    dragFromSlot.current = slot;
    dragItemId.current = null;
  };

  const onSlotDrop = (targetSlot: EquipSlot) => {
    setDragOverSlot(null);

    if (dragItemId.current !== null) {
      // dragging from bag
      const item = inventory.find((i) => i.id === dragItemId.current);
      if (!item) return;
      const placementSlots = getSlotsForItemPlacement(item, targetSlot);
      if (item.slots && item.slots.length > 0 && !placementSlots.includes(targetSlot)) return;
      if (placementSlots.some((slot) => !canPlaceItemInSlot(item, slot))) return;

      const displaced = Array.from(new Set(
        placementSlots
          .map((slot) => equipment[slot])
          .filter((eqItem): eqItem is InventoryItem => Boolean(eqItem && eqItem.id !== item.id)),
      ));

      setEquipment((prev) => {
        let next = clearItemFromEquipment(prev, item.id);
        displaced.forEach((eqItem) => {
          next = clearItemFromEquipment(next, eqItem.id);
        });
        placementSlots.forEach((slot) => {
          next[slot] = item;
        });
        return next;
      });

      setInventory((prev) => {
        const filtered = prev.filter((i) => i.id !== item.id);
        return [...filtered, ...displaced];
      });
    } else if (dragFromSlot.current !== null) {
      // dragging from another slot
      const sourceSlot = dragFromSlot.current;
      if (sourceSlot === targetSlot) return;
      const sourceItem = equipment[sourceSlot];
      if (!sourceItem) return;

      const placementSlots = getSlotsForItemPlacement(sourceItem, targetSlot);
      if (sourceItem.slots && sourceItem.slots.length > 0 && !placementSlots.includes(targetSlot)) return;
      if (placementSlots.some((slot) => !canPlaceItemInSlot(sourceItem, slot))) return;

      const displaced = Array.from(new Set(
        placementSlots
          .map((slot) => equipment[slot])
          .filter((eqItem): eqItem is InventoryItem => Boolean(eqItem && eqItem.id !== sourceItem.id)),
      ));

      setEquipment((prev) => {
        let next = clearItemFromEquipment(prev, sourceItem.id);
        displaced.forEach((eqItem) => {
          next = clearItemFromEquipment(next, eqItem.id);
        });
        placementSlots.forEach((slot) => {
          next[slot] = sourceItem;
        });
        return next;
      });

      if (displaced.length > 0) {
        setInventory((prev) => [...prev, ...displaced]);
      }
    }
    dragItemId.current = null;
    dragFromSlot.current = null;
  };

  const onBagDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragFromSlot.current !== null) {
      unequipToBack(dragFromSlot.current);
    }
    dragItemId.current = null;
    dragFromSlot.current = null;
  };

  const unequipToBack = (slot: EquipSlot) => {
    const item = equipment[slot];
    if (!item) return;
    setInventory((prev) => [...prev, item]);
    setEquipment((prev) => clearItemFromEquipment(prev, item.id));
  };

  // ─── Portrait ────────────────────────────────────────────────────────────
  // ─── Fight menu helpers ───────────────────────────────────────────────────
  const startFightDrag = (id: string, from: "roster" | "allies" | "combatants") => {
    fightDragId.current = id;
    fightDragFrom.current = from;
  };

  const dropOnFightColumn = (target: "allies" | "combatants") => {
    const id = fightDragId.current;
    const from = fightDragFrom.current;
    if (!id) return;

    const def = BASE_MONSTER_REGISTRY.find((m) => m.id === id)
      ?? fightAllies.find((m) => m.id === id)
      ?? fightCombatants.find((m) => m.id === id);
    if (!def) return;

    if (from === "allies") setFightAllies((p) => p.filter((m) => m.id !== id));
    if (from === "combatants") setFightCombatants((p) => p.filter((m) => m.id !== id));

    if (target === "allies") setFightAllies((p) => [...p, def]);
    else setFightCombatants((p) => [...p, def]);

    fightDragId.current = null;
  };

  const removeFromFightColumn = (id: string, col: "allies" | "combatants") => {
    if (col === "allies") setFightAllies((p) => p.filter((m) => m.id !== id));
    else setFightCombatants((p) => p.filter((m) => m.id !== id));
  };

  const startCombat = () => {
    const allies: CombatMonster[] = fightAllies.map((def) => ({
      uid: `${def.id}-${Math.random().toString(36).slice(2)}`,
      def,
      side: "ally",
      currentHp: def.hp,
      initiative: rollD(20) + def.stats.PHYS,
      runtime: buildMonsterRuntime(def),
    }));
    const enemies: CombatMonster[] = fightCombatants.map((def) => ({
      uid: `${def.id}-${Math.random().toString(36).slice(2)}`,
      def,
      side: "enemy",
      currentHp: def.hp,
      initiative: rollD(20) + def.stats.PHYS,
      runtime: buildMonsterRuntime(def),
    }));
    const monsters: CombatMonster[] = [...allies, ...enemies];
    setCombatMonsters(monsters);
    setCombatLog([]);
    setRound(1);
    setInitiativePhase(true);
    setFightMenuOpen(false);
  };

  const beginCombat = () => {
    setCombatMonsters((prev) =>
      prev.map((monster) => {
        const passive = resolvePassiveTrigger(monster.def, monster.runtime, "encounter_start");
        if (passive.healing > 0) {
          logCombat(`${monster.def.name} gains ${passive.healing} HP from encounter passives.`);
        }
        passive.logLines.forEach((line) => logCombat(line));
        return {
          ...monster,
          currentHp: Math.min(monster.def.hp, monster.currentHp + passive.healing),
          runtime: passive.runtime,
        };
      }),
    );
    setInitiativePhase(false);
    setCombatActive(true);
    setTurnIndex(0);
    setCombatLog((prev) => [`⚔ Combat begins — Round 1`, ...prev].slice(0, 60));
  };

  const combatTotalPower = fightCombatants.reduce((s, m) => s + monsterPower(m), 0);
  const diff = difficultyLabel(combatTotalPower);

  const logCombat = (msg: string) => setCombatLog((p) => [msg, ...p].slice(0, 60));

  const monsterAttackPlayer = (monster: CombatMonster, attack: MonsterAttack, player: CombatPlayer) => {
    const resolved = resolveMonsterAttack(monster.def, monster.runtime, attack);
    const raw = resolved.damage;
    logCombat(`${resolved.logLine} → ${player.name}`);
    resolved.effectLines.forEach((line) => logCombat(line));
    setCombatMonsters((prev) =>
      prev.map((entry) => (entry.uid === monster.uid ? { ...entry, runtime: resolved.runtime } : entry)),
    );
    setCombatPlayers((prev) =>
      prev.map((p) => p.uid === player.uid ? { ...p, currentHp: Math.max(0, p.currentHp - raw) } : p)
    );
  };

  const triggerMonsterTurnStart = (monsterUid: string) => {
    setCombatMonsters((prev) =>
      prev.map((monster) => {
        if (monster.uid !== monsterUid) return monster;
        const cooled = tickMonsterCooldowns(monster.runtime);
        const passive = resolvePassiveTrigger(monster.def, cooled, "turn_start");
        passive.logLines.forEach((line) => logCombat(line));
        if (passive.healing > 0) {
          logCombat(`${monster.def.name} restores ${passive.healing} HP from passives.`);
        }
        return {
          ...monster,
          currentHp: Math.min(monster.def.hp, monster.currentHp + passive.healing),
          runtime: passive.runtime,
        };
      }),
    );
  };

  const useMonsterAbility = (monster: CombatMonster, ability: ActiveAbility) => {
    const resolved = resolveActiveAbility(monster.def, monster.runtime, ability);
    logCombat(resolved.logLine);
    resolved.effectLines.forEach((line) => logCombat(line));

    if (!resolved.canUse) return;

    setCombatMonsters((prev) =>
      prev.map((entry) => {
        if (entry.uid !== monster.uid) return entry;
        const healed = Math.min(entry.def.hp, entry.currentHp + resolved.selfHealing);
        return { ...entry, currentHp: healed, runtime: resolved.runtime };
      }),
    );

    if (ability.target === "player" && resolved.damage > 0) {
      setCombatPlayers((prev) => {
        const target = prev.find((player) => player.currentHp > 0) ?? prev[0];
        if (!target) return prev;
        logCombat(`${target.name} takes ${resolved.damage} damage from ${ability.name}.`);
        return prev.map((player) =>
          player.uid === target.uid ? { ...player, currentHp: Math.max(0, player.currentHp - resolved.damage) } : player,
        );
      });
    }
  };

  // ─── Abilities ────────────────────────────────────────────────────────────
  const usePrestidigitation = () => {
    addLog("✨ Prestidigitation — you weave a minor magical flourish: a spark of light, a whisper of sound, a small object nudged across a surface.", "info");
  };

  const useBasicOffensiveMagic = () => {
    const roll = rollD(4);
    const total = roll + effectiveStats.INT;
    addLog(`✨ Basic Offensive Magic — rolled ${roll} + INT ${effectiveStats.INT} = ${total} damage.`, "info");
  };

  const useSecondWind = () => {
    if (secondWindUses <= 0) return;
    const heal = effectiveStats.PHYS;
    const cur = typeof currentHp === "number" ? currentHp : 0;
    const max = typeof maxHp === "number" ? maxHp : 0;
    setCurrentHp(Math.min(max, cur + heal));
    setSecondWindUses((u) => u - 1);
    addLog(`Second Wind — healed ${heal} HP (PHYS ${effectiveStats.PHYS})`, "heal");
  };

  const doLongRestRoll = () => {
    const roll = rollD(20);
    const total = roll + effectiveStats.INT;
    setLongRestRoll(total);
    setLongRestSafe(total >= 10);
    setLongRestStep("result");
  };

  const completeLongRest = () => {
    const max = typeof maxHp === "number" ? maxHp : 0;
    const lvl = level === "" ? 1 : Number(level);
    const secondWindCharges = 2 + Math.floor(lvl / 5);
    setCurrentHp(max);
    setSecondWindUses(secondWindCharges);
    setWizardSpellSlots(Math.max(1, lvl + 1));
    addLog("Long rest completed — HP fully restored, abilities refreshed.", "heal");
    // restore weapon charges
    const restoreCharges = (item: InventoryItem): InventoryItem => {
      const normalized = normalizeWeaponCharges(item);
      return normalized.maxCharges ? { ...normalized, currentCharges: normalized.maxCharges } : normalized;
    };
    setInventory((prev) => prev.map(restoreCharges));
    setEquipment((prev) => {
      const next = { ...prev };
      (Object.keys(next) as EquipSlot[]).forEach((slot) => {
        if (next[slot]) next[slot] = restoreCharges(next[slot]!);
      });
      return next;
    });
    setLongRestStep(null);
  };

  const clearPortrait = () => { setPortrait(""); setPortraitInput(""); setPortraitValid(false); setPortraitError(""); };

  const handlePortraitFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPortraitError("Selected file is not an image.");
      e.currentTarget.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        setPortraitError("Could not read image file.");
        return;
      }
      setPortrait(dataUrl);
      setPortraitInput("");
      setPortraitValid(false);
      setPortraitError("");
    };
    reader.onerror = () => {
      setPortraitError("Could not read image file.");
    };
    reader.readAsDataURL(file);
    e.currentTarget.value = "";
  };

  // ─── Admin ────────────────────────────────────────────────────────────────
  const WEAPON_TEMPLATE = {
    __instructions: "MODEL TARGET: Generate item JSON that can be pasted directly into the importer with no manual fixes.\n" +
      "\nREQUIRED TOP-LEVEL FIELDS:\n" +
      "- name (string)\n" +
      "- type (string): must be \"weapon\"\n" +
      "\nOPTIONAL TOP-LEVEL FIELDS (ALL SUPPORTED):\n" +
      "- icon (string): optional custom icon shown in inventory and detail cards\n" +
      "- slot (string): preferred slot lock. Valid keys: head, chest, pants, boots, weapon1, weapon2, accessory1, accessory2, accessory3, accessory4\n" +
      "- slots (string[]): optional placement list using the same keys. If provided, item can only be dropped into listed slots\n" +
      "- description (string)\n" +
      "- statBonus (object): keys PHYS|CON|INT|SOC, values numbers\n" +
      "- speedBonus (number)\n" +
      "- acBonus (number)\n" +
      "- magicResistBonus (number)\n" +
      "- sacrificeRewards (array): [{ name, amount?, description? }]\n" +
      "- Any item type (weapon, armor, accessory, consumable) can include statBonus, speedBonus, acBonus, and magicResistBonus\n" +
      "- Weapon-style fields are valid on any inventory item and are used whenever present\n" +
      "\nEQUIP/ATTACK BEHAVIOR (CURRENT BUILD):\n" +
      "- Armor and accessory slots are weapon-capable and act as extra weapon slots\n" +
      "- Weapons equipped in any slot can appear in the Attacks panel\n" +
      "- The Attacks panel de-duplicates by weapon id, so a multi-slot weapon's actions show once\n" +
      "\nSINGLE-ATTACK DAMAGE MODE (no attacks array):\n" +
      "- Legacy fields: die, stat, damageBonus, extraDice, extraDie, extraDamage\n" +
      "- Formula field: weaponFormula (string)\n" +
      "- If weaponFormula is present, it overrides legacy damage fields for damage calc.\n" +
      "- heal (number), healDie (number), healStat (PHYS|CON|INT|SOC) are supported in this mode.\n" +
      "\nMULTI-ATTACK DAMAGE MODE (attacks array present):\n" +
      "- attacks: [{ name, die?, stat?, formula?, damageBonus?, consumesCharge?, description? }]\n" +
      "- Each attack must include either formula OR (die and stat).\n" +
      "- formula takes precedence over die/stat for that attack.\n" +
      "- consumesCharge true spends 1 charge per use.\n" +
      "- description on an attack is optional and displays under that specific attack in the UI.\n" +
      "\nFORMULA/PERMUTATION RULES:\n" +
      "- Supported stat tokens: PHYS, CON, INT, SOC\n" +
      "- Compound stats are valid where stat is used: e.g. \"PHYS+INT\"\n" +
      "- Formula supports +, -, *, /, parentheses, static numbers, and NdM dice tokens\n" +
      "- Valid examples: \"2*PHYS + 4\", \"(PHYS+INT)*2 + 1d4\", \"2d6 + INT\"\n" +
      "\nCHARGE SYSTEM (PER WEAPON INSTANCE):\n" +
      "- maxCharges (number): total pool; large values supported (e.g. 200)\n" +
      "- currentCharges (number): starting pool; defaults to maxCharges if omitted\n" +
      "- maxCharges is normalized to positive integer\n" +
      "- currentCharges is clamped to 0..maxCharges\n" +
      "- Charges restore to maxCharges on long rest\n" +
      "- UI supports direct Cur/Max numeric editing, debounced typing, clamp hints, and +/- nudges\n" +
      "\nIMPORT SAFETY / BEST PRACTICES FOR MODELS:\n" +
      "- Always output uppercase stat keys\n" +
      "- Prefer integer numbers for dice, bonuses, and charges\n" +
      "- Do not include comments or trailing commas in JSON\n" +
      "- When unsure, include both a clear description and explicit numeric fields\n" +
      "- Keep type exactly \"weapon\" so importer routes it correctly\n" +
      "\nSTRICT MINIMAL VALID OUTPUTS (USE WHEN YOU WANT THE SMALLEST SAFE JSON):\n" +
      "- Minimal single-attack legacy:\n" +
      "  {\"name\":\"Short Sword\",\"type\":\"weapon\",\"icon\":\"⚔\",\"die\":6,\"stat\":\"PHYS\"}\n" +
      "- Minimal single-attack formula:\n" +
      "  {\"name\":\"Formula Blade\",\"type\":\"weapon\",\"icon\":\"✦\",\"weaponFormula\":\"1d6 + PHYS\"}\n" +
      "- Minimal multi-attack formula:\n" +
      "  {\"name\":\"Twin Sigil\",\"type\":\"weapon\",\"icon\":\"✧\",\"attacks\":[{\"name\":\"Sigil Strike\",\"formula\":\"1d8 + INT\",\"description\":\"Focused arcane thrust.\"}]}\n" +
      "- Minimal charge-enabled multi-attack:\n" +
      "  {\"name\":\"Charge Wand\",\"type\":\"weapon\",\"icon\":\"⬡\",\"maxCharges\":5,\"attacks\":[{\"name\":\"Bolt\",\"formula\":\"1d6 + INT\",\"consumesCharge\":true}]}\n",
    template: [
      {
        name: "Simple Sword (Formula)",
        type: "weapon",
        slot: "head",
        icon: "⚔",
        weaponFormula: "2*PHYS + 4",
        description: "A formula weapon in single-attack mode equipped in an armor slot (valid in current build).",
      },
      {
        name: "Warden Pike (Legacy Single)",
        type: "weapon",
        slots: ["weapon1", "weapon2"],
        die: 10,
        stat: "PHYS",
        damageBonus: 2,
        extraDice: 1,
        extraDie: 6,
        extraDamage: 3,
        healDie: 4,
        healStat: "CON",
        statBonus: { CON: 1 },
        description: "Legacy mode example with compound stat, extra dice, and healing rider.",
      },
      {
        name: "Spellblade",
        type: "weapon",
        slot: "accessory2",
        icon: "✧",
        maxCharges: 3,
        currentCharges: 3,
        statBonus: { PHYS: 2 },
        acBonus: 2,
        sacrificeRewards: [
          { name: "Gold", amount: 25, description: "Gain 25 gold when this weapon is sacrificed." },
          { name: "Ember Shard", amount: 1, description: "Used in ritual crafting." },
        ],
        attacks: [
          { name: "Slash", die: 8, stat: "PHYS", damageBonus: 0, description: "Reliable melee strike." },
          { name: "Arcane Strike", formula: "1d6 + PHYS + INT + 2", consumesCharge: true, description: "Charged slash infused with arcane force." },
          { name: "Spellburst", die: 10, stat: "INT", damageBonus: 0, consumesCharge: true, description: "High-output ranged burst." },
        ],
        description: "Slash is free. Arcane Strike and Spellburst cost a charge. Grants +2 PHYS and +2 AC while equipped.",
      },
      {
        name: "Battery Cannon (High Charges)",
        type: "weapon",
        slot: "weapon1",
        icon: "⬡",
        maxCharges: 200,
        currentCharges: 150,
        attacks: [
          { name: "Pulse Shot", formula: "2d4 + INT", consumesCharge: true, description: "Standard capacitor discharge." },
          { name: "Overdrive", formula: "3*(INT+PHYS) + 1d8", consumesCharge: true, description: "Burst fire mode that drains extra power." },
          { name: "Buttstroke", die: 6, stat: "PHYS", damageBonus: 1, description: "Fallback melee strike that does not consume charge." },
        ],
        description: "High-capacity charge weapon showing large pools and mixed formula/legacy multi-attacks.",
      },
    ],
  };
  const downloadWeaponTemplate = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(WEAPON_TEMPLATE, null, 2));
    } catch {
      const t = document.createElement("textarea");
      t.value = JSON.stringify(WEAPON_TEMPLATE, null, 2);
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    setAdminOpen(false);
  };

  const downloadItemTemplate = downloadWeaponTemplate;

  const downloadMonsterTemplate = async () => {
    const payload = {
      __instructions: MONSTER_TEMPLATE_INSTRUCTIONS,
      template: MONSTER_TEMPLATE,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      const t = document.createElement("textarea");
      t.value = JSON.stringify(payload, null, 2);
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    setAdminOpen(false);
  };


  const SHARED_CONTENT_TEMPLATE = {
    __instructions: "Fields and semantics for scars / feats / abilities / spells:\n" +
      "- Use a single payload with two sections: abilities and spells.\n" +
      "- abilities accepts Scars, Feats, and Abilities with type (Feat|Scar|Ability).\n" +
      "- spells accepts spell-like entries with isSpell: true and optional spell-specific fields.\n" +
      "- For abilities, support tallyFormula, modifiers, and actions just like the existing ability importer.\n" +
      "- For spells, support damageDie, damageStat, statModifiers, slotCost, slotCostMax, and scaleDamageBySlots.\n" +
      "- A spell can use just damageDie if you want a die-only effect with no extra stat bonus; damageStat is optional.\n" +
      "\nBehavior implemented by the app:\n" +
      "- Spells are stored as ability-like entries with isSpell: true so they can share the same data model.\n" +
      "- If slotCostMax is absent, the spell uses the fixed slotCost. If slotCostMax is present, the player can choose a value between slotCost and slotCostMax.\n" +
      "- Die-only spells still cast normally; when damageStat is absent, the roll is just the damage die result.\n" +
      "\nSTRICT MINIMAL VALID OUTPUTS:\n" +
      "- Minimal shared payload:\n" +
      "  {\"abilities\":[{\"name\":\"Veteran\",\"type\":\"Feat\",\"description\":\"...\"}],\"spells\":[{\"name\":\"Spark\",\"type\":\"Ability\",\"isSpell\":true,\"description\":\"Quick magical strike.\",\"damageDie\":4,\"damageStat\":\"INT\",\"slotCost\":2,\"scaleDamageBySlots\":true}]}\n" +
      "- Die-only example: {\"spells\":[{\"name\":\"Burst\",\"type\":\"Ability\",\"isSpell\":true,\"description\":\"A simple blast.\",\"damageDie\":12,\"slotCost\":2,\"scaleDamageBySlots\":true}]}\n",
    template: {
      abilities: [
        {
          name: "Veteran Instinct",
          type: "Feat",
          description: "A passive edge that sharpens your battlefield awareness.",
        },
        {
          name: "Ability Name",
          type: "Feat",
          description: "Describe what this ability does.",
          tallyFormula: "floor(level/2)",
          modifiers: [{ label: "CON", value: "floor(level/4)" }],
          actions: [
            { name: "Precision Burst", formula: "1d8 + PHYS + INT", consumesTally: true, description: "A focused strike that blends steel and spellwork." },
          ],
        },
      ],
      spells: [
        {
          name: "Spell Name",
          type: "Ability",
          isSpell: true,
          description: "Describe what this spell does.",
          damageDie: 6,
          damageStat: "INT",
          slotCost: 2,
          slotCostMax: 3,
          scaleDamageBySlots: true,
          statModifiers: [{ label: "PHYS", value: "+1" }],
        },
      ],
    },
  };

  const downloadSharedContentTemplate = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(SHARED_CONTENT_TEMPLATE, null, 2));
    } catch {
      const t = document.createElement("textarea");
      t.value = JSON.stringify(SHARED_CONTENT_TEMPLATE, null, 2);
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    setAdminOpen(false);
  };

  const importSharedContentFromText = (text: string) => {
    try {
      const payload = JSON.parse(text);
      const abilityEntries = Array.isArray(payload?.abilities)
        ? payload.abilities
        : Array.isArray(payload)
          ? payload.filter((entry: any) => !entry?.isSpell && !(entry?.damageDie !== undefined || entry?.damageStat !== undefined || entry?.slotCost !== undefined || entry?.slotCostMax !== undefined || entry?.scaleDamageBySlots !== undefined))
          : Array.isArray(payload?.template?.abilities)
            ? payload.template.abilities
            : [payload];
      const spellEntries = Array.isArray(payload?.spells)
        ? payload.spells
        : Array.isArray(payload)
          ? payload.filter((entry: any) => Boolean(entry?.isSpell) || entry?.damageDie !== undefined || entry?.damageStat !== undefined || entry?.slotCost !== undefined || entry?.slotCostMax !== undefined || entry?.scaleDamageBySlots !== undefined)
          : Array.isArray(payload?.template?.spells)
            ? payload.template.spells
            : [];

      const importedAbilities: Ability[] = abilityEntries.map((a: any, i: number) => ({
        id: nextAbilityId + i,
        name: a.name ?? "Unnamed",
        type: (["Feat", "Scar", "Ability"].includes(a.type) ? a.type : "Ability") as AbilityType,
        description: a.description ?? "",
        ...(a.tallyFormula ? { tallyFormula: String(a.tallyFormula), tally: { total: 1, used: 0 } } : a.tally ? { tally: { total: Number(a.tally.total) || 1, used: 0 } } : {}),
        ...(Array.isArray(a.modifiers)
          ? {
              modifiers: a.modifiers
                .filter((mod: unknown): mod is Record<string, unknown> => Boolean(mod && typeof mod === "object"))
                .map((mod: Record<string, unknown>, _index: number): AbilityModifier => {
                  const stat = canonicalStatKey(mod.label);
                  return {
                    label: stat ?? String(mod.label ?? ""),
                    value: String(mod.value ?? "0"),
                  } as AbilityModifier;
                }),
            }
          : {}),
        ...(Array.isArray(a.actions)
          ? {
              actions: a.actions
                .filter((action: unknown): action is Record<string, unknown> => Boolean(action && typeof action === "object"))
                .map((action: Record<string, unknown>) => {
                  const actionStat = normalizeStatExpression(action.stat);
                  return {
                    name: String(action.name ?? "Action"),
                    ...(action.die !== undefined ? { die: Number(action.die) || 0 } : {}),
                    ...(actionStat ? { stat: actionStat } : {}),
                    ...(action.formula !== undefined ? { formula: normalizeFormulaStatTokens(String(action.formula)) } : {}),
                    ...(action.damageBonus !== undefined ? { damageBonus: Number(action.damageBonus) || 0 } : {}),
                    ...(action.consumesTally !== undefined ? { consumesTally: Boolean(action.consumesTally) } : {}),
                    ...(action.description !== undefined ? { description: String(action.description) } : {}),
                  } as AbilityAction;
                }),
            }
          : {}),
      }));
      const importedSpells: Spell[] = spellEntries.map((s: any, i: number) => ({
        id: nextSpellId + i,
        name: s.name ?? "Unnamed Spell",
        type: "Ability" as AbilityType,
        description: s.description ?? "",
        isSpell: true,
        ...(s.damageDie ? { damageDie: Number(s.damageDie) } : {}),
        ...(canonicalStatKey(s.damageStat) ? { damageStat: canonicalStatKey(s.damageStat) as StatKey } : {}),
        ...(Array.isArray(s.statModifiers)
          ? {
              statModifiers: s.statModifiers
                .filter((mod: unknown): mod is Record<string, unknown> => Boolean(mod && typeof mod === "object"))
                .map((mod: Record<string, unknown>, _index: number): AbilityModifier => ({
                  label: canonicalStatKey(mod.label) ?? String(mod.label ?? ""),
                  value: String(mod.value ?? "0"),
                })),
            }
          : {}),
        ...(s.slotCost !== undefined ? { slotCost: Math.max(1, Number(s.slotCost) || 1) } : {}),
        ...(s.slotCostMax !== undefined ? { slotCostMax: Math.max(1, Number(s.slotCostMax) || 1) } : {}),
        ...(s.scaleDamageBySlots !== undefined ? { scaleDamageBySlots: Boolean(s.scaleDamageBySlots) } : {}),
      }));

      setAbilities((prev) => [...prev, ...importedAbilities]);
      setNextAbilityId((n) => n + importedAbilities.length);
      setSpells((prev) => [...prev, ...importedSpells]);
      setNextSpellId((n) => n + importedSpells.length);
      setImportJsonText("");
      setImportJsonOpen(false);
      setImportSpellJsonText("");
      setImportSpellJsonOpen(false);
      setAdminOpen(false);
    } catch {}
  };

  const importAbilitiesFromText = () => importSharedContentFromText(importJsonText);
  const importSpellsFromText = () => importSharedContentFromText(importSpellJsonText);

  const castSpell = (spell: Spell, slotCount: number) => {
    const minCost = Math.max(1, spell.slotCost ?? 1);
    const maxCost = Math.max(
      minCost,
      spell.slotCostMax ?? (spell.scaleDamageBySlots ? wizardSpellSlots : minCost),
    );
    const selectedSlotCount = Math.max(minCost, Math.min(slotCount, Math.min(wizardSpellSlots, maxCost)));

    if (selectedSlotCount > wizardSpellSlots) {
      addLog(`✨ ${spell.name} — not enough spell slots available.`, "info");
      return;
    }

    setWizardSpellSlots((current) => Math.max(0, current - selectedSlotCount));

    if (spell.damageDie !== undefined) {
      const damageRolls = spell.scaleDamageBySlots ? selectedSlotCount : 1;
      let totalRoll = 0;
      for (let i = 0; i < damageRolls; i += 1) totalRoll += rollD(spell.damageDie);
      const statBonus = spell.damageStat ? effectiveStats[spell.damageStat] : 0;
      const damage = totalRoll + statBonus;

      if (spell.damageStat) {
        addLog(`✨ ${spell.name} — ${selectedSlotCount} slot${selectedSlotCount > 1 ? "s" : ""}; ${damageRolls}d${spell.damageDie}(${totalRoll}) + ${spell.damageStat}(${statBonus}) = ${damage} damage dealt`, "info");
      } else {
        addLog(`✨ ${spell.name} — ${selectedSlotCount} slot${selectedSlotCount > 1 ? "s" : ""}; ${damageRolls}d${spell.damageDie}(${totalRoll}) = ${damage} damage dealt`, "info");
      }
    } else {
      addLog(`✨ Cast ${spell.name} using ${selectedSlotCount} slot${selectedSlotCount > 1 ? "s" : ""}`, "info");
    }
  };

  // ─── Derived stats ───────────────────────────────────────────────────────
  const equippedItems = Array.from(
    new Map(
      (Object.values(equipment).filter(Boolean) as InventoryItem[]).map((item) => [item.id, item]),
    ).values(),
  );
  const physAC = equippedItems.reduce((sum, item) => sum + (item.acBonus ?? 0), 0);
  const magicResist = equippedItems.reduce((sum, item) => sum + (item.magicResistBonus ?? 0), 0);
  const ac = physAC; // keep ac alias for attack applyDamage
  const baseSpeed = selectedClass === "Fighter" ? 3 : selectedClass === "Wizard" ? 2 : 0;
  const speed = baseSpeed + equippedItems.reduce((sum, item) => sum + (item.speedBonus ?? 0), 0);
  const initiative = effectiveStats.PHYS;
  const levelNumber = level === "" ? 1 : Number(level);
  const fighterActionCount = selectedClass === "Fighter"
    ? Math.max(1, 1 + Math.floor(levelNumber / 5))
    : selectedClass === "Wizard"
      ? Math.max(1, 1 + Math.floor(levelNumber / 10))
      : 1;
  const secondWindMaxUses = selectedClass === "Fighter" ? 2 + Math.floor(levelNumber / 5) : 2;

  useEffect(() => {
    setActionUsedSlots((prev) => {
      if (prev.length === fighterActionCount) return prev;
      return Array.from({ length: fighterActionCount }, (_, i) => prev[i] ?? false);
    });
  }, [fighterActionCount]);

  useEffect(() => {
    if (selectedClass !== "Fighter") return;
    setSecondWindUses(secondWindMaxUses);
  }, [selectedClass, secondWindMaxUses]);

  // ─── Derived ─────────────────────────────────────────────────────────────
  const hpNum = typeof currentHp === "number" ? currentHp : 0;
  const maxHpNum = typeof maxHp === "number" ? maxHp : 0;
  const hpPercent = maxHpNum > 0 ? Math.round((hpNum / maxHpNum) * 100) : 0;
  const hpColor = hpPercent > 60 ? "#5aaa5a" : hpPercent > 30 ? "#c4853a" : "#c43a3a";

  const logColor: Record<LogEntry["type"], string> = {
    hit: "#e2cfa0", miss: "#9a8a6a", crit: "#f5d060", heal: "#7acc7a", info: "#7ab0cc",
  };

  const statInputStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    color: "#e2cfa0",
    background: "transparent",
    border: "none",
    outline: "none",
    width: "100%",
    textAlign: "center" as const,
    fontSize: 20,
    fontWeight: 700,
  };

  const panelStyle = {
    border: "1px solid rgba(196,133,58,0.2)",
    background: "#0e0c08",
    borderRadius: 6,
    padding: "16px",
  };

  const weaponEntries = [
    ...inventory.filter((item) => usesWeaponLogic(item)),
    ...Array.from(
      new Map(
        Object.values(equipment)
          .filter((item): item is InventoryItem => usesWeaponLogic(item))
          .map((item) => [item.id, item]),
      ).values(),
    ),
  ];

  const inputStyle = {
    background: "#161209",
    border: "1px solid rgba(196,133,58,0.25)",
    borderRadius: 4,
    color: "#e2cfa0",
    fontFamily: "'Crimson Pro', serif",
    outline: "none",
    padding: "8px 12px",
    fontSize: 14,
    width: "100%",
  };

  const selectStyle = {
    ...inputStyle,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
  };

  return (
    <div
      className="min-h-screen w-full"
      onClick={() => setAdminOpen(false)}
      style={{ fontFamily: "'Crimson Pro', Georgia, serif", background: "radial-gradient(ellipse at 30% 10%, #1a1208 0%, #0c0a08 60%)" }}
    >
      <div className="w-full h-1" style={{ background: "linear-gradient(90deg, transparent, #c4853a 30%, #8b1c1c 50%, #c4853a 70%, transparent)" }} />

      <div className="max-w-5xl mx-auto p-4 md:p-6">

        {/* Admin */}
        <div className="relative inline-block mb-4" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setAdminOpen((o) => !o)}
            className="px-3 py-1.5 text-xs transition-all hover:opacity-90"
            style={{
              fontFamily: "'Cinzel', serif",
              color: adminOpen ? "#c4853a" : "#9a8a6a",
              background: adminOpen ? "rgba(196,133,58,0.08)" : "#0e0c08",
              border: `1px solid ${adminOpen ? "rgba(196,133,58,0.4)" : "rgba(196,133,58,0.15)"}`,
              borderRadius: 4,
              cursor: "pointer",
              letterSpacing: "0.08em",
            }}
          >
            Admin
          </button>

          {adminOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-40 flex flex-col"
              style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.3)", borderRadius: 6, minWidth: 220, padding: "8px 0" }}
            >
              <div className="px-4 py-2 mb-1" style={{ borderBottom: "1px solid rgba(196,133,58,0.1)" }}>
                <span className="text-xs uppercase tracking-widest" style={{ color: "#6a5a3a", fontFamily: "'Cinzel', serif" }}>Items</span>
              </div>
              <button
                onClick={() => { setFightMenuOpen(true); setAdminOpen(false); }}
                className="text-left px-4 py-2.5 text-sm hover:opacity-80 transition-opacity"
                style={{ fontFamily: "'Crimson Pro', serif", color: "#e2cfa0", background: "none", border: "none", cursor: "pointer" }}
              >
                Fight Menu
              </button>
              <button
                onClick={() => {
                  const lvl = typeof level === "number" ? level : 1;
                  if (lvl > 1) { setLevel(lvl - 1); setXpDiamonds(0); }
                  setAdminOpen(false);
                }}
                className="text-left px-4 py-2.5 text-sm hover:opacity-80 transition-opacity"
                style={{ fontFamily: "'Crimson Pro', serif", color: "#f5c5c5", background: "none", border: "none", cursor: "pointer" }}
              >
                Revert Level
              </button>
              <div style={{ borderTop: "1px solid rgba(196,133,58,0.1)", margin: "4px 0" }} />
              <button
                onClick={downloadItemTemplate}
                className="text-left px-4 py-2.5 text-sm hover:opacity-80 transition-opacity"
                style={{ fontFamily: "'Crimson Pro', serif", color: "#e2cfa0", background: "none", border: "none", cursor: "pointer" }}
              >
                Copy Item Template
              </button>
              <button
                onClick={downloadMonsterTemplate}
                className="text-left px-4 py-2.5 text-sm hover:opacity-80 transition-opacity"
                style={{ fontFamily: "'Crimson Pro', serif", color: "#e2cfa0", background: "none", border: "none", cursor: "pointer" }}
              >
                Copy Monster Template
              </button>
              <div className="px-4 py-2 mt-1" style={{ borderTop: "1px solid rgba(196,133,58,0.08)" }}>
                <span className="text-xs uppercase tracking-widest" style={{ color: "#6a5a3a", fontFamily: "'Cinzel', serif" }}>Scars, Feats & Spells</span>
              </div>
              <button
                onClick={downloadSharedContentTemplate}
                className="text-left px-4 py-2.5 text-sm hover:opacity-80 transition-opacity"
                style={{ fontFamily: "'Crimson Pro', serif", color: "#e2cfa0", background: "none", border: "none", cursor: "pointer" }}
              >
                Copy Shared Content Template
              </button>
              <button
                onClick={() => { setImportJsonText(""); setImportJsonOpen(true); setAdminOpen(false); }}
                className="text-left px-4 py-2.5 text-sm hover:opacity-80 transition-opacity"
                style={{ fontFamily: "'Crimson Pro', serif", color: "#e2cfa0", background: "none", border: "none", cursor: "pointer" }}
              >
                Paste Shared Content JSON
              </button>
            </div>
          )}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <input
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                placeholder="Character Name"
                className="bg-transparent border-b text-3xl md:text-4xl outline-none"
                style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0", borderColor: "rgba(196,133,58,0.4)", letterSpacing: "0.05em", minWidth: 240 }}
              />
              <div className="flex items-center gap-1.5">
                <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Lv</span>
                <input
                  type="number" min={1} max={20} value={level} placeholder="—"
                  onChange={(e) => { setLevel(e.target.value === "" ? "" : Math.min(20, Math.max(1, Number(e.target.value)))); setXpDiamonds(0); }}
                  className="bg-transparent border-b outline-none text-3xl md:text-4xl"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "#c4853a", borderColor: "rgba(196,133,58,0.4)", width: 56, textAlign: "center", MozAppearance: "textfield", appearance: "none" } as React.CSSProperties}
                />
              </div>
            </div>
            <div>{/* XP diamonds */}
              {(() => {
                const lvl = level === "" ? 0 : Number(level);
                if (lvl === 0 || lvl >= 20) return null;
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: lvl }).map((_, i) => {
                      const filled = i < xpDiamonds;
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            const next = i + 1 === xpDiamonds ? i : i + 1;
                            setXpDiamonds(next);
                            if (next >= lvl && lvl < 20) {
                              setLevel(lvl + 1);
                              setXpDiamonds(0);
                            }
                          }}
                          className="cursor-pointer transition-all hover:scale-110"
                          style={{
                            width: 12, height: 12,
                            transform: "rotate(45deg)",
                            background: filled ? "#c4853a" : "transparent",
                            border: "1.5px solid rgba(196,133,58,0.6)",
                            boxShadow: filled ? "0 0 5px #c4853a88" : "none",
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
          <button
            onClick={() => setLongRestStep("confirm")}
            className="text-xs px-3 py-1.5 hover:opacity-90 transition-opacity"
            style={{ background: "#0e0c18", border: "1px solid rgba(106,90,200,0.35)", borderRadius: 4, color: "#9a8acc", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
          >
            Long Rest
          </button>
        </div>

        {/* Class selector */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {(Object.keys(CLASS_COLORS) as ClassName[]).map((cls) => {
            const color = CLASS_COLORS[cls];
            const active = selectedClass === cls;
            return (
              <button key={cls} onClick={() => setSelectedClass(cls)}
                className="px-5 py-2.5 transition-all hover:opacity-90 active:scale-95"
                style={{ background: active ? `${color}18` : "#0e0c08", border: `1px solid ${active ? color : "rgba(196,133,58,0.15)"}`, borderRadius: 5, cursor: "pointer" }}
              >
                <span className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: active ? color : "#e2cfa0" }}>{cls}</span>
              </button>
            );
          })}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">

          {/* LEFT: Portrait + Stats */}
          <div className="flex flex-col gap-4">

            {/* Portrait */}
            <div className="relative flex flex-col" style={{ border: "1px solid rgba(196,133,58,0.3)", background: "#0e0c08", borderRadius: 6, aspectRatio: "3/4", width: "75%", overflow: "hidden" }}>
              {portrait && (
                <img src={portrait} alt="Character portrait" className="w-full h-full object-cover"
                  style={{ display: portraitValid ? "block" : "none" }}
                  onLoad={() => { setPortraitValid(true); setPortraitError(""); }}
                  onError={() => { setPortraitValid(false); setPortraitError("Image failed to load. Try a direct image URL or upload a local file."); }}
                />
              )}
              {!portraitValid && (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: "#3a3020" }}>
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="22" r="12" fill="currentColor" opacity="0.6" />
                    <path d="M8 56 C8 42 20 36 32 36 C44 36 56 42 56 56" fill="currentColor" opacity="0.6" />
                    <rect x="24" y="52" width="16" height="3" rx="1.5" fill="currentColor" opacity="0.4" />
                  </svg>
                  <span className="text-xs" style={{ color: "#4a3a28", fontFamily: "'Cinzel', serif" }}>Paste an image URL below</span>
                </div>
              )}
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l" style={{ borderColor: "#c4853a" }} />
              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r" style={{ borderColor: "#c4853a" }} />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l" style={{ borderColor: "#c4853a" }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r" style={{ borderColor: "#c4853a" }} />
              {portraitValid && (
                <button onClick={clearPortrait} className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full hover:opacity-100 transition-opacity"
                  style={{ background: "rgba(10,8,6,0.8)", border: "1px solid rgba(196,133,58,0.5)", color: "#c4853a", cursor: "pointer", fontSize: 15, lineHeight: 1, opacity: 0.75, zIndex: 10 }}>×</button>
              )}
              {!portraitValid && (
                <div className="absolute bottom-0 left-0 right-0" style={{ background: "rgba(10,8,6,0.85)", borderTop: "1px solid rgba(196,133,58,0.2)" }}>
                  <input value={portraitInput}
                    onChange={(e) => { setPortraitInput(e.target.value); setPortrait(e.target.value.trim()); setPortraitValid(false); setPortraitError(""); }}
                    placeholder="Image URL…" className="w-full px-2 py-1.5 text-xs outline-none bg-transparent"
                    style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}
                  />
                  <div className="px-2 pb-2 flex items-center justify-between gap-2">
                    <label className="text-[10px] cursor-pointer" style={{ color: "#c4853a", fontFamily: "'Cinzel', serif" }}>
                      Upload image
                      <input type="file" accept="image/*" onChange={handlePortraitFile} style={{ display: "none" }} />
                    </label>
                    {portraitError && (
                      <span className="text-[10px] text-right" style={{ color: "#c43a3a", fontFamily: "'Crimson Pro', serif" }}>
                        {portraitError}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Ability Scores */}
            <div style={{ border: `1px solid ${availablePoints > 0 ? "rgba(196,133,58,0.6)" : "rgba(196,133,58,0.2)"}`, background: "#0e0c08", borderRadius: 6, padding: "12px", transition: "border-color 0.3s" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Ability Scores</span>
                {availablePoints > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.15)", border: "1px solid rgba(196,133,58,0.5)", color: "#c4853a", fontFamily: "'Cinzel', serif", animation: "pulse 1.5s ease-in-out infinite" }}>
                    {availablePoints} pt{availablePoints !== 1 ? "s" : ""} available
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {STAT_LABELS.map((stat) => {
                  const canSpend = availablePoints > 0;
                  const canRefund = statBonuses[stat] > 0;
                  return (
                    <div key={stat} className="flex flex-col items-center py-2 px-1 cursor-pointer"
                      onClick={() => setStatPopup(statPopup === stat ? null : stat)}
                      style={{ border: `1px solid ${statPopup === stat ? STAT_COLORS[stat] : canSpend ? "rgba(196,133,58,0.3)" : "rgba(196,133,58,0.15)"}`, borderRadius: 4, background: statPopup === stat ? `${STAT_COLORS[stat]}10` : "#111008", transition: "all 0.15s" }}>
                      <span className="text-xs font-semibold tracking-widest mb-1" style={{ fontFamily: "'Cinzel', serif", color: STAT_COLORS[stat] }}>{stat}</span>
                      <span className="text-xl font-bold leading-none my-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#e2cfa0" }}>{effectiveStats[stat]}</span>
                      <div className="flex items-center gap-1 mt-1">
                        <button onClick={() => refundPoint(stat)} disabled={!canRefund} className="w-5 h-5 flex items-center justify-center rounded"
                          style={{ background: canRefund ? "rgba(139,28,28,0.4)" : "rgba(255,255,255,0.04)", border: `1px solid ${canRefund ? "rgba(139,28,28,0.6)" : "rgba(255,255,255,0.06)"}`, color: canRefund ? "#f5c5c5" : "#3a3028", fontSize: 14, lineHeight: 1, cursor: canRefund ? "pointer" : "default" }}>−</button>
                        <button onClick={() => spendPoint(stat)} disabled={!canSpend} className="w-5 h-5 flex items-center justify-center rounded"
                          style={{ background: canSpend ? "rgba(196,133,58,0.2)" : "rgba(255,255,255,0.04)", border: `1px solid ${canSpend ? "rgba(196,133,58,0.5)" : "rgba(255,255,255,0.06)"}`, color: canSpend ? "#c4853a" : "#3a3028", fontSize: 14, lineHeight: 1, cursor: canSpend ? "pointer" : "default" }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {statPopup && STAT_DESCRIPTIONS[statPopup as StatKey] && (
                <div className="mt-3 px-3 py-2 rounded" style={{ background: `${STAT_COLORS[statPopup as StatKey]}12`, border: `1px solid ${STAT_COLORS[statPopup as StatKey]}40` }}>
                  <p className="text-xs leading-relaxed" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif", fontSize: 13 }}>
                    {STAT_DESCRIPTIONS[statPopup as StatKey]}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      rollAbilityCheck(statPopup as StatKey);
                    }}
                    className="mt-2 px-2 py-1 text-[11px] uppercase tracking-widest transition-all"
                    style={{ background: "rgba(196,133,58,0.15)", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
                  >
                    Roll
                  </button>
                </div>
              )}
            </div>

            {/* Secondary stats */}
            <div style={{ border: "1px solid rgba(196,133,58,0.2)", background: "#0e0c08", borderRadius: 6, padding: "12px" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Stats</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  {
                    key: "physAC",
                    icon: <Shield size={15} style={{ color: "#c4853a" }} />,
                    val: physAC,
                  },
                  {
                    key: "magicResist",
                    icon: (
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                        <circle cx="7.5" cy="7.5" r="6.5" stroke="#9a8acc" strokeWidth="1.5"/>
                        <circle cx="7.5" cy="7.5" r="2" fill="#9a8acc"/>
                      </svg>
                    ),
                    val: magicResist,
                  },
                  { key: "Initiative", icon: <Zap size={13} style={{ color: "#9a8a6a" }} />, val: initiative },
                  { key: "Speed",      icon: <Footprints size={14} style={{ color: "#9a8a6a" }} />, val: speed },
                ] as { key: string; icon: React.ReactNode; val: number }[]).map(({ key, icon, val }) => {
                  const active = statPopup === key;
                  return (
                    <div key={key}
                      className="flex flex-col items-center py-2 px-1 cursor-pointer transition-all"
                      onClick={() => setStatPopup((active ? null : key) as any)}
                      style={{ border: `1px solid ${active ? "rgba(196,133,58,0.5)" : "rgba(196,133,58,0.15)"}`, borderRadius: 4, background: active ? "rgba(196,133,58,0.06)" : "#0e0c08" }}
                    >
                      <div className="mb-1 flex items-center justify-center" style={{ height: 18 }}>{icon}</div>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#c4853a", fontSize: 15, fontWeight: 700 }}>{val}</span>
                    </div>
                  );
                })}
              </div>
              {statPopup && SECONDARY_DESCRIPTIONS[statPopup] && (
                <div className="mt-3 px-3 py-2 rounded" style={{ background: "rgba(196,133,58,0.06)", border: "1px solid rgba(196,133,58,0.25)" }}>
                  <p className="text-xs leading-relaxed" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif", fontSize: 13 }}>
                    {SECONDARY_DESCRIPTIONS[statPopup]}
                  </p>
                  {statPopup === "Initiative" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        rollInitiative();
                      }}
                      className="mt-2 px-2 py-1 text-[11px] uppercase tracking-widest transition-all"
                      style={{ background: "rgba(196,133,58,0.15)", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
                    >
                      Roll
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: HP + Attacks + Log */}
          <div className="flex flex-col gap-4">

            {/* HP */}
            <div style={panelStyle}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                  <Heart size={12} style={{ color: "#c43a3a" }} /> Hit Points
                </span>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={currentHp === "" ? "" : currentHp} placeholder="—"
                    onChange={(e) => setCurrentHp(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "#e2cfa0", fontSize: 22, fontWeight: 700, background: "transparent", border: "none", outline: "none", width: 60, textAlign: "right" }} />
                  <span style={{ color: "#9a8a6a" }}>/</span>
                  <input type="number" min={0} value={maxHp === "" ? "" : maxHp} placeholder="—"
                    onChange={(e) => setMaxHp(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "#9a8a6a", fontSize: 16, background: "transparent", border: "none", outline: "none", width: 50 }} />
                </div>
              </div>
              <div className="relative h-5 w-full rounded-sm overflow-hidden mb-4" style={{ background: "#1a1510" }}>
                <div className="h-full transition-all duration-300" style={{ width: `${hpPercent}%`, background: maxHpNum > 0 ? `linear-gradient(90deg, ${hpColor}aa, ${hpColor})` : "transparent", boxShadow: maxHpNum > 0 ? `0 0 8px ${hpColor}66` : "none" }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#e2cfa0cc" }}>{maxHpNum > 0 ? `${hpPercent}%` : ""}</span>
                </div>
              </div>
              {/* Damage type selector */}
              <div className="flex gap-1 mb-3">
                {(["physical", "magic", "true"] as const).map((t) => (
                  <button key={t} onClick={() => setDamageType(t)}
                    className="flex-1 py-1 text-xs capitalize transition-all"
                    style={{
                      background: damageType === t ? (t === "physical" ? "rgba(196,133,58,0.2)" : t === "magic" ? "rgba(106,90,200,0.2)" : "rgba(122,176,204,0.2)") : "#111008",
                      border: `1px solid ${damageType === t ? (t === "physical" ? "#c4853a" : t === "magic" ? "#6a5ae0" : "#7ab0cc") : "rgba(196,133,58,0.15)"}`,
                      borderRadius: 4, color: damageType === t ? (t === "physical" ? "#c4853a" : t === "magic" ? "#9a8acc" : "#7ab0cc") : "#9a8a6a",
                      fontFamily: "'Cinzel', serif", cursor: "pointer",
                    }}>{t}</button>
                ))}
              </div>

              {/* Modifier toggles for current damage type */}
              {damageType !== "true" && (
                <div className="text-xs italic mb-3" style={{ color: "#6a5a3a", fontFamily: "'Crimson Pro', serif" }}>
                  Defenses will reduce {damageType} damage automatically.
                </div>
              )}

              {/* Damage / Heal inputs */}
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <input
                    type="number" min={0} value={damageInput} placeholder="Enter damage"
                    onChange={(e) => setDamageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || !damageInput) return;
                      applyIncomingDamage(Math.abs(Number(damageInput)), damageType);
                      setDamageInput("");
                    }}
                    className="w-full px-3 py-2 text-sm outline-none"
                    style={{ background: "rgba(139,28,28,0.15)", border: "1px solid rgba(139,28,28,0.4)", borderRadius: 4, color: "#f5c5c5", fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <input
                    type="number" min={0} value={healInput} placeholder="Enter healing"
                    onChange={(e) => setHealInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || !healInput) return;
                      adjustHp(Math.abs(Number(healInput)));
                      setHealInput("");
                    }}
                    className="w-full px-3 py-2 text-sm outline-none"
                    style={{ background: "rgba(90,170,90,0.1)", border: "1px solid rgba(90,170,90,0.35)", borderRadius: 4, color: "#7acc7a", fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </div>
              </div>
            </div>

            {/* Attacks + Class Abilities + Combat Tracker row */}
            <div className="flex gap-4 items-start">
            <div className="flex flex-col gap-4 flex-1 min-w-0">

            {/* Attacks */}
            <div style={panelStyle}>
              <div className="text-xs uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                <Sword size={12} style={{ color: "#c4853a" }} /> Attacks and Equipment Abilities
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={doBasicAttack} className="group relative w-full py-4 px-6 text-left transition-all hover:opacity-90 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #1a1208, #241a0c)", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 5, cursor: "pointer" }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>Basic Attack</div>
                    <ActionCostBadge cost="action" />
                  </div>
                  <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>d{attackDie} + PHYS ({effectiveStats.PHYS})</div>
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "#c4853a" }} />
                </button>

                {abilities.filter(isPassiveAbility).map((ability) => (
                  <div
                    key={`passive-${ability.id}`}
                    className="w-full py-3 px-4"
                    style={{ background: "linear-gradient(135deg, #101008, #17130a)", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 5 }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{ability.name}</div>
                      <span
                        className="text-[10px] uppercase tracking-[0.2em]"
                        style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}
                      >
                        Passive
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                      {ability.description || "Passive ability."}
                    </div>
                  </div>
                ))}

                {Array.from(
                  new Map(
                    (Object.values(equipment) as (InventoryItem | null)[])
                      .filter((wpn): wpn is InventoryItem => Boolean(wpn && wpn.type === "weapon"))
                      .map((wpn) => [wpn.id, wpn]),
                  ).values(),
                ).map((wpn, i) => {
                  if (!wpn || wpn.type !== "weapon") return null;
                  const normalizedWeapon = normalizeWeaponCharges(wpn);
                  const hasAttackProfile = hasWeaponAttackProfile(normalizedWeapon);
                  const maxCharges = normalizedWeapon.maxCharges;
                  const charges = normalizedWeapon.currentCharges ?? maxCharges ?? 0;

                  if (!hasAttackProfile) {
                    return (
                      <div key={i} style={{ background: "linear-gradient(135deg, #101008, #17130a)", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 5, padding: "10px 14px" }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{normalizedWeapon.name}</div>
                          <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Passive</span>
                        </div>
                        <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                          {normalizedWeapon.description || "Equipped passive gear effect."}
                        </div>
                        <div className="text-[10px] mt-1" style={{ color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                          {[normalizedWeapon.speedBonus ? `Speed +${normalizedWeapon.speedBonus}` : "", normalizedWeapon.acBonus ? `AC +${normalizedWeapon.acBonus}` : "", normalizedWeapon.magicResistBonus ? `MR +${normalizedWeapon.magicResistBonus}` : ""].filter(Boolean).join(" • ")}
                        </div>
                      </div>
                    );
                  }

                  if (normalizedWeapon.attacks && normalizedWeapon.attacks.length > 0) {
                    return (
                      <div key={i} style={{ background: "linear-gradient(135deg, #14100a, #1e1608)", border: "1px solid rgba(196,133,58,0.3)", borderRadius: 5, padding: "10px 14px" }}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{normalizedWeapon.name}</div>
                          {maxCharges ? (
                            <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#c4853a" }}>{charges}/{maxCharges}</span>
                          ) : null}
                        </div>
                        {maxCharges ? (
                          <div className="mb-2">
                            {maxCharges <= 24 ? (
                              <div className="flex gap-1 mb-2">
                                {Array.from({ length: maxCharges }).map((_, j) => (
                                  <div key={j}
                                    onClick={() => nudgeItemCharges(normalizedWeapon.id, j < charges ? -1 : 1)}
                                    className="cursor-pointer transition-all hover:opacity-80"
                                    style={{ width: 10, height: 10, borderRadius: "50%", background: j < charges ? "#c4853a" : "#2a2016", border: "1px solid rgba(196,133,58,0.4)" }} />
                                ))}
                              </div>
                            ) : null}
                            <div className="flex items-center gap-2 mb-2">
                              <label className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                                Cur
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={maxCharges}
                                value={getChargeInputValue(normalizedWeapon.id, "cur", charges)}
                                onChange={(e) => {
                                  queueChargeInputApply(normalizedWeapon.id, "cur", e.target.value, charges, maxCharges);
                                }}
                                className="w-16 px-1.5 py-0.5 text-[10px] outline-none"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}
                              />
                              <span className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                                Max {maxCharges}
                              </span>
                            </div>
                            <div className="text-[10px] mb-2" style={{ color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                              Cur range: 0-{maxCharges}
                            </div>
                            {chargeInputHints[String(normalizedWeapon.id)] ? (
                              <div className="text-[10px] mb-2" style={{ color: "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}>
                                {chargeInputHints[String(normalizedWeapon.id)]}
                              </div>
                            ) : null}
                            {maxCharges > 20 ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => nudgeItemCharges(normalizedWeapon.id, -10)}
                                  className="px-2 py-0.5 text-[10px]"
                                  style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
                                >
                                  -10
                                </button>
                                <button
                                  onClick={() => nudgeItemCharges(normalizedWeapon.id, -1)}
                                  className="px-2 py-0.5 text-[10px]"
                                  style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
                                >
                                  -1
                                </button>
                                <button
                                  onClick={() => nudgeItemCharges(normalizedWeapon.id, 1)}
                                  className="px-2 py-0.5 text-[10px]"
                                  style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() => nudgeItemCharges(normalizedWeapon.id, 10)}
                                  className="px-2 py-0.5 text-[10px]"
                                  style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
                                >
                                  +10
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => nudgeItemCharges(normalizedWeapon.id, -1)}
                                  className="px-2 py-0.5 text-[10px]"
                                  style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
                                >
                                  -1
                                </button>
                                <button
                                  onClick={() => nudgeItemCharges(normalizedWeapon.id, 1)}
                                  className="px-2 py-0.5 text-[10px]"
                                  style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
                                >
                                  +1
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mb-2">
                            <button
                              onClick={() => enableItemCharges(normalizedWeapon.id)}
                              className="px-2 py-0.5 text-[10px]"
                              style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}
                            >
                              Enable charges
                            </button>
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          {normalizedWeapon.attacks.map((atk, atkIdx) => {
                            const sv = atk.stat ? resolveStatValue(atk.stat) : 0;
                            const attackPreview = atk.formula
                              ? atk.formula
                              : `d${atk.die ?? "?"} + ${atk.stat ?? "?"}${atk.damageBonus ? ` +${atk.damageBonus}` : ""}`;
                            const noCharges = atk.consumesCharge && maxCharges && charges <= 0;
                            return (
                              <button key={atkIdx} onClick={() => doWeaponAttack(normalizedWeapon, atkIdx)} disabled={!!noCharges}
                                className="w-full py-2 px-3 text-left transition-all hover:opacity-90 active:scale-95"
                                style={{ background: noCharges ? "#111008" : "rgba(196,133,58,0.1)", border: `1px solid ${noCharges ? "rgba(196,133,58,0.1)" : "rgba(196,133,58,0.35)"}`, borderRadius: 4, cursor: noCharges ? "default" : "pointer", opacity: noCharges ? 0.45 : 1 }}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>
                                    {atk.name}{atk.consumesCharge ? " ⚡" : ""}
                                  </span>
                                  <ActionCostBadge cost="action" />
                                </div>
                                <div className="text-[10px] mt-0.5" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                                  {atk.formula
                                    ? attackPreview
                                    : `d${atk.die ?? "?"} + ${atk.stat ?? "?"}(${sv})${atk.damageBonus ? ` +${atk.damageBonus}` : ""}`}
                                </div>
                                {atk.description ? (
                                  <div className="text-xs leading-snug mt-1" style={{ color: "#8a7a5a", fontFamily: "'Crimson Pro', serif" }}>
                                    {atk.description}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={i} className="group relative w-full py-4 px-6 text-left"
                      style={{ background: "linear-gradient(135deg, #14100a, #1e1608)", border: "1px solid rgba(196,133,58,0.3)", borderRadius: 5 }}>
                      <button onClick={() => doWeaponAttack(normalizedWeapon)} className="w-full text-left transition-all hover:opacity-90 active:scale-95"
                        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{normalizedWeapon.name}</div>
                          <ActionCostBadge cost="action" />
                        </div>
                        <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                          {normalizedWeapon.weaponFormula
                            ? normalizedWeapon.weaponFormula
                            : `d${normalizedWeapon.die} + ${normalizedWeapon.stat} (${resolveStatValue(normalizedWeapon.stat ?? "")})`
                          }
                          {!normalizedWeapon.weaponFormula && normalizedWeapon.extraDice && normalizedWeapon.extraDie ? ` + ${normalizedWeapon.extraDice}d${normalizedWeapon.extraDie}` : null}
                          {!normalizedWeapon.weaponFormula && normalizedWeapon.extraDamage ? ` + ${normalizedWeapon.extraDamage} dmg` : null}
                          {normalizedWeapon.heal ? ` • heals ${normalizedWeapon.heal}` : null}
                          {normalizedWeapon.healDie ? ` • heals d${normalizedWeapon.healDie}${normalizedWeapon.healStat ? ` + ${normalizedWeapon.healStat}` : ""}` : null}
                        </div>
                      </button>
                      {maxCharges ? (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px]" style={{ color: "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}>{charges}/{maxCharges}</span>
                            <label className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                              Cur
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={maxCharges}
                              value={getChargeInputValue(normalizedWeapon.id, "cur", charges)}
                              onChange={(e) => {
                                queueChargeInputApply(normalizedWeapon.id, "cur", e.target.value, charges, maxCharges);
                              }}
                              className="w-16 px-1.5 py-0.5 text-[10px] outline-none"
                              style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}
                            />
                            <span className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                              Max {maxCharges}
                            </span>
                          </div>
                          <div className="text-[10px] mb-2" style={{ color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                            Cur range: 0-{maxCharges}
                          </div>
                          {chargeInputHints[String(normalizedWeapon.id)] ? (
                            <div className="text-[10px] mb-2" style={{ color: "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}>
                              {chargeInputHints[String(normalizedWeapon.id)]}
                            </div>
                          ) : null}
                          {maxCharges > 20 ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => nudgeItemCharges(normalizedWeapon.id, -10)} className="px-2 py-0.5 text-[10px]"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                                -10
                              </button>
                              <button onClick={() => nudgeItemCharges(normalizedWeapon.id, -1)} className="px-2 py-0.5 text-[10px]"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                                -1
                              </button>
                              <button onClick={() => nudgeItemCharges(normalizedWeapon.id, 1)} className="px-2 py-0.5 text-[10px]"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                                +1
                              </button>
                              <button onClick={() => nudgeItemCharges(normalizedWeapon.id, 10)} className="px-2 py-0.5 text-[10px]"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                                +10
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button onClick={() => nudgeItemCharges(normalizedWeapon.id, -1)} className="px-2 py-0.5 text-[10px]"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                                -1
                              </button>
                              <button onClick={() => nudgeItemCharges(normalizedWeapon.id, 1)} className="px-2 py-0.5 text-[10px]"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                                +1
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2">
                          <button onClick={() => enableItemCharges(normalizedWeapon.id)} className="px-2 py-0.5 text-[10px]"
                            style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                            Enable charges
                          </button>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "#c4853a" }} />
                    </div>
                  );
                })}

              </div>
            </div>

            {/* Class Abilities */}
            <div style={panelStyle}>
              <div className="mb-3">
                <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Class Abilities</span>
              </div>

              {selectedClass === "Fighter" ? (
                <div className="flex flex-col gap-2">
                  <div style={{ background: "#111008", border: "1px solid rgba(196,133,58,0.18)", borderRadius: 5, padding: "10px 12px" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>Second Wind</span>
                      <div className="flex gap-1">
                        {Array.from({ length: secondWindMaxUses }).map((_, i) => (
                          <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < secondWindUses ? "#c4853a" : "#2a2016", border: "1px solid rgba(196,133,58,0.3)" }} />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs mb-2" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                      Heal PHYS ({effectiveStats.PHYS} HP). {secondWindMaxUses} uses per long rest.
                    </p>
                    <button
                      onClick={useSecondWind}
                      disabled={secondWindUses === 0}
                      className="w-full py-1.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                      style={{
                        background: secondWindUses > 0 ? "rgba(196,133,58,0.15)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${secondWindUses > 0 ? "rgba(196,133,58,0.4)" : "rgba(255,255,255,0.06)"}`,
                        borderRadius: 4,
                        color: secondWindUses > 0 ? "#c4853a" : "#3a3020",
                        fontFamily: "'Cinzel', serif",
                        cursor: secondWindUses > 0 ? "pointer" : "default",
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Use ({secondWindUses} left)</span>
                        <ActionCostBadge cost="bonus" />
                      </div>
                    </button>
                  </div>
                </div>
              ) : selectedClass === "Wizard" ? null : selectedClass ? (
                <p className="text-xs italic" style={{ color: "#3a3020", fontFamily: "'Crimson Pro', serif" }}>
                  Abilities for {selectedClass} coming soon.
                </p>
              ) : (
                <p className="text-xs italic" style={{ color: "#3a3020", fontFamily: "'Crimson Pro', serif" }}>
                  Select a class to see abilities.
                </p>
              )}
            </div>

            {selectedClass === "Wizard" && (
              <div style={panelStyle}>
                <div className="mb-3">
                  <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Spells & Cantrips</span>
                </div>
                <div style={{ background: "#111008", border: "1px solid rgba(106,154,224,0.2)", borderRadius: 5, padding: "10px 12px" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>Spell Slots</span>
                    <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#6a9ae0" }}>{wizardSpellSlots}/{Math.max(1, (level === "" ? 1 : Number(level)) + 1)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {Array.from({ length: Math.max(1, (level === "" ? 1 : Number(level)) + 1) }).map((_, i) => (
                      <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < wizardSpellSlots ? "#6a9ae0" : "#1a1a2a", border: "1px solid rgba(106,154,224,0.3)" }} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setWizardSpellSlots((u) => Math.max(0, u - 1))} disabled={wizardSpellSlots === 0}
                      className="flex-1 py-1.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                      style={{ background: wizardSpellSlots > 0 ? "rgba(106,154,224,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${wizardSpellSlots > 0 ? "rgba(106,154,224,0.4)" : "rgba(255,255,255,0.06)"}`, borderRadius: 4, color: wizardSpellSlots > 0 ? "#6a9ae0" : "#3a3020", fontFamily: "'Cinzel', serif", cursor: wizardSpellSlots > 0 ? "pointer" : "default" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span>Use Spell Slot ({wizardSpellSlots} left)</span>
                        <ActionCostBadge cost="action" />
                      </div>
                    </button>
                    <button onClick={() => setWizardSpellSlots((u) => Math.min(Math.max(1, (level === "" ? 1 : Number(level)) + 1), u + 1))} disabled={wizardSpellSlots >= Math.max(1, (level === "" ? 1 : Number(level)) + 1)}
                      className="px-2 py-1.5 text-[10px] font-semibold transition-all hover:opacity-90 active:scale-95"
                      style={{ background: "rgba(106,154,224,0.12)", border: "1px solid rgba(106,154,224,0.4)", borderRadius: 4, color: "#6a9ae0", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                      Add Slot
                    </button>
                  </div>
                </div>
                <div className="mt-3" style={{ background: "#111008", border: "1px solid rgba(106,154,224,0.2)", borderRadius: 5, padding: "10px 12px" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>Cantrips</span>
                    <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "#6a9ae0", fontFamily: "'Cinzel', serif" }}>Unlimited</span>
                  </div>
                  <div className="w-full">
                    <button onClick={usePrestidigitation}
                      className="w-full py-1.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                      style={{ background: "rgba(106,154,224,0.12)", border: "1px solid rgba(106,154,224,0.4)", borderRadius: 4, color: "#6a9ae0", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span>Prestidigitation</span>
                        <ActionCostBadge cost="action" />
                      </div>
                    </button>
                    <p className="mt-1 text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                      A harmless magical flourish that creates minor sensory effects and utility magic.
                    </p>
                  </div>
                  <div className="mt-2 w-full">
                    <button onClick={useBasicOffensiveMagic}
                      className="w-full py-1.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                      style={{ background: "rgba(106,154,224,0.12)", border: "1px solid rgba(106,154,224,0.4)", borderRadius: 4, color: "#6a9ae0", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span>Basic Offensive Magic</span>
                        <ActionCostBadge cost="action" />
                      </div>
                    </button>
                    <p className="mt-1 text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                      Launch a simple spell bolt for d4 + INT damage.
                    </p>
                  </div>
                </div>
                <div className="mt-3" style={{ background: "#111008", border: "1px solid rgba(106,154,224,0.2)", borderRadius: 5, padding: "10px 12px" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>Spells</span>
                    <button
                      onClick={() => { setImportJsonText(""); setImportJsonOpen(true); }}
                      className="px-2 py-0.5 text-[8px] uppercase tracking-widest transition-all hover:opacity-90"
                      style={{ background: "rgba(106,154,224,0.12)", border: "1px solid rgba(106,154,224,0.3)", borderRadius: 3, color: "#6a9ae0", fontFamily: "'Cinzel', serif", cursor: "pointer", fontSize: 9 }}
                    >
                      + Import
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {spells.length === 0 && (
                      <p className="text-[10px] italic" style={{ color: "#3a3020", fontFamily: "'Crimson Pro', serif" }}>No spells yet.</p>
                    )}
                    {spells.map((spell) => {
                      const minSlotCost = Math.max(1, spell.slotCost ?? 1);
                      const maxSelectableSlotCost = Math.max(
                        minSlotCost,
                        Math.min(
                          wizardSpellSlots,
                          spell.slotCostMax ?? (spell.scaleDamageBySlots ? wizardSpellSlots : minSlotCost),
                        ),
                      );
                      const selectedSpellSlot = Math.max(
                        minSlotCost,
                        Math.min(spellSlotSelections[spell.id] ?? minSlotCost, maxSelectableSlotCost),
                      );
                      const canChooseSlots = maxSelectableSlotCost > minSlotCost;

                      return (<div key={spell.id} style={{ background: "rgba(106,154,224,0.08)", border: "1px solid rgba(106,154,224,0.2)", borderRadius: 4, padding: "8px 10px", overflow: "hidden" }}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1">
                            <div className="text-xs font-semibold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{spell.name}</div>
                            <p className="mt-0.5 text-[10px] leading-snug" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                              {spell.description}
                            </p>
                          </div>
                          <button onClick={() => setSpells((prev) => prev.filter((s) => s.id !== spell.id))}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#3a2020", padding: 0, lineHeight: 1, flexShrink: 0 }}>
                            <X size={10} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px]" style={{ color: "#6a9ae0", fontFamily: "'Cinzel', serif" }}>Slots</span>
                            {canChooseSlots ? (
                              <select
                                value={selectedSpellSlot}
                                onChange={(e) => setSpellSlotSelections((prev) => ({ ...prev, [spell.id]: Number(e.target.value) }))}
                                className="text-[9px] px-1.5 py-0.5 rounded"
                                style={{ background: "rgba(106,154,224,0.08)", border: "1px solid rgba(106,154,224,0.2)", color: "#e2cfa0", fontFamily: "'JetBrains Mono', monospace" }}
                              >
                                {Array.from({ length: maxSelectableSlotCost - minSlotCost + 1 }, (_, index) => {
                                  const value = minSlotCost + index;
                                  return <option key={value} value={value}>{value}</option>;
                                })}
                              </select>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(106,154,224,0.06)", border: "1px solid rgba(106,154,224,0.2)", color: "#e2cfa0", fontFamily: "'JetBrains Mono', monospace" }}>
                                {minSlotCost}
                              </span>
                            )}
                          </div>
                          {spell.damageDie !== undefined && (
                            <button
                              onClick={() => castSpell(spell, selectedSpellSlot)}
                              className="text-[10px] px-2 py-0.5 rounded transition-all hover:opacity-90 active:scale-95 font-semibold"
                              style={{ background: "rgba(106,154,224,0.2)", border: "1px solid rgba(106,154,224,0.4)", color: "#6a9ae0", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
                            >
                              Cast ({spell.damageStat ? `${spell.damageStat}d${spell.damageDie}` : `d${spell.damageDie}`})
                            </button>
                          )}
                          {spell.statModifiers && spell.statModifiers.length > 0 && (
                            <>
                              {spell.statModifiers.map((mod, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(106,154,224,0.06)", border: "1px solid rgba(106,154,224,0.2)", color: "#6a9ae0", fontFamily: "'JetBrains Mono', monospace" }}>
                                  {mod.value} {mod.label}
                                </span>
                              ))}
                            </>
                          )}
                        </div>
                      </div>);
                    })}
                  </div>
                </div>
              </div>
            )}

            </div>{/* end left sub-column */}

            {/* Combat Tracker */}
            <div style={{ ...panelStyle, width: 110, flexShrink: 0 }}>
              <div className="flex flex-col items-center gap-2 mb-5">
                <span className="text-xs" style={{ color: "#6aaa6a", fontFamily: "'Cinzel', serif" }}>Actions</span>
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: fighterActionCount }).map((_, index) => (
                    <div
                      key={index}
                      onClick={() => setActionUsedSlots((prev) => prev.map((used, i) => (i === index ? !used : used)))}
                      className="cursor-pointer transition-all hover:opacity-80"
                      style={{
                        width: 36, height: 36,
                        borderRadius: 4,
                        background: actionUsedSlots[index] ? "#6aaa6a" : "transparent",
                        border: "2px solid #6aaa6a",
                        boxShadow: actionUsedSlots[index] ? "0 0 10px #6aaa6a55" : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Bonus action — orange triangle */}
              <div className="flex flex-col items-center gap-1.5 mb-6">
                <span className="text-xs" style={{ color: "#c4853a", fontFamily: "'Cinzel', serif" }}>Bonus</span>
                <svg width="38" height="34" viewBox="0 0 38 34" className="cursor-pointer hover:opacity-80 transition-all" onClick={() => setBonusActionUsed((v) => !v)}>
                  <polygon
                    points="19,2 36,32 2,32"
                    fill={bonusActionUsed ? "#c4853a" : "transparent"}
                    stroke="#c4853a"
                    strokeWidth="2"
                    style={{ filter: bonusActionUsed ? "drop-shadow(0 0 5px #c4853a88)" : "none" }}
                  />
                </svg>
              </div>

              <button
                onClick={() => { setActionUsedSlots(Array.from({ length: fighterActionCount }, () => false)); setBonusActionUsed(false); }}
                className="w-full py-1.5 text-xs hover:opacity-80 transition-opacity"
                style={{ background: "rgba(196,133,58,0.08)", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
              >
                New Turn
              </button>
            </div>

            </div>{/* end row */}

            {/* Combat Log */}
            <div style={{ ...panelStyle, background: "#0a0906", flex: 1 }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                  <Scroll size={12} style={{ color: "#c4853a" }} /> Dice Log
                </span>
                <button onClick={() => { setLog([{ id: nextId, text: "Combat begins. Roll for initiative!", type: "info" }]); setNextId((n) => n + 1); }}
                  className="text-xs hover:opacity-70 transition-opacity" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer", background: "none", border: "none" }}>Clear</button>
              </div>
              <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 220, scrollbarWidth: "thin", scrollbarColor: "rgba(196,133,58,0.2) transparent" }}>
                {log.map((entry) => (
                  <div key={entry.id} className="flex gap-2 text-sm leading-snug py-1 border-b" style={{ borderColor: "rgba(196,133,58,0.06)" }}>
                    <span className="shrink-0 select-none" style={{ color: "rgba(196,133,58,0.4)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, paddingTop: 2 }}>{String(entry.id).padStart(2, "0")}</span>
                    <span style={{ color: logColor[entry.type], fontFamily: "'Crimson Pro', serif", fontSize: 14 }}>{entry.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Journal */}
            <div style={{ ...panelStyle, background: "#0a0906" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                  <Scroll size={12} style={{ color: "#c4853a" }} /> Entry {currentJournalIndex + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={goToPreviousJournalEntry}
                    disabled={currentJournalIndex === 0}
                    className="px-2 py-1 text-xs transition-opacity"
                    style={{
                      color: currentJournalIndex === 0 ? "#4a3a22" : "#9a8a6a",
                      fontFamily: "'Cinzel', serif",
                      cursor: currentJournalIndex === 0 ? "default" : "pointer",
                      background: "none",
                      border: "1px solid rgba(196,133,58,0.2)",
                      borderRadius: 4,
                    }}
                  >
                    ←
                  </button>
                  <button
                    onClick={goToNextJournalEntry}
                    className="px-2 py-1 text-xs transition-opacity hover:opacity-80"
                    style={{
                      color: "#9a8a6a",
                      fontFamily: "'Cinzel', serif",
                      cursor: "pointer",
                      background: "none",
                      border: "1px solid rgba(196,133,58,0.2)",
                      borderRadius: 4,
                    }}
                  >
                    →
                  </button>
                </div>
              </div>
              <textarea
                value={journalEntries[currentJournalIndex]?.text ?? ""}
                onChange={(e) => updateCurrentJournalEntry(e.target.value)}
                placeholder="Write your journal entry..."
                rows={6}
                style={{ ...inputStyle, minHeight: 140, resize: "vertical" as const }}
              />
            </div>
          </div>
        </div>

        {/* ── INVENTORY ────────────────────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-4">
          <div style={panelStyle}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                <Package size={12} style={{ color: "#c4853a" }} /> Inventory
              </div>
              <div className="flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M6 4.5 C6 3 7 2 9 2 C11 2 12 3 12 4.5 C12 5.5 11.2 6.2 10 6.5 L10 7 L8 7 L8 6.5 C6.8 6.2 6 5.5 6 4.5Z" fill="#c4853a" opacity="0.7"/>
                  <ellipse cx="9" cy="7.5" rx="1.5" ry="0.5" fill="#c4853a" opacity="0.5"/>
                  <path d="M4 11 C4 8.5 6 7 9 7 C12 7 14 8.5 14 11 C14 14 12 16 9 16 C6 16 4 14 4 11Z" fill="#c4853a" opacity="0.85"/>
                  <ellipse cx="9" cy="11.5" rx="2" ry="1" fill="#e2cfa0" opacity="0.25"/>
                </svg>
                <span className="text-xs uppercase tracking-widest" style={{ color: "#c4853a", fontFamily: "'Cinzel', serif" }}>Gold</span>
                <button onClick={() => setGold((g) => Math.max(0, g - 1))} className="w-5 h-5 flex items-center justify-center rounded transition-opacity hover:opacity-80"
                  style={{ background: "rgba(196,133,58,0.12)", border: "1px solid rgba(196,133,58,0.25)", color: "#c4853a", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>−</button>
                <input
                  type="number" min={0} value={gold}
                  onChange={(e) => setGold(Math.max(0, Number(e.target.value) || 0))}
                  className="text-center outline-none"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "#e2cfa0", fontSize: 15, fontWeight: 700, background: "transparent", border: "none", width: 52 }}
                />
                <button onClick={() => setGold((g) => g + 1)} className="w-5 h-5 flex items-center justify-center rounded transition-opacity hover:opacity-80"
                  style={{ background: "rgba(196,133,58,0.12)", border: "1px solid rgba(196,133,58,0.25)", color: "#c4853a", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>+</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
              {/* Equipment slots */}
              <div className="flex flex-col gap-2">
                <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Equipped</div>
                {EQUIP_SLOTS.map(({ key, label }) => {
                  const item = equipment[key];
                  const isOver = dragOverSlot === key;
                  return (
                    <div key={key}
                      onDragOver={(e) => { e.preventDefault(); setDragOverSlot(key); }}
                      onDragLeave={() => setDragOverSlot(null)}
                      onDrop={() => onSlotDrop(key)}
                      style={{
                        border: `1px ${isOver ? "solid" : "dashed"} ${isOver ? "#c4853a" : "rgba(196,133,58,0.2)"}`,
                        borderRadius: 5,
                        background: isOver ? "rgba(196,133,58,0.06)" : "#0e0c08",
                        minHeight: 40,
                        transition: "all 0.15s",
                      }}
                    >
                      {item ? (
                        <div
                          draggable
                          onDragStart={() => onSlotDragStart(key)}
                          className="flex items-center justify-between px-3 py-2 cursor-grab"
                          style={{ borderRadius: 4 }}
                          onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span style={{ fontSize: 13, color: TYPE_COLORS[item.type] }}>{getItemIcon(item)}</span>
                            <div className="min-w-0">
                              <div className="text-sm truncate" style={{ color: "#e2cfa0", fontFamily: "'Crimson Pro', serif" }}>{item.name}</div>
                              <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>{label}</div>
                            </div>
                          </div>
                          <button onClick={() => unequipToBack(key)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6a3a3a", padding: 0, flexShrink: 0 }}>
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center px-3 py-2 gap-2">
                          <span className="text-xs" style={{ color: "#3a3020", fontFamily: "'Cinzel', serif" }}>{label}</span>
                          <span className="text-xs" style={{ color: "#2a2016", fontFamily: "'Cinzel', serif" }}>— drop here</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bag */}
              <div onDragOver={(e) => e.preventDefault()} onDrop={onBagDrop}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Bag</span>
                  <button
                    onClick={() => setLoadItemOpen(true)}
                    className="flex items-center gap-1 px-3 py-1 text-xs transition-all hover:opacity-90"
                    style={{ background: "rgba(196,133,58,0.1)", border: "1px solid rgba(196,133,58,0.3)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
                  >
                    <Plus size={10} /> Paste JSON
                  </button>
                </div>

                <div className="flex flex-wrap gap-2" style={{ minHeight: 80 }}>
                  {inventory.map((item) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => onItemDragStart(item)}
                      onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      className="flex flex-col items-center justify-between cursor-grab select-none transition-all hover:opacity-90"
                      style={{
                        width: 76, height: 76,
                        background: selectedItem?.id === item.id ? "rgba(196,133,58,0.12)" : "#111008",
                        border: `1px solid ${selectedItem?.id === item.id ? "rgba(196,133,58,0.5)" : "rgba(196,133,58,0.15)"}`,
                        borderRadius: 6,
                        padding: "8px 4px 4px",
                        position: "relative",
                      }}
                    >
                      <span style={{ fontSize: 22, lineHeight: 1, color: TYPE_COLORS[item.type] }}>{getItemIcon(item)}</span>
                      <span className="text-center leading-tight w-full truncate px-1" style={{ fontSize: 10, color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>{item.name}</span>
                    </div>
                  ))}
                  {inventory.length === 0 && (
                    <span className="text-xs" style={{ color: "#3a3020", fontFamily: "'Cinzel', serif" }}>Empty — drag equipped items here or load new items</span>
                  )}
                </div>

                {/* Item detail card */}
                {selectedItem && (
                  <div className="mt-3 p-4 relative" style={{ background: "#111008", border: "1px solid rgba(196,133,58,0.25)", borderRadius: 6 }}>
                    <button onClick={() => setSelectedItem(null)} className="absolute top-2 right-2" style={{ background: "none", border: "none", cursor: "pointer", color: "#6a5a3a" }}>
                      <X size={12} />
                    </button>
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: 18, color: TYPE_COLORS[selectedItem.type] }}>{getItemIcon(selectedItem)}</span>
                      <div>
                        <div className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{selectedItem.name}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs capitalize" style={{ color: TYPE_COLORS[selectedItem.type], fontFamily: "'Cinzel', serif" }}>{selectedItem.type}</span>
                          {selectedItem.slot && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.12)", border: "1px solid rgba(196,133,58,0.25)", color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                              {EQUIP_SLOTS.find(s => s.key === selectedItem.slot)?.label ?? selectedItem.slot}
                            </span>
                          )}
                          {selectedItem.slots && selectedItem.slots.map((slotKey) => (
                            <span key={slotKey} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.12)", border: "1px solid rgba(196,133,58,0.25)", color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                              {EQUIP_SLOTS.find(s => s.key === slotKey)?.label ?? slotKey}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 mb-2">
                      {usesWeaponLogic(selectedItem) && selectedItem.weaponFormula && (
                        <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>Formula: {selectedItem.weaponFormula}</span>
                      )}
                      {usesWeaponLogic(selectedItem) && selectedItem.die && selectedItem.stat && !selectedItem.weaponFormula && (
                        <>
                          <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>Damage: d{selectedItem.die}</span>
                          <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>Stat: {selectedItem.stat} ({resolveStatValue(selectedItem.stat)})</span>
                          {selectedItem.damageBonus !== undefined && selectedItem.damageBonus > 0 && (
                            <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>Bonus: +{selectedItem.damageBonus}</span>
                          )}
                        </>
                      )}
                      {selectedItem.acBonus !== undefined && selectedItem.acBonus > 0 && (
                        <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>Phys AC: +{selectedItem.acBonus}</span>
                      )}
                      {selectedItem.magicResistBonus !== undefined && selectedItem.magicResistBonus > 0 && (
                        <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>Magic Res: +{selectedItem.magicResistBonus}</span>
                      )}
                      {selectedItem.statBonus && Object.entries(selectedItem.statBonus).map(([s, v]) => (
                        <span key={s} className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>{s}: +{v}</span>
                      ))}
                      {selectedItem.speedBonus !== undefined && selectedItem.speedBonus > 0 && (
                        <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>Speed: +{selectedItem.speedBonus}</span>
                      )}
                    </div>
                    {selectedItem.description && (
                      <p className="text-sm italic mb-2" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>{selectedItem.description}</p>
                    )}
                    {selectedItem.sacrificeRewards && selectedItem.sacrificeRewards.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "#c4853a", fontFamily: "'Cinzel', serif" }}>
                          Sacrifice Rewards
                        </div>
                        <div className="flex flex-col gap-1">
                          {selectedItem.sacrificeRewards.map((reward, index) => (
                            <div
                              key={`${selectedItem.id}-reward-${index}`}
                              className="px-2 py-1 rounded"
                              style={{ background: "rgba(196,133,58,0.06)", border: "1px solid rgba(196,133,58,0.15)" }}
                            >
                              <div className="text-xs" style={{ color: "#e2cfa0", fontFamily: "'Cinzel', serif" }}>
                                {reward.name}{reward.amount !== undefined ? `: ${reward.amount}` : ""}
                              </div>
                              {reward.description && (
                                <div className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                                  {reward.description}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <button onClick={() => removeFromBag(selectedItem.id)}
                      className="text-xs hover:opacity-80 transition-opacity"
                      style={{ color: "#8b1c1c", fontFamily: "'Cinzel', serif", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      Remove from bag
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ ...panelStyle, alignSelf: "start" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                Scars & Feats
              </span>
              <button
                onClick={() => { setImportJsonText(""); setImportJsonOpen(true); }}
                className="px-2.5 py-1 text-[10px] uppercase tracking-widest transition-all hover:opacity-90"
                style={{ background: "rgba(196,133,58,0.12)", border: "1px solid rgba(196,133,58,0.3)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
              >
                Paste JSON
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {abilities.filter((ability) => ability.type === "Feat" || ability.type === "Scar" || ability.type === "Ability").length === 0 && (
                <p className="text-xs italic" style={{ color: "#3a3020", fontFamily: "'Crimson Pro', serif" }}>None yet.</p>
              )}
              {abilities
                .filter((ability) => ability.type === "Feat" || ability.type === "Scar" || ability.type === "Ability")
                .map((ability) => (
                  <div key={ability.id} style={{ background: "#111008", border: `1px solid ${ABILITY_TYPE_COLORS[ability.type]}22`, borderRadius: 5, overflow: "hidden" }}>
                    <div className="flex items-center justify-between px-3 pt-3 pb-1">
                      <span className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{ability.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${ABILITY_TYPE_COLORS[ability.type]}22`, color: ABILITY_TYPE_COLORS[ability.type], fontFamily: "'Cinzel', serif", border: `1px solid ${ABILITY_TYPE_COLORS[ability.type]}44`, fontSize: 10 }}>
                          {ability.type}
                        </span>
                        <button onClick={() => setAbilities((prev) => prev.filter((a) => a.id !== ability.id))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#3a2020", padding: 0, lineHeight: 1 }}>
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                    <p className="px-3 pb-2 text-xs leading-relaxed" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif", fontSize: 13 }}>
                      {ability.description}
                    </p>
                    {!isPassiveAbility(ability) && (ability.tally || ability.tallyFormula) && (() => {
                      const tallyTotal = ability.tallyFormula
                        ? Math.max(1, evaluateFormula(ability.tallyFormula, levelNumber, effectiveStats))
                        : (ability.tally?.total ?? 1);
                      const tallyUsed = ability.tally?.used ?? 0;
                      return (
                        <div className="flex flex-col gap-1 px-3 pb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {Array.from({ length: tallyTotal }).map((_, i) => {
                              const checked = i < tallyUsed;
                              return (
                                <div key={i}
                                  onClick={() => setAbilities((prev) => prev.map((a) => {
                                    if (a.id !== ability.id) return a;
                                    const computedTotal = a.tallyFormula
                                      ? Math.max(1, evaluateFormula(a.tallyFormula, levelNumber, effectiveStats))
                                      : (a.tally?.total ?? 1);
                                    const newUsed = i + 1 === (a.tally?.used ?? 0) ? i : i + 1;
                                    return { ...a, tally: { total: computedTotal, used: Math.min(newUsed, computedTotal) } };
                                  }))}
                                  className="cursor-pointer transition-all hover:opacity-80"
                                  style={{ width: 14, height: 14, borderRadius: 2, background: checked ? ABILITY_TYPE_COLORS[ability.type] : "transparent", border: `1.5px solid ${ABILITY_TYPE_COLORS[ability.type]}88`, boxShadow: checked ? `0 0 4px ${ABILITY_TYPE_COLORS[ability.type]}66` : "none" }}
                                />
                              );
                            })}
                            <span className="text-xs ml-1" style={{ color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                              {tallyUsed}/{tallyTotal}
                            </span>
                          </div>
                          {ability.tallyFormula && (
                            <span className="text-[10px] italic" style={{ color: "#3a2e18", fontFamily: "'JetBrains Mono', monospace" }}>
                              charges: {ability.tallyFormula}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {!isPassiveAbility(ability) && ability.modifiers && ability.modifiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 px-3 pb-3">
                        {ability.modifiers.map((mod, i) => {
                          const rawVal = mod.value.trim().replace(/^\+/, "");
                          const isNum = Number.isFinite(Number(rawVal));
                          const lvl = level === "" ? 1 : Number(level);
                          const computed = isNum ? Number(rawVal) : evaluateFormula(rawVal, lvl, stats);
                          const display = (computed >= 0 ? "+" : "") + computed + " " + mod.label;
                          return (
                            <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.06)", border: "1px solid rgba(196,133,58,0.15)", color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                              {display}{!isNum ? ` (${mod.value})` : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {!isPassiveAbility(ability) && ability.actions && ability.actions.length > 0 && (
                      <div className="px-3 pb-3">
                        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#c4853a", fontFamily: "'Cinzel', serif" }}>
                          Actions
                        </div>
                        <div className="flex flex-col gap-1">
                          {ability.actions.map((action, actionIdx) => {
                            const abilityTotal = ability.tallyFormula
                              ? Math.max(1, evaluateFormula(ability.tallyFormula, levelNumber, effectiveStats))
                              : (ability.tally?.total ?? 1);
                            const abilityUsed = ability.tally?.used ?? 0;
                            const abilityRemaining = Math.max(0, abilityTotal - abilityUsed);
                            const disabled = !!action.consumesTally && abilityRemaining <= 0;
                            const preview = action.formula
                              ? action.formula
                              : `d${action.die ?? "?"} + ${action.stat ?? "?"}${action.damageBonus ? ` + ${action.damageBonus}` : ""}`;

                            return (
                              <button
                                key={`${ability.id}-action-${actionIdx}`}
                                onClick={() => doAbilityAction(ability, actionIdx)}
                                disabled={disabled}
                                className="w-full px-2 py-1 text-left transition-all hover:opacity-90"
                                style={{
                                  background: disabled ? "rgba(255,255,255,0.03)" : "rgba(196,133,58,0.08)",
                                  border: `1px solid ${disabled ? "rgba(255,255,255,0.08)" : "rgba(196,133,58,0.25)"}`,
                                  borderRadius: 4,
                                  color: disabled ? "#5a5040" : "#e2cfa0",
                                  cursor: disabled ? "default" : "pointer",
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold" style={{ fontFamily: "'Cinzel', serif" }}>
                                    {action.name}{action.consumesTally ? " ♦" : ""}
                                  </span>
                                  {action.consumesTally ? (
                                    <span className="text-[10px]" style={{ color: disabled ? "#6a5a3a" : "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}>
                                      {abilityRemaining}/{abilityTotal}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                                  {preview}
                                </div>
                                {action.description ? (
                                  <div className="text-xs leading-snug mt-1" style={{ color: "#8a7a5a", fontFamily: "'Crimson Pro', serif" }}>
                                    {action.description}
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>



            <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(196,133,58,0.12)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                  Items
                </span>
                <button
                  onClick={() => setLoadItemOpen(true)}
                  className="px-2.5 py-1 text-[10px] uppercase tracking-widest transition-all hover:opacity-90"
                  style={{ background: "rgba(196,133,58,0.12)", border: "1px solid rgba(196,133,58,0.3)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
                >
                  Paste Item JSON
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {weaponEntries.length === 0 && (
                  <p className="text-xs italic" style={{ color: "#3a3020", fontFamily: "'Crimson Pro', serif" }}>No items yet.</p>
                )}
                {weaponEntries.map((weapon) => {
                  const normalizedWeapon = normalizeWeaponCharges(weapon);
                  const isEquipped = Object.values(equipment).some((eqItem) => eqItem?.id === normalizedWeapon.id);
                  const maxCharges = normalizedWeapon.maxCharges;
                  const charges = normalizedWeapon.currentCharges ?? maxCharges ?? 0;
                  return (
                    <div key={normalizedWeapon.id} style={{ background: "#111008", border: "1px solid rgba(196,133,58,0.18)", borderRadius: 5, overflow: "hidden" }}>
                      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                        <span className="text-sm font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{normalizedWeapon.name}</span>
                        <div className="flex items-center gap-2">
                          {isEquipped && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(106,170,106,0.12)", border: "1px solid rgba(106,170,106,0.25)", color: "#6aaa6a", fontFamily: "'Cinzel', serif" }}>
                              Equipped
                            </span>
                          )}
                          <button
                            onClick={() => {
                              if (isEquipped) {
                                const equippedSlot = findFirstEquippedSlot(normalizedWeapon.id);
                                if (equippedSlot) unequipToBack(equippedSlot);
                              } else {
                                removeFromBag(normalizedWeapon.id);
                              }
                            }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#3a2020", padding: 0, lineHeight: 1 }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="px-3 pb-2 text-xs leading-relaxed" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif", fontSize: 12 }}>
                        {normalizedWeapon.description ? normalizedWeapon.description : "No description."}
                      </div>
                      <div className="flex flex-wrap gap-1 px-3 pb-3">
                        {normalizedWeapon.attacks && normalizedWeapon.attacks.length > 0 ? (
                          normalizedWeapon.attacks.map((atk, j) => (
                            <div key={j} className="px-2 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.06)", border: "1px solid rgba(196,133,58,0.15)", color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                              <span className="text-[10px]" style={{ color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                                {atk.name}: {atk.formula ? atk.formula : `d${atk.die ?? "?"}+${atk.stat ?? "?"}`}{atk.consumesCharge ? " ⚡" : ""}
                              </span>
                              {atk.description ? (
                                <div className="text-xs leading-snug mt-0.5" style={{ color: "#8a7a5a", fontFamily: "'Crimson Pro', serif" }}>
                                  {atk.description}
                                </div>
                              ) : null}
                            </div>
                          ))
                        ) : normalizedWeapon.weaponFormula ? (
                          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.06)", border: "1px solid rgba(196,133,58,0.15)", color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                            {normalizedWeapon.weaponFormula}
                          </span>
                        ) : normalizedWeapon.die && normalizedWeapon.stat ? (
                          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.06)", border: "1px solid rgba(196,133,58,0.15)", color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                            d{normalizedWeapon.die} + {normalizedWeapon.stat}
                          </span>
                        ) : null}
                        {maxCharges ? (
                          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.06)", border: "1px solid rgba(196,133,58,0.15)", color: "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}>
                            {charges}/{maxCharges} charges
                          </span>
                        ) : null}
                        {normalizedWeapon.acBonus !== undefined && normalizedWeapon.acBonus > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "rgba(196,133,58,0.06)", border: "1px solid rgba(196,133,58,0.15)", color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                            AC +{normalizedWeapon.acBonus}
                          </span>
                        )}
                      </div>
                      {maxCharges ? (
                        <div className="px-3 pb-3">
                          <div className="flex items-center gap-2 mb-2">
                            <label className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                              Cur
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={maxCharges}
                              value={getChargeInputValue(normalizedWeapon.id, "cur", charges)}
                              onChange={(e) => {
                                queueChargeInputApply(normalizedWeapon.id, "cur", e.target.value, charges, maxCharges);
                              }}
                              className="w-16 px-1.5 py-0.5 text-[10px] outline-none"
                              style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}
                            />
                            <span className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>
                              Max {maxCharges}
                            </span>
                          </div>
                          <div className="text-[10px] mb-2" style={{ color: "#6a5a3a", fontFamily: "'JetBrains Mono', monospace" }}>
                            Cur range: 0-{maxCharges}
                          </div>
                          {chargeInputHints[String(normalizedWeapon.id)] ? (
                            <div className="text-[10px] mb-2" style={{ color: "#c4853a", fontFamily: "'JetBrains Mono', monospace" }}>
                              {chargeInputHints[String(normalizedWeapon.id)]}
                            </div>
                          ) : null}
                          <div className="flex items-center gap-1">
                            {maxCharges > 20 ? (
                              <button onClick={() => nudgeItemCharges(normalizedWeapon.id, -10)} className="px-2 py-0.5 text-[10px]"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                                -10
                              </button>
                            ) : null}
                            <button onClick={() => nudgeItemCharges(normalizedWeapon.id, -1)} className="px-2 py-0.5 text-[10px]"
                              style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                              -1
                            </button>
                            <button onClick={() => nudgeItemCharges(normalizedWeapon.id, 1)} className="px-2 py-0.5 text-[10px]"
                              style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                              +1
                            </button>
                            {maxCharges > 20 ? (
                              <button onClick={() => nudgeItemCharges(normalizedWeapon.id, 10)} className="px-2 py-0.5 text-[10px]"
                                style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                                +10
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="px-3 pb-3">
                          <button onClick={() => enableItemCharges(normalizedWeapon.id)} className="px-2 py-0.5 text-[10px]"
                            style={{ background: "#171208", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer" }}>
                            Enable charges
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      {/* Save / Load */}
      <div className="flex justify-end gap-2 mt-4 px-4 md:px-6 pb-6">
        <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleCharacterFile} />
        <button onClick={openCharacterFilePicker} className="flex items-center gap-2 px-4 py-2 text-sm transition-all hover:opacity-90 active:scale-95"
          style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.25)", borderRadius: 5, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
          Load Character
        </button>
        <button onClick={saveCharacter} className="flex items-center gap-2 px-4 py-2 text-sm transition-all hover:opacity-90 active:scale-95"
          style={{ background: "linear-gradient(135deg, #1a1208, #241a0c)", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 5, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
          Save Character
        </button>
      </div>

      {/* ── FIGHT MENU MODAL ──────────────────────────────────────────────── */}
      {fightMenuOpen && (
        <div className="fixed inset-0 z-50 flex" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="m-auto w-full max-w-5xl flex flex-col" style={{ background: "#0c0a08", border: "1px solid rgba(196,133,58,0.3)", borderRadius: 8, maxHeight: "90vh", overflow: "hidden" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(196,133,58,0.15)" }}>
              <span className="text-lg font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#c4853a", letterSpacing: "0.08em" }}>Fight Menu</span>
              <button onClick={() => setFightMenuOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9a8a6a" }}><X size={16} /></button>
            </div>

            <div className="flex flex-1 overflow-hidden">

              {/* Roster */}
              <div className="flex flex-col w-52 shrink-0 overflow-y-auto" style={{ borderRight: "1px solid rgba(196,133,58,0.1)", padding: "16px 12px" }}>
                <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Players</div>
                <div className="text-xs italic mb-4" style={{ color: "#3a3020", fontFamily: "'Crimson Pro', serif" }}>No players configured</div>

                <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Monsters</div>
                <div className="flex flex-col gap-1.5">
                  {BASE_MONSTER_REGISTRY.map((m) => (
                    <div
                      key={m.id}
                      draggable
                      onDragStart={() => startFightDrag(m.id, "roster")}
                      className="flex items-center justify-between px-3 py-2 cursor-grab hover:opacity-80 transition-opacity"
                      style={{ background: "#111008", border: "1px solid rgba(196,133,58,0.15)", borderRadius: 4 }}
                    >
                      <div>
                        <div className="text-sm" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{m.name}</div>
                        <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>CR {m.cr} · HP {m.hp}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Allies column */}
              <div className="flex flex-col flex-1 overflow-y-auto" style={{ borderRight: "1px solid rgba(196,133,58,0.1)", padding: "16px 12px" }}
                onDragOver={(e) => e.preventDefault()} onDrop={() => dropOnFightColumn("allies")}>
                <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Allies</div>
                {fightAllies.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "#3a3020", fontFamily: "'Cinzel', serif", border: "1px dashed rgba(196,133,58,0.1)", borderRadius: 6, minHeight: 80 }}>Drop here</div>
                )}
                <div className="flex flex-col gap-1.5">
                  {fightAllies.map((m) => (
                    <div key={m.id} draggable onDragStart={() => startFightDrag(m.id, "allies")}
                      className="flex items-center justify-between px-3 py-2 cursor-grab"
                      style={{ background: "#111a10", border: "1px solid rgba(106,170,106,0.25)", borderRadius: 4 }}>
                      <div>
                        <div className="text-sm" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{m.name}</div>
                        <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>HP {m.hp} · AC {m.ac}</div>
                      </div>
                      <button onClick={() => removeFromFightColumn(m.id, "allies")} style={{ background: "none", border: "none", cursor: "pointer", color: "#6a3a3a" }}><X size={11} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Combatants column */}
              <div className="flex flex-col flex-1 overflow-y-auto" style={{ padding: "16px 12px" }}
                onDragOver={(e) => e.preventDefault()} onDrop={() => dropOnFightColumn("combatants")}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Combatants</div>
                  {fightCombatants.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: `${diff.color}18`, border: `1px solid ${diff.color}55`, color: diff.color, fontFamily: "'Cinzel', serif" }}>
                      {diff.label}
                    </span>
                  )}
                </div>
                {fightCombatants.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-xs" style={{ color: "#3a3020", fontFamily: "'Cinzel', serif", border: "1px dashed rgba(196,133,58,0.1)", borderRadius: 6, minHeight: 80 }}>Drop enemies here</div>
                )}
                <div className="flex flex-col gap-1.5">
                  {fightCombatants.map((m) => {
                    const pw = monsterPower(m);
                    return (
                      <div key={m.id} draggable onDragStart={() => startFightDrag(m.id, "combatants")}
                        className="flex items-center justify-between px-3 py-2 cursor-grab"
                        style={{ background: "#1a1008", border: "1px solid rgba(139,28,28,0.3)", borderRadius: 4 }}>
                        <div>
                          <div className="text-sm" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{m.name}</div>
                          <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>HP {m.hp} · AC {m.ac} · Power {pw}</div>
                        </div>
                        <button onClick={() => removeFromFightColumn(m.id, "combatants")} style={{ background: "none", border: "none", cursor: "pointer", color: "#6a3a3a" }}><X size={11} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: "1px solid rgba(196,133,58,0.15)" }}>
              <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                {fightCombatants.length} {fightCombatants.length !== 1 ? "enemies" : "enemy"} · {fightAllies.length} all{fightAllies.length !== 1 ? "ies" : "y"}
                {fightCombatants.length > 0 && ` · Total power ${combatTotalPower}`}
              </span>
              <button
                onClick={startCombat}
                disabled={fightCombatants.length === 0}
                className="px-6 py-2 text-sm font-bold transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: fightCombatants.length > 0 ? "linear-gradient(135deg, #1a1208, #241a0c)" : "#111008",
                  border: `1px solid ${fightCombatants.length > 0 ? "rgba(196,133,58,0.5)" : "rgba(196,133,58,0.1)"}`,
                  borderRadius: 5, color: fightCombatants.length > 0 ? "#c4853a" : "#3a3020",
                  fontFamily: "'Cinzel', serif", cursor: fightCombatants.length > 0 ? "pointer" : "default",
                }}
              >
                Start Combat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INITIATIVE PHASE ──────────────────────────────────────────────── */}
      {initiativePhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.9)", fontFamily: "'Crimson Pro', serif" }}>
          <div className="flex flex-col" style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.35)", borderRadius: 8, width: 440, maxHeight: "85vh", overflow: "hidden" }}>
            <div className="px-6 py-4" style={{ borderBottom: "1px solid rgba(196,133,58,0.15)" }}>
              <div className="text-lg font-bold mb-1" style={{ fontFamily: "'Cinzel', serif", color: "#c4853a", letterSpacing: "0.06em" }}>Roll Initiative</div>
              <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>Monsters have rolled. Enter player initiatives before combat begins.</div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-2" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(196,133,58,0.2) transparent" }}>
              {/* Monsters — read-only initiative */}
              {combatMonsters.map((cm) => (
                <div
                  key={cm.uid}
                  className="flex items-center justify-between px-3 py-2"
                  style={{
                    background: cm.side === "enemy" ? "#1a1008" : "#101a12",
                    border: cm.side === "enemy" ? "1px solid rgba(139,28,28,0.3)" : "1px solid rgba(90,170,90,0.3)",
                    borderRadius: 5,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: cm.side === "enemy" ? "rgba(139,28,28,0.3)" : "rgba(90,170,90,0.25)",
                        color: cm.side === "enemy" ? "#f5c5c5" : "#b6efb6",
                        fontFamily: "'Cinzel', serif",
                        fontSize: 10,
                      }}
                    >
                      {cm.side === "enemy" ? "Enemy" : "Ally"}
                    </span>
                    <span className="text-sm" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{cm.def.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>d20+PHYS</span>
                    <span className="text-base font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#c4853a", minWidth: 28, textAlign: "right" }}>{cm.initiative}</span>
                    <button onClick={() => setCombatMonsters((prev) => prev.map((m) => m.uid === cm.uid ? { ...m, initiative: rollD(20) + m.def.stats.PHYS } : m))}
                      className="text-xs px-2 py-0.5 hover:opacity-80" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif", background: "rgba(196,133,58,0.08)", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 3, cursor: "pointer" }}>↺</button>
                  </div>
                </div>
              ))}

              {/* Players — editable initiative */}
              {combatPlayers.map((cp) => (
                <div key={cp.uid} className="flex items-center justify-between px-3 py-2" style={{ background: "#0e1018", border: "1px solid rgba(106,154,224,0.25)", borderRadius: 5 }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(106,154,224,0.2)", color: "#6a9ae0", fontFamily: "'Cinzel', serif", fontSize: 10 }}>Player</span>
                    <input value={cp.name} onChange={(e) => setCombatPlayers((p) => p.map((x) => x.uid === cp.uid ? { ...x, name: e.target.value } : x))}
                      className="bg-transparent outline-none text-sm" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0", border: "none", width: 120 }} />
                  </div>
                  <input type="number" value={cp.initiative || ""} placeholder="—"
                    onChange={(e) => setCombatPlayers((p) => p.map((x) => x.uid === cp.uid ? { ...x, initiative: Number(e.target.value) || 0 } : x))}
                    className="text-center outline-none text-base font-bold"
                    style={{ width: 48, background: "rgba(196,133,58,0.08)", border: "1px solid rgba(196,133,58,0.25)", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", color: "#c4853a", padding: "2px 4px" }} />
                </div>
              ))}

              <button onClick={() => setCombatPlayers((p) => [...p, { uid: `cp${Date.now()}`, name: `Player ${p.length + 1}`, currentHp: 0, maxHp: 0, initiative: 0 }])}
                className="text-xs text-left hover:opacity-80 mt-1" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif", background: "none", border: "none", cursor: "pointer" }}>+ Add player</button>
            </div>

            <div className="px-6 py-4 flex justify-between items-center" style={{ borderTop: "1px solid rgba(196,133,58,0.15)" }}>
              <button onClick={() => setInitiativePhase(false)} className="text-xs hover:opacity-80"
                style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
              <button onClick={beginCombat} className="px-6 py-2 text-sm font-bold hover:opacity-90 active:scale-95"
                style={{ background: "linear-gradient(135deg, #1a0808, #260c0c)", border: "1px solid rgba(139,28,28,0.6)", borderRadius: 5, color: "#f5c5c5", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                ⚔ Begin Combat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMBAT VIEW ───────────────────────────────────────────────────── */}
      {combatActive && (() => {
        const allEntries = [
          ...combatMonsters.map((m) => ({ kind: "monster" as const, uid: m.uid, name: m.def.name, initiative: m.initiative, side: m.side, data: m })),
          ...combatPlayers.map((p) => ({ kind: "player" as const, uid: p.uid, name: p.name, initiative: p.initiative, data: p })),
        ].sort((a, b) => b.initiative - a.initiative);

        const total = allEntries.length;
        const safeTurn = total > 0 ? ((turnIndex % total) + total) % total : 0;
        const activeName = total > 0 ? allEntries[safeTurn].name : "";

        const nextTurn = () => {
          if (total === 0) return;
          const next = (safeTurn + 1) % total;
          if (next === 0) {
            setRound((r) => r + 1);
            logCombat(`— Round ${round + 1} begins —`);
          }
          setTurnIndex(next);
          logCombat(`${allEntries[next].name}'s turn`);
          if (allEntries[next].kind === "monster") {
            triggerMonsterTurnStart(allEntries[next].uid);
          }
        };

        const prevTurn = () => {
          const prev = (safeTurn - 1 + total) % total;
          setTurnIndex(prev);
        };

        return (
          <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0806", fontFamily: "'Crimson Pro', serif" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ background: "#0e0c08", borderBottom: "1px solid rgba(196,133,58,0.2)" }}>
              <div className="flex items-center gap-3">
                <span className="text-base font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#c43a3a", letterSpacing: "0.08em" }}>⚔ Round {round}</span>
                <div className="flex items-center gap-1">
                  <button onClick={prevTurn} className="px-2 py-1 text-xs hover:opacity-80"
                    style={{ background: "rgba(196,133,58,0.08)", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>‹ Prev</button>
                  <div className="px-3 py-1 text-xs" style={{ background: "rgba(196,133,58,0.12)", border: "1px solid rgba(196,133,58,0.3)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", minWidth: 100, textAlign: "center" }}>
                    {activeName}
                  </div>
                  <button onClick={nextTurn} className="px-2 py-1 text-xs hover:opacity-80"
                    style={{ background: "rgba(196,133,58,0.08)", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>Next ›</button>
                </div>
              </div>
              <button onClick={() => setCombatActive(false)} className="px-3 py-1 text-xs hover:opacity-80"
                style={{ background: "rgba(139,28,28,0.2)", border: "1px solid rgba(139,28,28,0.4)", borderRadius: 4, color: "#f5c5c5", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                End Combat
              </button>
            </div>

            {/* Initiative strip */}
            <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto shrink-0" style={{ background: "#0c0a08", borderBottom: "1px solid rgba(196,133,58,0.1)", scrollbarWidth: "none" }}>
              {allEntries.map((e, i) => {
                const isActive = i === safeTurn;
                const monsterBg = e.kind === "monster"
                  ? (e.side === "ally" ? "rgba(90,170,90,0.45)" : "rgba(139,28,28,0.5)")
                  : "rgba(106,154,224,0.35)";
                const monsterBgIdle = e.kind === "monster"
                  ? (e.side === "ally" ? "rgba(90,170,90,0.14)" : "rgba(139,28,28,0.15)")
                  : "rgba(106,154,224,0.1)";
                const monsterBorder = e.kind === "monster"
                  ? (e.side === "ally" ? "#6aaa6a" : "#c43a3a")
                  : "#6a9ae0";
                const monsterBorderIdle = e.kind === "monster"
                  ? (e.side === "ally" ? "rgba(90,170,90,0.35)" : "rgba(139,28,28,0.3)")
                  : "rgba(106,154,224,0.2)";
                const monsterShadow = e.kind === "monster"
                  ? (e.side === "ally" ? "#6aaa6a66" : "#c43a3a66")
                  : "#6a9ae066";
                const nameColor = isActive
                  ? "#fff"
                  : e.kind === "monster"
                    ? (e.side === "ally" ? "#b6efb6" : "#e2cfa0")
                    : "#6a9ae0";
                return (
                  <div key={e.uid} className="flex items-center gap-1 shrink-0">
                    {i > 0 && <span style={{ color: "#3a3020", fontSize: 10 }}>›</span>}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded transition-all"
                      style={{
                        background: isActive ? monsterBg : monsterBgIdle,
                        border: `1px solid ${isActive ? monsterBorder : monsterBorderIdle}`,
                        boxShadow: isActive ? `0 0 8px ${monsterShadow}` : "none",
                      }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#c4853a", fontSize: 11, fontWeight: 700 }}>{e.initiative}</span>
                      <span className="text-xs" style={{ fontFamily: "'Cinzel', serif", color: nameColor, fontWeight: isActive ? 700 : 400 }}>{e.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Main area — initiative-ordered cards */}
            <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(196,133,58,0.2) transparent" }}>
              <div className="flex flex-wrap gap-3">
                {allEntries.map((entry, entryIdx) => {
                  const isActiveTurn = entryIdx === safeTurn;
                  if (entry.kind === "player") {
                    const cp = entry.data as CombatPlayer;
                    return (
                      <div key={cp.uid}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const drag = combatAttackDrag.current;
                          if (!drag) return;
                          const monster = combatMonsters.find((m) => m.uid === drag.monsterId);
                          if (monster) monsterAttackPlayer(monster, drag.attack, cp);
                          combatAttackDrag.current = null;
                        }}
                        style={{ width: 160, background: isActiveTurn ? "#0e1420" : "#0e1018", border: `1px solid ${isActiveTurn ? "#6a9ae0" : "rgba(106,154,224,0.25)"}`, borderRadius: 6, padding: "10px", display: "flex", flexDirection: "column", gap: 6, boxShadow: isActiveTurn ? "0 0 12px #6a9ae044" : "none", transition: "all 0.2s" }}
                      >
                        <div className="text-xs font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#6a9ae0" }}>{cp.name}</div>
                        <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Init {cp.initiative}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <input type="number" value={cp.currentHp || ""} placeholder="HP"
                            onChange={(e) => setCombatPlayers((p) => p.map((x) => x.uid === cp.uid ? { ...x, currentHp: Number(e.target.value) || 0 } : x))}
                            style={{ width: 40, background: "#111008", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 3, outline: "none", fontFamily: "'JetBrains Mono', monospace", color: "#e2cfa0", fontSize: 13, textAlign: "center", padding: "2px 2px" }} />
                          <span style={{ color: "#9a8a6a", fontSize: 11 }}>/</span>
                          <input type="number" value={cp.maxHp || ""} placeholder="Max"
                            onChange={(e) => setCombatPlayers((p) => p.map((x) => x.uid === cp.uid ? { ...x, maxHp: Number(e.target.value) || 0 } : x))}
                            style={{ width: 40, background: "#111008", border: "1px solid rgba(196,133,58,0.15)", borderRadius: 3, outline: "none", fontFamily: "'JetBrains Mono', monospace", color: "#9a8a6a", fontSize: 11, textAlign: "center", padding: "2px 2px" }} />
                        </div>
                        <div className="text-xs italic mt-1" style={{ color: "#3a3020", fontFamily: "'Crimson Pro', serif" }}>drop attack here</div>
                      </div>
                    );
                  }

                  const cm = entry.data as CombatMonster;
                  const hpPct = Math.round((cm.currentHp / cm.def.hp) * 100);
                  const hpCol = hpPct > 60 ? "#5aaa5a" : hpPct > 30 ? "#c4853a" : "#c43a3a";
                  const cardBg = cm.side === "enemy"
                    ? (isActiveTurn ? "#1a1208" : "#111008")
                    : (isActiveTurn ? "#102014" : "#0e1510");
                  const cardBorder = cm.side === "enemy"
                    ? (isActiveTurn ? "#c4853a" : "rgba(196,133,58,0.18)")
                    : (isActiveTurn ? "#6aaa6a" : "rgba(90,170,90,0.22)");
                  const cardShadow = cm.side === "enemy"
                    ? "0 0 14px #c4853a44"
                    : "0 0 14px #6aaa6a44";
                  return (
                    <div key={cm.uid} style={{ width: 200, background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 6, padding: "10px", display: "flex", flexDirection: "column", gap: 6, boxShadow: isActiveTurn ? cardShadow : "none", transition: "all 0.2s" }}>
                      {/* Name + meta */}
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-bold leading-tight" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{cm.def.name}</span>
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded w-fit"
                            style={{
                              background: cm.side === "enemy" ? "rgba(139,28,28,0.3)" : "rgba(90,170,90,0.25)",
                              color: cm.side === "enemy" ? "#f5c5c5" : "#b6efb6",
                              fontFamily: "'Cinzel', serif",
                            }}
                          >
                            {cm.side === "enemy" ? "Enemy" : "Ally"}
                          </span>
                        </div>
                        <span className="text-xs shrink-0 ml-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#c4853a" }}>{cm.initiative}</span>
                      </div>
                      <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>CR {cm.def.cr} · AC {cm.def.ac} · MR {cm.def.mr} · Spd {cm.def.speed}</div>
                      {/* HP bar */}
                      <div className="relative h-3 rounded-sm overflow-hidden" style={{ background: "#1a1510" }}>
                        <div className="h-full transition-all duration-300" style={{ width: `${hpPct}%`, background: hpCol }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#e2cfa0" }}>{cm.currentHp}/{cm.def.hp}</span>
                        <div className="flex gap-1">
                          {[-5,-1,1,5].map((d) => (
                            <button key={d} onClick={() => setCombatMonsters((prev) => prev.map((m) => m.uid === cm.uid ? { ...m, currentHp: Math.max(0, Math.min(m.def.hp, m.currentHp + d)) } : m))}
                              className="text-xs hover:opacity-80" style={{ background: d < 0 ? "rgba(139,28,28,0.3)" : "rgba(90,170,90,0.2)", border: `1px solid ${d < 0 ? "rgba(139,28,28,0.4)" : "rgba(90,170,90,0.35)"}`, color: d < 0 ? "#f5c5c5" : "#7acc7a", borderRadius: 3, padding: "1px 4px", fontFamily: "'Cinzel', serif", cursor: "pointer", fontSize: 11 }}>
                              {d > 0 ? `+${d}` : d}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Compact stats */}
                      <div className="flex gap-1 flex-wrap">
                        {STAT_LABELS.map((s) => (
                          <div key={s} className="flex flex-col items-center" style={{ background: "#0e0c08", borderRadius: 3, padding: "2px 4px", minWidth: 26 }}>
                            <span style={{ color: STAT_COLORS[s], fontFamily: "'Cinzel', serif", fontSize: 8 }}>{s}</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#e2cfa0", fontSize: 11, fontWeight: 700 }}>{cm.def.stats[s]}</span>
                          </div>
                        ))}
                      </div>
                      {/* Attacks */}
                      <div className="flex flex-col gap-1 mt-1">
                        {cm.def.attacks.map((atk) => (
                          <div key={atk.id}
                            draggable
                            onDragStart={() => { combatAttackDrag.current = { monsterId: cm.uid, attack: atk }; }}
                            onClick={() => {
                              if (!isActiveTurn) return;
                              const resolved = resolveMonsterAttack(cm.def, cm.runtime, atk);
                              logCombat(resolved.logLine);
                              resolved.effectLines.forEach((line) => logCombat(line));
                              setCombatMonsters((prev) =>
                                prev.map((monster) => (monster.uid === cm.uid ? { ...monster, runtime: resolved.runtime } : monster)),
                              );
                            }}
                            className="transition-opacity px-2 py-1"
                            style={{
                              background: isActiveTurn ? "#241608" : "#1a1008",
                              border: `1px solid ${isActiveTurn ? "rgba(196,133,58,0.4)" : "rgba(196,133,58,0.18)"}`,
                              borderRadius: 4,
                              cursor: isActiveTurn ? "pointer" : "grab",
                              opacity: isActiveTurn ? 1 : 0.7,
                            }}>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{atk.name}</span>
                              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#9a8a6a", fontSize: 10 }}>
                                {`d${atk.formula.diceSides}x${atk.formula.diceCount}`}
                                {atk.formula.stat ? `+${cm.def.stats[atk.formula.stat]}` : ""}
                                {atk.formula.flatBonus ? `+${atk.formula.flatBonus}` : ""}
                              </span>
                            </div>
                            {atk.description && <div className="text-xs leading-tight mt-0.5 italic" style={{ color: "#6a5a3a", fontFamily: "'Crimson Pro', serif", fontSize: 10 }}>{atk.description}</div>}
                          </div>
                        ))}
                      </div>

                      {cm.def.activeAbilities.length > 0 && (
                        <div className="flex flex-col gap-1 mt-1">
                          <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Active Abilities</div>
                          {cm.def.activeAbilities.map((ability) => {
                            const cooldown = cm.runtime.cooldowns[ability.id] ?? 0;
                            const charges = ability.maxCharges ? (cm.runtime.charges[ability.id] ?? ability.maxCharges) : null;
                            const canUse = canUseActiveAbility(cm.runtime, ability) && isActiveTurn;
                            return (
                              <button
                                key={ability.id}
                                onClick={() => useMonsterAbility(cm, ability)}
                                disabled={!canUse}
                                className="text-left transition-opacity px-2 py-1"
                                style={{
                                  background: canUse ? "#121620" : "#101010",
                                  border: `1px solid ${canUse ? "rgba(106,154,224,0.45)" : "rgba(196,133,58,0.12)"}`,
                                  borderRadius: 4,
                                  cursor: canUse ? "pointer" : "default",
                                  opacity: canUse ? 1 : 0.6,
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>{ability.name}</span>
                                  <span style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                                    {cooldown > 0 ? `CD ${cooldown}` : charges !== null ? `${charges}/${ability.maxCharges}` : "Ready"}
                                  </span>
                                </div>
                                {ability.description && (
                                  <div className="text-[10px] leading-tight mt-0.5" style={{ color: "#6a7a95", fontFamily: "'Crimson Pro', serif" }}>{ability.description}</div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {cm.def.passiveAbilities.length > 0 && (
                        <div className="flex flex-col gap-1 mt-1">
                          <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Passives</div>
                          {cm.def.passiveAbilities.map((passive) => {
                            const notes = passive.effects
                              .filter((effect) => effect.note)
                              .map((effect) => effect.note as string);
                            return (
                              <div
                                key={passive.id}
                                className="px-2 py-1 rounded"
                                style={{
                                  color: "#7acc7a",
                                  border: "1px solid rgba(90,170,90,0.25)",
                                  background: "rgba(90,170,90,0.08)",
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold" style={{ color: "#7acc7a" }}>{passive.name}</span>
                                  <span className="text-[9px] uppercase" style={{ color: "#5a8a5a" }}>{passive.trigger.replace(/_/g, " ")}</span>
                                </div>
                                {passive.description && (
                                  <div className="text-[10px] leading-tight mt-0.5" style={{ color: "#9ac89a", fontFamily: "'Crimson Pro', serif" }}>
                                    {passive.description}
                                  </div>
                                )}
                                {notes.length > 0 && (
                                  <div className="text-[9px] leading-tight mt-0.5" style={{ color: "#7aa87a", fontFamily: "'Crimson Pro', serif" }}>
                                    {notes.join(" • ")}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {(() => {
                        const poolMap = new Map((cm.def.resourcePools ?? []).map((pool) => [pool.id, pool]));
                        const trackerIds = Array.from(new Set([
                          ...(cm.def.resourcePools ?? []).map((pool) => pool.id),
                          ...Object.keys(cm.runtime.resources),
                        ]));
                        if (trackerIds.length === 0) return null;
                        return (
                          <div className="flex flex-col gap-1 mt-1">
                            <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>Trackers</div>
                            {trackerIds.map((resourceId) => {
                              const pool = poolMap.get(resourceId);
                              const current = cm.runtime.resources[resourceId] ?? pool?.current ?? 0;
                              const max = pool?.max;
                              return (
                                <div
                                  key={resourceId}
                                  className="px-2 py-1 rounded"
                                  style={{
                                    background: "rgba(106,154,224,0.08)",
                                    border: "1px solid rgba(106,154,224,0.22)",
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px]" style={{ color: "#6a9ae0", fontFamily: "'Cinzel', serif" }}>{pool?.name ?? resourceId}</span>
                                    <span className="text-[10px]" style={{ color: "#9a8a6a", fontFamily: "'JetBrains Mono', monospace" }}>{max !== undefined ? `${current}/${max}` : current}</span>
                                  </div>
                                  <div className="flex items-center gap-1 mt-1">
                                    <button
                                      onClick={() => setCombatMonsters((prev) => prev.map((monster) => {
                                        if (monster.uid !== cm.uid) return monster;
                                        const poolDef = monster.def.resourcePools?.find((r) => r.id === resourceId);
                                        const existing = monster.runtime.resources[resourceId] ?? poolDef?.current ?? 0;
                                        const nextValue = Math.max(0, existing - 1);
                                        return {
                                          ...monster,
                                          runtime: {
                                            ...monster.runtime,
                                            resources: {
                                              ...monster.runtime.resources,
                                              [resourceId]: nextValue,
                                            },
                                          },
                                        };
                                      }))}
                                      className="text-[10px] px-1.5 py-0.5 hover:opacity-80"
                                      style={{ background: "rgba(139,28,28,0.25)", border: "1px solid rgba(139,28,28,0.45)", borderRadius: 3, color: "#f5c5c5", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
                                    >
                                      -
                                    </button>
                                    <button
                                      onClick={() => setCombatMonsters((prev) => prev.map((monster) => {
                                        if (monster.uid !== cm.uid) return monster;
                                        const poolDef = monster.def.resourcePools?.find((r) => r.id === resourceId);
                                        const existing = monster.runtime.resources[resourceId] ?? poolDef?.current ?? 0;
                                        const uncapped = existing + 1;
                                        const nextValue = poolDef ? Math.min(poolDef.max, uncapped) : uncapped;
                                        return {
                                          ...monster,
                                          runtime: {
                                            ...monster.runtime,
                                            resources: {
                                              ...monster.runtime.resources,
                                              [resourceId]: nextValue,
                                            },
                                          },
                                        };
                                      }))}
                                      className="text-[10px] px-1.5 py-0.5 hover:opacity-80"
                                      style={{ background: "rgba(90,170,90,0.2)", border: "1px solid rgba(90,170,90,0.35)", borderRadius: 3, color: "#7acc7a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Combat log footer */}
            <div className="shrink-0 px-5 py-3 overflow-y-auto" style={{ background: "#0c0a08", borderTop: "1px solid rgba(196,133,58,0.15)", height: 220, scrollbarWidth: "thin", scrollbarColor: "rgba(196,133,58,0.2) transparent" }}>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "#6a5a3a", fontFamily: "'Cinzel', serif" }}>Combat Log</div>
              {combatLog.map((l, i) => (
                <div key={i} className="text-sm leading-relaxed py-1" style={{ color: i === 0 ? "#e2cfa0" : "#9a8a6a", fontFamily: "'Crimson Pro', serif", borderBottom: "1px solid rgba(196,133,58,0.05)" }}>{l}</div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── LONG REST MODAL ───────────────────────────────────────────────── */}
      {longRestStep && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.8)" }}>
          <div className="flex flex-col items-center text-center" style={{ background: "#0e0c08", border: "1px solid rgba(106,90,200,0.4)", borderRadius: 8, padding: "36px 40px", minWidth: 320, maxWidth: 400 }}>

            {longRestStep === "confirm" && (<>
              <div className="text-4xl mb-4">🌙</div>
              <h2 className="text-base font-bold mb-2" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>Long Rest</h2>
              <p className="text-sm mb-6" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                Are you sure you want to attempt a long rest?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setLongRestStep(null)}
                  className="px-5 py-2 text-sm hover:opacity-80"
                  style={{ background: "none", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 5, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={doLongRestRoll}
                  className="px-5 py-2 text-sm font-semibold hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #0e0c18, #141028)", border: "1px solid rgba(106,90,200,0.5)", borderRadius: 5, color: "#b0a0e0", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                  Rest
                </button>
              </div>
            </>)}

            {longRestStep === "result" && (<>
              <div className="text-4xl mb-3">{longRestSafe ? "✦" : "⚠"}</div>
              <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "#9a8a6a", fontFamily: "'Cinzel', serif" }}>
                d20 + INT ({effectiveStats.INT}) =
              </div>
              <div className="text-5xl font-bold mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", color: longRestSafe ? "#6aaa6a" : "#c43a3a" }}>
                {longRestRoll}
              </div>
              <h2 className="text-base font-bold mb-2" style={{ fontFamily: "'Cinzel', serif", color: longRestSafe ? "#6aaa6a" : "#c43a3a" }}>
                {longRestSafe ? "You are safe." : "You are not safe."}
              </h2>
              <p className="text-sm mb-6" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                {longRestSafe
                  ? "The night passes without incident. Your watch holds."
                  : "Something stirs in the dark. The rest is uneasy."}
              </p>
              <button onClick={() => setLongRestStep("party")}
                className="px-6 py-2 text-sm font-semibold hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #0e0c18, #141028)", border: "1px solid rgba(106,90,200,0.4)", borderRadius: 5, color: "#b0a0e0", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Continue
              </button>
            </>)}

            {longRestStep === "party" && (<>
              <div className="text-4xl mb-4">🏕</div>
              <h2 className="text-base font-bold mb-2" style={{ fontFamily: "'Cinzel', serif", color: "#e2cfa0" }}>Party Rest</h2>
              <p className="text-sm mb-1" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                Did your party rest successfully?
              </p>
              <p className="text-xs mb-6 italic" style={{ color: "#6a5a3a", fontFamily: "'Crimson Pro', serif" }}>
                (Above fifty percent "safe")
              </p>
              <div className="flex gap-3">
                <button onClick={() => setLongRestStep(null)}
                  className="px-5 py-2 text-sm hover:opacity-80"
                  style={{ background: "rgba(139,28,28,0.2)", border: "1px solid rgba(139,28,28,0.4)", borderRadius: 5, color: "#f5c5c5", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                  No
                </button>
                <button onClick={completeLongRest}
                  className="px-5 py-2 text-sm font-semibold hover:opacity-90"
                  style={{ background: "rgba(90,170,90,0.2)", border: "1px solid rgba(90,170,90,0.4)", borderRadius: 5, color: "#7acc7a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                  Yes
                </button>
              </div>
            </>)}

          </div>
        </div>
      )}

      {/* Paste Shared Content JSON Modal */}
      {importJsonOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }} onClick={() => setImportJsonOpen(false)}>
          <div className="p-7 flex flex-col gap-4 w-full max-w-2xl" style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 8 }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#c4853a" }}>Paste Shared Content JSON</div>
            <p className="text-sm" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>Supports scars, feats, abilities, and spells in one payload. Use the shared template from Admin for full reference. Ability entries can use <code style={{ color: "#c4853a" }}>tallyFormula</code>, <code style={{ color: "#c4853a" }}>modifiers</code>, and <code style={{ color: "#c4853a" }}>actions</code>. Spell entries use <code style={{ color: "#c4853a" }}>isSpell</code> plus optional <code style={{ color: "#c4853a" }}>damageDie</code>, <code style={{ color: "#c4853a" }}>damageStat</code>, <code style={{ color: "#c4853a" }}>slotCost</code>, and <code style={{ color: "#c4853a" }}>scaleDamageBySlots</code>.</p>
            <textarea
              autoFocus
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='{"abilities":[{"name":"Veteran Instinct","type":"Feat","description":"You keep calm under pressure."}],"spells":[{"name":"Spark","type":"Ability","isSpell":true,"description":"Quick magical strike.","damageDie":4,"damageStat":"INT","slotCost":2,"scaleDamageBySlots":true}]}'
              rows={12}
              style={{ ...inputStyle, resize: "vertical" as const, minHeight: 220 }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setImportJsonOpen(false); setImportJsonText(""); }} className="px-4 py-2 text-sm" style={{ background: "#111008", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={importAbilitiesFromText} className="px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg, #1a1208, #241a0c)", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Spell JSON Modal */}
      {importSpellJsonOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }} onClick={() => setImportSpellJsonOpen(false)}>
          <div className="p-7 flex flex-col gap-4 w-full max-w-2xl" style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 8 }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#c4853a" }}>Add Spell</div>
            <p className="text-sm" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>Supports optional <code style={{ color: "#c4853a" }}>damageDie</code>, <code style={{ color: "#c4853a" }}>damageStat</code>, and <code style={{ color: "#c4853a" }}>statModifiers</code>. Copy template from Admin for full reference.</p>
            <textarea
              autoFocus
              value={importSpellJsonText}
              onChange={(e) => setImportSpellJsonText(e.target.value)}
              placeholder='[{"name":"Spark","description":"Quick magical strike.","damageDie":4,"damageStat":"INT","statModifiers":[{"label":"INT","value":"+1"}]}]'
              rows={12}
              style={{ ...inputStyle, resize: "vertical" as const, minHeight: 220 }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setImportSpellJsonOpen(false); setImportSpellJsonText(""); }} className="px-4 py-2 text-sm" style={{ background: "#111008", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={importSpellsFromText} className="px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg, #1a1208, #241a0c)", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Add Spell
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Character JSON Modal */}
      {characterLoadJsonOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }} onClick={() => setCharacterLoadJsonOpen(false)}>
          <div className="p-7 flex flex-col gap-4 w-full max-w-2xl" style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 8 }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#c4853a" }}>Paste Character JSON</div>
            <textarea
              autoFocus
              value={characterLoadJsonText}
              onChange={(e) => setCharacterLoadJsonText(e.target.value)}
              placeholder='{"characterName":"Example","level":1,...}'
              rows={12}
              style={{ ...inputStyle, resize: "vertical" as const, minHeight: 220 }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setCharacterLoadJsonOpen(false); setCharacterLoadJsonText(""); }} className="px-4 py-2 text-sm" style={{ background: "#111008", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={loadCharacterFromText} className="px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg, #1a1208, #241a0c)", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Item Modal */}
      {loadItemOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }} onClick={() => setLoadItemOpen(false)}>
          <div className="p-7 flex flex-col gap-4 w-full max-w-2xl" style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 8 }} onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-bold" style={{ fontFamily: "'Cinzel', serif", color: "#c4853a" }}>Paste Item JSON</div>
            <p className="text-sm" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
              Paste one item object or an array of item objects. Supports stat bonuses (PHYS/CON/INT/SOC), speed, armor, and magic resist bonuses on any item type, plus legacy fields, formulas, multi-attacks, per-attack descriptions, high charge pools, and custom icons.
            </p>
            <textarea
              autoFocus
              value={itemImportText}
              onChange={(e) => setItemImportText(e.target.value)}
              placeholder='[{"name":"Battery Cannon","type":"weapon","icon":"⬡","slot":"weapon1","maxCharges":200,"currentCharges":150,"attacks":[{"name":"Pulse Shot","formula":"2d4 + INT","consumesCharge":true,"description":"Standard capacitor discharge."},{"name":"Overdrive","formula":"3*(INT+PHYS) + 1d8","consumesCharge":true,"description":"Burst mode that burns extra charge."}],"description":"High-capacity charge item."}]'
              rows={12}
              style={{ ...inputStyle, resize: "vertical" as const, minHeight: 220 }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setLoadItemOpen(false); setItemImportText(""); }} className="px-4 py-2 text-sm" style={{ background: "#111008", border: "1px solid rgba(196,133,58,0.2)", borderRadius: 4, color: "#9a8a6a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={importItemsFromText} className="px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg, #1a1208, #241a0c)", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 4, color: "#c4853a", fontFamily: "'Cinzel', serif", cursor: "pointer" }}>
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dodge popup */}
      {dodgePopup && (
        <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", zIndex: 60 }}>
          <div style={{ background: "#163716", border: "1px solid rgba(106,170,106,0.25)", color: "#cfeecd", padding: "10px 14px", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.6)", fontFamily: "'JetBrains Mono', monospace" }}>
            {dodgePopup}
          </div>
        </div>
      )}

      <div className="w-full h-1" style={{ background: "linear-gradient(90deg, transparent, #c4853a 30%, #8b1c1c 50%, #c4853a 70%, transparent)" }} />
    </div>
  </div>
  );
}
