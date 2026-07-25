#!/usr/bin/env node
// bridge/bridge.mjs — Local Bridge der AI-Act-Akademie.
// Dependency-frei (nur Node-Builtins). EINE Implementierung, drei Betriebsarten (Plan §5.4/§6):
//   Jans Betrieb:  node bridge.mjs --cli claude --sessions --store data --port 8791
//   Share:         node bridge.mjs            (Auto-CLI-Erkennung, Zufallsport, Token)
//   Serve-only:    node bridge.mjs --no-llm   (nur App ausliefern; Prüfungen bleiben gesperrt)
//
// Sicherheits-Kontrakt: docs/THREAT-MODEL.md (T1-T10). Kurzfassung:
//   Loopback-only · Pairing-Token · Host-/Origin-Prüfung · Body-/Zeit-/Rate-Limits ·
//   Executable-Whitelist ohne Shell · Umgebungs-Isolation summativer Aufrufe ·
//   transaktionale Sicherung summativer Antworten · redigierte Logs · kein Secret in /health.

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, renameSync, existsSync, appendFileSync, statSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  PRUEFER_SYSTEM, COACH_SYSTEM, PROMPTS_VERSION,
  buildSummativeGradingPrompt, buildAppealPrompt, buildCoachPrompt,
  buildBossPersonaPrompt, buildBossJudgePrompt, buildGeneratePrompt, buildPersonalizationPrompt,
  buildDiagnosePrompt, extractJson,
} from '../tutor/prompts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- CLI-Argumente
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
};

// ---------------------------------------------------------------- CLI-Erkennung
// Executable-WHITELIST (Threat T8): ausschließlich diese Binaries, nie Shell.
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
// Modell-Default hängt am aktiven CLI (Task-12-Finding: Codex-Betrieb meldete Claude-Modell)
if (!OPT.model) OPT.model = ACTIVE_CLI === 'codex' ? 'codex (gpt-frontier)' : 'claude-opus-4-8';

// LLM-Zugang AUSSCHLIESSLICH über Abo/OAuth der CLIs (claude/codex) —
// Auftraggeber-Direktive 2026-07-25: KEIN API-Key-Transport. Es gibt bewusst
// keinen Code-Pfad, der Provider-Schlüssel liest; gesetzte Provider-Umgebungs-
// variablen werden ignoriert (der Release-Scan wacht über die Wiedereinführung).

