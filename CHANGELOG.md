# Changelog

**Versionierungsregel (0.x-Phase):** letzte Ziffer (Patch, z. B. `0.1.1` → `0.1.2`) für kleine
Anpassungen/Bugfixes. Die mittlere Ziffer (Minor, `0.x.0`) wird nur für echte neue Funktionen
hochgezählt – **und nur nach Rücksprache**, d. h. bevor z. B. auf `0.2.0` hochgegangen wird, wird
das vorher abgestimmt. Der Sprung auf `1.0.0` markiert den ersten stabilen Release und wird
ebenfalls erst nach Absprache gesetzt.

Bei jeder Änderung, die live gehen soll: `@version` im Script hochzählen und pushen. Ohne
Versionserhöhung erkennt Tampermonkey kein Update.

- **0.3.4**
  - Wachen-Check: Spaltenüberschriften (Personal, Automat. Werben, Ausbauten) sind jetzt
    anklickbar zum Sortieren, "Wache" springt zurück zur Kategorie-Gruppierung.
  - Wortwahl geschärft: orange markierte Ausbauten heißen jetzt "optional" statt
    "empfohlen" (sie stehen auf einer Empfehlungs-Liste, sind aber nicht verpflichtend).
- **0.3.3**
  - Fix: Kategorie-Überschriften im Wachen-Check waren im dunklen Theme kaum lesbar
    (fest einprogrammierter heller Hintergrund) - nutzt jetzt eine Bootstrap-Klasse,
    die sich ans Theme der Seite anpasst.
- **0.3.2**
  - Neuer Menüpunkt "Wachen-Check": Tabelle mit allen Wachen (nach Kategorie sortiert,
    mit Suchfeld), zeigt je Wache empfohlene Ausbauten als farbige Badges (grün =
    vorhanden, blau = im Bau, orange = empfohlen aber noch nicht gebaut, grau = nicht
    empfohlen) inkl. Name als Tooltip beim Draufhalten, außerdem aktuelles Personal und
    ob automatisches Werben aktiv ist. Bauen von Ausbauten kostet Spielgeld und bleibt
    daher ein manueller Klick zur Wache.
  - Fenster ist jetzt etwas breiter, damit vor allem die Wachen-Check-Tabelle besser
    lesbar ist.
  - Fix: Gebäudetyp-Kategorisierung korrigiert (fehlender Gebäudetyp verschob seither
    einige IDs, u.a. war Autobahnpolizei fälschlich bei "Seenotrettung" einsortiert).
- **0.2.3**
  - Fix: Nach dem Umbenennen von Wachen/Leitstellen führte "Zurück" fälschlich zum
    Hauptmenü statt zurück ins Namen-Menü.
- **0.2.2**
  - Fix: Wachen/Leitstellen umbenennen hat den neuen Namen nicht gespeichert (falsches
    Formularfeld). Behoben.
  - Fix: Krankenhäuser landeten fälschlich in der Kategorie "Sonstiges" – haben jetzt eine
    eigene Kategorie.
- **0.2.1**
  - Internes Aufräumen: Skript in klar benannte Abschnitte gegliedert (Konfiguration,
    Speicher, Umbenennen-Engine, Bildschirme je Funktion) – keine funktionalen
    Änderungen an bestehenden Funktionen.
  - Wachen/Leitstellen umbenennen: zuverlässigerer Weg zum Speichern des neuen Namens.
- **0.2.0**
  - Fahrzeuge umbenennen: ein einheitlicher Bildschirm statt getrennter Modi. Namens-Bausteine
    (Text 1 → Fahrzeugtyp-Name → Text 2 → Nummer) sind einzeln zu-/abschaltbar, jeder Fahrzeugtyp
    per Häkchen wählbar. Für freie, manuelle Namen einfach Text 1/Text 2 deaktivieren.
  - Live-Vorschau beim Einrichten sowie ein Bestätigungsschritt vor dem eigentlichen Umbenennen.
  - Fortschrittsbalken mit Abbrechen-Button; Schließen des Fensters bricht eine laufende
    Umbenennung ebenfalls sauber ab.
  - Einstellungen erweitert: "Neuinstallation erzwingen" (Update ohne Versionssprung testen),
    "Speicher löschen" (setzt FuxTools auf den Zustand einer Neuinstallation zurück).
  - Gespeicherte Namen/Einstellungen laufen jetzt über den Tampermonkey-eigenen Speicher statt
    über die Website – bleiben dadurch auch domainübergreifend (www./polizei.) erhalten.
- **0.1.4** – Neuer Menüpunkt "Einstellungen": Anzeige von Version/Kanal (Stable/Beta), manueller
  "Nach Updates suchen"-Button, sowie ein Button zum Umschalten zwischen Stable- und Beta-Kanal
  (Tampermonkey fragt dabei einmal zur Bestätigung, danach läuft der gewählte Kanal inkl.
  Auto-Update). Neuerungen landen ab jetzt zuerst auf dem `beta`-Branch, bevor sie auf `main`
  übernommen werden.
- **0.1.3** – Namens-Bausteine beim Umbenennen: Text 1, Fahrzeugtyp-Name, Text 2 und Nummer sind
  jetzt einzeln zu- und abschaltbar; Text 1/Text 2 gelten global für alle ausgewählten Fahrzeugtypen.
- **0.1.2** – Wartungs-Release, keine funktionalen Änderungen.
- **0.1.1 (Public Release)** –
