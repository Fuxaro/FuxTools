<p align="center">
  <img src="./logo.png" alt="FuxTools Logo" width="220">
</p>

# FuxTools

Willkommen bei FuxTools – meinem ersten Script für [leitstellenspiel.de](https://www.leitstellenspiel.de)!

Ein Tampermonkey-Script zur Wachen- und Fahrzeugverwaltung: Fahrzeuge, Wachen und Leitstellen
automatisch umbenennen, den Ausbau-Stand aller Wachen auf einen Blick prüfen und Ausbauten direkt
aus dem Script heraus bauen. Läuft komplett über die bestehende Spiel-Session, kein API-Key nötig.

## Aktuelle Funktionen

**Fahrzeuge**
- Leitstelle(n) und Wache(n) gezielt auswählen (nach Kategorie sortiert: Feuerwehr,
  Rettungsdienst, Polizei, THW, Seenotrettung, Sonstiges).
- **Fahrzeuge umbenennen** mit frei kombinierbaren Namens-Bausteinen: Text 1 → Fahrzeugtyp-Name →
  Text 2 → Nummer. Jeder Baustein einzeln an-/abschaltbar; Text 1/Text 2 gelten global für alle
  ausgewählten Fahrzeugtypen, Start-Nummer und führende Nullen frei wählbar. Die Bausteine-Vorlage
  lässt sich jederzeit per Klick auf die Standardeinstellung zurücksetzen.
- **Fahrzeugnamen zurücksetzen**: alle Fahrzeuge einer Auswahl auf ihren reinen Fahrzeugtyp-Namen
  zurücksetzen.
- Einmal vergebene Namen und Bausteine werden gespeichert und beim nächsten Mal vorausgefüllt.
- Auch für sehr große Accounts ausgelegt: Fahrzeuge werden seitenweise geladen und mehrere
  gleichzeitig statt strikt nacheinander umbenannt.

**Wachen & Leitstellen**
- Wachen und Leitstellen selbst umbenennen.
- **Wachen-Check**: Tabelle aller Wachen mit Suchfeld und Filter nach Gebäudetyp, zeigt je Wache
  Personal, automatisches Werben, Ausbauten (farbig nach Status), Ausbaustufe und Lagerräume.
- Fehlende Ausbauten, Lagerräume und die nächste (oder direkt die höchste) Ausbaustufe lassen sich
  mit echten Namen und Kosten direkt aus der Tabelle heraus bauen – Credits oder Coins, du
  entscheidest bei jeder Aktion selbst.
- Welche Ausbauten je Gebäudetyp als "gefordert" gelten, lässt sich in den Einstellungen anpassen
  (mit Reset auf die Standard-Empfehlungen).
- **Personal-Check**: prüft je Wache, ob genug Personal mit bestimmten Ausbildungen vorhanden ist
  (z. B. ELW-2-Fahrer). Scan gezielt pro Kategorie startbar, Ergebnisse bleiben bis zum nächsten
  Scan gespeichert. Soll-Anzahl je Ausbildung und Gebäudetyp in den Einstellungen anpassbar.

**Sonstiges**
- **Verlauf**: Liste aller über FuxTools durchgeführten Aktionen (gebaute Ausbauten/Lagerräume/
  Ausbaustufen mit Kosten, zusammengefasste Umbenennen-Läufe) mit Datum, Uhrzeit und
  Script-Version – nur lokal gespeichert.
- Einstellungen: Kanal-Info, manueller Update-Check, Kanal wechseln (Stable/Beta), Speicher
  löschen (setzt FuxTools auf den Zustand einer Neuinstallation zurück).

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
