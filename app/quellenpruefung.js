// app/quellenpruefung.js — does the tutor's legal claim rest on a source we ship?
//
// Rank 8 of the source hierarchy (plan §4.1 #9): LLM output is never itself a
// legal source. The prompts already demand `claims[]` with `source_ids[]` — but
// demanding and checking are two different things, and until now nothing checked.
// A model that invents "Art. 6 Abs. 7" produces a sentence that reads exactly
// like one resting on the official journal.
//
// What this does NOT do: judge whether the claim is legally correct. It answers
// the narrower, decidable question — does the cited provision exist in the
// package that shipped, and does it belong to the legal state this build teaches?
// Everything else stays a matter for the content review (#15).

/**
 * Reference form of a citation. "Art. 6 Abs. 3 lit. a", "art-6-abs-3-lit-a" and
 * "Artikel 6 Absatz 3 Buchstabe a" are the same provision written three ways —
 * the model picks one, the content another.
 */
export function normalisiereRef(ref) {
  if (typeof ref !== 'string') return '';
  return ref
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    // German and English both, because the model answers in whichever it likes:
    // measured against a live Opus grading, which cited "annex-iii-5-a" for a
    // provision the content calls "Anhang III Nr. 5 lit. a".
    .replace(/\bartikel\b|\barticle\b|\bart\b/g, 'art')
    .replace(/\babsatz\b|\bparagraph\b|\bpara\b|\babs\b/g, 'abs')
    .replace(/\bbuchstabe\b|\bletter\b|\bpoint\b|\blit\b/g, 'lit')
    .replace(/\bnummer\b|\bnumber\b|\bno\b|\bnr\b/g, 'nr')
    .replace(/\berwaegungsgrund\b|\brecital\b|\berwg\b/g, 'erwg')
    .replace(/\bannex\b|\banhang\b/g, 'anhang')
    // Version suffixes are not part of the provision's identity; they are checked
    // separately against the legal state.
    .replace(/\bidf\b.*$/, '')
    .replace(/\bvo\s*\d{4}\/\d+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Kind plus the bare sequence of ordinals: "anhang|iii|5|a".
 *
 * The same live grading that revealed the English vocabulary also left the
 * structural words out entirely — "annex-iii-5-a" against the content's "Anhang
 * III Nr. 5 lit. a". A citation without its markers is still unambiguous as long
 * as no second provision carries the same numbers, and `baueRegister` refuses to
 * index an abbreviation that would be ambiguous. Precision is not traded for
 * convenience; ambiguity simply falls back to the exact form.
 */
export function ordinalfolge(ref) {
  const norm = normalisiereRef(ref);
  if (!norm) return '';
  const art = /^(anhang|erwg|art)\b/.exec(norm)?.[1] ?? 'art';
  const teile = norm.split('-').filter(t => t && !['art', 'abs', 'lit', 'nr', 'erwg', 'anhang'].includes(t));
  return teile.length ? `${art}|${teile.join('|')}` : '';
}

/**
 * The register of everything the shipped content cites, built from the
 * `legal_basis` entries that the schema makes mandatory (#39). The content IS
 * the source package — there is no second list to keep in sync.
 */
export function baueRegister(objekte) {
  const register = new Map();
  const kurz = new Map();          // Ordinalfolge → Menge exakter Schlüssel
  const eintragen = (o) => {
    for (const b of (o?.legal_basis ?? [])) {
      if (!b?.ref) continue;
      const key = normalisiereRef(b.ref);
      if (!key) continue;
      if (!register.has(key)) register.set(key, { ref: b.ref, instrumente: new Set() });
      if (b.instrument) register.get(key).instrumente.add(b.instrument);
      const of = ordinalfolge(b.ref);
      if (of) { if (!kurz.has(of)) kurz.set(of, new Set()); kurz.get(of).add(key); }
    }
  };
  for (const o of objekte ?? []) {
    eintragen(o);
    for (const b of (o?.blocks ?? [])) eintragen(b);
  }
  // Only unambiguous abbreviations enter the register. Two provisions with the
  // same numbers keep their markers as the only thing telling them apart, and an
  // abbreviated citation of either stays unverified — correctly.
  for (const [of, keys] of kurz) {
    if (keys.size === 1 && !register.has(of)) {
      const einziger = [...keys][0];
      register.set(of, { ...register.get(einziger), abgekuerzt: true });
    }
  }
  return register;
}

/**
 * Judges one claim. Deliberately three outcomes rather than two: a claim with no
 * citation at all is a different failure from one citing something that does not
 * exist, and the interface says which.
 */
export function pruefeClaim(claim, register) {
  const ids = Array.isArray(claim?.source_ids) ? claim.source_ids.filter(Boolean) : [];
  if (!ids.length) return { status: 'ohne-quelle', unbekannt: [] };
  const unbekannt = ids.filter(id => !register.has(normalisiereRef(id)) && !register.has(ordinalfolge(id)));
  return { status: unbekannt.length ? 'unbelegt' : 'belegt', unbekannt };
}

/**
 * Citations as they appear in running text: "Art. 26", "Anhang III Nr. 5 lit. a",
 * "ErwG 58". Declared claims are the model's own account of what it asserted —
 * and a model that simply declares nothing would slip past a check that only
 * reads that account. Measured on a live coach answer: it named Anhang III in
 * the text and declared no claim at all.
 */
export function findeFundstellen(text) {
  if (typeof text !== 'string') return [];
  // Two patterns, not one, and roman numerals only where they occur. "Art" is
  // also an ordinary German noun — measured: "eine Art von" was read as the
  // citation "Art vo", because a case-insensitive roman class happily matches
  // the "v". Articles and recitals are numbered in digits; annexes in roman.
  // No whitespace before the trailing letter: "Art. 6 Abs. 3 und" would otherwise
  // swallow the "u" of "und" as a Buchstabe — measured.
  // Sub-divisions carry both kinds of ordinal — "Abs. 3" but "lit. a" — and both
  // cases of their keyword, because the annex pattern below cannot be
  // case-insensitive without reading "Anhang von" as annex "vo".
  const unter = '(?:\\s*(?:[Aa]bs(?:atz)?\\.?|[Nn]r\\.?|[Ll]it\\.?|[Bb]uchstabe|[Pp]ara(?:graph)?|[Pp]oint|[Ll]etter)\\s*(?:[0-9]+[a-z]?|[a-z]\\b))*';
  const artikel = new RegExp('\\b(?:art(?:ikel)?\\.?|erw(?:aegungs)?g(?:rund)?\\.?)\\s*[0-9]+[a-z]?\\b' + unter, 'gi');
  // Keyword case-insensitive by hand, roman numerals strictly uppercase: with a
  // case-insensitive class, "Anhang von" would read as annex "vo".
  const anhang = new RegExp('\\b[Aa](?:nhang|nnex)\\s*(?:[IVXLC]+|[0-9]+)\\b' + unter, 'g');
  return [...new Set([...(text.match(artikel) ?? []), ...(text.match(anhang) ?? [])].map(m => m.trim()))];
}

/**
 * Does the register know this citation — exactly, by its ordinals, or as the
 * broader provision of something it cites more precisely? "Anhang III" is not an
 * invention when the content cites "Anhang III Nr. 5 lit. a"; it is the same
 * annex, named less specifically.
 */
export function istBekannt(ref, register) {
  if (register.has(normalisiereRef(ref))) return true;
  const of = ordinalfolge(ref);
  if (!of) return false;
  if (register.has(of)) return true;
  for (const key of register.keys()) if (key.startsWith(of + '|')) return true;
  return false;
}

/**
 * All claims of one tutor answer. `alleBelegt` is what the interface acts on:
 * anything else gets marked, never silently shown as if it were sourced.
 */
export function pruefeAntwort(antwort, register) {
  const claims = Array.isArray(antwort?.claims) ? antwort.claims : [];
  const befunde = claims.map(c => ({ text: c?.text ?? '', ...pruefeClaim(c, register) }));

  // Whatever the answer cites in prose counts too, declared or not.
  const imText = findeFundstellen(antwort?.text ?? antwort?.feedback ?? '');
  for (const ref of imText) {
    if (istBekannt(ref, register)) continue;
    befunde.push({ text: ref, status: 'unbelegt', unbekannt: [ref], ausText: true });
  }
  return {
    geprueft: befunde.length,
    befunde,
    alleBelegt: befunde.length > 0 && befunde.every(b => b.status === 'belegt'),
    beanstandet: befunde.filter(b => b.status !== 'belegt'),
  };
}

/**
 * Loads the register from the shipped content. Cached: the content does not
 * change while the page is open, and every piece of tutor feedback would
 * otherwise re-read the whole package.
 */
let cache = null;
export async function ladeRegister(fetchImpl = fetch) {
  if (cache) return cache;
  const teile = [];
  const hol = async (pfad, pick) => {
    try {
      const j = await (await fetchImpl(pfad)).json();
      teile.push(...pick(j));
    } catch { /* fehlt eine Datei, zählt sie nicht als Quelle */ }
  };
  await hol('content/questions-core.json', j => j.questions ?? []);
  await hol('content/units/index.json', j => j.units ?? []);
  await hol('content/facts-db.json', j => j.facts ?? []);
  // Units carry their citations per block, so they have to be read individually.
  const index = teile.filter(u => u.id && u.phase);
  for (const u of index) {
    await hol(`content/units/${u.id}.json`, j => [j]);
  }
  cache = baueRegister(teile);
  return cache;
}

/** For tests: forget what was cached. */
export function registerZuruecksetzen() { cache = null; }
