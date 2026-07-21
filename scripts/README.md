# scripts/

Build-Hilfsskripte für FuxTools – nicht Teil des eigentlichen Userscripts, laufen nur bei uns
lokal bzw. bei der Vorbereitung eines main/Stable-Releases.

## Main-Release auslösen (empfohlener Weg)

GitHub-Repo → Tab **Actions** → Workflow **"Main-Release vorbereiten"** → Button **"Run
workflow"**. Das nimmt automatisch den aktuellen `beta`-Stand und bringt ihn komplett auf
main-Stand (siehe die drei Skripte unten), dann öffnet es einen Pull Request gegen `main` mit
dem fertigen Ergebnis – **kein direkter Push**, der PR-Diff kann erst noch gegengeprüft und
dann per Klick gemerged werden. Erst mit dem Merge ziehen sich Stable-Nutzer die neue Version.

Betrifft `fuxtools.user.js` und `CHANGELOG.md`. Andere Dateien (README, Logo, ...) werden davon
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
`@updateURL`/`@downloadURL` auf den `main`-Branch um – die zwei Stellen im Script, die für
main gegenüber beta immer angepasst werden müssen.

```bash
node scripts/set-stable-channel.js fuxtools.user.js.stripped fuxtools.user.js.main
```

### promote-changelog.js

Macht aus dem `## Beta`-Abschnitt der `CHANGELOG.md` den neuen `## Stable (vX.Y.Z)`-Abschnitt
– der alte, jetzt überholte `## Stable (...)`-Abschnitt entfällt dabei (die neue Stable-Version
enthält ja bereits alles, was vorher unter Beta stand).

```bash
node scripts/promote-changelog.js CHANGELOG.md CHANGELOG.md.main 0.9.27
```

Danach `node -c fuxtools.user.js.main` als minimalen Syntax-Check, dann beide Dateien als
Inhalt von `fuxtools.user.js`/`CHANGELOG.md` auf `main` committen – oder eben einfach die
GitHub Action oben nutzen, die genau diese drei Schritte automatisch verkettet.
