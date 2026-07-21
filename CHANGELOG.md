# Changelog

**Versionierungsregel (0.x-Phase):** letzte Ziffer (Patch, z. B. `0.1.1` → `0.1.2`) für kleine
Anpassungen/Bugfixes. Die mittlere Ziffer (Minor, `0.x.0`) wird nur für echte neue Funktionen
hochgezählt – **und nur nach Rücksprache**, d. h. bevor z. B. auf `0.2.0` hochgegangen wird, wird
das vorher abgestimmt. Der Sprung auf `1.0.0` markiert den ersten stabilen Release und wird
ebenfalls erst nach Absprache gesetzt.

**Stand 2026-07-20:** Ab jetzt bumpt Claude nur noch die letzte Ziffer (Patch), auch bei neuen
Funktionen - die mittlere Ziffer (Minor) und `1.0.0` bleiben ausschließlich Fuxaro selbst
vorbehalten, damit wir nicht ungewollt in Richtung `1.0` rutschen.

Bei jeder Änderung, die live gehen soll: `@version` im Script hochzählen und pushen. Ohne
Versionserhöhung erkennt Tampermonkey kein Update.

- **0.9.23**
  - Fahrzeug-Katalog hat jetzt einen Notfall-Fallback: falls api.lss-manager.de mal nicht
    erreichbar ist (Seite down, o.ä.), lädt FuxTools automatisch eine eigene Kopie aus dem
    FuxTools-Repo (`data/vehicle-types-fallback.json`) nach, statt komplett ohne
    Fahrzeugdaten dazustehen. Diese Kopie wird nur 1 Stunde gecacht (statt 1 Tag), damit
    beim nächsten Laden gleich wieder die echte, aktuelle Quelle versucht wird. Bestehende,
    noch gültige (auch abgelaufene) Cache-Daten werden zusätzlich als letzte Rückfalloption
    weiterverwendet, falls auch der Fallback mal nicht erreichbar ist.
- **0.9.22**
  - Pre-Release-Review vor den ersten Beta-Testern: Code komplett auf Fehler, tote Codeteile
    und account-spezifische Daten geprüft.
  - Bugfix: `addMenuEntry()` konnte das Script mit einem uncaught TypeError abbrechen, falls
    `#menu_profile` auf der Seite mal nicht gefunden wird - jetzt eine klare Fehlermeldung in
    der Konsole statt eines kompletten Absturzes.
  - Bugfix: der Start (`main()`) nutzte `Promise.all` für die drei Initialisierungsschritte -
    schlug der Fahrzeug-Katalog-Abruf von der externen Seite api.lss-manager.de fehl (z.B.
    durch Adblocker oder kurzzeitige Downtime), wurden dadurch auch der Navbar-Menüpunkt und
    der Update-Check nie erreicht und FuxTools war komplett unsichtbar. Jetzt mit
    `Promise.allSettled` - ein einzelner fehlgeschlagener Schritt blockiert die anderen nicht
    mehr, Fehler werden nur noch in der Konsole geloggt.
  - Geprüft und bestätigt: keine Account-spezifischen Daten (Passwörter, Tokens, feste
    Wachen-/User-IDs) im Code - alle Fuxaro-Erwähnungen sind Lizenz-/Autoren-Angaben, alle
    API-Aufrufe laufen über die Session des jeweiligen Nutzers. `ALL_SETTINGS_KEYS` gegen alle
    tatsächlich genutzten Storage-Keys gegengeprüft - vollständig und ohne Karteileichen.
- **0.9.21**
  - "Wachen-Baupläne" heißt jetzt "Wachen-Bauplaner" (Menüpunkt, Titel, Buttons überall
    umbenannt - der Community-Vorbild-Script-Name "Wachenbaupläne" in Code-Kommentaren bleibt
    als Quellenangabe unverändert).
  - Großes Update: "Personal-Standard" (manuell gepflegte Soll-Zahlen) entfällt komplett -
    Personal-Check und Schulungen berechnen den Personalbedarf jetzt automatisch aus dem je
    Gebäudetyp AKTIVEN Wachenbauplan (dessen Fahrzeuge bestimmen den Bedarf). Pro Gebäudetyp
    kann nur ein Bauplan gleichzeitig aktiv sein - wird beim Speichern ein neuer aktiviert,
    deaktiviert das automatisch alle anderen desselben Typs. Gebäudetypen ganz ohne aktiven
    Bauplan fordern nichts. Beide Screens verlinken jetzt direkt auf den Wachen-Bauplaner.
  - Wachen-Bauplaner "Bearbeiten": leerer Name übernimmt jetzt automatisch den
    Gebäudetyp-Namen (z.B. "Feuerwache") statt einen Namen zu erzwingen. Gibt es bereits einen
    Bauplan mit diesem Namen, wird vor dem Speichern gefragt, ob er ersetzt werden soll.
