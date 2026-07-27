#!/usr/bin/env node
// bridge/bridge.mjs — the local bridge of AI-Academy.
// Dependency-free (Node built-ins only). ONE implementation, three operating modes:
//   full:       node bridge.mjs --cli claude --sessions --store data --port 8791
//   share:      node bridge.mjs            (CLI auto-detection, random port, token)
//   serve-only: node bridge.mjs --no-llm   (serve the app only; exams stay locked)
//
// Security contract: docs/THREAT-MODEL.md (T1-T10). In short:
//   loopback only · pairing token · host and origin check · body, time and rate limits ·
//   executable allowlist without a shell · environment isolation for summative calls ·
//   transactional safeguarding of summative answers · redacted logs · no secret in /health.

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { oeffneBrowser } from './browser-oeffnen.mjs';
import { liegtInnerhalb } from './pfad-wache.mjs';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  PRUEFER_SYSTEM, COACH_SYSTEM, PROMPTS_VERSION,
  buildSummativeGradingPrompt, buildAppealPrompt, buildCoachPrompt,
  buildBossPersonaPrompt, buildBossJudgePrompt, buildGeneratePrompt, buildPersonalizationPrompt,
  buildDiagnosePrompt, extractJson, asText,
} from '../tutor/prompts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- CLI arguments
const args = process.argv.slice(2);
function argVal(name, dflt) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; }
const OPT = {
  cli: argVal('--cli', 'auto'),                    // claude | codex | auto
  port: parseInt(argVal('--port', '0'), 10) || 0,  // 0 = Zufallsport
  store: argVal('--store', join(ROOT, 'data')),
  webroot: argVal('--webroot', join(ROOT, 'public')),
  sessions: args.includes('--sessions') || true,   // Session-Matrix ist Kernverhalten
  noLlm: args.includes('--no-llm'),
  model: argVal('--model', null),                  // Default hängt am aktiven CLI (unten aufgelöst)
  logFull: args.includes('--log-full'),            // Default: redigierte Logs (Threat T6)
  open: args.includes('--open'),                   // Browser mit der fertigen Adresse öffnen
};

// ---------------------------------------------------------------- CLI detection
// Executable ALLOWLIST (threat T8): these binaries only, never a shell.
const SUPPORTED_CLIS = ['claude', 'codex'];
function detectClis() {
  const found = {};
  for (const c of SUPPORTED_CLIS) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf-8', timeout: 15000, shell: false });
    if (r.status === 0) found[c] = String(r.stdout || '').trim().split('\n')[0];
  }
  return found;
}
const CLIS = OPT.noLlm ? {} : detectClis();
const ACTIVE_CLI = OPT.noLlm ? null
  : OPT.cli !== 'auto' ? (CLIS[OPT.cli] ? OPT.cli : null)
  : (CLIS.claude ? 'claude' : CLIS.codex ? 'codex' : null);
// The default model follows the active CLI; running codex used to report a Claude model.
// An alias, not a version. `opus` resolves to the newest Opus at call time, so
// the product does not quietly keep grading on a model that has been superseded
// — which is what happened: it sat on claude-opus-4-8 long after that stopped
// being current. The alias is what gets requested; what actually answered is
// read back from the response and logged (see AUFGELOESTES_MODELL), because a
// score series may only be compared within one grading regime (#17) and an
// alias would hide the change that starts a new one.
if (!OPT.model) OPT.model = ACTIVE_CLI === 'codex' ? 'codex (gpt-frontier)' : 'opus';

/** The model that actually answered, as reported by the CLI. Null until the first call. */
let AUFGELOESTES_MODELL = null;
export function modellKennung() { return AUFGELOESTES_MODELL ?? OPT.model; }

/**
 * Which model answered, out of what the CLI reports.
 *
 * modelUsage lists more than one: the CLI runs its own small steps on a light
 * model alongside the one that was asked for, and in a short grading call that
 * helper can account for MORE output tokens than the answer itself. Taking the
 * first key logged Haiku as the grader of an Opus run — and "most tokens" would
 * have been just as wrong.
 *
 * So match against what was requested. If nothing matches, the CLI answered on
 * something else entirely — a fallback, most likely — and that is worth seeing
 * rather than papering over: the busiest entry is reported and flagged.
 */
