import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { RollableAttack } from "../monsters/types";
import { MAX_ACTIVE_ENTITIES } from "../entities";
import type { CustomEntityInput, EntityInstance } from "../entities";

export type EntityDamageType = "physical" | "magic" | "true";
export interface SpawnResult { ok: boolean; error?: string }

export interface EquippedCompanionOption {
  companionId: string;
  name: string;
  currentHp: number | null;
  maxHp: number | null;
  resolved: boolean;
  active: boolean;
}

interface EntityTrackerProps {
  entities: EntityInstance[];
  equippedCompanions: EquippedCompanionOption[];
  bestiaryIds: string[];
  bestiaryLoading: boolean;
  onOpenSummon: () => void;
  onSpawnCompanion: (companionId: string) => SpawnResult;
  onSpawnById: (monsterId: string) => SpawnResult;
  onSpawnCustom: (input: CustomEntityInput) => SpawnResult;
  onDismiss: (uid: string) => void;
  onClearCustom: () => void;
  onDamage: (uid: string, amount: number, type: EntityDamageType) => void;
  onHeal: (uid: string, amount: number) => void;
  onAttack: (uid: string, attack: RollableAttack) => void;
}

const FONT_HEAD = "'Cinzel', serif";
const FONT_MONO = "'JetBrains Mono', monospace";
const goldButton = {
  background: "rgba(196,133,58,0.12)",
  border: "1px solid rgba(196,133,58,0.35)",
  borderRadius: 4,
  color: "#c4853a",
  fontFamily: FONT_HEAD,
  cursor: "pointer",
} as const;
const fieldStyle = {
  background: "#111008",
  border: "1px solid rgba(196,133,58,0.25)",
  borderRadius: 4,
  color: "#e2cfa0",
  fontFamily: FONT_MONO,
  fontSize: 12,
  padding: "4px 6px",
  outline: "none",
  width: "100%",
} as const;

const EntityCard = ({
  entity, onDismiss, onDamage, onHeal, onAttack,
}: {
  entity: EntityInstance;
  onDismiss: EntityTrackerProps["onDismiss"];
  onDamage: EntityTrackerProps["onDamage"];
  onHeal: EntityTrackerProps["onHeal"];
  onAttack: EntityTrackerProps["onAttack"];
}) => {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<EntityDamageType>("physical");
  const [infoOpen, setInfoOpen] = useState(false);
  const down = entity.currentHp <= 0;
  const pct = entity.maxHp > 0 ? Math.round((entity.currentHp / entity.maxHp) * 100) : 0;
  const barColor = pct > 50 ? "#4a9a5a" : pct > 25 ? "#c4a03a" : "#c43a3a";
  const parsed = Math.max(0, Math.floor(Number(amount) || 0));
  const submit = (kind: "damage" | "heal") => {
    if (parsed <= 0) return;
    if (kind === "damage") onDamage(entity.uid, parsed, type);
    else onHeal(entity.uid, parsed);
    setAmount("");
  };

  return (
    <div style={{ background: "#0e0c08", border: `1px solid ${down ? "rgba(196,58,58,0.5)" : "rgba(196,133,58,0.25)"}`, borderRadius: 6, padding: 8 }}>
      <div className="flex items-center gap-1.5">
        <span className="flex-1 truncate text-xs font-semibold uppercase" title={entity.name} style={{ color: down ? "#9a6a6a" : "#e2cfa0", fontFamily: FONT_HEAD }}>
          {entity.name}
        </span>
        {entity.speed && (
          <span className="text-[10px] px-1.5 py-0.5" title="Speed" style={{ border: "1px solid rgba(196,133,58,0.3)", borderRadius: 3, color: "#9a8a6a", fontFamily: FONT_MONO }}>
            SPD {entity.speed}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setInfoOpen(true); }}
          title="Creature info"
          aria-label={`Info for ${entity.name}`}
          style={{ background: "none", border: "none", color: "#c4853a", cursor: "pointer", fontSize: 12 }}
        >
          ℹ
        </button>
        <button
          type="button"
          onClick={() => onDismiss(entity.uid)}
          title={entity.isPermanent ? "Dismiss (HP is kept)" : "Delete"}
          aria-label={entity.isPermanent ? `Dismiss ${entity.name}` : `Delete ${entity.name}`}
          style={{ background: "none", border: "none", color: "#9a8a6a", cursor: "pointer", fontSize: 12 }}
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        <div className="relative flex-1 h-4 rounded-sm overflow-hidden" style={{ background: "#1a1510" }}>
          <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, background: barColor }} />
          <span className="absolute inset-0 flex items-center justify-center text-[10px]" style={{ color: "#fff", fontFamily: FONT_MONO, textShadow: "0 0 3px #000" }}>
            {entity.currentHp}/{entity.maxHp}
          </span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5" title="Armor" style={{ border: "1px solid rgba(106,154,224,0.4)", borderRadius: 3, color: "#6a9ae0", fontFamily: FONT_MONO }}>
          AR {entity.armor}
        </span>
        <span className="text-[10px] px-1.5 py-0.5" title="Magic Resist" style={{ border: "1px solid rgba(160,106,224,0.4)", borderRadius: 3, color: "#a06ae0", fontFamily: FONT_MONO }}>
          MR {entity.magicResist}
        </span>
      </div>

      {down && (
        <div className="mt-1.5 text-center text-[10px] uppercase tracking-widest py-0.5" style={{ background: "rgba(196,58,58,0.18)", border: "1px solid rgba(196,58,58,0.5)", borderRadius: 3, color: "#e06a6a", fontFamily: FONT_HEAD }}>
          {entity.isPermanent ? "Fainted" : "Destroyed"}
        </div>
      )}

      <div className="flex items-center gap-1 mt-1.5">
        <input
          type="number"
          min={0}
          value={amount}
          placeholder="amt"
          aria-label={`Damage or heal amount for ${entity.name}`}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit("damage"); }}
          style={{ ...fieldStyle, width: 48, textAlign: "center" }}
        />
        <select value={type} onChange={(e) => setType(e.target.value as EntityDamageType)} aria-label="Damage type" style={{ ...fieldStyle, width: "auto", flex: 1 }}>
          <option value="physical">Physical</option>
          <option value="magic">Magic</option>
          <option value="true">True</option>
        </select>
        <button type="button" onClick={() => submit("damage")} className="px-1.5 py-1 text-[10px]" style={{ ...goldButton, color: "#e06a6a", borderColor: "rgba(196,58,58,0.5)" }}>Hit</button>
        <button type="button" onClick={() => submit("heal")} className="px-1.5 py-1 text-[10px]" style={{ ...goldButton, color: "#6ac47a", borderColor: "rgba(74,154,90,0.5)" }}>Heal</button>
      </div>

      {entity.attacks.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {entity.attacks.map((attack) => (
            <button
              key={attack.id}
              type="button"
              disabled={down}
              onClick={() => onAttack(entity.uid, attack)}
              className="px-1.5 py-1 text-[10px]"
              title={attack.description}
              style={{ ...goldButton, opacity: down ? 0.4 : 1, cursor: down ? "not-allowed" : "pointer" }}
            >
              {attack.name} {attack.formula.diceCount}d{attack.formula.diceSides}
              {attack.formula.stat ? `+${attack.formula.stat}` : ""}
              {attack.formula.flatBonus ? (attack.formula.flatBonus > 0 ? `+${attack.formula.flatBonus}` : attack.formula.flatBonus) : ""}
            </button>
          ))}
        </div>
      )}
      {infoOpen && <EntityInfoDialog entity={entity} onClose={() => setInfoOpen(false)} />}
    </div>
  );
};

