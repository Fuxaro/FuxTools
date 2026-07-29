# Changelog

Kurzer Überblick über die wichtigsten Neuerungen von FuxTools.

## Stable (v1.0.6)

- Bugfix (kritisch): "Max ausbauen" im Wachenausbau baute bisher nur eine einzige Stufe statt bis
  zur Zielstufe durchzubauen und zog auch nur deren Einzelpreis ab, obwohl die Gesamtkosten aller
  fehlenden Stufen angezeigt wurden (das Spiel erlaubt pro Anfrage nur eine Stufe). Zusätzlich
  meldete FuxTools jeden Ausbau-Versuch als erfolgreich, ohne zu prüfen, ob das Spiel ihn mangels
  Guthaben überhaupt durchgeführt hat (der Ausbau-Endpunkt leitet bei Erfolg UND Fehlschlag auf
  dieselbe Seite weiter). "Max ausbauen" baut jetzt echt Stufe für Stufe durch und prüft direkt
  im Anschluss den tatsächlichen Ausbau-Stand per API - Ergebnis-Bildschirm und Verlaufs-Eintrag
  zeigen die wirklich erreichte Stufe samt Fehlermeldung, falls das Guthaben nicht gereicht hat.

- Diagnose: Schulungen-Übersicht zeigt jetzt zusätzlich "X vorhanden / Ziel Y–Z" je Ausbildung,
  aufklappbar mit Aufschlüsselung pro Wache (auch bereits ausreichend besetzte Wachen, als "voll"
  markiert) - hilft nachzuvollziehen, warum ein Mangel angezeigt wird, z.B. wenn der aktive
  Bauplan mehr Fahrzeuge eines Typs vorsieht, als aktuell an der Wache stehen, oder wenn eine
  Wache schlicht schon ausreichend besetzt ist und deshalb woanders nicht mitgezählt wird.

- Bugfix: "SW Kats" landete im Bauplan-Editor fälschlich unter "Andere Fahrzeuge" statt bei den
  übrigen Schlauchwagen, ebenso "ELW Drohne"/"ELW2 Drohne"/"MTF Drohne" statt bei "Drohnen" und
  "HLF Schiene" statt bei "Bahnrettung" - der Fahrzeugkatalog (api.lss-manager.de) schreibt diese
  Namen mit Leerzeichen, unsere Zuordnungstabelle kannte nur die Bindestrich-Schreibweise aus der
  In-Game-Anzeige. Systematisch gegen den kompletten Katalog geprüft, keine weiteren Treffer.

- Effizienz: Wachen werden jetzt über `/api/v2/buildings` geladen statt über `/api/buildings`.

- Effizienz: Wachen- und Fahrzeugdaten werden zusätzlich nach dem in der Community diskutierten
  Cache-Format (`sessionStorage`-Schlüssel `aVehicles`/`aBuildings`, 5 Minuten gültig) abgelegt.
  Dadurch übersteht der Cache jetzt auch Seitenwechsel (vorher nur innerhalb eines einzelnen
  Seitenaufrufs gültig) und wird geteilt, falls andere Scripte sich an dasselbe Format halten.

- Code-Aufräumen: die seitenweise Lade-Logik für `/api/v2/vehicles` (`paging.next_page`) und
  `/api/v2/buildings` in eine gemeinsame Funktion (`fetchAllPagesV2`) zusammengeführt - beide
  laden jetzt automatisch nach, falls `next_page` in der Antwort vorhanden ist, sonst bleibt es
  bei einer einzigen Anfrage. Kein Verhaltensunterschied für Accounts unter der jeweiligen
  Seitengröße (aktuell einziger bekannter Fall).

- Code-Aufräumen: der eingeloggte Name wird jetzt direkt aus der vom Spiel bereitgestellten
  globalen Variable gelesen, statt ihn per DOM-Selektor aus dem Profil-Link in der Navbar zu
  scrapen (der bleibt nur noch als Fallback).

