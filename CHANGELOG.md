# Changelog

Kurzer Überblick über die wichtigsten Neuerungen von FuxTools.

## Beta

- **Wachen-Bauplaner**: eigene Baupläne pro Gebäudetyp (Ausbauten, Fahrzeuge, Personal) -
  zeigt automatisch Soll/Ist je Wache, kann fehlende Ausbauten/Fahrzeuge direkt bauen/kaufen
  und überzählige Fahrzeuge verkaufen.
- **Fahrzeug-Besatzung**: prüft und weist automatisch passend ausgebildetes Personal zu
  (auch für normale Fahrzeuge ohne Sonderausbildung), wahlweise Minimum- oder Vollbesatzung.
- **Personal-Check & Schulungen**: zeigt fehlendes Ausbildungspersonal je Wache - Bedarf
  kommt automatisch aus deinen aktiven Wachen-Bauplänen - und startet fehlende Lehrgänge
  automatisch.
- Einheitliches Design für alle Bildschirme mit Breadcrumb-Navigation, eigener
  FuxTools-Eintrag direkt in der Navigationsleiste.
- Einstellungen lassen sich als Datei sichern und wiederherstellen (z. B. vor einer
  Neuinstallation).
- Kritische Fehler (z. B. beim Start) werden jetzt direkt auf der Seite angezeigt statt nur
  in der Browser-Konsole - hilft uns, Bugs aus der Beta-Phase besser nachzuvollziehen.
- Diese Fehler landen zusätzlich in einem Fehlerprotokoll, das sich in den Einstellungen als
  Datei exportieren lässt - praktisch für Bug-Reports.
- Neuer Button "Changelog anzeigen" in den Einstellungen zeigt diese Liste direkt im Script.
- Neuer Menüpunkt "So funktioniert's" erklärt kurz die empfohlene Reihenfolge der Module.
- **Fahrzeug-Besatzung**: neue Leitstellen-Auswahl vor dem Prüfen/Zuweisen, damit sich gezielt
  nur ein Teil des Accounts bearbeiten lässt. Die Liste nicht vollständig besetzter Fahrzeuge
  zeigt jetzt, seit wann ein Fahrzeug als Problem geführt wird, lässt sich Zeile für Zeile
  oder komplett leeren. Deutlicher sichtbar, welcher Besatzungs-Modus (Minimum/Volle
  Besatzung) gerade aktiv ist - "Volle Besatzung" ist jetzt rot markiert, da er dazu führen
  kann, dass anderen Fahrzeugen Personal fehlt.
- Wachenausbau ans Ende der Modul-Liste verschoben (funktioniert unabhängig von den anderen),
  Suchfeld verkleinert und direkter Link zu "Geforderte Ausbauten anpassen" ergänzt.
- **Bugfix Fahrzeug-Besatzung**: manche Fahrzeuge blieben trotz genug freiem Personal
  unbesetzt (half oft erst beim erneuten Klick) - Ursache war eine Race Condition, wenn
  mehrere Fahrzeuge DERSELBEN Wache gleichzeitig geprüft wurden (teilen sich denselben
  Personal-Pool). Fahrzeuge einer Wache laufen jetzt immer strikt nacheinander, verschiedene
  Wachen weiterhin parallel.
- **Bugfix Fahrzeug-Besatzung**: normale Fahrzeuge (z.B. LF) konnten dabei Personal mit
  wertvoller Sonderausbildung (z.B. Notarzt) bekommen, das eigentlich für NAW/RTW gebraucht
  wird. Personal ohne Sonderausbildung wird jetzt bevorzugt zugewiesen, speziell
  ausgebildetes Personal nur noch als letzte Reserve.
- **Bugfix Fahrzeug-Besatzung**: der eigentliche Grund für "trotz genug Personal bleibt das
  Fahrzeug leer" - Personal, das bereits einem ANDEREN Fahrzeug zugewiesen war, wurde
  komplett übersehen (nur wirklich freies Personal wurde erkannt). FuxTools zieht jetzt bei
  Bedarf Personal von einem anderen Fahrzeug ab und weist es dem gerade geprüften zu (echte
  freie Personen werden aber immer bevorzugt).
- Neuer Button "Alle Zuweisungen rückgängig machen" bei Fahrzeug-Besatzung: zieht mit
  Bestätigung die komplette Besatzung aller Fahrzeuge im gewählten Leitstellen-Bereich ab.
- Rote Warn-/Fehlertexte im Script waren auf dem dunklen Seiten-Theme kaum lesbar (zu
  dunkles Rot) - jetzt durchgängig auf einen helleren, kontrastreicheren Rotton angehoben.
