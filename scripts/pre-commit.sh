#!/usr/bin/env bash
# Prüfung vor dem Commit. Einhängen mit:
#   ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
#
# Bewusst ohne zusätzliches Werkzeug: Das Projekt bleibt zur Laufzeit
# abhängigkeitsfrei, und ein Haken, der eine Fremdsprache voraussetzt, widerspräche
# dem. Geprüft wird nur, was in Sekunden geht.
set -u
fehler=0
melde() { echo "  [FEHLER] $1"; fehler=1; }

echo "Prüfung vor dem Commit"

# 1. Syntax aller geänderten JavaScript-Dateien
geaendert=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|mjs)$' || true)
if [ -n "$geaendert" ]; then
  echo "$geaendert" | while read -r f; do
    [ -f "$f" ] && node --check "$f" || true
  done
  echo "$geaendert" | xargs -r -P 8 -I{} node --check {} 2>/dev/null || melde "Syntaxfehler in einer JavaScript-Datei"
fi

# 2. Inhalte nur prüfen, wenn welche geändert wurden
if git diff --cached --name-only | grep -q '^content/'; then
  node tools/validate-content.mjs > /dev/null 2>&1 || melde "Schema-Prüfung der Inhalte fehlgeschlagen"
  node tools/check-questions.mjs > /dev/null 2>&1 || melde "Abgleich der Fragen fehlgeschlagen"
fi

# 3. Hygiene: nichts Internes, keine Zugangsdaten
if git diff --cached --name-only | grep -qE '^(data|legal)/'; then
  melde "data/ oder legal/ soll nicht versioniert werden"
fi
if git diff --cached --name-only | grep -qE '(^|/)\.(env|private-terms)$|\.(key|pem)$'; then
  melde "geheimnisartige Datei im Commit"
fi
if [ -f .private-terms ]; then
  if git diff --cached -U0 | grep -E '^\+' | grep -qiE "$(cat .private-terms)"; then
    melde "geschützter Begriff im Commit (Fundstelle bewusst nicht ausgegeben)"
  fi
fi

[ $fehler -eq 0 ] && echo "  in Ordnung" || echo "  Commit abgebrochen."
exit $fehler