- **0.9.20**
  - Fux-Logo in der Navigationsleiste vergrößert (20px → 24px), war kaum zu erkennen.
- **0.9.19**
  - "Speicher löschen" (Einstellungen) öffnet jetzt ein eigenes Bestätigungsfenster statt
    eines browser confirm() - der Löschen-Button bleibt gesperrt, bis das Wort "löschen"
    exakt eingetippt wurde, damit ein versehentlicher Klick nicht sofort alle Daten löscht.
- **0.9.18**
  - Navbar-Einstiegspunkt vereinfacht: der alte Fallback (AAO-Dropdown) ist raus, falls
    #menu_profile mal nicht gefunden wird, gibt es jetzt direkt einen Fehler zum Nachschauen
    statt eines stillen Rückfalls.
- **0.9.17**
  - FuxTools-Einstiegspunkt ist jetzt ein eigener Punkt direkt in der Navigationsleiste (mit
    Fux-Logo), links neben dem Profil-Menü - vorher versteckt im Profil-Dropdown. Fällt auf
    die alte Position zurück, falls die Navbar-Struktur der Seite mal abweicht.
- **0.9.16**
  - Hauptmenü: Sektion "Umbenennen" heißt jetzt "Schnellumbenennung".
- **0.9.15**
  - Schulungen: "Ausbilden"-Buttons in der Bedarfs-Tabelle sind jetzt in jeder Zeile vertikal
    zentriert statt oben ausgerichtet - wirkte bei unterschiedlich hohen Zeilen (z.B. durch
    umbrechende Ausbildungsnamen) uneinheitlich.
  - "Personal-Standard anpassen" gibt es jetzt nur noch im Personal-Check-Menü selbst, nicht
    mehr zusätzlich in den Einstellungen - vermeidet Verwechslung mit dem Wachenbauplan.
- **0.9.14**
  - Schulungen: die Gesamt-Raumzahl einer Schule kommt jetzt direkt aus deren echten Ausbauten
    ("Weiterer Klassenraum", wie auf der Gebäudeseite sichtbar) statt aus der Raum-Auswahl im
    Lehrgangs-Formular - die existiert dort naemlich nur, wenn gerade ein Raum frei ist, und
    war deshalb als Quelle fuer die GESAMTZAHL ungeeignet. Betrifft sowohl die
    Kapazitäts-Anzeige als auch die Zuteilung beim tatsächlichen Lehrgang-Start.
  - Bugfix: ein per verzögertem Start eingeplanter Lehrgang hat schon einen echten
    Fertig-Zeitpunkt in der Zukunft, obwohl das "running"-Flag der API noch false ist - belegte
    Klassenräume werden jetzt anhand des Fertig-Zeitpunkts erkannt statt zusätzlich das
    "running"-Flag zu verlangen (das hier hinterherhinkt statt umgekehrt).
- **0.9.13**
  - Bugfix Schulungen: Anzeige "alle X Klassenräume belegt" nutzte einen hart codierten
    Rückfallwert (X=1), wenn die Raum-Auswahl im Formular fehlte, statt die Raumzahl aus
    tatsächlich belegten + frei wählbaren Räumen zu berechnen - per Live-Diagnose im Browser
    bestätigt: die Raum-Auswahl existiert nur, wenn mindestens ein komplett ungenutzter Raum
    frei ist; "offene Plätze" eines bereits laufenden Lehrgangs sind NICHT mehr nutzbar.
- **0.9.12**
  - Schulungen-Übersicht: "alle Klassenräume belegt" zeigt jetzt zusätzlich, bis wann (laut
    /api/schoolings frühester Fertig-Zeitpunkt der gerade laufenden Lehrgänge), statt nur
    "belegt" ohne weitere Info.
