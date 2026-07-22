# data/

`vehicle-types-fallback.json` ist eine Kopie des Fahrzeug-Katalogs von
`https://api.lss-manager.de/de_DE/vehicles`. FuxTools nutzt diese Datei NICHT im
Normalbetrieb, sondern ausschließlich als Notfall-Ersatz, falls die eigentliche Quelle
(api.lss-manager.de) mal nicht erreichbar ist (siehe `fetchVehicleTypeCatalog()` in
`fuxtools.user.js`).

Die Datei wird zwangsläufig mit der Zeit veraltet (neue Fahrzeugtypen fehlen dann im
Fallback). Sie ab und zu aktualisieren:

```bash
curl -s https://api.lss-manager.de/de_DE/vehicles | python3 -m json.tool --sort-keys > data/vehicle-types-fallback.json
```

Danach committen und pushen (idealerweise auf beiden Branches, `main` und `beta`, da das
Script je nach Kanal die passende Branch-URL lädt).
