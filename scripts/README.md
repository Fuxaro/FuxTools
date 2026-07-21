# scripts/

Build-Hilfsskripte für FuxTools – nicht Teil des eigentlichen Userscripts, laufen nur bei uns
lokal bzw. bei der Vorbereitung eines main/Stable-Releases.

## Main-Release auslösen (empfohlener Weg)

GitHub-Repo → Tab **Actions** → Workflow **"Main-Release vorbereiten"** → Button **"Run
workflow"**. Das nimmt automatisch den aktuellen `beta`-Stand, entfernt alle internen
Kommentare und stellt den Kanal auf `stable` um (siehe die zwei Skripte unten) und öffnet
danach einen Pull Request gegen `main` mit dem fertigen Ergebnis – **kein direkter Push**,
der PR-Diff kann erst noch gegengeprüft und dann per Klick gemerged werden. Erst mit dem
Merge ziehen sich Stable-Nutzer die neue Version.

Betrifft nur `fuxtools.user.js` selbst – andere Dateien (README, CHANGELOG, ...) werden davon
nicht angefasst und müssten für einen echten Release ggf. separat aktualisiert werden.

## Die einzelnen Skripte (auch manuell nutzbar)

### strip-comments.js

Entfernt alle internen Erklär-Kommentare aus `fuxtools.user.js` (unsere Entwickler-Notizen zu
"warum ist das so gelöst") – der Pflicht-UserScript-Header (`@version`, `@match`, ...) und der
Lizenztext direkt danach bleiben unangetastet, sonst würde Tampermonkey das Script nicht mehr
erkennen bzw. der Lizenzhinweis würde verschwinden.

**Wichtig:** überschreibt NIE `fuxtools.user.js` selbst (dagegen gibt es eine Sicherung im
Skript) – `beta` bleibt immer die vollständig kommentierte "Master"-Version.

```bash
npm install   # einmalig
node scripts/strip-comments.js fuxtools.user.js.stripped
```

### set-stable-channel.js

Schaltet in einer bereits kommentarfreien Datei `CHANNEL` auf `"stable"` und
`@updateURL`/`@downloadURL` auf den `main`-Branch um – die zwei Stellen, die für main
gegenüber beta immer angepasst werden müssen.

```bash
node scripts/set-stable-channel.js fuxtools.user.js.stripped fuxtools.user.js.main
```

Danach `node -c fuxtools.user.js.main` als minimalen Syntax-Check, dann als Inhalt von
`fuxtools.user.js` auf `main` committen – oder eben einfach die GitHub Action oben nutzen,
die genau diese zwei Schritte automatisch verkettet.
