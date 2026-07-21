# Hinweise für Claude (und zukünftige Sessions)

## Live-verifizierte Spiel-Endpunkte - NICHT ohne neuen Beweis ändern

Die folgenden Endpunkte in `fuxtools.user.js` wurden per echter Netzwerk-Aufzeichnung eines
manuellen Kaufs/Verkaufs im Spiel (curl-Export aus den Browser-DevTools) bestätigt, NICHT nur
aus Community-Scripten geraten. Vorher waren beide (seit Einführung, nie vorher anders)
POST-basiert mit `X-CSRF-Token`-Header - das schlug live zuverlässig mit 404 fehl.

- **`buyVehicle(buildingId, vehicleTypeId, currency)`**: einfacher **GET** auf
  `/buildings/{buildingId}/vehicle/{buildingId}/{vehicleTypeId}/{currency}?building={buildingId}`,
  KEIN CSRF-Header, KEIN Body. Der Kaufen-Button im Spiel ist ein normaler Linkklick
  (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-User: ?1`), keine AJAX-Anfrage.
- **`sellVehicle(vehicleId)`**: **POST** auf `/vehicles/{vehicleId}`, Body
  `_method=delete&authenticity_token={csrfToken}` (Content-Type
  `application/x-www-form-urlencoded`). Der Token gehört hier als `authenticity_token` IN DEN
  BODY, NICHT als `X-CSRF-Token`-Header (der ist nur für echte AJAX/XHR-Anfragen gedacht -
  dieser Request ist ein normaler Formular-Submit, `Sec-Fetch-Mode: navigate`).

**Bevor du an diesen beiden Funktionen etwas änderst** (Refactoring, "Vereinheitlichung" mit
`buildExtension`/`buildStorage`, o.ä.): das war schon mal genau der Fehler. Ändere sie nur,
wenn der Nutzer eine NEUE, echte Netzwerk-Aufzeichnung (curl-Export) eines fehlgeschlagenen
oder geänderten Requests liefert - nicht aus Vermutung oder Konsistenz-Gründen mit anderen
Bau-Funktionen.

`buildExtension`/`buildStorage` (Ausbauten/Lagerräume kaufen) sind bisher NICHT als defekt
gemeldet worden und laufen weiter über POST + `X-CSRF-Token`-Header - das ist ein anderer,
bisher unbestätigt aber funktionierender Pfad, absichtlich nicht angefasst.

## Versionierung

`@version`-Header-Kommentar UND `const SCRIPT_VERSION` müssen bei JEDER Änderung synchron
hochgezählt werden (nur die PATCH-Ziffer, z.B. 0.9.47 → 0.9.48). MINOR-Version und `1.0.0`
sind ausschließlich Fuxaro (Repo-Owner) vorbehalten.

## Workflow

- Entwicklung läuft auf dem Branch `beta`. Main wird über die GitHub Action
  `release-to-main.yml` befüllt (Kommentare entfernen, Kanal auf stable, Changelog
  übernehmen) - nicht direkt auf main pushen, außer explizit angefordert.
- Nach jeder Änderung: `node -c fuxtools.user.js` (Syntax-Check) vor dem Commit.
- CHANGELOG.md unter `## Beta` bei jeder nennenswerten Änderung ergänzen.