- **Bugfix "Alle Zuweisungen rückgängig machen"**: setzte bisher FMS 6 (nicht besetzt) auf
  die komplett geleerten Fahrzeuge - das löst im Spiel aber eine automatische Nachbesetzung
  aus, genau das Gegenteil von dem, was der Button erreichen soll. Der FMS-Status bleibt
  jetzt unangetastet, nur die Besatzung wird abgezogen.
- **Bugfix Fahrzeug-Besatzung**: Fahrzeuge mit teilweiser Ausbildungsanforderung (z.B. NAW
  braucht nur 1 Notarzt bei 3 Plätzen) blieben unter der Mindestbesatzung hängen, weil die
  restlichen Plätze nie mit normalem Personal aufgefüllt wurden. Wird jetzt bis
  Minimum/Vollbesatzung ergänzt.
- Neuer "Abbrechen"-Button bei Fahrzeug-Besatzung (Kategorie-Prüfung und "Alle Zuweisungen
  rückgängig machen") für lang laufende Durchläufe mit vielen Fahrzeugen.
- Erklärungstexte im gesamten Script gekürzt - nur noch das Wichtigste.
- **Bugfix "Alle Zuweisungen rückgängig machen"**: sprang nach Fertig-/Abbruch-Meldung
  automatisch nach 1,5s zurück ins Hauptmenü - der Endstatus (wie viele Personen von wie
  vielen Fahrzeugen abgezogen wurden) war kaum lesbar. Bleibt jetzt stehen, bis man selbst
  über "Abbrechen" zurückgeht.
- **Bugfix Fahrzeug-Besatzung**: nach Wechsel von "Volle Besatzung" zurück auf "Minimum" blieb
  überzähliges Personal auf bereits voll besetzten Fahrzeugen stehen. Wird beim nächsten
  Prüfen/Zuweisen jetzt wieder bis auf die Mindestbesatzung abgezogen (Teil-Anforderungen
  bleiben dabei eingehalten), damit es für andere Fahrzeuge frei wird.
- Hauptmenü: Fahrzeug-Besatzung und Wachenausbau in eine eigene Sektion "Helfer" verschoben -
  Wachen-Bauplaner, Personal-Check und Schulungen (die zusammenhängen) bleiben für sich unter
  der Sektion "Wachenplanung" (vorher "Wachen & Fahrzeuge", passte nach der Aufteilung nicht
  mehr).
- **Bugfix Layout**: bei langen Listen (z.B. viele Fahrzeugtypen bei "Fahrzeuge umbenennen")
  rutschten noch nicht gescrollte Zeilen sichtbar unter die Aktions-Buttons durch. Die Buttons
  liegen jetzt in einer eigenen, nicht scrollenden Zeile unterhalb der Liste (wie Kopf-/
  Fusszeile) statt als "sticky" Element innerhalb des Scrollbereichs - betrifft automatisch
  alle Bildschirme mit Aktions-Buttons.
- **Wachen umbenennen**: fragt jetzt vorher die Leitstelle(n) ab (wie bei "Fahrzeuge
  umbenennen"), statt immer alle Wachen im ganzen Account anzuzeigen.
- **Netzwerk-Timeout**: kein Netzwerk-Aufruf im Script hatte bisher ein Zeitlimit - eine
  haengende Verbindung (Anfrage raus, aber nie eine Antwort) konnte einen Lauf unbegrenzt
  blockieren, auch "Abbrechen" half in dem Moment nicht. Jeder Aufruf bricht jetzt nach 20s
  selbst ab und wird wie ein normaler Netzwerkfehler behandelt (einzelnes Fahrzeug/Wache als
  Fehler markiert, der Rest läuft weiter) - betrifft auch Umbenennen, Bauen/Verkaufen,
  Schulungen usw. Timeouts landen zusätzlich im Fehlerprotokoll.
- **Fahrzeug-Besatzung**: Wachen liefen schon strikt sequenziell (verschiedene Wachen aber
  parallel) - die Anzahl gleichzeitiger Wachen wurde von 3 auf 8 erhöht, damit ein
  Durchlauf bei sehr vielen Fahrzeugen (mehrere Tausend) nicht unnötig lange dauert.
- **Fehlerprotokoll**: neuer Button "Anzeigen" in den Einstellungen zeigt die letzten Fehler
  direkt im Script an, statt nur als Datei herunterladbar zu sein.

## Stable (v0.5.1)

- **Umbenennen**: Fahrzeuge, Wachen und Leitstellen mit frei einstellbaren
  Namens-Bausteinen, inkl. Live-Vorschau und Bestätigung vor dem Ausführen.
- **Wachenausbau**: Übersicht aller Wachen mit Ausbauten, Personal und Werbestatus -
  Ausbauten, Ausbaustufen und Lagerräume direkt aus der Liste bauen.
- **Verlauf**: alle über FuxTools durchgeführten Aktionen mit Datum und Kosten.
- Automatischer Update-Check, Stable- und Beta-Kanal wählbar.