- **0.9.11**
  - Bugfix Personal-Check: Bildschirm stürzte beim Öffnen ab (fehlender "Scan jetzt
    starten"-Button in der Vorlage, obwohl die Anzeige-Logik dafür schon existierte) - dadurch
    blieb die Liste immer leer, da der Absturz vor dem eigentlichen Befüllen der Tabelle
    passierte. Button + Zeitstempel ("Letzter Scan: ...") jetzt ergänzt, wie bei Schulungen.
  - Fahrzeug-Besatzung: neue Checkbox "Normale Fahrzeuge (ohne Ausbildungsanforderung)
    einbeziehen" - fügt sie direkt in die bestehende Kategorie-Logik ein (kein separater
    Button/Screen). Normale Fahrzeuge werden dabei einfach mit beliebigem verfügbarem
    Personal bis Minimum bzw. volle Besatzung aufgefüllt (je nach Einstellung), statt dass
    ein einzelnes Fahrzeug alles verfügbare Personal bekommt und andere leer bleiben.
- **0.9.10**
  - Bugfix Layout: Modal hat jetzt eine feste Gesamthöhe mit Flexbox (Header/Footer fix, nur
    der Inhalt scrollt) statt variabler Höhe - vorher konnte je nach Bildschirmgröße/
    Inhaltslänge ein zweiter, verschachtelter Scrollbereich entstehen, wodurch die "Zurück"/
    Speichern-Buttons nicht am echten unteren Rand des Fensters standen und der Hintergrund
    darunter durchscrollte. Betrifft jetzt JEDEN Screen einheitlich.
  - Fahrzeug-Besatzung: "X/Y passend besetzt" (wirkte wie ein Bruchteil der Gesamtkapazität)
    heißt jetzt "X/Y erforderliches Personal zugewiesen" und zeigt wirklich nur die
    geforderte Ausbildung gegen ihr Ziel, nicht die Gesamtbelegung gegen die Maximalkapazität.
  - Hauptmenü neu sortiert: Wachen-Baupläne, Fahrzeug-Besatzung, Wachenausbau (vorher
    "Wachen-Check"), Personal-Check, Schulungen jetzt oben in einer Sektion; alle
    Umbenennen-Werkzeuge (Fahrzeuge/Wachen/Leitstellen) jetzt gebündelt in einer eigenen
    "Umbenennen"-Sektion.
  - Wachen-Baupläne "Anwenden": neuer "Aktualisieren"-Button (lädt Wachen/Fahrzeuge neu und
    scannt Personal frisch) plus Anzeige, wann der Personal-Stand zuletzt gescannt wurde -
    wie bei Schulungen/Personal-Check.
  - Neu: Breadcrumb im Fenster-Header zeigt jetzt immer, in welchem Menü/Untermenü man sich
    gerade befindet (z.B. "› Wachen-Baupläne › Anwenden").
- **0.9.9**
  - Wachen-Baupläne "Anwenden": zu viele Fahrzeuge eines Typs (rote Markierung) können jetzt
    direkt verkauft werden (mit eigenem, deutlich rot markiertem Bestätigungsfenster statt der
    Spiel-eigenen Abfrage) - vorher nur ein Link zum manuellen Verkaufen. Endpunkt per
    Live-Diagnose im Browser bestätigt: der echte "Verkaufen"-Link im Spiel ist ein
    Rails-UJS-Link mit `data-method="delete"` auf `/vehicles/{id}`.
- **0.9.8**
  - Bugfix Schulungen: "Kapazität unbekannt (Ausbildungs-Formular an dieser Schule nicht
    gefunden.)" kam faelschlich als Fehler, obwohl die Schule ganz normal funktioniert - das
    Lehrgangs-Formular existiert im Spiel schlicht nur, solange mindestens ein Klassenraum
    frei ist (per Live-Diagnose im Browser bestätigt). Sind alle Klassenräume belegt, wird das
    jetzt korrekt als "alle Klassenräume belegt" angezeigt statt als Fehler.
