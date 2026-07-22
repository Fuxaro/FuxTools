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
- **Wachen-Bauplaner**: Feuerwehr-Kategorien deutlicher als aufklappbar erkennbar (Hintergrund,
  Pfeil-Symbol). "Benötigtes Personal" zeigt zusätzlich Summenzeilen (Geschult/Ungeschult/
  Insgesamt benötigt) direkt in der Tabelle statt als separatem Text.
- **Fahrzeug-Besatzung**: neuer Schalter "Nur ergänzen" / "Vollständig anwenden" - legt fest,
  ob ein Lauf bereits zugewiesenes Personal wieder entfernen darf (z.B. beim Rückbau von
  Voll- auf Minimum-Besatzung), oder nur fehlendes Personal ergänzt und nie etwas antastet.
- Einheitliches Design für aufklappbare Kategorien (blauer Rand, Hintergrund, drehender Pfeil)
  jetzt auch bei Fahrzeuge/Wachen umbenennen, nicht nur im Wachen-Bauplaner.
- **Wachen umbenennen**: jetzt als echte Tabelle (Wachen-ID, Name, Neuer Name als Spalten) -
  Sortierung per Klick auf die Spaltenüberschrift statt separater Buttons. Blaue
  Kategorie-Hervorhebung war durch einen CSS-Konflikt mit dem Seiten-Design unsichtbar, jetzt
  behoben. Umsortieren klappt aufgeklappte Kategorien nicht mehr zu und verwirft auch keine
  bereits eingetippten neuen Namen mehr.
- **Wachen-Bauplaner**: Feuerwehr-Kategorien starten beim Bearbeiten eines bestehenden Bauplans
  jetzt immer eingeklappt, auch wenn schon Fahrzeuge gewählt sind - die Zahl neben dem Namen
  zeigt das schon an.
- "Zurück"-Buttons hatten in jedem Menü keinen Abstand zum Fensterrand - behoben.
- Große "Aktualisieren"/"Scan jetzt starten"-Buttons (Wachenausbau, Personal-Check,
  Schulungen, Wachen-Bauplaner "Anwenden") durch einheitliche kleine Icon-Buttons direkt neben
  dem Zeitstempel ersetzt.
- **Schulungen**: Bugfix - Personal, das bereits eine andere Ausbildung hat oder gerade "Im
  Unterricht"/"Im Einsatz" ist, wird jetzt nicht mehr zusätzlich für einen neuen Lehrgang
  eingeteilt (die bisherige Auswahl kannte nur die eine gerade gesuchte Ausbildung, nicht den
  restlichen Status der Person). Abgleich läuft über die echte Personal-ID statt über den Namen.
- **Fahrzeug-Besatzung**: kritischer Bugfix - lief eine Kategorie im Hintergrund weiter, ließ
  sich das Fenster gar nicht mehr öffnen (nur ein Hinweis-Bildschirm ohne Fortschritt, ohne
  Zugriff auf den Rest des Tools). Läuft jetzt weiter normal, die betroffene Kategorie zeigt
  direkt "Abbrechen" (rot) mit dem echten Fortschritt statt eines zweiten möglichen Laufs.
- Buttons blieben nach einem Klick "hängen" (halb eingefärbt, bis man woanders hinklickt) -
  Fokus wird nach jedem Klick automatisch wieder entfernt.
- Schalter-Gruppen (Minimum/Volle Besatzung, Nur ergänzen/Vollständig anwenden, ...) stehen
  jetzt in einem grauen Kasten, damit erkennbar ist, was zusammengehört.
- **Fahrzeug-Besatzung**: Fehler-Liste (Kategorie/Wache/Fahrzeug/Status/Seit) jetzt per Klick
  auf die Spaltenüberschrift sortierbar.
- **Hintergrund-Aufgaben** haben jetzt einen eigenen Navbar-Eintrag (Fox-Logo mit drehendem
  Symbol davor, Zähler bei mehreren gleichzeitig) statt den normalen FuxTools-Menüpunkt
  mitzubenutzen - der normale Eintrag öffnet immer ganz normal das Hauptmenü. Ein Klick auf den
  neuen Eintrag zeigt alle laufenden/wartenden Aufgaben mit Fortschrittsbalken und eigenem
  Abbrechen-Button je Eintrag.
