# Changelog

**Versionierungsregel (0.x-Phase):** letzte Ziffer (Patch, z. B. `0.1.1` → `0.1.2`) für kleine
Anpassungen/Bugfixes. Die mittlere Ziffer (Minor, `0.x.0`) wird nur für echte neue Funktionen
hochgezählt – **und nur nach Rücksprache**, d. h. bevor z. B. auf `0.2.0` hochgegangen wird, wird
das vorher abgestimmt. Der Sprung auf `1.0.0` markiert den ersten stabilen Release und wird
ebenfalls erst nach Absprache gesetzt.

Bei jeder Änderung, die live gehen soll: `@version` im Script hochzählen und pushen. Ohne
Versionserhöhung erkennt Tampermonkey kein Update.

- **0.6.11**
  - Internes Aufräumen, keine sichtbaren Änderungen: totes/unfertiges Code (unbenutzte
    Soll-Personal-Tabelle, unerreichbarer Fallback in der Verlaufs-Typ-Zuordnung), die
    alte IndexedDB-Migration aus Vor-0.2.0-Zeiten und ihre Lösch-Logik entfernt sowie
    mehrfach duplizierten Code zusammengelegt (CSRF-Token-Abruf, Such-/Typ-Filter der
    drei Tabellen-Bildschirme, doppelte Ausbildungs-Listen der Kleinwachen).
- **0.6.10**
  - "Zurück"/"Hauptmenü"-Buttons (Einstellungen, Geforderte Ausbauten anpassen,
    Personal-Standard anpassen, Personal-Check) bleiben jetzt am unteren Rand des
    Anzeigebereichs fixiert (sticky), statt dass man bei langen Listen erst dorthin
    scrollen muss.
- **0.6.9**
  - **Fix**: Ausbaustufen-Katalog der Feuerwache ging nur bis Stufe 18, tatsächliches
    Maximum im Spiel ist Stufe 19 - führte im Wachen-Check zu "Stufe 19 / 18" bei bereits
    voll ausgebauten Wachen. Katalog um eine Stufe erweitert.
  - Personal-Check und Personal-Standard-Einstellungen zeigen jetzt keine "Sonstiges"-
    Gebäude mehr (Leitstelle, Großer/Kleiner Komplex, Verbandszellen, Bereitstellungsraum)
    - haben wie Krankenhäuser/Schulen kein zuweisbares Personal mit Ausbildungen.
- **0.6.8**
  - Ausbildungs-Katalog anhand einer vom User bereitgestellten Referenz-Tabelle
    gegengeprüft: "NEA200 Fortbildung" (Feuerwache) und "Intensivpflege" (Rettungswache)
    ergänzt, sowie Kleinwachen (Feuerwache/Polizeiwache/Rettungswache) mit demselben
    Ausbildungs-Pool wie ihre normale Wache versehen (vorher ganz ohne Katalog-Einträge).
- **0.6.7**
  - Einstellungen "Personal-Standard anpassen": fester Katalog, welche Ausbildungen es je
    Gebäudetyp gibt, macht die Liste jetzt von Anfang an vollständig - nicht mehr abhängig
    davon, ob die jeweilige Kategorie schon einmal gescannt wurde. Ein Eintrag ist erst
    bedienbar (Eingabefeld), sobald die zugehörige Ausbildung einmal im Personal-Check
    gescannt wurde, vorher erscheint er ausgegraut mit Schloss-Symbol.
  - **Fix**: Personal-Check-Übersicht zeigte in der Spalte "Personal-Ausbildungen" immer
    "-", solange für den Gebäudetyp nichts als "gefordert" konfiguriert war - auch wenn
    tatsächlich schon Personal mit entsprechender Ausbildung vorhanden war. Vorhandene
    Ausbildungen werden jetzt immer als Badge angezeigt, bei 0 gefordert entsprechend rot
    (z. B. "5/0").
- **0.6.6**
  - Einstellungen "Personal-Standard anpassen" komplett überarbeitet: statt einer breiten,
    grösstenteils leeren Tabelle mit allen Ausbildungen als Spalten für alle Gebäudetypen
    gibt es jetzt einen Block je Gebäudetyp, der nur die Ausbildungen zeigt, die für diesen
    Typ tatsächlich schon gescannt wurden (nicht jeder Typ hat jede Ausbildung). Label und
    Eingabefeld stehen direkt nebeneinander, dadurch bleibt beim Scrollen immer erkennbar,
    wofür eine Zahl steht - zusätzlich bleibt die Kategorie-Überschrift beim Scrollen oben
    haften (sticky).
