# Changelog

Kurzer Überblick über die wichtigsten Neuerungen von FuxTools.

## Beta

- **Wachen-Bauplaner**: eigene Baupläne pro Gebäudetyp (Ausbauten, Fahrzeuge, benötigtes
  Personal wird automatisch berechnet) - zeigt automatisch Soll/Ist je Wache, kann fehlende
  Ausbauten/Fahrzeuge direkt kaufen und überzählige Fahrzeuge verkaufen. Feuerwehr-
  Fahrzeugliste nach Kategorien gruppiert (wie die "Fahrzeug kaufen"-Seite im Spiel), Mini-
  Übersicht "Deine Wachen" zeigt vorab, wie viele Wachen es je Gebäudetyp gibt.
- **Fahrzeug-Besatzung**: prüft und weist automatisch passend ausgebildetes Personal zu (auch
  für normale Fahrzeuge ohne Sonderausbildung), wahlweise Minimum- oder Vollbesatzung, mit
  Leitstellen-Auswahl vorab. Liste nicht vollständig besetzter Fahrzeuge mit Zeitstempel,
  Abbrechen-Button für lange Durchläufe. "Alle Zuweisungen rückgängig machen" zieht mit
  Bestätigung die komplette Besatzung eines gewählten Bereichs ab.
- **Personal-Check & Schulungen**: zeigt fehlendes Ausbildungspersonal je Wache - Bedarf kommt
  automatisch aus den aktiven Wachen-Bauplänen - und startet fehlende Lehrgänge automatisch.
- **Statistik**: Wachen je Gebäudetyp, gruppiert nach Leitstelle, mit Fahrzeug- und
  Personalzahlen je Gruppe und insgesamt.
- **Wachenausbau**: Übersicht mit Ausbauten, Personal und Werbestatus, direktes Bauen -
  manueller "Aktualisieren"-Button mit Zeitstempel.
- Einheitliches Design für alle Bildschirme mit Breadcrumb-Navigation und eigenen
  Bestätigungs-Screens (statt Browser-Standarddialogen), eigener FuxTools-Eintrag direkt in
  der Navigationsleiste.
- Einstellungen lassen sich als Datei sichern und wiederherstellen (z. B. vor einer
  Neuinstallation). Kritische Fehler werden direkt auf der Seite angezeigt und landen
  zusätzlich in einem einsehbaren Fehlerprotokoll (Export als Datei möglich).
- Netzwerk-Anfragen haben jetzt ein Zeitlimit (20s) statt bei einer hängenden Verbindung
  unbegrenzt zu blockieren.
- **Wachen-Bauplaner "Anwenden"**: nach einem Kauf/Verkauf zeigt das Spiel die neue Anzahl
  teils erst nach bis zu einer Minute - der Screen merkt sich Käufe/Verkäufe jetzt vorläufig
  vor (Uhr-Symbol als Hinweis) und gleicht das automatisch mit dem echten Stand ab, sobald die
  Änderung im Spiel sichtbar ist. Funktioniert auch bei mehreren gleichzeitigen Käufen/
  Verkäufen an verschiedenen Wachen/Fahrzeugtypen.
- **Wachen-Bauplaner**: "Benötigtes Personal" zeigt jetzt Min./Max.-Spalten statt einer
  einzelnen Zahl, inkl. Fahrzeugtypen wie Dekon-P, die vorher trotz eigener Ausbildungsanforderung
  komplett fehlten (betraf auch Personal-Check & Schulungen).
- **Fahrzeug-Besatzung**: neuer Schalter "Nur ungeschultes Personal zuweisen" - bei Fahrzeugen
  ohne eigene Ausbildungsanforderung (z.B. GruKw bei BePol/THW/SEG) werden Spezialisten wie
  Notarzt nie mehr verbraucht (lieber ein Platz leer). Echte Ausbildungspflichten (z.B.
  Notarzt auf NAW) bleiben davon unberührt. Optionen jetzt als Buttons statt Checkboxen,
  Erklärungen als Tooltip statt Fließtext.
- **Wachen umbenennen**: Liste jetzt nach Wachen-ID statt Name sortiert, für eine vom aktuellen
  Namen unabhängige, stabile Reihenfolge.
- **Wachen-Bauplaner**: Feuerwehr-Fahrzeugkategorien sind jetzt auf-/zuklappbar statt alle auf
  einmal offen.
- Lang laufende Aktionen (Umbenennen/Zurücksetzen, Fahrzeug-Besatzung) laufen jetzt im
  Hintergrund weiter, wenn das Fenster geschlossen wird - ein Symbol direkt am
  FuxTools-Menüpunkt zeigt den Fortschritt (blinkt grün bei Fertigstellung), erneutes Öffnen
  zeigt wieder den laufenden/fertigen Task. Ein währenddessen gestarteter zweiter Task landet
  in einer Warteschlange, statt parallel zu laufen.

## Stable (v0.5.1)

- **Umbenennen**: Fahrzeuge, Wachen und Leitstellen mit frei einstellbaren
  Namens-Bausteinen, inkl. Live-Vorschau und Bestätigung vor dem Ausführen.
- **Wachenausbau**: Übersicht aller Wachen mit Ausbauten, Personal und Werbestatus -
  Ausbauten, Ausbaustufen und Lagerräume direkt aus der Liste bauen.
- **Verlauf**: alle über FuxTools durchgeführten Aktionen mit Datum und Kosten.
- Automatischer Update-Check, Stable- und Beta-Kanal wählbar.
