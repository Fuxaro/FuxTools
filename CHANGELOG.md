# Changelog

**Versionierungsregel (0.x-Phase):** letzte Ziffer (Patch, z. B. `0.1.1` → `0.1.2`) für kleine
Anpassungen/Bugfixes. Die mittlere Ziffer (Minor, `0.x.0`) wird nur für echte neue Funktionen
hochgezählt – **und nur nach Rücksprache**, d. h. bevor z. B. auf `0.2.0` hochgegangen wird, wird
das vorher abgestimmt. Der Sprung auf `1.0.0` markiert den ersten stabilen Release und wird
ebenfalls erst nach Absprache gesetzt.

Bei jeder Änderung, die live gehen soll: `@version` im Script hochzählen und pushen. Ohne
Versionserhöhung erkennt Tampermonkey kein Update.

- **0.4.3**
  - Wachen-Check: Neues Dropdown zum Filtern nach genauem Gebäudetyp (zusätzlich zur
    Textsuche und der groben Kategorie).
- **0.4.2**
  - **Wichtiger Fix**: Ausbaustufen-Bau hat teilweise doppelt abgebucht und zwei Stufen
    auf einmal gebaut statt einer. Ursache: der Bau-Endpunkt antwortet mit einer
    Weiterleitung, die automatisch eine zweite echte Anfrage ausgelöst hat. Behoben,
    indem die Weiterleitung nicht mehr automatisch verfolgt wird.
- **0.4.1**
  - Wachen-Check: Gebäudetyp wird jetzt zusätzlich zum Namen angezeigt – wichtig, wenn
    eine Wache umbenannt wurde und der Name nichts mehr über den Typ verrät.
  - Fenster im Wachen-Check nochmal breiter, damit mehr Platz für die Tabelle ist.
- **0.4.0**
  - Wachen-Check: Ausbauten, Ausbaustufen und Lagerräume haben jetzt echte Namen und
    Kosten und können direkt gebaut werden – bei jeder Aktion wählst du selbst, ob mit
    Credits oder Coins bezahlt wird. Achtung: Das kostet echtes Spielgeld!
  - Fahrzeuge umbenennen: Daten werden jetzt über die neue, seitenweise ladende API
    geholt (wichtig für sehr große Accounts) und mehrere Fahrzeuge gleichzeitig statt
    strikt nacheinander umbenannt – bei mehreren Tausend Fahrzeugen deutlich schneller.
- **0.3.13**
  - Fix: Spaltenbreiten im Wachen-Check verschoben sich je nachdem, welche Kategorie
    gerade auf-/zugeklappt war (Tabelle passte die Breiten an die sichtbaren Inhalte an) -
    jetzt feste Spaltenbreiten.
  - Ausbau-Farben zurück auf die Original-Bedeutung: Grün = gebaut und aktiv, Blau = in
    Bau, Orange = nicht gebaut, aber gefordert, Grau = nicht gebaut. Direkt aus der
    offiziellen Erklärung des Referenzskripts übernommen.
- **0.3.12**
  - Fix: Beim Sortieren nach Personal/Werben drehte sich bei vielen gleichen Werten
    (z.B. überall "300"/"Ja") nur die Namensreihenfolge mit der Sortierrichtung mit -
    sah aus wie eine kaputte Sortierung. Der Namens-Rückfall bei Gleichstand bleibt
    jetzt immer aufsteigend.
  - Fenster-Breite passt sich jetzt dem Bildschirm an: schmal für Menü/Formulare,
    breit nur für den Wachen-Check mit seiner Tabelle - keine leeren Flächen mehr auf
    den einfachen Bildschirmen.
- **0.3.11**
  - Wachen-Check: Kategorien bleiben jetzt auch beim Sortieren/Suchen immer erhalten
    (vorher flog man beim Sortieren nach Personal/Werben/Ausbauten komplett aus der
    Kategorie-Gruppierung raus) - sortiert wird nur noch innerhalb jeder Kategorie.
  - Hauptmenü: Menüpunkte an das dunkle Theme der Seite angepasst (vorher weißer
    Bootstrap-Standard-Hintergrund), schmaler statt über die volle Fensterbreite.
  - Logo im Fenster-Titel lädt jetzt zuverlässig (lag vorher nur auf dem beta-Branch,
    das Bild-Asset liegt jetzt auch auf main).
- **0.3.10**
  - Fix: Kategorie-Kopfzeilen im Wachen-Check hatten je nach Position abwechselnd
    unterschiedliche Hintergründe (Zebra-Streifen-Effekt der Tabelle).
  - Kategorie "Krankenhaus" heißt jetzt "Krankenhäuser & Schulen" und enthält jetzt
    auch alle Ausbildungsgebäude (Feuerwehr-/Rettungs-/Polizeischule, THW-Bundesschule,
    Schule für Seefahrt und Seenotrettung) statt sie bei ihrer Fachrichtung zu belassen.
- **0.3.9**
  - Hauptmenü: Logo im Fenster-Titel, Menüpunkte in Abschnitte gruppiert (Fahrzeuge /
    Wachen &amp; Leitstellen / Sonstiges) für mehr Übersicht.
- **0.3.8**
  - Wachen-Check: Bedeutung von Orange/Grau bei den Ausbauten getauscht - Orange =
    "als nächstes bauen", Grau = "optional" (steht auf der Referenz-Liste, aber nicht
    dringend).
- **0.3.7**
  - Fix: Wachen-Check zeigte gar keine Wachen mehr an (Tippfehler beim Umbenennen einer
    Funktion in 0.3.6).
  - Wortwahl weiter vereinfacht: Orange = "als nächstes bauen", Grau = "optional".
- **0.3.6**
  - Wachen-Check: Kategorien sind jetzt auf-/zuklappbar (wie bei der Wachen-Auswahl zum
    Umbenennen), statt einer schwer lesbaren Kopfzeile pro Kategorie.
  - Wortwahl präzisiert: Grau heißt jetzt einfach "noch nicht gebaut" statt umständlich
    "nicht auf der Empfehlungs-Liste".
- **0.3.5**
  - Wachen-Check: Spaltenüberschriften (Personal, Automat. Werben, Ausbauten) sind jetzt
    anklickbar zum Sortieren, "Wache" springt zurück zur Kategorie-Gruppierung.
  - Wortwahl geschärft: orange markierte Ausbauten heißen jetzt "optional" statt
    "empfohlen" (sie stehen auf einer Empfehlungs-Liste, sind aber nicht verpflichtend).
  - Fix: Sortier-Pfeil in den Spaltenüberschriften brach in eine zweite Zeile um und
    machte die Kopfzeile unnötig hoch.
  - Die Ausbau-/Personal-Richtwerte im Wachen-Check stammen ursprünglich aus dem
    BSD-3-Clause-lizenzierten Community-Skript "Gebäude- & Fuhrparkverwalter" von
    BOS-Ernie und Thomas Felber.
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