const formulaText = (f: RollableAttack["formula"]) =>
  `${f.diceCount}d${f.diceSides}${f.stat ? ` + ${f.stat}` : ""}${f.flatBonus ? (f.flatBonus > 0 ? ` + ${f.flatBonus}` : ` − ${Math.abs(f.flatBonus)}`) : ""}`;

const InfoSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <div className="text-[10px] uppercase tracking-widest" style={{ color: "#c4853a", fontFamily: FONT_HEAD, borderBottom: "1px solid rgba(196,133,58,0.2)" }}>{title}</div>
    {children}
  </div>
);

const InfoEntry = ({ name, meta, text }: { name: string; meta?: string; text?: string }) => (
  <div>
    <div className="text-xs" style={{ color: "#e2cfa0", fontFamily: FONT_HEAD }}>
      {name}{meta && <span style={{ color: "#9a8a6a", fontFamily: FONT_MONO, marginLeft: 6 }}>{meta}</span>}
    </div>
    {text && <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif", whiteSpace: "pre-wrap" }}>{text}</div>}
  </div>
);

const EntityInfoDialog = ({ entity, onClose }: { entity: EntityInstance; onClose: () => void }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const def = entity.def;
  const passives = def?.passiveAbilities ?? [];
  const actives = def?.activeAbilities ?? [];
  const tags = def?.tags ?? [];
  const stats = def?.stats;
  const effectNotes = (effects?: { note?: string }[]) =>
    (effects ?? []).map((effect) => effect.note).filter(Boolean).join("\n");
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join("\n") || undefined;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${entity.name} info`}
        className="flex flex-col gap-3 w-full"
        style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 8, padding: 20, maxWidth: 440, maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold uppercase" style={{ fontFamily: FONT_HEAD, color: "#c4853a" }}>{entity.name}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#9a8a6a", cursor: "pointer" }}>✕</button>
        </div>

        <InfoSection title="Creature Info">
          <div className="text-xs" style={{ color: "#e2cfa0", fontFamily: FONT_MONO }}>
            HP {entity.maxHp} · Armor {entity.armor} · MR {entity.magicResist}{entity.speed ? ` · SPD ${entity.speed}` : ""}
          </div>
          {stats && (
            <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: FONT_MONO }}>
              PHYS {stats.PHYS} · CON {stats.CON} · INT {stats.INT} · SOC {stats.SOC}
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5" style={{ border: "1px solid rgba(196,133,58,0.3)", borderRadius: 3, color: "#9a8a6a", fontFamily: FONT_MONO }}>{tag}</span>
              ))}
            </div>
          )}
          {entity.notes && <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>{entity.notes}</div>}
        </InfoSection>

        {entity.attacks.length > 0 && (
          <InfoSection title="Attacks">
            {entity.attacks.map((attack) => (
              <InfoEntry
                key={attack.id}
                name={attack.name}
                meta={`${formulaText(attack.formula)}${attack.damageType ? ` · ${attack.damageType}` : ""}`}
                text={join(attack.description, effectNotes(attack.effects))}
              />
            ))}
          </InfoSection>
        )}

        {passives.length > 0 && (
          <InfoSection title="Passives">
            {passives.map((passive) => (
              <InfoEntry key={passive.id} name={passive.name} meta={passive.trigger.replace(/_/g, " ")} text={join(passive.description, effectNotes(passive.effects))} />
            ))}
          </InfoSection>
        )}

        {actives.length > 0 && (
          <InfoSection title="Actives">
            {actives.map((ability) => {
              const meta = [
                ability.formula ? formulaText(ability.formula) : undefined,
                ability.maxCharges ? `${ability.maxCharges} charges` : undefined,
                ability.cooldownTurns ? `${ability.cooldownTurns}-turn cooldown` : undefined,
                ability.resourceCost ? `costs ${ability.resourceCost.amount} ${ability.resourceCost.resourceId}` : undefined,
              ].filter(Boolean).join(" · ");
              return <InfoEntry key={ability.id} name={ability.name} meta={meta || undefined} text={join(ability.description, effectNotes(ability.effects))} />;
            })}
          </InfoSection>
        )}
      </div>
    </div>
  );
};

type SummonTab = "companions" | "bestiary" | "custom";

const EMPTY_CUSTOM = { name: "", maxHp: "", armor: "", magicResist: "", speed: "" };

export function EntityTracker(props: EntityTrackerProps) {
  const {
    entities, equippedCompanions, bestiaryIds, bestiaryLoading,
    onOpenSummon, onSpawnCompanion, onSpawnById, onSpawnCustom, onDismiss, onClearCustom, onDamage, onHeal, onAttack,
  } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<SummonTab>("companions");
  const [monsterId, setMonsterId] = useState("");
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const [errorPopup, setErrorPopup] = useState("");

  const full = entities.length >= MAX_ACTIVE_ENTITIES;
  const hasCustom = entities.some((e) => !e.isPermanent);

  const openModal = () => {
    setTab("companions");
    setMonsterId("");
    setCustom(EMPTY_CUSTOM);
    setModalOpen(true);
    onOpenSummon();
  };

  const handleResult = (result: SpawnResult) => {
    if (result.ok) setModalOpen(false);
    else if (result.error) setErrorPopup(result.error);
  };

  const submitCustom = () => {
    if (!custom.name.trim()) return;
    handleResult(onSpawnCustom({
      name: custom.name,
      maxHp: Number(custom.maxHp),
      armor: Number(custom.armor),
      magicResist: Number(custom.magicResist),
      speed: custom.speed,
    }));
  };

  const tabButton = (key: SummonTab, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      className="flex-1 px-2 py-1 text-[10px] uppercase tracking-wider"
      style={{ ...goldButton, background: tab === key ? "rgba(196,133,58,0.3)" : "transparent" }}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(196,133,58,0.12)" }}>
      {entities.length === 0 ? (
        <button type="button" onClick={openModal} className="w-full px-2 py-1.5 text-[11px] uppercase tracking-widest hover:opacity-90" style={goldButton}>
          + Summon / Entity
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {entities.map((entity) => (
            <EntityCard key={entity.uid} entity={entity} onDismiss={onDismiss} onDamage={onDamage} onHeal={onHeal} onAttack={onAttack} />
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openModal}
              disabled={full}
              className="flex-1 px-2 py-1 text-[11px] uppercase tracking-widest"
              title={full ? `Max ${MAX_ACTIVE_ENTITIES} active entities` : undefined}
              style={{ ...goldButton, opacity: full ? 0.4 : 1, cursor: full ? "not-allowed" : "pointer" }}
            >
              + Add
            </button>
            <button
              type="button"
              onClick={onClearCustom}
              disabled={!hasCustom}
              className="flex-1 px-2 py-1 text-[11px] uppercase tracking-widest"
              style={{ ...goldButton, opacity: hasCustom ? 1 : 0.4, cursor: hasCustom ? "pointer" : "not-allowed" }}
            >
              Clear Custom
            </button>
          </div>
          {full && (
            <div className="text-[10px] text-center" style={{ color: "#9a8a6a", fontFamily: FONT_HEAD }}>
              Max {MAX_ACTIVE_ENTITIES} entities active
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }} onClick={() => setModalOpen(false)}>
          <div
            className="flex flex-col gap-3 w-full"
            style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 8, padding: 20, maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ fontFamily: FONT_HEAD, color: "#c4853a" }}>Summon / Entity</span>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Close" style={{ background: "none", border: "none", color: "#9a8a6a", cursor: "pointer" }}>✕</button>
            </div>
            <div className="flex gap-1">
              {tabButton("companions", "Companions")}
              {tabButton("bestiary", "Bestiary ID")}
              {tabButton("custom", "Custom")}
            </div>

            {tab === "companions" && (
              <div className="flex flex-col gap-2">
                {equippedCompanions.length === 0 && (
                  <div className="text-xs" style={{ color: "#9a8a6a", fontFamily: "'Crimson Pro', serif" }}>
                    No equipped weapon or accessory has a companion.
                  </div>
                )}
                {equippedCompanions.map((option) => {
                  const disabled = option.active || !option.resolved || full;
                  const label = option.resolved
                    ? `Spawn ${option.name} (${option.currentHp}/${option.maxHp})`
                    : `${option.name} (bestiary not synced)`;
                  return (
                    <button
                      key={option.companionId}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleResult(onSpawnCompanion(option.companionId))}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs"
                      style={{ ...goldButton, opacity: disabled ? 0.55 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
                    >
                      <span>[{label}]</span>
                      {option.active && <span style={{ color: "#6ac47a" }}>[Active]</span>}
                    </button>
                  );
                })}
                {bestiaryLoading && <div className="text-[10px]" style={{ color: "#9a8a6a" }}>Syncing bestiary…</div>}
              </div>
            )}

            {tab === "bestiary" && (
              <div className="flex flex-col gap-2">
                <input
                  list="entity-bestiary-ids"
                  value={monsterId}
                  onChange={(e) => setMonsterId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !full) handleResult(onSpawnById(monsterId)); }}
                  placeholder="Monster ID (e.g. ice-skeleton)"
                  style={fieldStyle}
                />
                <datalist id="entity-bestiary-ids">
                  {bestiaryIds.map((id) => <option key={id} value={id} />)}
                </datalist>
                {bestiaryLoading && <div className="text-[10px]" style={{ color: "#9a8a6a" }}>Syncing bestiary…</div>}
                <button type="button" disabled={full} onClick={() => handleResult(onSpawnById(monsterId))} className="px-2 py-1.5 text-xs" style={{ ...goldButton, opacity: full ? 0.4 : 1 }}>
                  Spawn
                </button>
              </div>
            )}

            {tab === "custom" && (
              <div className="flex flex-col gap-2">
                <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Name (e.g. Glacial Repose Ice Block)" style={fieldStyle} />
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" min={1} value={custom.maxHp} onChange={(e) => setCustom({ ...custom, maxHp: e.target.value })} placeholder="Max HP" aria-label="Max HP" style={fieldStyle} />
                  <input type="number" min={0} value={custom.armor} onChange={(e) => setCustom({ ...custom, armor: e.target.value })} placeholder="Armor" aria-label="Armor" style={fieldStyle} />
                  <input type="number" min={0} value={custom.magicResist} onChange={(e) => setCustom({ ...custom, magicResist: e.target.value })} placeholder="MR" aria-label="Magic Resist" style={fieldStyle} />
                </div>
                <input value={custom.speed} onChange={(e) => setCustom({ ...custom, speed: e.target.value })} placeholder="Speed / Notes (optional)" style={fieldStyle} />
                <button type="button" disabled={full || !custom.name.trim()} onClick={submitCustom} className="px-2 py-1.5 text-xs" style={{ ...goldButton, opacity: full || !custom.name.trim() ? 0.4 : 1 }}>
                  Spawn
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {errorPopup && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setErrorPopup("")}>
          <div role="alertdialog" className="flex flex-col items-center gap-3" style={{ background: "#0e0c08", border: "1px solid rgba(196,58,58,0.6)", borderRadius: 8, padding: "20px 24px", maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="text-sm text-center" style={{ color: "#e06a6a", fontFamily: FONT_HEAD }}>{errorPopup}</div>
            <button type="button" autoFocus onClick={() => setErrorPopup("")} className="px-4 py-1.5 text-xs" style={goldButton}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
