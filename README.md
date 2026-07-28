<p align="center">
  <img src="./logo.png" alt="FuxTools Logo" width="220">
</p>

# FuxTools

Willkommen bei FuxTools

Ein Script zur Wachen-, Fahrzeug- und Personalverwaltung: Fahrzeuge/Wachen/Leitstellen
umbenennen, Ausbauten direkt bauen, Fahrzeuge automatisch mit passend ausgebildetem Personal
besetzen, Wachen-Baupläne mit automatischer Personal-Bedarfsrechnung anlegen und fehlende
Lehrgänge direkt starten.

## Aktuelle Funktionen

**Fahrzeuge**
- Leitstelle(n)/Wache(n) gezielt auswählen, nach Kategorie sortiert.
- Umbenennen mit frei kombinierbaren Namens-Bausteinen (Text/Fahrzeugtyp-Name/Text/Nummer) oder
  zurücksetzen auf den reinen Fahrzeugtyp-Namen. Auch für große Accounts ausgelegt (seitenweises
  Laden, mehrere Fahrzeuge gleichzeitig).

**Wachen & Leitstellen**
- Wachen/Leitstellen umbenennen, mit Suchfeld und Sortierung nach ID oder Name; Wachenname
  verlinkt direkt zur Wache im Spiel.
- **Wachenausbau**: Personal, Werbung, Ausbauten/Ausbaustufen/Lagerräume je Wache, direkt aus der
  Tabelle heraus baubar (Credits oder Coins, du entscheidest) - mit Leitstellen- und
  Gebäudetyp-Filter.

**Wachen-Bauplaner & Wachen-Check**
- Eigene Baupläne je Gebäudetyp (Ausbauten, Fahrzeuge) – benötigtes Personal wird automatisch
  daraus berechnet. Beliebig viele Baupläne je Gebäudetyp möglich, z. B. für unterschiedlich
  ausgebaute Wachen-Gruppen.
- **Wachen-Check**: Bauplan wählen, dann die betroffenen Wachen (gruppiert nach Leitstelle, mit
  Suche und "alle auswählen" je Leitstelle - die Auswahl wird je Bauplan gemerkt). Zeigt danach
  Soll/Ist je Wache für Ausbauten, Fahrzeuge und Personal (inkl. Gesamtübersicht), kann fehlende
  Ausbauten/Fahrzeuge direkt kaufen und überzählige Fahrzeuge verkaufen.

**Schulungen**
- Gleicher Auswahl-Assistent wie Wachen-Check (Bauplan, dann Wachen) - zeigt fehlendes
  Ausbildungspersonal und startet Lehrgänge direkt (Minimum oder Maximum), berücksichtigt bereits
  laufende Lehrgänge.

**Fahrzeug-Besatzung**
- Weist automatisch passend ausgebildetes Personal zu (z. B. Notarzt), wahlweise Minimum- oder
  Vollbesatzung, auch für normale Fahrzeuge ohne eigene Ausbildungsanforderung.
- Einstellbar: nur ergänzen oder auch überzähliges Personal entfernen, nur ungeschultes Personal
  für Fahrzeuge ohne Anforderung, FMS-Status automatisch setzen oder unangetastet lassen.
- "Alle Zuweisungen rückgängig machen" für eine gewählte Leitstellen-Auswahl.

**Sonstiges**
- **Statistik**: Wachen je Gebäudetyp und Leitstelle mit Fahrzeug- und Personalzahlen.
- **Verlauf**: alle über FuxTools durchgeführten Aktionen mit Datum, Kosten und Status, sortierbar.
- Lang laufende Aktionen laufen im Hintergrund weiter, auch bei geschlossenem Fenster – eigenes
  Task-Center zeigt Fortschritt und laufende Lehrgänge.
- Einstellungen: Update-Check, Kanal wechseln (Stable/Beta), Fehlerprotokoll, Sichern/
  Wiederherstellen, Speicher löschen.

## Installation

1. [Tampermonkey](https://www.tampermonkey.net/) installieren (falls noch nicht vorhanden).
2. Auf **`fuxtools.user.js`** in diesem Repo klicken → "Raw" öffnen.
3. Tampermonkey erkennt die Datei automatisch und bietet die Installation an.
4. Seite neu laden → Eintrag **"FuxTools"** erscheint in der Navigation.

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

## Datenschutz

FuxTools läuft komplett lokal in deinem Browser und sendet keine Daten an Server von Fuxaro
oder sonstige Dritte:

- **leitstellenspiel.de**: alle Aktionen (Umbenennen, Bauen, Fahrzeuge kaufen/verkaufen, Personal
  zuweisen, ...) laufen über deine bestehende, eingeloggte Spiel-Session.
- **api.lss-manager.de**: liefert nur den öffentlichen Fahrzeug-Katalog (Namen,
  Ausbildungsanforderungen) – es werden keine Daten an diese Seite gesendet, nur abgerufen.
- **raw.githubusercontent.com** (dieses Repo): für den automatischen Update-Check, den
  Changelog-Button in den Einstellungen und als Notfall-Fallback für den Fahrzeug-Katalog –
  ebenfalls nur Abruf, kein Versand.

Alle Einstellungen, Namen und der Verlauf werden ausschließlich lokal über den
Tampermonkey-eigenen Speicher (`GM.setValue`/`GM.getValue`) gespeichert – kein Tracking, keine
Analytics, keine Weitergabe an Dritte.

## Copyright

**© Fuxaro.** Lizenziert unter [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
– siehe [LICENSE](./LICENSE) für Details. Kurz gesagt: nutzen, verändern und weitergeben erlaubt,
solange Fuxaro als Urheber genannt wird, es nicht verkauft wird und veränderte Versionen unter
derselben Lizenz weitergegeben werden.

## Credits

Der Fahrzeug-Katalog (Namen, Ausbildungsanforderungen) stammt von
[lss-manager.de](https://www.lss-manager.de) – danke an das Team dafür!

FuxTools ist komplett eigener Code (kein übernommener Quelltext). Bei ein paar Konzepten haben
folgende Community-Skripte für leitstellenspiel.de als Inspiration gedient:

| Skript | Autor | Lizenz | Übernommenes Konzept |
|---|---|---|---|
| Gebäude- & Fuhrparkverwalter | BOS-Ernie & Thomas Felber | BSD-3-Clause | Farbbedeutung der Ausbau-Badges (grün/blau/orange/grau) + empfohlene Ausbauten je Gebäudetyp als Richtwert |
| Personalzuweiser | BOS-Ernie | BSD-3-Clause | Ablauf/Spaltenaufbau der Zuweisungsseite bei der Fahrzeug-Besatzung |
| FMS6 | LaLeLu4153 | nur `@copyright` angegeben | FMS-Status-Ablauf bei der Fahrzeug-Besatzung |
| Wachenbaupläne | BOS-Ernie | BSD-3-Clause | Bauplan-Konzept + Verfügbar/Zugewiesen-Auswahl für Ausbauten beim Wachen-Bauplaner |

In allen Fällen wurde nur das Konzept/Verhalten übernommen, nicht der Quelltext – eigene, komplett
unabhängige Umsetzung mit anderem Code, anderer Struktur.
