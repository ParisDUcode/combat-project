export interface InitiativeEntry {
  uid: string;
  initiative: number;
}

// Same ordering the combat view uses: monsters first, then players, stable-sorted by initiative descending.
export const buildTurnOrder = (monsters: InitiativeEntry[], players: InitiativeEntry[]): string[] =>
  [...monsters, ...players]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.initiative - a.entry.initiative || a.index - b.index)
    .map(({ entry }) => entry.uid);

export const safeTurnIndex = (turnIndex: number, total: number): number =>
  total > 0 ? ((turnIndex % total) + total) % total : 0;

// Keeps the same combatant acting after new entries are inserted into the order.
export const turnIndexAfterInsert = (oldOrder: string[], turnIndex: number, newOrder: string[]): number => {
  const activeUid = oldOrder[safeTurnIndex(turnIndex, oldOrder.length)];
  const next = activeUid === undefined ? -1 : newOrder.indexOf(activeUid);
  return next >= 0 ? next : 0;
};

export const uniqueDisplayName = (baseName: string, existingNames: string[]): string => {
  const base = baseName.trim() || "Monster";
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const sameBase = existingNames.filter((name) => {
    const lower = name.trim().toLowerCase();
    return lower === base.toLowerCase() || new RegExp(`^${base.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d+$`).test(lower);
  });
  if (sameBase.length === 0) return base;
  let n = sameBase.length + 1;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
};