- **0.9.7**
  - Wachen-Baupläne "Bearbeiten": Namensfilter (Regex) entfernt (unnötige Komplexität - ein
    Bauplan gilt jetzt einfach für alle Wachen des gewählten Gebäudetyps). Ausbauten werden
    jetzt wie im Vorbild-Script "Wachenbaupläne" (BOS-Ernie) über zwei Listen
    (Verfügbar/Zugewiesen, per Doppelklick oder Pfeil-Buttons verschiebbar) statt Checkboxen
    ausgewählt.
  - Benötigtes Personal (Wachen-Baupläne, sowohl beim Bearbeiten als auch beim Anwenden) geht
    jetzt immer von der minimalen Besatzung aus statt von der vollen Besatzung bei
    Spezialfahrzeugen mit "alle brauchen die Ausbildung"-Anforderung (z.B. ELW 2) - verlangt
    nicht mehr mehr Personal, als für den Betrieb wirklich nötig ist.
  - Wachen-Baupläne "Anwenden": Spaltenüberschriften (Wache/Ausbauten/Fahrzeuge/Personal) sind
    jetzt anklickbar zum Sortieren. Zu viele Fahrzeuge eines Typs werden jetzt rot markiert und
    verlinken direkt auf ein überzähliges Fahrzeug zum manuellen Verkaufen (kein bestätigter
    Verkaufs-Endpunkt vorhanden, daher kein automatischer Verkauf). Der separate "Zur
    Wache"-Button entfällt, da der Wachenname selbst schon in einem neuen Tab öffnet.
- **0.9.6**
  - Script-Icon (Tampermonkey-Übersicht/Menü) ist jetzt unser eigenes Fux-Logo statt des
    generischen Google-Favicons für leitstellenspiel.de.
- **0.9.5**
  - Fahrzeug-Besatzung: Klick auf ein Fahrzeug in der Problem-Liste führt jetzt direkt zur
    Fahrzeugseite statt in den Bearbeiten-Modus.
  - Fahrzeug-Besatzung: die Liste nicht passend besetzter Fahrzeuge (FMS 6) bleibt jetzt über
    Schließen/Wiederöffnen des Fensters gespeichert - kein erneutes Scannen mehr nötig, nur
    tatsächlich verkaufte/umgebaute Fahrzeuge fallen automatisch raus.
  - "Wachen-Baupläne" ist jetzt ein eigener Punkt im Hauptmenü (vorher unter Einstellungen).
  - Wachen-Baupläne "Anwenden": fehlende Fahrzeuge können jetzt direkt gekauft werden (Kosten
    vorher bestätigen wie bei Ausbauten) statt nur über einen Link zur Wache. Endpunkt anhand
    der Community-Scripte "Beschaffungsagent" (BOS-Ernie) und "[LSS] Fahrzeug-Manager"
    (Caddy21) bestätigt.
- **0.9.4**
  - Fahrzeug-Besatzung: die roten Knöpfe für nicht passende Fahrzeuge sind wieder eine
    normale Tabelle (wie überall sonst im Script) - und nur noch EINE gemeinsame Liste
    unter allen Kategorien statt einer je Kategorie.
- **0.9.3**
  - Neu: "Wachen-Baupläne" (Einstellungen) - Vorlagen, wie eine Wache eines bestimmten Typs
    ausgebaut/ausgestattet sein soll (Ausbauten, Fahrzeuge+Anzahl, Sollpersonal - Personal
    wird automatisch aus den Fahrzeugen berechnet). Je Bauplan "Anwenden" zeigt alle
    passenden Wachen (optional per Namensfilter/Regex eingeschränkt, z.B. Normalwache vs.
    Werkfeuerwehr) mit Soll/Ist-Vergleich für Ausbauten (direkt baubar), Fahrzeuge (Link zum
    Kauf - noch nicht automatisiert) und Personal (Verweis auf Fahrzeug-Besatzung/
    Schulungen). Konzept/Datenmodell vom Community-Script "Wachenbaupläne" (BOS-Ernie)
    übernommen, Personal-Bedarf nutzt aber unsere eigene, an echten Teil-Anforderungen
    korrekte Berechnung.
  - Fahrzeug-Besatzung: Layout aufgeräumt (Kategorie-Buttons jetzt in einer Linie, Minimum/
    Volle-Besatzung-Buttons mit sichtbarem Abstand statt zusammengeklebt).
