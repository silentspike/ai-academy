// app/content-index.js — facts about the content that several modules need.
//
// The number of units lived as a literal in three places: 17 in the feasibility
// check, 16 in the learning curve, 16 again in the ritual's drift check — while
// the index holds 17. Three numbers for one quantity means at least two views
// are wrong, and adding a unit would have to be remembered in three files.

let GESAMT = null;
let INDEX = null;

/** The unit index, fetched once. */
export async function unitIndex() {
  if (INDEX) return INDEX;
  const idx = await fetch('content/units/index.json').then(r => r.ok ? r.json() : null).catch(() => null);
  INDEX = idx ?? { units: [] };
  return INDEX;
}

/** How many units the content holds. */
export async function einheitenGesamt() {
  if (GESAMT != null) return GESAMT;
  const idx = await unitIndex();
  // A failed fetch must not silently turn into "zero units" — that would make
  // every progress share NaN or 1.
  GESAMT = idx.units?.length || 17;
  return GESAMT;
}
