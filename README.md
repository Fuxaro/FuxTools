# FuxTools

**© Fuxaro.** Lizenziert unter [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
– siehe [LICENSE](./LICENSE) für Details. Kurz gesagt: nutzen, verändern und weitergeben erlaubt,
solange Fuxaro als Urheber genannt wird, es nicht verkauft wird und veränderte Versionen unter
derselben Lizenz weitergegeben werden.

Tampermonkey-Script für [leitstellenspiel.de](https://www.leitstellenspiel.de): Fahrzeuge einer
oder mehrerer Wachen automatisch und durchnummeriert umbenennen – oder wieder auf den reinen
Fahrzeugtyp-Namen zurücksetzen. Läuft komplett über die bestehende Spiel-Session, kein API-Key
nötig.

## Features

- Leitstelle(n) und Wache(n) gezielt auswählen (nach Kategorie sortiert: Feuerwehr,
  Rettungsdienst, Polizei, THW, Seenotrettung, Sonstiges).
- **Fahrzeuge umbenennen** mit frei kombinierbaren Namens-Bausteinen: Text 1 → Fahrzeugtyp-Name →
  Text 2 → Nummer. Jeder Baustein einzeln an-/abschaltbar; Text 1/Text 2 gelten global für alle
  ausgewählten Fahrzeugtypen, Start-Nummer und führende Nullen frei wählbar.
- **Zurücksetzen** aller Fahrzeuge einer Auswahl auf ihren reinen Fahrzeugtyp-Namen.
- Einmal vergebene Namen und Bausteine werden gespeichert und beim nächsten Mal vorausgefüllt.
- Geplant: Wachen und Leitstellen selbst umbenennen.

## Installation

1. [Tampermonkey](https://www.tampermonkey.net/) installieren (falls noch nicht vorhanden).
2. Auf **`fuxtools.user.js`** in diesem Repo klicken → "Raw" öffnen.
3. Tampermonkey erkennt die Datei automatisch und bietet die Installation an.
4. Seite neu laden → Eintrag **"FuxTools"** erscheint in der Navigation neben "AAO".

Das Script prüft automatisch (über `@updateURL`) auf neue Versionen aus diesem Repo –
Tampermonkey zeigt sie unter *Dashboard → Utilities → Nach Updates suchen* an, oder automatisch
im Hintergrund. Im Script selbst gibt es unter **Einstellungen** ebenfalls einen manuellen
"Nach Updates suchen"-Button samt Anzeige der aktuellen Version.

## Beta-Kanal

Für Testzwecke gibt es parallel zur stabilen Version (`main`-Branch) einen `beta`-Branch. Wer
Neuerungen vorab testen möchte, installiert zusätzlich die Beta-Variante über
[`fuxtools.user.js` im `beta`-Branch](https://github.com/Fuxaro/FuxTools/blob/beta/fuxtools.user.js)
(eigener Name/Namespace, läuft parallel zur Stable-Version, ohne sie zu ersetzen). Der
Einstellungen-Bildschirm im Script zeigt an, welcher Kanal (Stable/Beta) gerade installiert ist.

## Changelog

Siehe [CHANGELOG.md](./CHANGELOG.md).
