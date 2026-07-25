// app/router.js — minimal hash router core, extracted from app.js so that
// route modules (exam.js and friends) can register without an import cycle.
export const routes = new Map();
export function route(path, render) { routes.set(path, render); }
