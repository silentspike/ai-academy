// app/llm-adapter.js — EIN LLM-Interface für die gesamte App (Plan §6.2).
// v3.2 + Direktive 2026-07-25: Der EINZIGE Browser-Transport ist die Local
// Bridge, und die Bridge spricht LLMs AUSSCHLIESSLICH über Abo/OAuth der CLIs
// (claude/codex) an — API-Keys werden im gesamten Produkt nicht unterstützt.
//
// Frontier-Gate (Plan §5.4, docs/INTENDED-PURPOSE.md §3): Unterstützt sind nur
// Frontier-Modelle von Anthropic (Claude) und OpenAI (ChatGPT). Nicht
// unterstützte Modelle → harte Sperre aller summativen Funktionen.

export const FRONTIER_PATTERNS = [
  /^claude-(opus|sonnet|fable|mythos)/i,   // Anthropic-Frontier-Klassen
  /^(gpt-[45]|gpt-\d{2,}|o[3-9])/i,        // OpenAI-Frontier-Klassen
  /^codex/i,                                // ChatGPT-Abo via codex-CLI
];

export function isFrontierModel(model) {
  return typeof model === 'string' && FRONTIER_PATTERNS.some(re => re.test(model.trim()));
}

// API-Präfix je Betriebsart (Plan §6.1): Bridge served die App same-origin
// unter /api/; Jans nginx-Betrieb liegt unter /ai-act-training/ und proxyt
// über /ai-act-tutor-api/ → Bridge /api/ (dev-workspaces.conf).
export function apiPrefix(baseUrl = '') {
  if (baseUrl) return baseUrl + '/api/';
  return location.pathname.startsWith('/ai-act-training') ? '/ai-act-tutor-api/' : '/api/';
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

  // Frontier-Gate: Modellklasse prüfen. Ergebnis steuert die Prüfungs-Sperre (#summativeAllowed).
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

  // --- Formative Wege (laufen auch, solange irgendein CLI verbunden ist) ---
  async coach(payload)      { return this.#call('dialog', { method: 'POST', body: { mode: 'coach', ...payload } }); }
  async boss(payload)       { return this.#call('dialog', { method: 'POST', body: { mode: 'boss', ...payload } }); }
  async endSession(day)     { return this.#call('dialog/end-session', { method: 'POST', body: { day } }); }
  async generate(payload)   { return this.#call('generate', { method: 'POST', body: payload }); }
  async personalize(payload) { return this.#call('personalize', { method: 'POST', body: payload }); }
  async diagnose(payload)   { return this.#call('diagnose', { method: 'POST', body: payload }); }
  async authCheck()         { return this.#call('auth-check', { timeoutMs: 120000 }); }
}