- **0.9.2**
  - Bugfix Fahrzeug-Besatzung: "vollständig besetzt"-Prüfung konnte bei Fahrzeugen ohne
    zugewiesene Person fälschlich "passt" melden (leere Liste erfüllt ".every()" immer) -
    jetzt wird explizit verlangt, dass überhaupt jemand zugewiesen ist.
  - Fahrzeug-Besatzung überarbeitet: keine lange Tabelle aller Fahrzeuge mehr (bei vielen
    Fahrzeugen unübersichtlich) - stattdessen nur noch anklickbare Links zu Fahrzeugen, die
    nach der Prüfung nicht passen (direkter Sprung ins Fahrzeug im Spiel).
  - Neue Einstellung direkt im Bildschirm: bei Fahrzeugen mit Teil-Anforderung (z.B. GRTW/NAW,
    nur 1 von 6 mit Notarzt-Ausbildung) wählbar, ob nur das echte Minimum oder gleich die
    volle Besatzung mit der Ausbildung belegt wird - sichtbar markiert, was aktiv ist.
- **0.9.1**
  - Fahrzeug-Besatzung überarbeitet: die Fahrzeugtyp→Ausbildungs-Zuordnung kommt jetzt direkt
    aus dem ohnehin geladenen Fahrzeug-Katalog (api.lss-manager.de) statt aus einer von Hand
    gepflegten, teils ungenauen Liste - dadurch jetzt korrekt auch Fahrzeuge, bei denen nur
    EIN TEIL der Besatzung die Ausbildung braucht (z.B. GRTW/NAW: nur 1 von 6 mit Notarzt-
    Ausbildung, statt fälschlich alle 6) sowie Fahrzeuge mit MEHREREN Anforderungen
    gleichzeitig (z.B. GW-Verpflegung/GW-Küche). Fahrzeuge, deren Ausbildung nur am
    Einsatzort (nicht in der eigenen Besatzung) gebraucht wird (z.B. Dekon-P), werden nicht
    mehr fälschlich einbezogen.
  - Statt eines Buttons pro einzelnem Fahrzeug (bei vielen Fahrzeugen unübersichtlich) gibt es
    jetzt EINEN "Alle ... prüfen & zuweisen"-Button je Kategorie (Feuerwehr/Rettungsdienst/
    Polizei/...), der alle betroffenen Fahrzeuge der Kategorie nacheinander abarbeitet.
- **0.9.0**
  - Neu: "Fahrzeug-Besatzung" im Hauptmenü. Zeigt Fahrzeugtypen, deren Besatzung KOMPLETT
    eine bestimmte Ausbildung braucht (z.B. ELW 2), weist freie Plätze mit verfügbarem,
    passend ausgebildetem Personal zu und setzt danach automatisch den Fahrzeugstatus: FMS 6
    (nicht besetzt), wenn die Besatzung nicht vollständig passt, sonst FMS 2 (frei auf
    Funk) - Fahrzeuge im Einsatz werden dabei nie angefasst. Verhindert außerdem, dass
    bereits zugewiesenes, ausgebildetes Personal versehentlich einem anderen Fahrzeug
    zugeteilt wird.
- **0.8.3**
  - Bugfix: FuxTools startete gar nicht mehr (Absturz beim allerersten Öffnen). Der neue
    "Beenden"-Button im Fußbereich wurde per `document.getElementById` gesucht, bevor das
    Fenster überhaupt im Dokument hing - dadurch war das Element `null` und der Absturz
    verhinderte, dass das Menü sich öffnet.
- **0.8.2**
  - Schulungen: "Ausbilden" zeigt jetzt eine eigene Bestätigungs-Ansicht (statt des
    generischen Browser-Fensters) mit exakter Personen-Anzahl je Wache, genutzter
    Klassenraumzahl und einer Fertig-Schätzung anhand der Lehrgangsdauer.
  - Bugfix: "Zurück" funktionierte nicht, wenn man direkt über den neuen Hauptmenü-Punkt
    "Schulungen" oder über "Personal-Standard anpassen" (Einstellungen) dorthin kam - der
    Klick löste dort fälschlich ein Event statt der Zurück-Funktion aus.
  - Modal-Fenster: das "×" oben rechts entfernt, dafür unten rechts im Fußbereich ein
    "Beenden"-Button.
