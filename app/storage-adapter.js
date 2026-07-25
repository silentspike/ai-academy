// app/storage-adapter.js — EIN Storage-Interface, zwei Backends (Plan §6.2, #38):
//   bridge-store:  Jans Betrieb — Persistenz serverseitig in data/ (atomar, Snapper-gesichert)
//   localStorage:  Share-Betrieb — plus JSON-Export/Import als Safari-Sicherheitsnetz (§5.5)
// Die Engine spricht NUR dieses Interface; Backend-Wahl trifft der Self-Check.

import { apiPrefix } from './llm-adapter.js';
const LS_PREFIX = 'ai-act-akademie:';

class LocalStorageBackend {
  async get(key, dflt) {
    try { const v = localStorage.getItem(LS_PREFIX + key); return v === null ? dflt : JSON.parse(v); }
    catch { return dflt; }
  }
  async set(key, value) { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); }
  async exportAll() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(LS_PREFIX)) data[k.slice(LS_PREFIX.length)] = JSON.parse(localStorage.getItem(k));
    }
    return { exportedAt: new Date().toISOString(), warning: 'Enthält persönliche Lerndaten.', backend: 'localStorage', data };
  }
  async importAll(bundle) {
    if (!bundle || typeof bundle.data !== 'object') throw new Error('ungültiges Export-Format');
    for (const [k, v] of Object.entries(bundle.data)) localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
  }
  async wipe() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LS_PREFIX)) keys.push(k); }
    keys.forEach(k => localStorage.removeItem(k));
  }
}

class BridgeStoreBackend {
  constructor({ token = window.BRIDGE_TOKEN } = {}) { this.token = token; this.cache = {}; }
  async #call(path, method = 'GET', body = null) {
    const res = await fetch(apiPrefix() + path, {
      method, headers: { 'X-Bridge-Token': this.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) throw new Error('store ' + path + ': HTTP ' + res.status);
    return res.json();
  }
  // Bridge kennt benannte Dokumente (progress/notes); generische Keys leben im progress-Dokument.
  async get(key, dflt) {
    if (key === 'notes') return await this.#call('notes').catch(() => dflt);
    const doc = await this.#call('progress').catch(() => ({}));
    return key === 'progress' ? (Object.keys(doc).length ? doc : dflt) : (key in doc ? doc[key] : dflt);
  }
  async set(key, value) {
    if (key === 'notes') return void await this.#call('notes', 'PUT', value);
    const doc = await this.#call('progress').catch(() => ({}));
    if (key === 'progress') return void await this.#call('progress', 'PUT', value);
    doc[key] = value;
    await this.#call('progress', 'PUT', doc);
  }
  async exportAll() { return this.#call('export'); }
  async importAll(bundle) {
    if (!bundle?.data) throw new Error('ungültiges Export-Format');
    if (bundle.data.progress) await this.#call('progress', 'PUT', bundle.data.progress);
    if (bundle.data.notes) await this.#call('notes', 'PUT', bundle.data.notes);
  }
  async wipe() { await this.#call('progress', 'PUT', {}); await this.#call('notes', 'PUT', {}); }
}

export class StorageAdapter {
  constructor(backend) { this.backend = backend; }
  static localStorage() { return new StorageAdapter(new LocalStorageBackend()); }
  static bridgeStore(opts) { return new StorageAdapter(new BridgeStoreBackend(opts)); }
  get(k, d) { return this.backend.get(k, d); }
  set(k, v) { return this.backend.set(k, v); }
  exportAll() { return this.backend.exportAll(); }
  importAll(b) { return this.backend.importAll(b); }
  wipe() { return this.backend.wipe(); }

  downloadExport(bundle, filename = 'ai-act-akademie-export.json') {
    const blob = new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  }
}
