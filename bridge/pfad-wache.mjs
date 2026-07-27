// bridge/pfad-wache.mjs — is this file inside one of the directories we serve?
//
// Its own file for the same reason as browser-oeffnen.mjs: the part that behaves
// differently per platform gets isolated so it can be tested without that
// platform. The previous form compared `resolve(fp).startsWith(root + '/')`, and
// a hard-coded slash is a Unix assumption: on Windows the resolved path is
// `D:\...\public\index.html` while the prefix reads `D:\...\public/`, so the
// comparison failed for every file. The bridge started, answered /api/health and
// served nothing — a 403 on every static request. Found by the first run of the
// platform job on windows-latest.

import { relative, isAbsolute, sep } from 'node:path';

/**
 * True when `ziel` is `wurzel` itself or lies underneath it.
 *
 * Uses `relative` rather than string prefixes: it is separator-agnostic and, for
 * a path outside the root, returns something that starts with `..` — which is
 * exactly the traversal case this guard exists for. `/srv/publicX` must not pass
 * as being inside `/srv/public`, and it does not: the relative path is
 * `../publicX`.
 *
 * @param {(a: string, b: string) => string} relativ  injectable for tests that
 *   need the other platform's semantics (`path.win32.relative`).
 */
export function liegtInnerhalb(wurzel, ziel, relativ = relative, absolut = isAbsolute, trenner = sep) {
  const rel = relativ(wurzel, ziel);
  if (rel === '') return true;                       // die Wurzel selbst
  if (absolut(rel)) return false;                    // andere Platte, anderer Zweig
  return rel !== '..' && !rel.startsWith('..' + trenner);
}