// ---------------------------------------------------------------- File-Store (atomar)
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
  // Atomar UND parallelsicher: eindeutiger Temp-Name pro Write. Ein gemeinsamer
  // ".tmp"-Pfad kollidierte bei gleichzeitigen Saves (Task-12-Nacharbeit: 500er
  // beim PUT /progress, wenn zwei Views gleichzeitig speicherten).
  const p = storePath(name);
  const tmp = `${p}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(obj, null, 1));
    renameSync(tmp, p);                                     // atomar (T9)
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* Temp-Rest ignorieren */ }
    throw e;
  }
}
function logLine(kind, obj) {
  const entry = { ts: new Date().toISOString(), kind, ...obj };
  appendFileSync(join(STORE, 'log', 'bridge-log.jsonl'), JSON.stringify(entry) + '\n');
}

// ---------------------------------------------------------------- Pairing-Token (T1/T2)
const TOKEN = process.env.BRIDGE_TOKEN || randomBytes(24).toString('base64url');

// ---------------------------------------------------------------- LLM-Aufrufe
// Session-Matrix (Plan #22): benannte Sessions über CLI-Session-IDs (--session-id/--resume),
// frische Aufrufe ohne Session. Summative Aufrufe laufen ISOLIERT (leeres Temp-cwd,
// --setting-sources "" → keine CLAUDE.md/AGENTS.md/Hooks, keine Tools, kein MCP; Threat T5).
const namedSessions = storeRead('sessions', {});   // name -> {sessionId, startedAt, turns}
let queueChain = Promise.resolve();                 // 1 LLM-Aufruf zur Zeit (T7)
let queueDepth = 0;
const MAX_QUEUE = 20;

function claudeArgs({ system, prompt, sessionName, isolate }) {
  const a = ['-p', '--output-format', 'json', '--model', OPT.model,
             '--disallowedTools', '*', '--strict-mcp-config',
             // IMMER ohne Nutzer-Konfiguration (CLAUDE.md/Hooks): Der Tutor-Charakter kommt
             // ausschließlich aus unseren System-Prompts — persönliche Agent-Instruktionen
             // des Rechners dürfen weder Coach noch Prüfer beeinflussen (Task-12-Finding;
             // T5 verlangte das bisher nur summativ, produktrichtig ist es überall).
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
    // cwd-Regel: Summative/frische Aufrufe → eigenes leeres Temp-Verzeichnis pro Aufruf (T5).
    // Benannte Sessions (coach/boss) → STABILES leeres Verzeichnis unter dem Store, weil die
    // CLI Sessions pro Projektverzeichnis ablegt und --resume sonst ins Leere greift.
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

// ---------------------------------------------------------------- Transaktionale Sicherung (T9)
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
// Auto-Sperre (Plan #27a v3.2): Gold-Set-Toleranzverletzung sperrt summative
// Bewertung, bis tools/gold-set-run.mjs wieder grün läuft. Der Gold-Set-Lauf
// selbst (kind 'goldset') und formative Übungen bleiben erlaubt — sonst wäre
// ein Entsperren unmöglich bzw. das Lernen blockiert.
const LOCKED_KINDS = new Set(['chapter', 'chapter1', 'chapter2', 'exam', 'capstone', 'placement', 'appeal', 'boss-judge', 'challenge']);
function requireUnlocked(kind) {
  if (!LOCKED_KINDS.has(kind)) return;
  const lock = storeRead('summative_lock', null);
  if (lock?.locked) {
    throw Object.assign(new Error('Summative Bewertung gesperrt: Gold-Set-Lauf außerhalb Toleranz (' + (lock.since || '') + '). Neuen Lauf starten: node tools/gold-set-run.mjs'), { code: 'GOLDSET_LOCK' });
  }
}

async function gradeSummative({ question, rubric, modelAnswer, answer, sources, txKind, existingTxId = null }) {
  requireUnlocked(txKind);
  const txId = existingTxId || txBegin(txKind, { question: question.slice(0, 200), answerLen: answer.length, full: { question, rubric, modelAnswer, answer } });
  const prompt = buildSummativeGradingPrompt({ question, rubric, modelAnswer, answer, sources });
  logPrompt('summative', prompt);
  const result = await llmJson({ system: PRUEFER_SYSTEM, prompt, isolate: true });
  txResolve(txId, result);
  logLine('grade', { txId, kind: txKind, verdict: result.verdict, score: result.score, max: result.max, critical: !!result.critical_error, model: OPT.model, prompts: PROMPTS_VERSION });
  return { txId, result, label: { type: 'LLM-unterstützt', model: OPT.model, rubricVersion: PROMPTS_VERSION } };
}

// Prompt-Log (Verifikation Plan §10: "Prompt-Log-Inspektion") — voller Prompt nur mit --log-full,
// sonst Hash+Länge (Redaktion, T6). Für die Isolations-ACs wird --log-full genutzt.
function logPrompt(kind, prompt) {
  const rec = { kind, len: prompt.length };
  if (OPT.logFull) rec.prompt = prompt;
  appendFileSync(join(STORE, 'log', 'prompt-log.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...rec }) + '\n');
}

// ---------------------------------------------------------------- HTTP-Schicht
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
        // Erst ab dem 4-fachen Limit hart trennen — so kann der 413 noch gesendet werden (T7)
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
      // /api/health ist token-frei (Discovery), enthält aber KEINE Secrets (T6)
      if (path === '/api/health') {
        return send(res, 200, {
          ok: true, name: 'ai-act-akademie-bridge', promptsVersion: PROMPTS_VERSION,
          clis: Object.keys(CLIS), activeCli: ACTIVE_CLI,
          model: OPT.model,
          llm: !!ACTIVE_CLI, queueDepth,
          sessions: Object.fromEntries(Object.entries(namedSessions).map(([k, v]) => [k, { turns: v.turns }])),
        });
      }
      if ((req.headers['x-bridge-token'] || url.searchParams.get('token')) !== TOKEN) return send(res, 403, { error: 'token' });

      const seg = path.slice(5).replace(/\/+$/, '');
      if (seg === 'auth-check') {
        if (!ACTIVE_CLI) return send(res, 200, { ok: false, reason: 'kein unterstütztes CLI gefunden (claude/codex)' });
        const { text } = await runCli({ system: 'Antworte exakt mit: OK', prompt: 'Sag OK.', isolate: true, timeoutMs: 90000 });
        return send(res, 200, { ok: /\bOK\b/.test(text), cli: ACTIVE_CLI, model: OPT.model });
      }
      if (seg === 'grade' && req.method === 'POST') {
        const b = await readBody(req);
        const out = await gradeSummative({ question: b.question, rubric: b.rubric, modelAnswer: b.modelAnswer || '', answer: b.answer, sources: b.sources || '', txKind: b.kind || 'exercise' });
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
        // Payload-Normalisierung: App liefert Rubrik/Kern/Transcript als Objekte (Task-12-Finding)
        for (const k of ['scenarioCore', 'rubric', 'transcript'])
          if (b[k] != null && typeof b[k] !== 'string') b[k] = JSON.stringify(b[k], null, 1);
        const prompt = buildBossJudgePrompt({ scenarioCore: b.scenarioCore, rubric: b.rubric, transcript: b.transcript });
        logPrompt('summative', prompt);
        const result = await llmJson({ system: PRUEFER_SYSTEM, prompt, isolate: true });
        logLine('boss-judge', { verdict: result.verdict, model: OPT.model });
        return send(res, 200, { result });
      }
      if (seg === 'dialog/end-session' && req.method === 'POST') {
        const b = await readBody(req);
        // Lernjournal-Summary bei Sitzungsende (Plan #22a), dann Coach-Session verwerfen
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
        requireUnlocked('appeal');
        const prompt = buildAppealPrompt({ question: b.question, rubric: b.rubric, modelAnswer: b.modelAnswer || '', answer: b.answer, appealReason: b.appealReason, sources: b.sources || '' });
        logPrompt('summative', prompt);
        const result = await llmJson({ system: PRUEFER_SYSTEM, prompt, isolate: true });
        logLine('appeal', { verdict: result.verdict, model: OPT.model });
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
        // Lädt das lokale Nutzerprofil aus data/profiles/ (gitignored; Namen sind Nutzersache —
        // KEINE Profilnamen im Code, Git-Historie-Schutz Plan §5.1)
        const dir = join(STORE, 'profiles');
        const files = existsSync(dir) ? (await import('node:fs')).readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
        if (files.length) return send(res, 200, readFileSync(join(dir, files[0]), 'utf-8'), 'application/json; charset=utf-8');
        return send(res, 404, { error: 'kein Profil' });
      }
      return send(res, 404, { error: 'unknown endpoint' });
    }

    // ---------- Static (nur GET; Webroot + assets/ + content/ read-only) ----------
    if (req.method !== 'GET') return send(res, 405, { error: 'method' });
    let fp;
    if (path.startsWith('/assets/') || path.startsWith('/content/')) fp = join(ROOT, normalize(path).replace(/^([/\\])+/, ''));
    else fp = join(resolve(OPT.webroot), normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, ''));
    const allowedRoots = [resolve(OPT.webroot), join(ROOT, 'assets'), join(ROOT, 'content'), join(ROOT, 'app')];
    if (path.startsWith('/app/')) fp = join(ROOT, normalize(path).replace(/^([/\\])+/, ''));
    if (!allowedRoots.some(r => resolve(fp).startsWith(r + '/') || resolve(fp) === r)) return send(res, 403, { error: 'path' });
    if (!existsSync(fp) || !statSync(fp).isFile()) return send(res, 404, { error: 'not found' });
    let data = readFileSync(fp);
    if (path === '/' || path.endsWith('index.html')) {
      data = Buffer.from(data.toString('utf-8').replace('__BRIDGE_TOKEN__', TOKEN)); // Token-Injektion
    }
    return send(res, 200, data, MIME[extname(fp)] || 'application/octet-stream');
  } catch (e) {
    const code = e.code === 'TOO_LARGE' ? 413 : e.code === 'BAD_JSON' ? 400 : e.code === 'QUEUE_FULL' ? 429 : e.code === 'NO_LLM' ? 503 : e.code === 'GOLDSET_LOCK' ? 423 : 500;
    logLine('error', { code: e.code || 'ERR', msg: String(e.message).slice(0, 200) });
    return send(res, code, { error: e.code || 'internal', message: String(e.message).slice(0, 200) });
  }
});

server.requestTimeout = 300000;
server.listen(OPT.port, '127.0.0.1', () => {
  const port = server.address().port;
  console.log(`AI-Act-Akademie Bridge — http://127.0.0.1:${port}/?token=${TOKEN}`);
  console.log(`CLIs erkannt: ${Object.keys(CLIS).join(', ') || 'keine'} · aktiv: ${ACTIVE_CLI || 'KEIN LLM'} · Modell: ${ACTIVE_CLI ? OPT.model : '-'}`);
  console.log(`Store: ${STORE} · Webroot: ${resolve(OPT.webroot)}`);
});
