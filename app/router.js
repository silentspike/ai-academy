// app/router.js — minimaler Hash-Router-Kern (aus app.js extrahiert, Task 9):
// eigenes Modul, damit Routen-Module (exam.js …) ohne Import-Zyklus registrieren können.
export const routes = new Map();
export function route(path, render) { routes.set(path, render); }