- **0.6.5**
  - **Fix**: Einstellungen "Personal-Standard anpassen" füllten die Felder beim ersten
    Öffnen (bzw. nach "Zurücksetzen auf Standard") noch mit fest hinterlegten
    Referenz-Werten vor (z. B. 15, 3, 18) statt mit 0. Diese Vorausfüllung wurde komplett
    entfernt - Standard ist jetzt immer überall 0 (nichts gefordert), jeder Spieler
    konfiguriert die Soll-Anzahlen selbst.
- **0.6.4**
  - Einstellungen "Personal-Standard anpassen" komplett neu als kompakte, nach Kategorie
    gruppierte Tabelle (Gebäudetypen als Zeilen, Ausbildungen als Spalten) statt vieler
    einzelner Blöcke.
  - Direkter Button "Personal-Standard anpassen" jetzt auch im Personal-Check selbst,
    nicht mehr nur in den Einstellungen.
  - **Wichtig**: Ohne eigene, gespeicherte Konfiguration ist wieder überall 0 Personal
    gefordert (Standard) - die Referenz-Werte dienen nur noch als Vorausfüllung beim
    ersten Öffnen der Einstellungen, werden aber erst nach "Speichern" aktiv.
  - Ausbildungs-Badges: Grün = genau passend, Gelb = zu wenig, Rot = mehr Personal
    vorhanden als gefordert (Überbesetzung).
  - Krankenhäuser und Schulen aus dem Personal-Check entfernt (haben kein zuweisbares
    Personal).
- **0.6.3**
  - Personal-Check: Spalte "Zuletzt gescannt" entfernt (steht bereits pro Kategorie oben),
    Ausbildungs-Badges zeigen jetzt explizit, wie viel Personal fehlt (z. B. "3/18 (15
    fehlen)"), und die Tabelle lässt sich nach unvollständigsten Wachen sortieren (Klick
    auf "Personal-Ausbildungen", Klick auf "Wache" zurück zur Kategorie-Sortierung).
- **0.6.2**
  - **Fix**: Personal-Ausbildungen-Spalte im Personal-Check war leer, solange in den
    Einstellungen noch nichts gespeichert wurde. Die Referenz-Standardwerte gelten jetzt
    direkt (analog zu den geforderten Ausbauten), bis eine eigene Konfiguration
    gespeichert wird.
- **0.6.1**
  - Personal-Check: neue Spalte "Personal" zeigt je Wache Mitarbeiter gesamt, ohne
    Ausbildung, verfügbar und im Unterricht. Ausbau-Badges zeigen jetzt zusätzlich die
    Namen der Personen mit der jeweiligen Ausbildung (als Tooltip beim Draufhalten).
- **0.6.0**
  - Neuer Menüpunkt "Personal-Check": prüft je Wache, ob genug Personal mit bestimmten
    Ausbildungen (z. B. ELW-2-Fahrer) vorhanden ist. Da es dafür keine Sammel-API gibt,
    startet man den Scan gezielt pro Kategorie (Ergebnisse bleiben bis zum nächsten Scan
    gespeichert, mit Zeitpunkt des letzten Scans).
  - Neuer Menüpunkt in den Einstellungen: "Personal-Standard anpassen" - legt je
    Gebäudetyp und Ausbildung eine Soll-Anzahl fest, mit sinnvollen Vorschlagswerten
    beim ersten Aufruf.
  - Änderungen an dieser Konfiguration landen mit Details im Verlauf.
- **0.5.1**
  - **Wichtiger Fix**: Script startete nach dem Sprung auf main nicht mehr (doppelt
    deklarierte Variablen durch einen fehlerhaft aufgelösten Merge beim Release). Beta
    war davon nicht betroffen, Versionsnummer zur Konsistenz trotzdem mitgezogen.
