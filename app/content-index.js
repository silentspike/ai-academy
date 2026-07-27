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


/**
 * Phase artwork. Ten covers were produced as their own work package and were
 * shown in exactly one place: the ceremony after finishing a phase. Everywhere a
 * learner actually spends time — the phase list, the phase view — there was no
 * image at all.
 */
export const PHASEN_COVER = {
  p1: 'p1-fundament', p2: 'p2-verbote', p3: 'p3-einstufung', p4: 'p4-pflichten',
  p5: 'p5-transparenz', p6: 'p6-gpai', p7: 'p7-aufsicht', p8: 'p8-randwissen',
  p9: 'p9-oesterreich', p10: 'p10-auslegung',
};
export function coverPfad(phase) {
  return PHASEN_COVER[phase] ? `assets/covers/${PHASEN_COVER[phase]}.webp` : null;
}