- Bugfix: das globale Fehler-Sicherheitsnetz zeigte fälschlich einen "FuxTools-Fehler"-Banner
  an, wenn das Spiel selbst (nicht FuxTools) versucht, einen Sound abzuspielen, bevor man mit
  der Seite interagiert hat (vom Browser blockiert, "NotAllowedError") - FuxTools spielt
  nirgends Audio ab, dieser Fehlertyp wird jetzt ignoriert statt fälschlich zugeordnet.

- Code-Aufräumen: unnötig vorsichtige Fallback-Selektoren beim Umbenennen entfernt (die
  echten Formular-IDs waren längst bekannt), die Kandidatenliste beim Auslesen des
  eingeloggten Namens auf einen Selektor reduziert (ein Kandidat war eine reine Teilmenge
  eines anderen), doppelten Code beim Einlesen der Ausbildungs-Slugs sowie beim Auslesen der
  Namens-Bausteine-Formularfelder (stand identisch an drei Stellen) jeweils in eine
  gemeinsame Funktion zusammengeführt. Keine Verhaltensänderung.

- Effizienz: Wachen (`/api/buildings`) und Fahrzeuge (`/api/v2/vehicles`) wurden bisher von
  fast jedem Modul (Wachenausbau, Wachen-Check, Schulungen, Statistik, Fahrzeug-Besatzung,
  Umbenennen) unabhängig voneinander neu abgerufen - bis zu 6x `/api/buildings` für denselben
  Menü-Durchlauf. Es gibt jetzt einen zentralen, 60 Sekunden gültigen Cache: alle Module teilen
  sich denselben Abruf, bei Wachen mit vielen Tausend Wachen/Fahrzeugen spürbar schneller beim
  Wechseln zwischen den Bildschirmen. Die "Aktualisieren"-Buttons (Wachenausbau, Wachen-Check)
  erzwingen weiterhin einen echten Neuabruf.

- Beta-Entwicklung ist in dieses private Repo umgezogen (siehe README) - der öffentliche
  `beta`-Branch im Haupt-Repo wurde eingestellt. Den dafür überflüssig gewordenen "Zu Beta
  wechseln"-Button (Einstellungen) gibt es deshalb nicht mehr.
- Bugfix: der Mini-Markdown-Renderer (Changelog, "So funktioniert's") zeigte reinen Fliesstext
  bisher als einzelnen Absatz PRO ZEILE im `.md`-Quelltext statt als einen zusammenhängenden
  Absatz - sah bei mehrzeiligem Text wie ein unleserlicher "Wall of Text" mit vielen Lücken aus.
  Zusammenhängende Zeilen werden jetzt korrekt zu einem Absatz zusammengefasst.
- **"So funktioniert's"** wird jetzt live aus `HOW_IT_WORKS.md` in diesem Repo geladen (wie schon
  der Changelog) statt fest im Script zu stehen - Text-Anpassungen kommen so sofort bei allen
  Nutzern an, ohne dafür eine neue Version veröffentlichen zu müssen.
- README auf den aktuellen Stand gebracht (Wachen-Check/Wachenausbau/Schulungen-Assistent,
  Personal-Check und "Aktiv"-Schalter entfernt).
- **Schulungen**: Bugfix - direkt nach dem Bestätigen eines Lehrgangs zeigte die Übersicht noch
  den alten Stand ("Minimum erreicht" fehlte, "X schon im Lehrgang" fehlte), bis man manuell neu
  gescannt hat, weil das Spiel den Status "Im Unterricht" der betroffenen Personen selbst erst
  mit Verzögerung einträgt. Wird jetzt genau wie schon bei der Klassenraum-Belegung sofort
  vorgemerkt, damit die Anzeige direkt nach dem Start stimmt.
- **Wachen-Bauplaner**: der "Aktiv"-Schalter (nur ein Bauplan je Gebäudetyp gleichzeitig aktiv)
  entfällt komplett - war nur für den mittlerweile entfernten Personal-Check nötig. Beliebig
  viele Baupläne je Gebäudetyp möglich, in Schulungen/Wachen-Check wählst du ja ohnehin jedes
  Mal explizit, mit welchem Bauplan geprüft werden soll.
