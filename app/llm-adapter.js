// app/llm-adapter.js — ONE model interface for the whole application.
// The ONLY browser transport is the local bridge, and the bridge reaches models
// EXCLUSIVELY through the subscription sign-in of the CLIs (claude, codex).
// API keys are not supported anywhere in this product.
//
// Frontier gate: only frontier models from Anthropic (Claude) and OpenAI (ChatGPT)
// are supported. An unsupported model hard-locks every summative function.


export const FRONTIER_PATTERNS = [
  /^claude-(opus|sonnet|fable|mythos)/i,   // Anthropic-Frontier-Klassen
  /^(gpt-[45]|gpt-\d{2,}|o[3-9])/i,        // OpenAI-Frontier-Klassen
  /^codex/i,                                // ChatGPT-Abo via codex-CLI
];

export function isFrontierModel(model) {
  return typeof model === 'string' && FRONTIER_PATTERNS.some(re => re.test(model.trim()));
}

// API prefix, derived relative to the document.
//
// The application is served from very different places: directly by the bridge at
// "/", or by an arbitrary web server under an arbitrary sub-path. A hard-wired path
// would therefore be correct in exactly one installation.
// Instead the directory of the running page is taken as the base and "api/" appended.
// That holds in both operating modes without the application needing to know where
// it lives. When running behind a web server, that server must forward <base>/api/
// Bridge weiterreichen (siehe README, Abschnitt Betrieb).
export function apiPrefix(baseUrl = '') {
  if (baseUrl) return baseUrl.replace(/\/+$/, '') + '/api/';
  return new URL('api/', document.baseURI).pathname;
}

export class LlmAdapter {
  constructor({ baseUrl = '', token = window.BRIDGE_TOKEN } = {}) {
    this.baseUrl = baseUrl;          // '' = same-origin (Bridge served die App)
    this.token = token;
    this.health = null;              // letzter /health-Stand
    this.gate = { checked: false, frontier: false, reason: 'noch nicht geprüft' };
  }

  async #call(path, { method = 'GET', body = null, timeoutMs = 240000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(apiPrefix(this.baseUrl) + path, {
        method,
        headers: { 'X-Bridge-Token': this.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : null,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || data.error || ('HTTP ' + res.status)), { status: res.status, code: data.error });
      return data;
    } finally { clearTimeout(t); }
  }

  async refreshHealth() { this.health = await this.#call('health'); return this.health; }

  // Frontier gate: check the model class. The result drives the exam lock.
  evaluateGate() {
    const h = this.health;
    if (!h || !h.llm) this.gate = { checked: true, frontier: false, reason: 'kein LLM verbunden' };
    else if (!isFrontierModel(h.model)) this.gate = { checked: true, frontier: false, reason: `Modell „${h.model}" wird nicht unterstützt — nur Claude/ChatGPT-Frontier-Modelle (docs/INTENDED-PURPOSE.md)` };
    else this.gate = { checked: true, frontier: true, reason: 'unterstütztes Frontier-Modell: ' + h.model };
    return this.gate;
  }

  get summativeAllowed() { return this.gate.checked && this.gate.frontier; }

  #requireGate() {
    if (!this.summativeAllowed) {
      throw Object.assign(new Error('Prüfungen gesperrt: ' + this.gate.reason), { code: 'FRONTIER_GATE' });
    }
  }

  // --- Summative Wege (Gate-pflichtig) ---
  async grade(payload)      { this.#requireGate(); return this.#call('grade', { method: 'POST', body: payload }); }
  async gradeRetry(txId)    { this.#requireGate(); return this.#call('grade/retry', { method: 'POST', body: { txId } }); }
  async judgeBoss(payload)  { this.#requireGate(); return this.#call('dialog/judge', { method: 'POST', body: payload }); }
  async appeal(payload)     { this.#requireGate(); return this.#call('appeal', { method: 'POST', body: payload }); }

  // --- formative paths (these run as long as any CLI is connected) ---
  async coach(payload)      { return this.#call('dialog', { method: 'POST', body: { mode: 'coach', ...payload } }); }
  async boss(payload)       { return this.#call('dialog', { method: 'POST', body: { mode: 'boss', ...payload } }); }
  async endSession(day)     { return this.#call('dialog/end-session', { method: 'POST', body: { day } }); }
  async generate(payload)   { return this.#call('generate', { method: 'POST', body: payload }); }
  async personalize(payload) { return this.#call('personalize', { method: 'POST', body: payload }); }
  async diagnose(payload)   { return this.#call('diagnose', { method: 'POST', body: payload }); }
  async authCheck()         { return this.#call('auth-check', { timeoutMs: 120000 }); }
}
