# Changelog

Kurzer Überblick über die wichtigsten Neuerungen von FuxTools.

## Stable (v0.9.49)

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