- **0.8.1**
  - Schulungen: Scan-Button und Scan-Datum ins Sticky-Footer neben "Zurück" verschoben
    (besser sichtbar als grauer Text, Scan-Button jetzt blau). Neue Übersicht ganz oben
    zeigt IMMER alle eigenen Schulen (Feuerwehr/Rettungsdienst/Polizei/...) mit Auslastung,
    auch wenn dort aktuell kein Personal fehlt.
  - Personal-Check: gleiche Verschiebung von Scan-Button/-Datum ins Sticky-Footer.
  - Neuer Hauptmenü-Eintrag "Schulungen" direkt neben Personal-Check - kein Umweg mehr über
    den Personal-Check nötig.
- **0.8.0**
  - Personal-Check: EIN gemeinsamer Scan über alle Kategorien statt einzelner Scans pro
    Kategorie (schnell genug, um alles zusammen zu laden). Scannt automatisch neu, wenn
    der letzte Scan mehr als 15 Minuten her ist, beim Öffnen von Personal-Check oder
    Schulungen - weiterhin auch jederzeit manuell über "Scan jetzt starten" auslösbar,
    mit sichtbarem Fortschritt.
  - Schulungen: nutzt jetzt die echte `/api/schoolings`-API statt einer HTML-Schätzung, um
    zu wissen, wie viele Klassenräume einer Schule aktuell belegt sind - zeigt "X/Y
    Klassenräume frei" statt der bisherigen ungenauen "läuft/frei"-Vermutung, und wählt bei
    "Ausbilden" nur so viele Räume, wie tatsächlich frei sind.
  - Einstellungen: neuer Bereich "Einstellungen sichern" - alle FuxTools-Einstellungen als
    Datei herunterladen bzw. aus so einer Datei wiederherstellen (z. B. vor einer
    Neuinstallation oder für einen anderen Rechner).
  - Speicher-Aufräumen: Scan-Daten haben jetzt einen einzigen gemeinsamen Zeitstempel statt
    einem pro Wache (unnötig doppelt gespeichert).
- **0.7.1**
  - Update-Ablauf: FuxTools sperrt sich jetzt SOFORT nach dem Öffnen des Update-Tabs (statt
    erst beim nächsten Öffnen) auf einen Neuladen-Bildschirm mit explizitem "Seite neu
    laden"-Button - kein Weiterarbeiten mehr mit der alten Version möglich, kein stiller
    automatischer Reload mehr.
  - Design-Konsistenz: alle Bildschirme haben jetzt denselben "Zurück"-Button (nicht mehr
    teils "Zurück", teils "Hauptmenü") und halten ihn per Sticky-Footer immer sichtbar am
    unteren Rand, ohne Scrollen. Der Sticky-Footer-Hintergrund liest jetzt die tatsächliche
    Modal-Hintergrundfarbe aus, statt einen festen (falschen) Grauton zu zeigen.
  - Bugfix: "Personal-Standard anpassen" aus dem Personal-Check landete beim Zurück-Klick
    immer im Einstellungsmenü statt zurück im Personal-Check.
  - Einstellungen: von einer langen Liste zu einem breiten Karten-Raster umgebaut (weniger
    Scrollen, übersichtlicher).
  - Schulungen starten: keine Schulwahl mehr nötig (welche eigene Schule genutzt wird, ist
    egal) - zeigt statt einer Dropdown-Auswahl die Kapazität/Auslastung der Schule an und
    gruppiert die Bedarfe nach Schultyp. Neue Einstellung "Mindest-Personalstärke pro Wache"
    schützt frisch gebaute/kleine Wachen davor, sofort für Schulungen leergeräumt zu werden.
- **0.7.0**
  - Neu: "Schulungen starten" im Personal-Check. Zeigt anhand des Personal-Standards und des
    letzten Scans, wie viel Personal je Ausbildung über alle Wachen einer Kategorie fehlt, und
    schickt es nach Bestätigung automatisch (bis zu 10 Personen pro Klassenraum, größter Mangel
    zuerst) in den passenden Lehrgang der eigenen Schule - kein manuelles Anklicken einzelner
    Personen mehr nötig.
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
