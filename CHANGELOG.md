# Changelog

Kurzer Überblick über die wichtigsten Neuerungen von FuxTools.

## Stable (v0.9.27)

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
- "So funktioniert's" erscheint jetzt automatisch beim allerersten Öffnen von FuxTools -
  "Bestätigen" merkt sich das dauerhaft, danach nur noch manuell über den Menüpunkt erreichbar.