- **Wachen-Check/Schulungen**: die Wachen-Auswahl zeigt jetzt je Leitstelle direkt an, wie viele
  der Wachen dort gerade ausgewählt sind (aktualisiert sich live beim An-/Abhaken).
- Bugfix: Wachen-Check/Schulungen blieben bei "Lade Wachen ..." hängen, wenn schon vor der
  Vereinfachung des Auswahl-Assistenten (kein separater Leitstelle-Schritt mehr) eine Auswahl
  für einen Bauplan gespeichert wurde - das alte Speicherformat wird jetzt automatisch erkannt,
  auf das neue migriert und zurückgeschrieben, statt nur toleriert zu werden. Zusätzlich meldet
  ein neues globales Sicherheitsnetz unerwartete Fehler jetzt sichtbar als Banner statt nur in
  der Browser-Konsole.
- Verwaiste Speicher-Einträge entfernter Funktionen (aktuell: die alte "Wachen
  ausblenden"-Funktion) werden jetzt automatisch bei jedem Start aufgeräumt, statt sich als
  nutzloser Ballast anzusammeln, bis man einmal "Speicher löschen" in den Einstellungen nutzt.

### Wachen-Bauplaner & Wachen-Check
- Eigener Bauplan-Editor je Gebäudetyp: Ausbauten, Fahrzeuge (Feuerwehr-Fahrzeuge nach
  Kategorien gruppiert, auf-/zuklappbar) - benötigtes Personal wird automatisch berechnet
  (Min./Max.-Spalten, inkl. Fahrzeugtypen mit eigener Ausbildungsanforderung wie Dekon-P).
- **Wachen-Check** (vormals "Bauplan Anwenden", jetzt eigener Hauptmenü-Punkt, ersetzt auch den
  früheren separaten Personal-Check): Auswahl-Assistent Bauplan → Wachen, gruppiert nach
  Leitstelle (auf-/zuklappbar, standardmäßig eingeklappt), mit Suche und "alle auswählen" je
  Leitstelle. Ohne gespeicherte Auswahl ist nichts angehakt - die getroffene Auswahl wird je
  Bauplan gespeichert und beim nächsten Öffnen wieder vorbelegt.
- Zeigt Soll/Ist je Wache für Ausbauten (inkl. Ausbaustufe mit "Nächste Stufe"/"Max
  ausbauen"-Buttons), Fahrzeuge (erkennt auch Typen, die an einer Wache existieren, aber gar
  nicht im Bauplan stehen, als Überschuss) und Personal (Ausbildungs-Badges plus
  Gesamtübersicht gesamt/ohne Ausbildung/verfügbar/im Unterricht). Fehlende Ausbauten/Fahrzeuge
  direkt kaufen, überzählige auf einen Klick verkaufen (mit Bestätigung samt Liste aller
  betroffenen Fahrzeug-IDs). Käufe/Verkäufe werden vorläufig vorgemerkt (Uhr-Symbol) und
  automatisch mit dem echten Spielstand abgeglichen, da das Spiel neue Zahlen teils erst nach
  einer Minute zeigt.

### Schulungen
- Auswahl-Assistent Bauplan → Wachen (wie Wachen-Check) statt eines kombinierten Bedarfs über
  ALLE aktiven Baupläne und Wachen eines Gebäudetyps gemischt - wichtig für Accounts mit
  unterschiedlich bestückten Wachen.
- Startet fehlende Lehrgänge automatisch, getrennte Buttons "Ausbilden Minimum"/"Ausbilden
  Maximum". Laufende Lehrgänge werden vorläufig vorgemerkt und "im Unterricht" befindliches
  Personal wird angezeigt und vom noch fehlenden Bedarf abgezogen. Ist das Minimum nur durch
  eine noch laufende Schulung gedeckt, erscheint statt eines verschwundenen Buttons der Hinweis
  "Minimum erreicht (Schulung läuft)".
- Personal, das schon eine andere Ausbildung hat oder "im Unterricht"/"im Einsatz" ist, wird
  nicht mehr doppelt für einen neuen Lehrgang eingeteilt.
- Mehrere Dekon-P-Bugfixes (interne Bezeichnung wich an mehreren Stellen vom Rest des Spiels ab
  - betraf Anzeige, "schon im Lehrgang"-Zählung und den berechneten Bedarf selbst).

### Fahrzeug-Besatzung
- Weist automatisch passend ausgebildetes Personal zu (auch normale Fahrzeuge ohne
  Sonderausbildung), wahlweise Minimum- oder Vollbesatzung, mit Leitstellen-Auswahl vorab.
  Schalter "Nur ergänzen"/"Vollständig anwenden", "Nur ungeschultes Personal zuweisen" (schont
  Spezialisten wie Notarzt bei Fahrzeugen ohne eigene Ausbildungsanforderung) und "Automatisch
  FMS setzen: Ja/Nein".
- Läuft in zwei Runden je Wache (erst Pflicht-Ausbildung plus ungeschultes Personal für JEDES
  Fahrzeug, danach übrige Spezialisten auf Restplätze) - verhindert, dass ein Fahrzeug einem
  anderen an derselben Wache unnötig Personal wegschnappt. Diverse behobene Bugs rund um
  Teil-Anforderungen (z. B. NAW), "Umzug" von Personal zwischen zwei Fahrzeugen im selben Lauf
  und Fahrzeuge mit mehreren gleichzeitigen Ausbildungsanforderungen (z. B. ELW2 Drohne).
- "Alle Zuweisungen rückgängig machen" (mit Bestätigung, setzt FMS korrekt zurück) läuft wie die
  Zuweisung selbst im Hintergrund-Task-System. Fehler-Liste (Kategorie/Wache/Fahrzeug/Status/
  Seit) per Klick auf die Spaltenüberschrift sortierbar.

### Wachenausbau
- Übersicht aller Wachen mit Ausbauten, Ausbaustufe, Personal und Werbestatus, direktes Bauen.
  Leitstellen-Filter zusätzlich zum Gebäudetyp-Filter, Spalten "Wache" und "Stufe" sortierbar.

### Umbenennen (Fahrzeuge, Wachen, Leitstellen)
- Frei einstellbare Namens-Bausteine mit Live-Vorschau und Bestätigung vor dem Ausführen.
- Wachen umbenennen als echte, sortierbare Tabelle (Wachen-ID/Name/Neuer Name) mit Suchfeld
  (Name oder Wachen-ID) und Direktlink zur Wache im Spiel.

### Aufgaben, Verlauf & Allgemeines
- Lang laufende Aktionen (Umbenennen, Fahrzeug-Besatzung inkl. "Alle Zuweisungen rückgängig
  machen") laufen im Hintergrund weiter, auch bei geschlossenem Fenster - eigener
  Navbar-Eintrag (Task-Center) zeigt den Fortschritt live mit Abbrechen-Button je Lauf; ein
  zweiter gestarteter Task landet in einer Warteschlange statt parallel zu laufen. Zeigt
  zusätzlich alle gerade laufenden Lehrgänge (rein informativ).
- Verlauf: jede Aktion erzeugt sofort beim Start einen Eintrag und bestätigt ihn bei Abschluss
  (erkennbar, ob ein Lauf wirklich fertig wurde oder z. B. durch Fenster schließen unterbrochen
  war) - Status- und alle anderen Spalten per Klick auf die Spaltenüberschrift sortierbar.
- Einheitliches Design für alle Bildschirme mit Breadcrumb-Navigation, eigenen
  Bestätigungs-Screens statt Browser-Standarddialogen und einheitlich auf-/zuklappbaren
  Kategorien.
- Einstellungen als Datei sicherbar/wiederherstellbar (z. B. vor einer Neuinstallation).
  Kritische Fehler werden direkt sichtbar angezeigt (statt nur in der Konsole) und landen
  zusätzlich in einem exportierbaren Fehlerprotokoll (inkl. betroffener Wachen-/Fahrzeug-/
  Personal-IDs).
- Netzwerk-Anfragen haben ein Zeitlimit (20s) statt bei einer hängenden Verbindung unbegrenzt
  zu blockieren.