export function loeseModellAuf(modelUsage, angefordert) {
  const schluessel = Object.keys(modelUsage ?? {});
  if (!schluessel.length) return null;
  const wunsch = String(angefordert ?? '').toLowerCase();
  // 'opus' matches 'claude-opus-5'; a full name matches itself.
  const passend = schluessel.filter(k => k.toLowerCase().includes(wunsch) || wunsch.includes(k.toLowerCase()));
  if (passend.length === 1) return passend[0];
  if (passend.length > 1) {
    // Several match the alias (an older and a newer Opus, say): the one that did the work.
    return passend.sort((a, b) => (modelUsage[b].outputTokens ?? 0) - (modelUsage[a].outputTokens ?? 0))[0];
  }
  const ersatz = schluessel.sort((a, b) => (modelUsage[b].outputTokens ?? 0) - (modelUsage[a].outputTokens ?? 0))[0];
  logLine('modell-abweichung', { angefordert, geantwortet: ersatz, alle: schluessel });
  return ersatz;
}

// Model access runs EXCLUSIVELY through the subscription sign-in of the CLIs
// (claude/codex). There is deliberately no code path that reads a provider key;
// provider environment variables that happen to be set are ignored, and the
// release scan guards against reintroduction.

// ---------------------------------------------------------------- file store (atomic)
const STORE = resolve(OPT.store);
mkdirSync(join(STORE, 'store'), { recursive: true });
mkdirSync(join(STORE, 'log'), { recursive: true });
mkdirSync(join(STORE, 'profiles'), { recursive: true });
function storePath(name) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('invalid store name');
  return join(STORE, 'store', name + '.json');
}
function storeRead(name, dflt) {
  try { return JSON.parse(readFileSync(storePath(name), 'utf-8')); } catch { return dflt; }
}
function storeWrite(name, obj) {
  // Atomic AND safe under concurrency: a unique temporary name per write. A shared
  // ".tmp" path collided when two views saved at once, surfacing as a 500 on
  // PUT /progress while silently losing the write.
  const p = storePath(name);
  const tmp = `${p}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    schreibeAtomar(tmp, p, obj);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* leftover temp file, ignore */ }
    // The store directory can disappear underneath a running process — a stale
    // path, a cleaned temporary directory, an unmounted share. Recreate it once
    // and retry rather than answering 500 and losing the write.
    if (e?.code !== 'ENOENT') throw e;
    mkdirSync(join(STORE, 'store'), { recursive: true });
    schreibeAtomar(tmp, p, obj);
  }
}
function schreibeAtomar(tmp, ziel, obj) {
  writeFileSync(tmp, JSON.stringify(obj, null, 1));
  renameSync(tmp, ziel);                                    // atomic (T9)
}
function logLine(kind, obj) {
  const entry = { ts: new Date().toISOString(), kind, ...obj };
  // Create the directory on demand. On a fresh store it does not exist yet, and
  // an append would abort the process on the very first request — which is
  // exactly what a first-time user gets.
  const datei = join(STORE, 'log', 'bridge-log.jsonl');
  try {
    appendFileSync(datei, JSON.stringify(entry) + '\n');
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
    mkdirSync(join(STORE, 'log'), { recursive: true });
    appendFileSync(datei, JSON.stringify(entry) + '\n');
  }
}

// ---------------------------------------------------------------- pairing token (T1/T2)
const TOKEN = process.env.BRIDGE_TOKEN || randomBytes(24).toString('base64url');

// ---------------------------------------------------------------- model calls
// Session matrix: named sessions via CLI session identifiers (--session-id/--resume),
// fresh calls without a session. Summative calls run ISOLATED (empty temporary working
// directory, --setting-sources "" → no agent instruction files, no hooks, no tools; threat T5).
const namedSessions = storeRead('sessions', {});   // name -> {sessionId, startedAt, turns}
let queueChain = Promise.resolve();                 // 1 LLM-Aufruf zur Zeit (T7)
let queueDepth = 0;
const MAX_QUEUE = 20;

function claudeArgs({ system, prompt, sessionName, isolate }) {
  const a = ['-p', '--output-format', 'json', '--model', OPT.model,
             '--disallowedTools', '*', '--strict-mcp-config',
             // ALWAYS without user configuration: the tutor's character comes solely from
             // our own system prompts. Personal agent instructions present on the machine
             // must influence neither the coach nor the examiner. T5 required this for
             // summative calls only; for the product it is right everywhere.
             '--setting-sources', ''];
  void isolate; // Isolation steuert zusätzlich cwd (Temp) — Flag-seitig jetzt einheitlich
  if (system) a.push('--system-prompt', system);
  if (sessionName) {
    const s = namedSessions[sessionName];
    if (s) a.push('--resume', s.sessionId);
    else { const id = randomUUID(); namedSessions[sessionName] = { sessionId: id, startedAt: new Date().toISOString(), turns: 0 }; a.push('--session-id', id); }
  }
  a.push(prompt);
  return a;
}

function runCli({ system, prompt, sessionName = null, isolate = false, timeoutMs = 180000 }) {
  if (!ACTIVE_CLI) return Promise.reject(Object.assign(new Error('kein unterstütztes CLI verbunden (claude/codex — Abo/OAuth)'), { code: 'NO_LLM' }));
  if (queueDepth >= MAX_QUEUE) return Promise.reject(Object.assign(new Error('Warteschlange voll'), { code: 'QUEUE_FULL' }));
  queueDepth++;
  const job = () => new Promise((resolveP, rejectP) => {
    // Working-directory rule: summative and fresh calls each get their own empty temporary directory (T5).
    // Named sessions (coach, boss) get a STABLE empty directory under the store, because the
    // CLI files sessions per project directory and --resume would otherwise find nothing.
    let cwd, ephemeral;
    if (sessionName) {
      cwd = join(STORE, 'llm-sessions', sessionName.replace(/[^a-z0-9_-]/gi, '_'));
      mkdirSync(cwd, { recursive: true }); ephemeral = false;
    } else {
      cwd = mkdtempSync(join(tmpdir(), 'akademie-llm-')); ephemeral = true;
    }
    const cliArgs = ACTIVE_CLI === 'claude'
      ? claudeArgs({ system, prompt, sessionName, isolate })
      : ['exec', '--json', (system ? system + '\n\n' : '') + prompt]; // codex-Pfad (Share)
    const env = { ...process.env }; delete env.CLAUDECODE;
    logLine('llm-call', { cli: ACTIVE_CLI, isolate, sessionName, cwd, settingSources: 'NONE' });
    const child = spawn(ACTIVE_CLI, cliArgs, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      clearTimeout(timer);
      if (ephemeral) rmSync(cwd, { recursive: true, force: true });
      if (code !== 0) {
        logLine('cli-error-detail', { stderr: err.slice(-400), args0: cliArgs.slice(0, 6) });
        return rejectP(Object.assign(new Error('CLI-Fehler: ' + err.slice(-160)), { code: 'CLI_ERROR' }));
      }
      try {
        let text = out, sessionId = null;
        if (ACTIVE_CLI === 'claude') {
          const envl = JSON.parse(out);
          if (envl.is_error) throw new Error('CLI meldet Fehler');
          text = envl.result; sessionId = envl.session_id;
          const genutzt = loeseModellAuf(envl.modelUsage, OPT.model);
          if (genutzt && genutzt !== AUFGELOESTES_MODELL) {
            if (AUFGELOESTES_MODELL) logLine('modellwechsel', { von: AUFGELOESTES_MODELL, nach: genutzt });
            AUFGELOESTES_MODELL = genutzt;
          }
        }
        if (sessionName && sessionId) {
          namedSessions[sessionName] = { ...(namedSessions[sessionName] || {}), sessionId, turns: (namedSessions[sessionName]?.turns || 0) + 1 };
          storeWrite('sessions', namedSessions);
        }
        resolveP({ text, sessionId });
      } catch (e) { rejectP(Object.assign(e, { code: e.code || 'BAD_OUTPUT' })); }
    });
  });
  const p = queueChain.then(job, job).finally(() => { queueDepth--; });
  queueChain = p.catch(() => {});
  return p;
}

async function llmJson(opts) {
  const { text } = await runCli(opts);
  return extractJson(text);
}

// ---------------------------------------------------------------- transactional safeguarding (T9)
function txBegin(kind, payload) {
  const tx = storeRead('pending_grades', {});
  const id = randomUUID();
  tx[id] = { id, kind, payload, status: 'incomplete_pending_retry', createdAt: new Date().toISOString() };
  storeWrite('pending_grades', tx);
  return id;
}
function txResolve(id, result) {
  const tx = storeRead('pending_grades', {});
  if (tx[id]) { tx[id].status = 'graded'; tx[id].result = result; tx[id].gradedAt = new Date().toISOString(); storeWrite('pending_grades', tx); }
}
// Automatic lock: a tolerance breach in the calibration set locks summative
// grading until tools/gold-set-run.mjs passes again. The calibration run
// itself (kind 'goldset') and formative practice stay allowed — otherwise
// unlocking would be impossible and learning would be blocked.
const LOCKED_KINDS = new Set(['chapter', 'chapter1', 'chapter2', 'exam', 'capstone', 'placement', 'appeal', 'boss-judge', 'challenge']);
function requireUnlocked(kind) {
  if (!LOCKED_KINDS.has(kind)) return;
  const lock = storeRead('summative_lock', null);
  if (lock?.locked) {
    throw Object.assign(new Error('Summative Bewertung gesperrt: Gold-Set-Lauf außerhalb Toleranz (' + (lock.since || '') + '). Neuen Lauf starten: node tools/gold-set-run.mjs'), { code: 'GOLDSET_LOCK' });
  }
}

/**
 * Checks required request fields before any work starts.
 * Throws with code BAD_FIELD, which the error handler maps to 400.
 */
function pruefeFelder(body, erwartet) {
  const fehlend = [];
  for (const [feld, typ] of Object.entries(erwartet)) {
    const v = body?.[feld];
    if (v === undefined || v === null || typeof v !== typ || (typ === 'string' && v === '')) {
      fehlend.push(`${feld} (${typ})`);
    }
  }
  if (fehlend.length) {
    throw Object.assign(new Error('missing or invalid fields: ' + fehlend.join(', ')), { code: 'BAD_FIELD' });
  }
}

async function gradeSummative({ question, rubric, modelAnswer, answer, sources, txKind, existingTxId = null }) {
  requireUnlocked(txKind);
  const txId = existingTxId || txBegin(txKind, { question: question.slice(0, 200), answerLen: answer.length, full: { question, rubric, modelAnswer, answer } });
  const prompt = buildSummativeGradingPrompt({ question, rubric, modelAnswer, answer, sources });
  logPrompt('summative', prompt);
  const result = await llmJson({ system: PRUEFER_SYSTEM, prompt, isolate: true });
  txResolve(txId, result);
  logLine('grade', { txId, kind: txKind, verdict: result.verdict, score: result.score, max: result.max, critical: !!result.critical_error, model: modellKennung(), prompts: PROMPTS_VERSION });
  return { txId, result, label: { type: 'LLM-unterstützt', model: modellKennung(), rubricVersion: PROMPTS_VERSION } };
}

// Prompt log — the full prompt only with --log-full, otherwise hash and length
// (redaction, T6). Verifying the isolation guarantees uses --log-full.
function logPrompt(kind, prompt) {
  const rec = { kind, len: prompt.length };
  if (OPT.logFull) rec.prompt = prompt;
  appendFileSync(join(STORE, 'log', 'prompt-log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n');
}

// ---------------------------------------------------------------- HTTP layer
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'";

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(buf);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((res, rej) => {
    let size = 0, rejected = false; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) {
        if (!rejected) { rejected = true; rej(Object.assign(new Error('body too large'), { code: 'TOO_LARGE' })); }
        // Only sever at four times the limit, so the 413 can still be sent (T7)
        if (size > limit * 4) req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => { if (!rejected) { try { res(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : {}); } catch { rej(Object.assign(new Error('bad json'), { code: 'BAD_JSON' })); } } });
    req.on('error', e => { if (!rejected) rej(e); });
  });
}

function checkAccess(req) {
  const host = String(req.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) return 'bad host';           // DNS-Rebinding (T1)
  const origin = req.headers.origin;
  if (origin) {
    try { const o = new URL(origin); if (!['127.0.0.1', 'localhost'].includes(o.hostname)) return 'bad origin'; }
    catch { return 'bad origin'; }
    if (origin === 'null') return 'null origin';                               // T2
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const deny = checkAccess(req);
    if (deny) return send(res, 403, { error: deny });
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;

    // ---------- API ----------
    if (path.startsWith('/api/')) {
      // /api/health needs no token (discovery) but carries NO secrets (T6)
      if (path === '/api/health') {
        return send(res, 200, {
          ok: true, name: 'ai-act-akademie-bridge', promptsVersion: PROMPTS_VERSION,
          clis: Object.keys(CLIS), activeCli: ACTIVE_CLI,
          model: modellKennung(),
          llm: !!ACTIVE_CLI, queueDepth,
          sessions: Object.fromEntries(Object.entries(namedSessions).map(([k, v]) => [k, { turns: v.turns }])),
        });
      }
      if ((req.headers['x-bridge-token'] || url.searchParams.get('token')) !== TOKEN) return send(res, 403, { error: 'token' });

      const seg = path.slice(5).replace(/\/+$/, '');
      if (seg === 'auth-check') {
        if (!ACTIVE_CLI) return send(res, 200, { ok: false, reason: 'kein unterstütztes CLI gefunden (claude/codex)' });
        const { text } = await runCli({ system: 'Antworte exakt mit: OK', prompt: 'Sag OK.', isolate: true, timeoutMs: 90000 });
        return send(res, 200, { ok: /\bOK\b/.test(text), cli: ACTIVE_CLI, model: modellKennung() });
      }
      if (seg === 'grade' && req.method === 'POST') {
        const b = await readBody(req);
        // Validate before doing anything. A missing field used to reach the
        // grading path and fail there, which surfaced as "internal" with a
        // stack-trace message — a public product must answer 400 for bad input.
        pruefeFelder(b, { question: 'string', answer: 'string' });
        if (b.rubric === undefined || b.rubric === null || b.rubric === '') {
          throw Object.assign(new Error('missing or invalid fields: rubric'), { code: 'BAD_FIELD' });
        }
        // The rubric may arrive as a string or as a structure — the application
        // sends both, depending on where the question came from. Normalise here
        // rather than making every caller stringify.
        const out = await gradeSummative({ question: b.question, rubric: asText(b.rubric), modelAnswer: asText(b.modelAnswer || ''), answer: b.answer, sources: asText(b.sources || ''), txKind: b.kind || 'exercise' });
        return send(res, 200, out);
      }
      if (seg === 'grade/retry' && req.method === 'POST') {
        const b = await readBody(req);
        const tx = storeRead('pending_grades', {});
        const rec = tx[b.txId];
        if (!rec) return send(res, 404, { error: 'unknown tx' });
        if (rec.status === 'graded') return send(res, 200, { txId: rec.id, result: rec.result, replay: true });
        const f = rec.payload.full;
        const out = await gradeSummative({ question: f.question, rubric: f.rubric, modelAnswer: f.modelAnswer, answer: f.answer, sources: '', txKind: rec.kind, existingTxId: rec.id });
        return send(res, 200, out);
      }
      if (seg === 'dialog' && req.method === 'POST') {
        const b = await readBody(req);
        if (b.mode === 'boss') {
          const prompt = buildBossPersonaPrompt({ personaCard: b.personaCard, revealedFacts: b.revealedFacts, conversationPhase: b.phase, userTurn: b.userTurn });
          logPrompt('boss', prompt);
          const j = await llmJson({ system: 'Du spielst exakt die beschriebene Rolle. ' + 'Antworte AUSSCHLIESSLICH mit dem geforderten JSON.', prompt, sessionName: 'boss-' + (b.bossId || 'default') });
          return send(res, 200, j);
        }
        const prompt = buildCoachPrompt({ topic: b.topic, unitContext: b.unitContext, userMessage: b.userMessage, notes: b.notes, journal: b.journal, profileHints: b.profileHints, sources: b.sources });
        logPrompt('coach', prompt);
        const { text } = await runCli({ system: COACH_SYSTEM, prompt, sessionName: 'coach' });
        return send(res, 200, { text });
      }
      if (seg === 'dialog/judge' && req.method === 'POST') {
        const b = await readBody(req);
        requireUnlocked('boss-judge');
        // Payload normalisation: the app sends rubric, core and transcript as objects
        for (const k of ['scenarioCore', 'rubric', 'transcript'])
          if (b[k] != null && typeof b[k] !== 'string') b[k] = JSON.stringify(b[k], null, 1);
        const prompt = buildBossJudgePrompt({ scenarioCore: b.scenarioCore, rubric: b.rubric, transcript: b.transcript });
        logPrompt('summative', prompt);
        const result = await llmJson({ system: PRUEFER_SYSTEM, prompt, isolate: true });
        logLine('boss-judge', { verdict: result.verdict, model: modellKennung() });
        return send(res, 200, { result });
      }
      if (seg === 'dialog/end-session' && req.method === 'POST') {
        const b = await readBody(req);
        // Write the learning-journal summary at session end, then discard the coach session
        let summary = null;
        if (namedSessions.coach) {
          try {
            const j = await llmJson({ system: COACH_SYSTEM, prompt: 'Fasse die heutige Lernsitzung in 3-5 Sätzen für das Lernjournal zusammen (Themen, Stärken, offene Punkte). Antworte NUR mit JSON: {"summary":"..."}', sessionName: 'coach' });
            summary = j.summary;
          } catch { /* Journal ist best effort */ }
          delete namedSessions.coach; storeWrite('sessions', namedSessions);
        }
        if (summary) { const jl = storeRead('journal', []); jl.push({ ts: new Date().toISOString(), summary, day: b.day || null }); storeWrite('journal', jl); }
        return send(res, 200, { summary });
      }
      if (seg === 'appeal' && req.method === 'POST') {
        const b = await readBody(req);
        pruefeFelder(b, { question: 'string', answer: 'string' });
        requireUnlocked('appeal');
        const prompt = buildAppealPrompt({ question: b.question, rubric: b.rubric, modelAnswer: b.modelAnswer || '', answer: b.answer, appealReason: b.appealReason, sources: b.sources || '' });
        logPrompt('summative', prompt);
        const result = await llmJson({ system: PRUEFER_SYSTEM, prompt, isolate: true });
        logLine('appeal', { verdict: result.verdict, model: modellKennung() });
        return send(res, 200, { result });
      }
      if (seg === 'personalize' && req.method === 'POST') {
        const b = await readBody(req);
        const prompt = buildPersonalizationPrompt({ fachprofil: b.fachprofil, lernprofil: b.lernprofil, retry_hint: b.retry_hint });
        logPrompt('personalize', prompt);
        return send(res, 200, await llmJson({ system: COACH_SYSTEM, prompt, isolate: true }));
      }
      if (seg === 'generate' && req.method === 'POST') {
        const b = await readBody(req);
        const prompt = buildGeneratePrompt({ blueprint: b.blueprint, factsSlice: b.factsSlice, count: b.count });
        logPrompt('generate', prompt);
        return send(res, 200, await llmJson({ system: PRUEFER_SYSTEM, prompt, isolate: true }));
      }
      if (seg === 'diagnose' && req.method === 'POST') {
        const b = await readBody(req);
        pruefeFelder(b, { errors: 'object' });
        const prompt = buildDiagnosePrompt({ errorHistoryJson: JSON.stringify(b.errorHistory || []), competenciesJson: JSON.stringify(b.competencies || []) });
        logPrompt('diagnose', prompt);
        return send(res, 200, await llmJson({ system: PRUEFER_SYSTEM, prompt, isolate: true }));
      }
      if (seg === 'progress') {
        if (req.method === 'GET') return send(res, 200, storeRead('progress', {}));
        if (req.method === 'PUT') { storeWrite('progress', await readBody(req, 2 * 1024 * 1024)); return send(res, 200, { ok: true }); }
      }
      if (seg === 'notes') {
        if (req.method === 'GET') return send(res, 200, storeRead('notes', {}));
        if (req.method === 'PUT') { storeWrite('notes', await readBody(req, 2 * 1024 * 1024)); return send(res, 200, { ok: true }); }
      }
      if (seg === 'journal' && req.method === 'GET') return send(res, 200, storeRead('journal', []));
      if (seg === 'export' && req.method === 'GET') {
        const bundle = {};
        for (const n of ['progress', 'notes', 'journal', 'pool']) bundle[n] = storeRead(n, null);
        return send(res, 200, { exportedAt: new Date().toISOString(), warning: 'Enthält persönliche Lerndaten.', data: bundle });
      }
      if (seg === 'profile' && req.method === 'GET') {
        // Loads the local user profile from data/profiles/ (gitignored). Profile names are the
        // user's business — no profile name appears in the code.
        const dir = join(STORE, 'profiles');
        // Read and handle failure, rather than asking first and reading after:
        // between the two the directory can change, and the check buys nothing.
        let files = [];
        try { files = (await import('node:fs')).readdirSync(dir).filter(f => f.endsWith('.json')).sort(); }
        catch { files = []; }
        if (files.length) return send(res, 200, readFileSync(join(dir, files[0]), 'utf-8'), 'application/json; charset=utf-8');
        // No curated profile is the normal case — the repository ships none and
        // share users create theirs in the wizard (§5.1). Answering 404 would put
        // a red entry in every first-time user's console for an expected state.
        return send(res, 200, null);
      }
      return send(res, 404, { error: 'unknown endpoint' });
    }

    // ---------- static files (GET only; web root plus assets/ and content/, read-only) ----------
    if (req.method !== 'GET') return send(res, 405, { error: 'method' });
    let fp;
    if (path.startsWith('/assets/') || path.startsWith('/content/')) fp = join(ROOT, normalize(path).replace(/^([/\\])+/, ''));
    else fp = join(resolve(OPT.webroot), normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, ''));
    const allowedRoots = [resolve(OPT.webroot), join(ROOT, 'assets'), join(ROOT, 'content'), join(ROOT, 'app')];
    if (path.startsWith('/app/')) fp = join(ROOT, normalize(path).replace(/^([/\\])+/, ''));
    if (!allowedRoots.some(r => liegtInnerhalb(r, resolve(fp)))) return send(res, 403, { error: 'path' });
    // Read straight away and handle the failure. A stat followed by a read is
    // still check-then-use: the answer can be stale by the time the read runs.
    // Reading a directory fails with EISDIR, which is the same 404 to a client.
    let data;
    try { data = readFileSync(fp); }
    catch { return send(res, 404, { error: 'not found' }); }
    // Token injection into every served HTML page, not just index.html. The
    // self-check page carries the same placeholder and never got a value: every
    // check against the bridge answered 403 "token", so the traffic light meant
    // to clear the first learning session was permanently red.
    if (path === '/' || extname(fp) === '.html') {
      data = Buffer.from(data.toString('utf-8').replaceAll('__BRIDGE_TOKEN__', TOKEN));
    }
    return send(res, 200, data, MIME[extname(fp)] || 'application/octet-stream');
  } catch (e) {
    // A prompt builder rejecting an incomplete payload is a client error, not an
    // internal one. Without this mapping the caller sees 500 "internal" and has
    // no way to tell a bug from a malformed request. Must run before the status
    // code is derived.
    if (!e.code && /^(summative|appeal|coach|boss|generate|diagnose) prompt:/.test(String(e.message))) {
      e.code = 'BAD_FIELD';
    }
    // BAD_OUTPUT and CLI_ERROR mean the model answered with something unusable —
    // that is an upstream failure, not a fault of the bridge. Reporting it as 500
    // "internal" sends the user looking in the wrong place.
    const code = e.code === 'TOO_LARGE' ? 413
      : e.code === 'BAD_JSON' || e.code === 'BAD_FIELD' ? 400
      : e.code === 'QUEUE_FULL' ? 429
      : e.code === 'NO_LLM' ? 503
      : e.code === 'GOLDSET_LOCK' ? 423
      : e.code === 'BAD_OUTPUT' || e.code === 'CLI_ERROR' ? 502
      : 500;
    logLine('error', { code: e.code || 'ERR', msg: String(e.message).slice(0, 200) });
    return send(res, code, { error: e.code || 'internal', message: String(e.message).slice(0, 200) });
  }
});

server.requestTimeout = 300000;
server.listen(OPT.port, '127.0.0.1', () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/?token=${TOKEN}`;
  console.log(`AI-Act-Akademie Bridge — ${url}`);
  console.log(`CLIs erkannt: ${Object.keys(CLIS).join(', ') || 'keine'} · aktiv: ${ACTIVE_CLI || 'KEIN LLM'} · Modell: ${ACTIVE_CLI ? OPT.model + ' (aufgeloest beim ersten Aufruf)' : '-'}`);
  console.log(`Store: ${STORE} · Webroot: ${resolve(OPT.webroot)}`);
  if (OPT.open) oeffneBrowser(url);
});
