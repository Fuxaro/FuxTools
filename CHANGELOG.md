# Changelog

**Versionierungsregel (0.x-Phase):** letzte Ziffer (Patch, z. B. `0.1.1` → `0.1.2`) für kleine
Anpassungen/Bugfixes. Die mittlere Ziffer (Minor, `0.x.0`) wird nur für echte neue Funktionen
hochgezählt – **und nur nach Rücksprache**, d. h. bevor z. B. auf `0.2.0` hochgegangen wird, wird
das vorher abgestimmt. Der Sprung auf `1.0.0` markiert den ersten stabilen Release und wird
ebenfalls erst nach Absprache gesetzt.

Bei jeder Änderung, die live gehen soll: `@version` im Script hochzählen und pushen. Ohne
Versionserhöhung erkennt Tampermonkey kein Update.

- **0.1.4** – Neuer Menüpunkt "Einstellungen": Anzeige von Version/Kanal (Stable/Beta), manueller
  "Nach Updates suchen"-Button, sowie ein Button zum Umschalten zwischen Stable- und Beta-Kanal
  (Tampermonkey fragt dabei einmal zur Bestätigung, danach läuft der gewählte Kanal inkl.
  Auto-Update). Neuerungen landen ab jetzt zuerst auf dem `beta`-Branch, bevor sie auf `main`
  übernommen werden.
- **0.1.3** – Namens-Bausteine beim Umbenennen: Text 1, Fahrzeugtyp-Name, Text 2 und Nummer sind
  jetzt einzeln zu- und abschaltbar; Text 1/Text 2 gelten global für alle ausgewählten Fahrzeugtypen.
- **0.1.2** – Wartungs-Release, keine funktionalen Änderungen.
- **0.1.1 (Public Release)** –