- **Hintergrund-Aufgaben**: Symbol drehte sich vorher über dem Fox-Logo und verdeckte es
  komplett - dreht sich jetzt daneben als kleines Icon, damit der Zusammenhang zu FuxTools
  erkennbar bleibt. Dreht sich nur noch, während wirklich etwas läuft; nach Abschluss bleibt
  das gleiche Symbol einfach stehen (Farbe zeigt fertig/läuft), statt komplett zu verschwinden.
  Abgeschlossene Fahrzeug-Besatzung-Läufe waren dadurch bisher gar nicht mehr auffindbar - jetzt
  bleiben sie im Task-Center sichtbar (mit Ergebnis), bis man sie bestätigt.
- **Verlauf**: Umbenennen und Fahrzeug-Besatzung erzeugen jetzt schon beim Start einen Eintrag
  und bestätigen ihn in derselben Zeile bei Abschluss - so ist erkennbar, ob ein Lauf wirklich
  fertig wurde oder z.B. durch F5/Fenster schließen unterbrochen wurde (bleibt dann auf
  "läuft/unterbrochen" stehen). Abbrechen über den eigenen Stop-Button trägt sofort "abgebrochen"
  ein. "Alle Zuweisungen rückgängig machen" landet jetzt ebenfalls im Verlauf.
- **Schulungen**: Verlauf-Eintrag zeigt jetzt die Personal-Nummern statt der Namen, damit sich
  die Zuordnung eindeutig überprüfen lässt.
- Startete ein Umbenennen-Vorgang automatisch aus der Warteschlange (weil vorher schon ein
  anderer Task lief), wechselte der Bildschirm ungefragt zur Fortschritts-/Ergebnis-Ansicht -
  auch wenn man inzwischen längst in einem ganz anderen Menü war. Passiert jetzt nicht mehr;
  der Fortschritt läuft in dem Fall nur noch über den Navbar-Badge und das Task-Center.
- **Task-Center**: Navbar-Eintrag bleibt jetzt immer sichtbar (auch im Leerlauf, statt zu
  verschwinden) - zeigt bei nichts Laufendem eine kurze Meldung ("Nichts in der
  Warteschlange ...") statt eines leeren Bildschirms, plus Button direkt zum Verlauf.
- **Fahrzeug-Besatzung**: Kategorien zeigen jetzt einen echten Ladebalken (gleiches Design wie
  beim Umbenennen) statt nur eines Textstatus - sowohl direkt im Menü als auch im Task-Center.
- "Schließen" (je Bildschirm) und "Beenden" (dauerhaft unten im Fenster) waren doppelt - taten
  exakt dasselbe. "Schließen" entfernt, "Beenden" reicht dafür.
- Das drehende Symbol am Task-Center-Eintrag "eierte" sichtbar statt sauber auf der Stelle zu
  rotieren - Ursache war der farbige Kreis dahinter, der jede kleinste Rasterungs-Abweichung der
  Glyphe sichtbar machte. Kreis entfernt, drehen (läuft) vs. stillstehen (fertig/Leerlauf)
  reicht als Signal.
- **Task-Center**: Fortschrittsbalken/-text (Umbenennen wie Fahrzeug-Besatzung) blieben stehen,
  solange man den Bildschirm offen ließ - erst Schließen und neu Öffnen zeigte den aktuellen
  Stand, teils schon "fertig". Aktualisiert sich jetzt live, auch während man draufschaut.
- **Verlauf**: erfolgreich abgeschlossene Einträge zeigen jetzt ebenfalls einen Status
  ("abgeschlossen"), nicht nur laufende/abgebrochene.

## Stable (v0.5.1)

- **Umbenennen**: Fahrzeuge, Wachen und Leitstellen mit frei einstellbaren
  Namens-Bausteinen, inkl. Live-Vorschau und Bestätigung vor dem Ausführen.
- **Wachenausbau**: Übersicht aller Wachen mit Ausbauten, Personal und Werbestatus -
  Ausbauten, Ausbaustufen und Lagerräume direkt aus der Liste bauen.
- **Verlauf**: alle über FuxTools durchgeführten Aktionen mit Datum und Kosten.
- Automatischer Update-Check, Stable- und Beta-Kanal wählbar.