- **0.5.0**
  - Fahrzeuge umbenennen: neuer Button "Bausteine zurücksetzen" neben "Fahrzeuge
    umbenennen" - setzt die Namens-Bausteine-Vorlage (Text 1, Fahrzeugtyp-Name, Text 2,
    Nummer) mit Sicherheitsabfrage auf die Standardeinstellung zurück.
  - Hauptmenü aufgeräumt: "Fahrzeuge zurücksetzen" heißt jetzt "Fahrzeugnamen
    zurücksetzen", überflüssige Zusatztexte bei den Menüpunkten entfernt.
  - Internes Aufräumen: totes/unbenutztes Code entfernt, veraltete Kommentare korrigiert,
    keine funktionalen Änderungen an bestehenden Funktionen.
- **0.4.9**
  - Neuer Menüpunkt in den Einstellungen: "Geforderte Ausbauten anpassen" - legt fest,
    welche Ausbauten im Wachen-Check je Gebäudetyp orange als "gefordert" markiert
    werden. Standard bleibt die bisherige feste Empfehlungs-Liste, mit Button zum
    Zurücksetzen darauf.
  - Änderungen an dieser Konfiguration (gespeichert oder zurückgesetzt) landen mit
    Details im Verlauf.
- **0.4.8**
  - Update-Logik aufgeräumt: der "Update verfügbar"-Hinweis unten im Fenster löst
    jetzt nichts mehr direkt aus, sondern führt nur noch zu den Einstellungen (dort
    passiert das eigentliche Update).
  - **Wichtiger Fix**: Nach einem Update über die Einstellungen lief teilweise
    weiterhin die alte Version, weil nicht zuverlässig neu geladen wurde. FuxTools
    merkt sich jetzt, wenn ein Update-Tab geöffnet wurde, und lädt die Seite beim
    nächsten Öffnen einmalig automatisch neu.
  - "Nach Updates suchen", "Jetzt aktualisieren" und "Neuinstallation erzwingen"
    laufen jetzt intern über dieselbe Funktion statt das Öffnen des Update-Tabs an
    drei Stellen einzeln zu duplizieren.
- **0.4.7**
  - **Wichtiger Fix**: Wachen-Check sprang nach einem Kauf trotzdem auf die
    Standardansicht zurück statt Suche/Filter/Sortierung beizubehalten (der
    Zustand wurde erst beim Zurückspringen ausgelesen, da war die Suchleiste/das
    Dropdown aber schon durch den Bau-Bildschirm ersetzt).
  - "Max"-Button umbenannt in "Max ausbauen auf Stufe X (...)" mit Gesamtkosten im
    Text, und in einem dunkleren Rot (statt Grau) passend zu den anderen Farben.
- **0.4.6**
  - Verlauf: Umbenennen/Zurücksetzen von Fahrzeugen, Wachen und Leitstellen wird jetzt
    ebenfalls erfasst – ein zusammengefasster Eintrag pro Durchlauf (Typ + Anzahl),
    keine Einzeleinträge pro Fahrzeug/Wache.
- **0.4.5**
  - Neuer Menüpunkt "Verlauf" (Hauptmenü &gt; Sonstiges): Liste aller über FuxTools
    gebauten Ausbauten, Lagerräume und Ausbaustufen mit Datum, Uhrzeit, Kosten und
    Script-Version, mit Suchfeld und Dropdown-Filter nach Aktion.
- **0.4.4**
  - **Wichtiger Fix**: Ausbaustufe zeigte teilweise eine falsche Zielstufe beim Bauen an
    (z. B. Sprung auf Stufe 3 statt 2). Anzeige und Zielstufe stimmen jetzt mit der Stufe
    im Spiel überein.
  - Wachen-Check: Neuer kleiner "Max"-Button neben "Nächste Stufe" – baut direkt bis zur
    höchsten verfügbaren Ausbaustufe (Gesamtkosten werden vorher angezeigt).
  - Wachen-Check: Kategorie-Gruppierung entfernt (durch den Gebäudetyp-Filter nicht mehr
    nötig), Filter/Suche vertauscht (Filter links, Suche rechts).
  - Wachen-Check: Nach einem Kauf (Ausbau, Lagerraum, Ausbaustufe) bleiben Suche, Filter
    und Sortierung erhalten, statt auf die Standardansicht zurückzuspringen.
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
