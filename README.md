<p align="center">
  <img src="./logo.png" alt="FuxTools Logo" width="220">
</p>

# FuxTools

Willkommen bei FuxTools – meinem ersten Script für [leitstellenspiel.de](https://www.leitstellenspiel.de)!

Ein Tampermonkey-Script zur Wachen- und Fahrzeugverwaltung: Fahrzeuge einer oder mehrerer Wachen
automatisch und durchnummeriert umbenennen – oder wieder auf den reinen Fahrzeugtyp-Namen
zurücksetzen. Läuft komplett über die bestehende Spiel-Session, kein API-Key nötig.

## Aktuelle Funktionen

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

Neuerungen landen zuerst auf dem `beta`-Branch und erst danach auf `main` (stabil). Unter
**Einstellungen** im Script zeigt ein Button "Zu Beta wechseln" den aktuellen Kanal an und lässt
dich jederzeit umschalten: Klick öffnet den Code des jeweils anderen Kanals in einem neuen Tab,
Tampermonkey erkennt es (gleicher Script-Name) als Update und fragt einmal zur Bestätigung. Ab
dann läuft der neue Kanal inklusive Auto-Update, bis du im selben Menü wieder zurückwechselst –
keine separate Installation nötig.

## Changelog

Siehe [CHANGELOG.md](./CHANGELOG.md).

## Copyright

**© Fuxaro.** Lizenziert unter [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
– siehe [LICENSE](./LICENSE) für Details. Kurz gesagt: nutzen, verändern und weitergeben erlaubt,
solange Fuxaro als Urheber genannt wird, es nicht verkauft wird und veränderte Versionen unter
derselben Lizenz weitergegeben werden.
