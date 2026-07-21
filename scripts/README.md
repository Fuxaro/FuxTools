# scripts/

Build-Hilfsskripte für FuxTools – nicht Teil des eigentlichen Userscripts, laufen nur bei uns
lokal bzw. bei der Vorbereitung eines main/Stable-Releases.

## strip-comments.js

Entfernt alle internen Erklär-Kommentare aus `fuxtools.user.js` (unsere Entwickler-Notizen zu
"warum ist das so gelöst") – der Pflicht-UserScript-Header (`@version`, `@match`, ...) und der
Lizenztext direkt danach bleiben unangetastet, sonst würde Tampermonkey das Script nicht mehr
erkennen bzw. der Lizenzhinweis würde verschwinden.

**Wichtig:** überschreibt NIE `fuxtools.user.js` selbst (dagegen gibt es eine Sicherung im
Skript) – `beta` bleibt immer die vollständig kommentierte "Master"-Version. Das Skript wird nur
gezielt eingesetzt, wenn ein neuer main/Stable-Release vorbereitet wird.

### Einmalig einrichten

```bash
npm install
```

### Nutzung

```bash
node scripts/strip-comments.js fuxtools.user.js.main
```

Erzeugt eine kommentarfreie Kopie unter dem angegebenen Pfad. Danach: Ergebnis kurz
gegenprüfen (`node -c <Datei>` für einen Syntax-Check reicht als Minimum), dann gezielt als
Inhalt von `fuxtools.user.js` auf dem `main`-Branch committen – inklusive der dort nötigen
Anpassungen (`CHANNEL` auf `"stable"`, `@updateURL`/`@downloadURL` auf `main`, siehe bisherige
main-Releases), die dieses Skript bewusst NICHT automatisch übernimmt.
