import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { MonsterDefinition } from "../monsters/types";

export type AddEntityConfig =
  | { kind: "monster"; def: MonsterDefinition; side: "ally" | "enemy"; initiative: number }
  | { kind: "custom"; name: string; maxHp: number; currentHp: number; ac: number; mr: number; speed: number; initiative: number };

interface AddEntityModalProps {
  monsters: MonsterDefinition[];
  loading: boolean;
  loadError: string;
  rollD20: () => number;
  onSubmit: (config: AddEntityConfig) => void;
  onClose: () => void;
}

const FONT_HEAD = "'Cinzel', serif";
const FONT_MONO = "'JetBrains Mono', monospace";
const field = {
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
const button = {
  background: "rgba(196,133,58,0.12)",
  border: "1px solid rgba(196,133,58,0.35)",
  borderRadius: 4,
  color: "#c4853a",
  fontFamily: FONT_HEAD,
  cursor: "pointer",
} as const;

const toInt = (value: string, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const Labeled = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider" style={{ color: "#9a8a6a", fontFamily: FONT_HEAD }}>
    {label}
    {children}
  </label>
);

export function AddEntityModal({ monsters, loading, loadError, rollD20, onSubmit, onClose }: AddEntityModalProps) {
  const [kind, setKind] = useState<"monster" | "custom">("monster");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MonsterDefinition | null>(null);
  const [side, setSide] = useState<"ally" | "enemy">("enemy");
  const [custom, setCustom] = useState({ name: "", maxHp: "", currentHp: "", ac: "", mr: "", speed: "" });
  const [initiative, setInitiative] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? monsters.filter((m) => m.name.toLowerCase().includes(needle) || m.id.toLowerCase().includes(needle)).slice(0, 8)
    : monsters.slice(0, 8);

  const speed = kind === "monster" ? (selected?.speed ?? 0) : toInt(custom.speed);
  const hasInitiative = initiative.trim() !== "" && Number.isFinite(Number(initiative));
  const ready = hasInitiative && (kind === "monster" ? Boolean(selected) : custom.name.trim() !== "");

  const roll = () => setInitiative(String(rollD20() + speed));

  const submit = () => {
    if (!ready) return;
    const init = Math.floor(Number(initiative));
    if (kind === "monster" && selected) {
      onSubmit({ kind: "monster", def: selected, side, initiative: init });
      return;
    }
    const maxHp = Math.max(0, toInt(custom.maxHp));
    const currentHp = custom.currentHp.trim() === "" ? maxHp : Math.min(maxHp, Math.max(0, toInt(custom.currentHp)));
    onSubmit({
      kind: "custom",
      name: custom.name.trim(),
      maxHp,
      currentHp,
      ac: Math.max(0, toInt(custom.ac)),
      mr: Math.max(0, toInt(custom.mr)),
      speed,
      initiative: init,
    });
  };

  const toggle = (value: "monster" | "custom", label: string) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      className="flex-1 px-2 py-1 text-[11px] uppercase tracking-wider"
      style={{ ...button, background: kind === value ? "rgba(196,133,58,0.3)" : "transparent" }}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", zIndex: 70 }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Add Entity to Encounter"
        className="flex flex-col gap-3 w-full"
        style={{ background: "#0e0c08", border: "1px solid rgba(196,133,58,0.4)", borderRadius: 8, padding: 20, maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold" style={{ fontFamily: FONT_HEAD, color: "#c4853a" }}>Add Entity to Encounter</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#9a8a6a", cursor: "pointer" }}>✕</button>
        </div>

        <div className="flex gap-1">
          {toggle("monster", "Monster")}
          {toggle("custom", "Player / Custom")}
        </div>

        {kind === "monster" ? (
          <div className="flex flex-col gap-2">
            <Labeled label="Search monsters (name or id)">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="e.g. ice-skeleton"
                autoFocus
                style={field}
              />
            </Labeled>
            {loading && <div className="text-[11px]" style={{ color: "#9a8a6a" }}>Syncing bestiary…</div>}
            {!loading && monsters.length === 0 && (
              <div className="text-[11px]" style={{ color: "#e06a6a" }}>{loadError || "Bestiary has not synced yet."}</div>
            )}
            <div className="flex flex-col gap-1">
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setSelected(m); setQuery(m.name); }}
                  className="flex items-center justify-between px-2 py-1 text-xs text-left"
                  style={{ ...button, background: selected?.id === m.id ? "rgba(196,133,58,0.3)" : "transparent" }}
                >
                  <span>{m.name}</span>
                  <span style={{ fontFamily: FONT_MONO, color: "#9a8a6a", fontSize: 10 }}>{m.id}</span>
                </button>
              ))}
            </div>
            {selected && (
              <div className="text-xs" style={{ color: "#e2cfa0", fontFamily: FONT_MONO }}>
                HP {selected.hp} · AC {selected.ac} · MR {selected.mr} · SPD {selected.speed} · {selected.attacks.length} attack(s)
              </div>
            )}
            <div className="flex gap-1">
              {(["enemy", "ally"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className="flex-1 px-2 py-1 text-[11px] uppercase tracking-wider"
                  style={{ ...button, background: side === s ? "rgba(196,133,58,0.3)" : "transparent" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Labeled label="Name">
              <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} autoFocus style={field} />
            </Labeled>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Max HP"><input type="number" min={0} value={custom.maxHp} onChange={(e) => setCustom({ ...custom, maxHp: e.target.value })} style={field} /></Labeled>
              <Labeled label="Current HP"><input type="number" min={0} value={custom.currentHp} placeholder="= Max" onChange={(e) => setCustom({ ...custom, currentHp: e.target.value })} style={field} /></Labeled>
              <Labeled label="AC"><input type="number" min={0} value={custom.ac} onChange={(e) => setCustom({ ...custom, ac: e.target.value })} style={field} /></Labeled>
              <Labeled label="MR"><input type="number" min={0} value={custom.mr} onChange={(e) => setCustom({ ...custom, mr: e.target.value })} style={field} /></Labeled>
              <Labeled label="Speed"><input type="number" min={0} value={custom.speed} onChange={(e) => setCustom({ ...custom, speed: e.target.value })} style={field} /></Labeled>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Labeled label="Initiative Roll">
              <input
                type="number"
                value={initiative}
                onChange={(e) => setInitiative(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                style={field}
              />
            </Labeled>
          </div>
          <button type="button" onClick={roll} className="px-3 py-1.5 text-[11px] uppercase tracking-wider" title="Rolls 1d20 + Speed" style={button}>
            Roll d20+SPD
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs" style={{ ...button, color: "#9a8a6a" }}>Cancel</button>
          <button type="button" onClick={submit} disabled={!ready} className="px-4 py-1.5 text-xs font-semibold" style={{ ...button, opacity: ready ? 1 : 0.4, cursor: ready ? "pointer" : "not-allowed" }}>
            Add to Encounter
          </button>
        </div>
      </div>
    </div>
  );
}
