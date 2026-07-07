// ==UserScript==
// @name        * FuxTools
// @namespace   custom.leitstellenspiel.de
// @version     0.4.8
// @author      Fuxaro
// @license     CC BY-NC-SA 4.0 - https://creativecommons.org/licenses/by-nc-sa/4.0/
// @description FuxTools - Wachen- und Fahrzeugverwaltung für leitstellenspiel.de: Wache(n) auswählen, pro Fahrzeugtyp einen Namen vergeben, automatisch durchnummeriert umbenennen oder zurücksetzen.
// @match       https://www.leitstellenspiel.de/
// @match       https://polizei.leitstellenspiel.de/
// @icon        https://www.google.com/s2/favicons?sz=64&domain=leitstellenspiel.de
// @updateURL   https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/fuxtools.user.js
// @downloadURL https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/fuxtools.user.js
// @run-at      document-idle
// @grant       GM.setValue
// @grant       GM.getValue
// @grant       GM.deleteValue
// @grant       unsafeWindow
// ==/UserScript==

// -----------------------------------------------------------------------------
// FuxTools - (c) Fuxaro
//
// Dieses Werk steht unter der Creative Commons Attribution-NonCommercial-
// ShareAlike 4.0 International Lizenz (CC BY-NC-SA 4.0).
// https://creativecommons.org/licenses/by-nc-sa/4.0/
//
// Kurz: Nutzen, Veraendern und Weitergeben erlaubt - Namensnennung (Fuxaro)
// erforderlich, keine kommerzielle Nutzung, veraenderte Versionen muessen
// unter derselben Lizenz weitergegeben werden. Siehe LICENSE im Repository
// fuer die genauen Bedingungen.
// -----------------------------------------------------------------------------

(async function () {
  //////////////////////////////////////////////////////////////////////////////
  // KONFIGURATION - bei jedem Release/Beta-Push hier pruefen und anpassen.
  //
  //   SCRIPT_VERSION  muss manuell synchron mit dem @version-Wert im Header
  //                   ganz oben in der Datei gehalten werden.
  //   CHANNEL         "stable" auf dem main-Branch, "beta" auf dem beta-Branch.
  //                   Muss zusammen mit @updateURL/@downloadURL im Header oben
  //                   passend zum jeweiligen Branch gesetzt sein.
  //////////////////////////////////////////////////////////////////////////////
  const SCRIPT_VERSION = "0.4.8";
  const CHANNEL = "beta"; // "stable" oder "beta"
  //////////////////////////////////////////////////////////////////////////////

  const STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js";
  const BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/fuxtools.user.js";
  const UPDATE_CHECK_URL = CHANNEL === "beta" ? BETA_URL : STABLE_URL;
  // Immer main, unabhaengig vom Kanal - das Logo ist ein reines Bild-Asset ohne
  // Versionsbezug und liegt deshalb nur auf einem Branch (main), nicht auf beta.
  const LOGO_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/logo-small.png";

  let modalFooterEl = null;
  let availableUpdateVersion = null;
  let lastUpdateCheckAt = 0;
  const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  // Gesetzt, sobald irgendwo ein Update-Tab geoeffnet wurde (Update-Button in den
  // Einstellungen oder "Neuinstallation erzwingen") - beim naechsten Oeffnen von
  // FuxTools in diesem Tab wird dann einmalig neu geladen, damit garantiert die neue
  // Version laeuft, falls der User sie im anderen Tab installiert hat. Bewusst kein
  // sofortiger Reload-Zwang, da der User den Tampermonkey-Dialog im anderen Tab erst
  // in Ruhe bestaetigen koennen soll.
  let pendingReloadAfterUpdate = false;
  let renameCancelled = false;

  // Fenster-Breite je Bildschirm-Typ: schmal fuer reine Menue-/Formular-Bildschirme,
  // breit fuer den Wachen-Check mit seiner Tabelle - vermeidet leere Flaechen links/
  // rechts bei einfachen Bildschirmen, ohne die Tabelle einzuquetschen.
  const MODAL_WIDTH_COMPACT = 520;
  const MODAL_WIDTH_DEFAULT = 900;
  const MODAL_WIDTH_WIDE = 1400;

  function setModalWidth(px) {
    const dialog = document.getElementById("vehicle-naming-modal-dialog");
    if (!dialog) return;
    dialog.style.minWidth = `min(${px}px, 95%)`;
    dialog.style.maxWidth = `min(${px}px, 95%)`;
  }

  const modalId = "vehicle-naming-modal";
  const cacheKeyVehicleTypes = "vehicleTypes";

  let vehicleTypeCaptions = {};
  let namesStore = {};

  // Kategorisierung der Gebaeudetypen (building_type-ID), abgeglichen mit der
  // offiziellen deutschen Gebaeudetypen-Liste des Spiels. Kleinwachen teilen sich
  // die building_type-ID mit ihrem normalen Pendant (z.B. Feuerwache/Feuerwache
  // Kleinwache sind beide 0) und werden separat ueber "small_building" erkannt -
  // brauchen deshalb keine eigenen IDs in dieser Liste. Schulen (Ausbildungsgebaeude)
  // stehen zusammen mit dem Krankenhaus in einer eigenen Kategorie statt bei ihrer
  // jeweiligen Fachrichtung.
  const BUILDING_CATEGORIES = {
    Feuerwehr: [0],
    Rettungsdienst: [2, 5, 12, 15, 21, 25],
    "Krankenhäuser & Schulen": [1, 3, 4, 8, 10, 27],
    Polizei: [6, 11, 13, 17, 24, 29],
    THW: [9],
    Seenotrettung: [26, 28],
    Sonstiges: [7, 14, 16, 22, 23],
  };
  const BUILDING_TYPE_TO_CATEGORY = {};
  for (const [category, ids] of Object.entries(BUILDING_CATEGORIES)) {
    for (const id of ids) BUILDING_TYPE_TO_CATEGORY[id] = category;
  }
  const CATEGORY_ORDER = [
    "Feuerwehr",
    "Rettungsdienst",
    "Krankenhäuser & Schulen",
    "Polizei",
    "THW",
    "Seenotrettung",
    "Sonstiges",
    "Unbekannt",
  ];

  function categoryForBuilding(building) {
    const typeId = building?.building_type ?? building?.type;
    return BUILDING_TYPE_TO_CATEGORY[typeId] ?? "Unbekannt";
  }

  // "Pseudo-Gebaeudetypen": Kleinwachen teilen sich die building_type-ID mit ihrem
  // normalen Pendant (z.B. Feuerwache/Feuerwache Kleinwache sind beide 0), haben aber
  // teils andere empfohlene Ausbauten - deshalb eigene IDs hier, analog zur Nummerierung
  // die auch die externe Ausbau-Bezeichnungs-Quelle (siehe loadExtensionCatalog) nutzt.
  const PSEUDO_BUILDING_TYPES = [
    { id: "0", buildingType: 0, smallBuilding: false },
    { id: "1", buildingType: 1, smallBuilding: false },
    { id: "2", buildingType: 2, smallBuilding: false },
    { id: "3", buildingType: 3, smallBuilding: false },
    { id: "4", buildingType: 4, smallBuilding: false },
    { id: "5", buildingType: 5, smallBuilding: false },
    { id: "6", buildingType: 6, smallBuilding: false },
    { id: "7", buildingType: 7, smallBuilding: false },
    { id: "8", buildingType: 8, smallBuilding: false },
    { id: "9", buildingType: 9, smallBuilding: false },
    { id: "10", buildingType: 10, smallBuilding: false },
    { id: "11", buildingType: 11, smallBuilding: false },
    { id: "12", buildingType: 12, smallBuilding: false },
    { id: "13", buildingType: 13, smallBuilding: false },
    { id: "14", buildingType: 14, smallBuilding: false },
    { id: "15", buildingType: 15, smallBuilding: false },
    { id: "16", buildingType: 16, smallBuilding: false },
    { id: "17", buildingType: 17, smallBuilding: false },
    { id: "18", buildingType: 0, smallBuilding: true },
    { id: "19", buildingType: 6, smallBuilding: true },
    { id: "20", buildingType: 2, smallBuilding: true },
    { id: "21", buildingType: 21, smallBuilding: false },
    { id: "22", buildingType: 22, smallBuilding: false },
    { id: "23", buildingType: 23, smallBuilding: false },
    { id: "24", buildingType: 24, smallBuilding: false },
    { id: "25", buildingType: 25, smallBuilding: false },
    { id: "26", buildingType: 26, smallBuilding: false },
    { id: "27", buildingType: 27, smallBuilding: false },
    { id: "28", buildingType: 28, smallBuilding: false },
    { id: "29", buildingType: 29, smallBuilding: false },
  ];

  function getPseudoBuildingTypeId(building) {
    const entry = PSEUDO_BUILDING_TYPES.find(
      t => t.buildingType === building.building_type && t.smallBuilding === !!building.small_building,
    );
    return entry ? entry.id : null;
  }

  // Lesbare Gebaeudetyp-Namen, unabhaengig vom (frei waehlbaren) Wachen-Namen - wichtig
  // im Wachen-Check, damit man bei einer umbenannten Wache trotzdem sofort sieht, um
  // welchen Gebaeudetyp es sich handelt. Schluessel wie bei EXTENSION_CATALOG etc.
  const BUILDING_TYPE_NAMES = {
    "0_normal": "Feuerwache",
    "0_small": "Feuerwache (Kleinwache)",
    "1_normal": "Feuerwehrschule",
    "2_normal": "Rettungswache",
    "2_small": "Rettungswache (Kleinwache)",
    "3_normal": "Rettungsschule",
    "4_normal": "Krankenhaus",
    "5_normal": "Rettungshubschrauber-Station",
    "6_normal": "Polizeiwache",
    "6_small": "Polizeiwache (Kleinwache)",
    "7_normal": "Leitstelle",
    "8_normal": "Polizeischule",
    "9_normal": "Technisches Hilfswerk",
    "10_normal": "THW-Bundesschule",
    "11_normal": "Bereitschaftspolizei",
    "12_normal": "Schnelleinsatzgruppe (SEG)",
    "13_normal": "Polizeihubschrauberstation",
    "14_normal": "Bereitstellungsraum",
    "15_normal": "Wasserrettung",
    "16_normal": "Verbandszellen",
    "17_normal": "Polizei-Sondereinheiten",
    "21_normal": "Rettungshundestaffel",
    "22_normal": "Großer Komplex",
    "23_normal": "Kleiner Komplex",
    "24_normal": "Reiterstaffel",
    "25_normal": "Bergrettungswache",
    "26_normal": "Seenotrettungswache",
    "27_normal": "Schule für Seefahrt und Seenotrettung",
    "28_normal": "Hubschrauberstation (Seenotrettung)",
    "29_normal": "Autobahnpolizei",
  };

  // Empfohlene Ausbauten je Pseudo-Gebaeudetyp, uebernommen aus einem bekannten
  // Community-Skript ("Gebaeude- & Fuhrparkverwalter") - keine offizielle Vorgabe
  // des Spiels, nur ein Richtwert. Nur Gebaeudetypen mit Eintrag hier werden im
  // Wachen-Check auf fehlende Ausbauten geprueft.
  const RECOMMENDED_EXTENSIONS_BY_PSEUDO_ID = {
    "0": [16, 18, 25], // Feuerwache
    "1": [0, 1, 2], // Feuerwehrschule
    "2": [], // Rettungswache
    "3": [0, 1, 2], // Rettungsschule
    "4": [0, 1, 2, 3, 4, 5, 6, 7, 8], // Krankenhaus
    "5": [], // Rettungshubschrauber-Station
    "6": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16], // Polizeiwache
    "8": [0, 1, 2], // Polizeischule
    "9": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15], // THW
    "10": [0, 1, 2], // THW Bundesschule
    "11": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // Bereitschaftspolizei
    "12": [0, 1, 3, 4, 5, 6], // Schnelleinsatzgruppe (SEG)
    "13": [], // Polizeihubschrauberstation
    "15": [], // Wasserrettung
    "17": [], // Polizei-Sondereinheiten
    "18": [18], // Feuerwache (Kleinwache)
    "19": [0, 1, 12], // Polizeiwache (Kleinwache)
    "20": [], // Rettungswache (Kleinwache)
    "21": [], // Rettungshundestaffel
    "24": [], // Reiterstaffel
    "25": [0, 1, 2, 3], // Bergrettungswache
    "26": [], // Seenotrettungswache
    "27": [0, 1, 2], // Schule fuer Seefahrt und Seenotrettung
    "28": [], // Hubschrauberstation (Seenotrettung)
    "29": [], // Autobahnpolizei
  };

  // Soll-Personal je Pseudo-Gebaeudetyp, aus derselben Community-Skript-Quelle wie
  // RECOMMENDED_EXTENSIONS_BY_PSEUDO_ID - nur zur Anzeige (aktuell/soll, farbig), keine
  // automatische Korrektur mehr. Gebaeudetypen ohne Eintrag haben kein Soll-Personal
  // (z.B. Schulen, Krankenhaus, Leitstelle) und zeigen nur die reine Anzahl.
  const PERSONNEL_SET_POINT_BY_PSEUDO_ID = {
    "0": 260, // Feuerwache
    "2": 80, // Rettungswache
    "5": 20, // Rettungshubschrauber-Station
    "6": 80, // Polizeiwache
    "9": 160, // THW
    "11": 400, // Bereitschaftspolizei
    "12": 140, // Schnelleinsatzgruppe (SEG)
    "13": 30, // Polizeihubschrauberstation
    "15": 20, // Wasserrettung
    "17": 110, // Polizei-Sondereinheiten
    "18": 260, // Feuerwache (Kleinwache)
    "19": 80, // Polizeiwache (Kleinwache)
    "20": 80, // Rettungswache (Kleinwache)
    "21": 40, // Rettungshundestaffel
    "24": 200, // Reiterstaffel
    "25": 60, // Bergrettungswache
    "26": 50, // Seenotrettungswache
    "28": 6, // Hubschrauberstation (Seenotrettung)
    "29": 20, // Autobahnpolizei
  };

  //////////////////////////////////////////////////
  // Ausbau-Katalog: echte Namen, Kosten (Credits/Coins) fuer Ausbauten, Lagerraeume und
  // Ausbaustufen, uebernommen aus einem bekannten Community-Skript ("Erweiterungs-
  // Manager" von Caddy21). Schluessel: "<building_type>_normal" oder "<building_type>_
  // small" (Kleinwache). Ermoeglicht das direkte Bauen aus FuxTools heraus.
  //////////////////////////////////////////////////

  function getBuildingKey(building) {
    return `${building.building_type}_${building.small_building ? "small" : "normal"}`;
  }

  const EXTENSION_CATALOG = {
    "0_normal": [
      { id: 0, name: "Rettungsdienst", cost: 100000, coins: 20 },
      { id: 1, name: "1te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 2, name: "2te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 3, name: "3te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 4, name: "4te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 5, name: "5te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 6, name: "Wasserrettung", cost: 400000, coins: 25 },
      { id: 7, name: "6te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 8, name: "Flughafenfeuerwehr", cost: 300000, coins: 25 },
      { id: 9, name: "Großwache", cost: 1000000, coins: 50 },
      { id: 10, name: "7te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 11, name: "8te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 12, name: "9te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 13, name: "Werkfeuerwehr", cost: 100000, coins: 20 },
      { id: 14, name: "Netzersatzanlage 50", cost: 100000, coins: 20 },
      { id: 15, name: "Netzersatzanlage 200", cost: 100000, coins: 20 },
      { id: 16, name: "Großlüfter", cost: 75000, coins: 15 },
      { id: 17, name: "10te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 18, name: "Drohneneinheit", cost: 150000, coins: 25 },
      { id: 19, name: "Verpflegungsdienst", cost: 200000, coins: 25 },
      { id: 20, name: "1te Anhänger Stellplatz", cost: 75000, coins: 15 },
      { id: 21, name: "2te Anhänger Stellplatz", cost: 75000, coins: 15 },
      { id: 22, name: "3te Anhänger Stellplatz", cost: 75000, coins: 15 },
      { id: 23, name: "4te Anhänger Stellplatz", cost: 75000, coins: 15 },
      { id: 24, name: "5te Anhänger Stellplatz", cost: 75000, coins: 15 },
      { id: 25, name: "Bahnrettung", cost: 125000, coins: 25 },
      { id: 26, name: "11te Ab-Stellplatz", cost: 150000, coins: 20 },
      { id: 27, name: "12te Ab-Stellplatz", cost: 150000, coins: 20 },
    ],
    "0_small": [
      { id: 0, name: "Rettungsdienst", cost: 100000, coins: 20 },
      { id: 1, name: "1te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 2, name: "2te AB-Stellplatz", cost: 100000, coins: 20 },
      { id: 6, name: "Wasserrettung", cost: 400000, coins: 25 },
      { id: 8, name: "Flughafenfeuerwehr", cost: 300000, coins: 25 },
      { id: 13, name: "Werkfeuerwehr", cost: 100000, coins: 20 },
      { id: 14, name: "Netzersatzanlage 50", cost: 100000, coins: 20 },
      { id: 16, name: "Großlüfter", cost: 75000, coins: 25 },
      { id: 18, name: "Drohneneinheit", cost: 150000, coins: 25 },
      { id: 19, name: "Verpflegungsdienst", cost: 200000, coins: 25 },
      { id: 20, name: "1te Anhänger Stellplatz", cost: 75000, coins: 15 },
      { id: 21, name: "2te Anhänger Stellplatz", cost: 75000, coins: 15 },
      { id: 25, name: "Bahnrettung", cost: 125000, coins: 25 },
    ],
    "1_normal": [
      { id: 0, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 1, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 2, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
    ],
    "2_normal": [{ id: 0, name: "Großwache", cost: 1000000, coins: 50 }],
    "3_normal": [
      { id: 0, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 1, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 2, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
    ],
    "4_normal": [
      { id: 0, name: "Allgemeine Innere", cost: 10000, coins: 10 },
      { id: 1, name: "Allgemeine Chirurgie", cost: 10000, coins: 10 },
      { id: 2, name: "Gynäkologie", cost: 70000, coins: 15 },
      { id: 3, name: "Urologie", cost: 70000, coins: 15 },
      { id: 4, name: "Unfallchirurgie", cost: 70000, coins: 15 },
      { id: 5, name: "Neurologie", cost: 70000, coins: 15 },
      { id: 6, name: "Neurochirurgie", cost: 70000, coins: 15 },
      { id: 7, name: "Kardiologie", cost: 70000, coins: 15 },
      { id: 8, name: "Kardiochirurgie", cost: 70000, coins: 15 },
      { id: 9, name: "Großkrankenhaus", cost: 200000, coins: 50 },
    ],
    "5_normal": [{ id: 0, name: "Windenrettung", cost: 200000, coins: 15 }],
    "6_normal": [
      { id: 0, name: "1te Zelle", cost: 25000, coins: 5 },
      { id: 1, name: "2te Zelle", cost: 25000, coins: 5 },
      { id: 2, name: "3te Zelle", cost: 25000, coins: 5 },
      { id: 3, name: "4te Zelle", cost: 25000, coins: 5 },
      { id: 4, name: "5te Zelle", cost: 25000, coins: 5 },
      { id: 5, name: "6te Zelle", cost: 25000, coins: 5 },
      { id: 6, name: "7te Zelle", cost: 25000, coins: 5 },
      { id: 7, name: "8te Zelle", cost: 25000, coins: 5 },
      { id: 8, name: "9te Zelle", cost: 25000, coins: 5 },
      { id: 9, name: "10te Zelle", cost: 25000, coins: 5 },
      { id: 10, name: "Diensthundestaffel", cost: 100000, coins: 10 },
      { id: 11, name: "Kriminalpolizei", cost: 100000, coins: 20 },
      { id: 12, name: "Dienstgruppenleitung", cost: 200000, coins: 25 },
      { id: 13, name: "Motorradstaffel", cost: 75000, coins: 15 },
      { id: 14, name: "Großwache", cost: 1000000, coins: 50 },
      { id: 15, name: "Großgewahrsam", cost: 200000, coins: 50 },
      { id: 16, name: "Autobahnpolizei", cost: 75000, coins: 15 },
    ],
    "6_small": [
      { id: 0, name: "1te Zelle", cost: 25000, coins: 5 },
      { id: 1, name: "2te Zelle", cost: 25000, coins: 5 },
      { id: 10, name: "Diensthundestaffel", cost: 100000, coins: 10 },
      { id: 11, name: "Kriminalpolizei", cost: 100000, coins: 20 },
      { id: 12, name: "Dienstgruppenleitung", cost: 200000, coins: 25 },
      { id: 13, name: "Motorradstaffel", cost: 75000, coins: 15 },
      { id: 16, name: "Autobahnpolizei", cost: 75000, coins: 15 },
    ],
    "8_normal": [
      { id: 0, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 1, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 2, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
    ],
    "9_normal": [
      { id: 0, name: "1. Technischer Zug: Fachgruppe Notversorgung/Notinstandsetzung", cost: 25000, coins: 5 },
      { id: 1, name: "1. Technischer Zug: Zugtrupp", cost: 25000, coins: 5 },
      { id: 2, name: "Fachgruppe Räumen", cost: 25000, coins: 5 },
      { id: 3, name: "Fachgruppe Wassergefahren", cost: 500000, coins: 15 },
      { id: 4, name: "2. Technischer Zug - Bergungsgruppe", cost: 25000, coins: 5 },
      { id: 5, name: "2. Technischer Zug: Notversorgung/Notinstandsetzung", cost: 25000, coins: 5 },
      { id: 6, name: "2. Technischer Zug: Zugtrupp", cost: 25000, coins: 5 },
      { id: 7, name: "Fachgruppe Ortung", cost: 450000, coins: 25 },
      { id: 8, name: "Fachgruppe Wasserschaden/Pumpen", cost: 200000, coins: 25 },
      { id: 9, name: "Fachgruppe Schwere Bergung", cost: 200000, coins: 25 },
      { id: 10, name: "Fachgruppe Elektroversorgung", cost: 200000, coins: 25 },
      { id: 11, name: "Ortsverband-Mannschaftstransportwagen", cost: 50000, coins: 15 },
      { id: 12, name: "Trupp Unbemannte Luftfahrtsysteme", cost: 50000, coins: 15 },
      { id: 13, name: "Fachzug Führung und Kommunikation", cost: 300000, coins: 25 },
      { id: 14, name: "Fachgruppe Logistik-Verpflegung", cost: 50000, coins: 15 },
      { id: 15, name: "Fachgruppe Brückenbau", cost: 50000, coins: 15 },
    ],
    "10_normal": [
      { id: 0, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 1, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 2, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
    ],
    "11_normal": [
      { id: 0, name: "2. Zug der 1. Hundertschaft", cost: 25000, coins: 5 },
      { id: 1, name: "3. Zug der 1. Hundertschaft", cost: 25000, coins: 5 },
      { id: 2, name: "Sonderfahrzeug: Gefangenenkraftwagen", cost: 25000, coins: 5 },
      { id: 3, name: "Technischer Zug: Wasserwerfer", cost: 25000, coins: 5 },
      { id: 4, name: "SEK: 1. Zug", cost: 100000, coins: 10 },
      { id: 5, name: "SEK: 2. Zug", cost: 100000, coins: 10 },
      { id: 6, name: "MEK: 1. Zug", cost: 100000, coins: 10 },
      { id: 7, name: "MEK: 2. Zug", cost: 100000, coins: 10 },
      { id: 8, name: "Diensthundestaffel", cost: 100000, coins: 10 },
      { id: 9, name: "Reiterstaffel", cost: 300000, coins: 25 },
      { id: 10, name: "Lautsprecherkraftwagen", cost: 100000, coins: 10 },
    ],
    "12_normal": [
      { id: 0, name: "Führung", cost: 25000, coins: 5 },
      { id: 1, name: "Sanitätsdienst", cost: 25000, coins: 5 },
      { id: 2, name: "Wasserrettung", cost: 500000, coins: 25 },
      { id: 3, name: "Rettungshundestaffel", cost: 350000, coins: 25 },
      { id: 4, name: "SEG-Drohne", cost: 50000, coins: 15 },
      { id: 5, name: "Betreuungs- und Verpflegungsdienst", cost: 200000, coins: 25 },
      { id: 6, name: "Technik und Sicherheit", cost: 200000, coins: 25 },
    ],
    "13_normal": [
      { id: 0, name: "Außenlastbehälter", cost: 200000, coins: 15 },
      { id: 1, name: "Windenrettung", cost: 200000, coins: 15 },
    ],
    "17_normal": [
      { id: 0, name: "SEK: 1. Zug", cost: 100000, coins: 10 },
      { id: 1, name: "SEK: 2. Zug", cost: 100000, coins: 10 },
      { id: 2, name: "MEK: 1. Zug", cost: 100000, coins: 10 },
      { id: 3, name: "MEK: 2. Zug", cost: 100000, coins: 10 },
      { id: 4, name: "Diensthundestaffel", cost: 100000, coins: 10 },
    ],
    "24_normal": [
      { id: 0, name: "Reiterstaffel", cost: 300000, coins: 25 },
      { id: 1, name: "Reiterstaffel", cost: 300000, coins: 25 },
      { id: 2, name: "Reiterstaffel", cost: 300000, coins: 25 },
      { id: 3, name: "Reiterstaffel", cost: 300000, coins: 25 },
      { id: 4, name: "Reiterstaffel", cost: 300000, coins: 25 },
      { id: 5, name: "Reiterstaffel", cost: 300000, coins: 25 },
    ],
    "25_normal": [
      { id: 0, name: "Höhenrettung", cost: 50000, coins: 25 },
      { id: 1, name: "Drohneneinheit", cost: 75000, coins: 25 },
      { id: 2, name: "Rettungshundestaffel", cost: 350000, coins: 25 },
      { id: 3, name: "Rettungsdienst", cost: 100000, coins: 20 },
    ],
    "27_normal": [
      { id: 0, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 1, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
      { id: 2, name: "Weiterer Klassenraum", cost: 400000, coins: 40 },
    ],
    "29_normal": [
      { id: 0, name: "1te Zelle", cost: 25000, coins: 5 },
      { id: 1, name: "2te Zelle", cost: 25000, coins: 5 },
      { id: 2, name: "3te Zelle", cost: 25000, coins: 5 },
      { id: 3, name: "4te Zelle", cost: 25000, coins: 5 },
      { id: 4, name: "5te Zelle", cost: 25000, coins: 5 },
      { id: 5, name: "6te Zelle", cost: 25000, coins: 5 },
      { id: 6, name: "7te Zelle", cost: 25000, coins: 5 },
      { id: 7, name: "8te Zelle", cost: 25000, coins: 5 },
      { id: 8, name: "9te Zelle", cost: 25000, coins: 5 },
      { id: 9, name: "10te Zelle", cost: 25000, coins: 5 },
    ],
  };

  const STORAGE_CATALOG = {
    "0_normal": [
      { id: "initial_containers", name: "Lagerraum", cost: 25000, coins: 10 },
      { id: "additional_containers_1", name: "1te Zusätzlicher Lagerraum", cost: 50000, coins: 12 },
      { id: "additional_containers_2", name: "2te Zusätzlicher Lagerraum", cost: 50000, coins: 12 },
      { id: "additional_containers_3", name: "3te Zusätzlicher Lagerraum", cost: 100000, coins: 15 },
      { id: "additional_containers_4", name: "4te Zusätzlicher Lagerraum", cost: 100000, coins: 15 },
      { id: "additional_containers_5", name: "5te Zusätzlicher Lagerraum", cost: 100000, coins: 15 },
      { id: "additional_containers_6", name: "6te Zusätzlicher Lagerraum", cost: 100000, coins: 15 },
      { id: "additional_containers_7", name: "7te Zusätzlicher Lagerraum", cost: 100000, coins: 15 },
    ],
    "0_small": [
      { id: "initial_containers", name: "Lagerraum", cost: 25000, coins: 10 },
      { id: "additional_containers_1", name: "1te Zusätzlicher Lagerraum", cost: 50000, coins: 10 },
      { id: "additional_containers_2", name: "2te Zusätzlicher Lagerraum", cost: 50000, coins: 10 },
    ],
    "5_normal": [{ id: "initial_helicopter_equipment", name: "Lagerraum", cost: 25000, coins: 10 }],
    "13_normal": [{ id: "initial_helicopter_equipment", name: "Lagerraum", cost: 25000, coins: 10 }],
  };

  // Ausbaustufen-Kosten je Stufe (kumulativ ansteigend, direkt auf eine Zielstufe
  // ausbaubar). Separates System von den einzelnen Ausbauten oben - "level" auf dem
  // Gebaeude-Objekt ist die aktuell erreichte Stufe.
  function buildUniformLevels(count, cost, coins) {
    return Array.from({ length: count }, (_, i) => ({ id: i, cost, coins }));
  }
  const LEVEL_CATALOG = {
    "0_normal": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      ...buildUniformLevels(17, 100000, 20).map((l, i) => ({ id: i + 2, cost: l.cost, coins: l.coins })),
    ],
    "0_small": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      { id: 2, cost: 100000, coins: 20 },
      { id: 3, cost: 100000, coins: 20 },
      { id: 4, cost: 100000, coins: 20 },
    ],
    "2_normal": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      ...Array.from({ length: 12 }, (_, i) => ({ id: i + 2, cost: 100000, coins: 20 })),
    ],
    "2_small": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      { id: 2, cost: 100000, coins: 20 },
      { id: 3, cost: 100000, coins: 20 },
      { id: 4, cost: 100000, coins: 20 },
    ],
    "4_normal": Array.from({ length: 20 }, (_, i) => ({ id: i, cost: 19000, coins: 11 })),
    "6_normal": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      ...Array.from({ length: 12 }, (_, i) => ({ id: i + 2, cost: 100000, coins: 20 })),
    ],
    "6_small": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      { id: 2, cost: 100000, coins: 20 },
      { id: 3, cost: 100000, coins: 20 },
      { id: 4, cost: 100000, coins: 20 },
    ],
    "15_normal": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      { id: 2, cost: 100000, coins: 20 },
      { id: 3, cost: 100000, coins: 20 },
      { id: 4, cost: 100000, coins: 20 },
    ],
    "25_normal": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      ...Array.from({ length: 12 }, (_, i) => ({ id: i + 2, cost: 100000, coins: 20 })),
    ],
    "26_normal": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      { id: 2, cost: 100000, coins: 20 },
      { id: 3, cost: 100000, coins: 20 },
      { id: 4, cost: 100000, coins: 20 },
    ],
    "29_normal": [
      { id: 0, cost: 10000, coins: 10 },
      { id: 1, cost: 50000, coins: 15 },
      ...Array.from({ length: 7 }, (_, i) => ({ id: i + 2, cost: 100000, coins: 20 })),
    ],
  };

  //////////////////////////////////////////////////
  // Speicher ueber Tampermonkey (GM.setValue/GM.getValue) statt IndexedDB.
  // Vorteil: haengt am Script, nicht an der Website-Origin - Einstellungen/Namen
  // bleiben so auch zwischen www.leitstellenspiel.de und polizei.leitstellenspiel.de
  // (getrennte Origins, getrennte IndexedDBs) erhalten und ueberleben ein "Cookies/
  // Website-Daten loeschen" im Browser.
  //////////////////////////////////////////////////

  async function storeData(data, key) {
    await GM.setValue(key, data);
  }

  async function retrieveData(key) {
    return await GM.getValue(key, undefined);
  }

  // Verlauf aller Aktionen ueber FuxTools (Ausbauten/Lagerraeume/Ausbaustufen bauen,
  // Fahrzeuge/Wachen/Leitstellen umbenennen) - rein informativ (Hauptmenue > Sonstiges
  // > Verlauf), hat keinen Einfluss auf die eigentliche Aktion. Umbenennungen werden
  // bewusst NICHT pro Fahrzeug/Wache geloggt, sondern einmal zusammengefasst pro Lauf
  // (Typ + Anzahl), sonst waere der Verlauf bei grossen Umbenennungen unlesbar voll.
  // Die Script-Version wird mitgespeichert, um bei spaeteren Fehlermeldungen zuordnen
  // zu koennen, mit welcher Version eine Aktion ausgefuehrt wurde.
  const HISTORY_STORAGE_KEY = "actionHistory";
  const HISTORY_MAX_ENTRIES = 300;
  const HISTORY_TYPE_LABELS = {
    extension: "Ausbau",
    storage: "Lagerraum",
    level: "Ausbaustufe",
    vehicle_rename: "Fahrzeuge umbenennen",
    vehicle_reset: "Fahrzeuge zurücksetzen",
    station_rename: "Wachen umbenennen",
    leitstelle_rename: "Leitstellen umbenennen",
  };

  async function getHistory() {
    return (await retrieveData(HISTORY_STORAGE_KEY)) || [];
  }

  async function logHistoryEntry(entry) {
    const history = await getHistory();
    history.unshift({ timestamp: Date.now(), version: SCRIPT_VERSION, ...entry });
    if (history.length > HISTORY_MAX_ENTRIES) history.length = HISTORY_MAX_ENTRIES;
    await storeData(history, HISTORY_STORAGE_KEY);
  }

  // Ordnet einen Umbenennen-/Reset-Lauf (itemNoun+verb aus executeRenamePlan) einem
  // Verlaufs-Typ zu.
  function renameHistoryType(itemNoun, verb) {
    if (itemNoun === "Fahrzeug(e)") return verb === "zurückgesetzt" ? "vehicle_reset" : "vehicle_rename";
    if (itemNoun === "Wache(n)") return "station_rename";
    if (itemNoun === "Leitstelle(n)") return "leitstelle_rename";
    return "rename";
  }

  // Loescht alle von FuxTools angelegten GM-Speicher-Eintraege (Namen/Bausteine-
  // Einstellungen, Fahrzeugtyp-Cache, Verlauf) - fuer den "Speicher loeschen"-Button in
  // den Einstellungen, simuliert damit den Zustand einer Neuinstallation.
  async function clearAllStoredData() {
    await GM.deleteValue("names");
    await GM.deleteValue(cacheKeyVehicleTypes);
    await GM.deleteValue(HISTORY_STORAGE_KEY);

    // Alte IndexedDB (Vor-GM-Speicher-Versionen) ebenfalls loeschen - sonst wuerde
    // migrateLegacyIndexedDbNames() beim naechsten Start die geraden geloeschten
    // Namen aus der Legacy-Datenbank wiederherstellen.
    await new Promise(resolve => {
      const request = window.indexedDB.deleteDatabase("CustomVehicleNaming");
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  }

  // Einmalige Migration: alte IndexedDB-Daten (Vor-GM-Speicher-Versionen) uebernehmen,
  // falls im neuen GM-Speicher noch nichts unter "names" liegt. Laeuft fehlerfrei durch,
  // auch wenn die alte Datenbank gar nicht existiert (z.B. bei Neuinstallation).
  async function migrateLegacyIndexedDbNames() {
    try {
      const alreadyMigrated = await GM.getValue("names", undefined);
      if (alreadyMigrated !== undefined) return;

      const db = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open("CustomVehicleNaming", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {}; // keine alte DB vorhanden - nichts zu migrieren
      });

      if (!db.objectStoreNames.contains("main")) {
        db.close();
        return;
      }

      const legacyNames = await new Promise((resolve, reject) => {
        const tx = db.transaction(["main"], "readonly");
        const store = tx.objectStore("main");
        const request = store.get("names");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();

      if (legacyNames) await GM.setValue("names", legacyNames);
    } catch (e) {
      console.warn("[FuxTools] Migration aus altem IndexedDB-Speicher fehlgeschlagen (ignoriert):", e);
    }
  }

  async function fetchAndStoreData(url, key) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 1);
    await storeData({ data, expirationDate }, key);
    return data;
  }

  async function initVehicleTypeCaptions() {
    const cached = await retrieveData(cacheKeyVehicleTypes);
    let types = cached?.data;
    const expirationDate = cached?.expirationDate;

    if (!types || !expirationDate || new Date(expirationDate) < new Date()) {
      types = await fetchAndStoreData("https://api.lss-manager.de/de_DE/vehicles", cacheKeyVehicleTypes);
    }

    vehicleTypeCaptions = {};
    for (const [id, vehicle] of Object.entries(types || {})) {
      vehicleTypeCaptions[id] = vehicle.caption;
    }
  }

  async function initNamesStore() {
    namesStore = (await retrieveData("names")) || {};
  }

  async function saveNamesStore() {
    await storeData(namesStore, "names");
  }

  //////////////////////////////////////////////////
  // Spiel-eigene Daten lesen (Session-basiert, kein API-Key)
  //////////////////////////////////////////////////

  async function fetchJSON(path) {
    const res = await fetch(path, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Fehler beim Laden von ${path}: ${res.status}`);
    const data = await res.json();
    const result = data.result || data;
    return Array.isArray(result) ? result : Object.values(result);
  }

  // Seitenweises Laden ueber /api/v2/vehicles statt /api/vehicles - bei sehr grossen
  // Accounts (mehrere Tausend Fahrzeuge) kann eine einzelne /api/vehicles-Anfrage in
  // das 15-Sekunden-Timeout des Servers laufen. Mehrere kleinere Seiten sind schneller
  // und zuverlaessiger. Feldnamen sind identisch zu v1 (id, caption, building_id,
  // vehicle_type, ...), das bestehende Umbenennen funktioniert unveraendert.
  async function fetchAllVehiclesV2() {
    let vehicles = [];
    let nextPage = "/api/v2/vehicles?limit=2000";
    while (nextPage) {
      const res = await fetch(nextPage, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`Fehler beim Laden der Fahrzeuge: ${res.status}`);
      const data = await res.json();
      vehicles = vehicles.concat(data.result || []);
      nextPage = data.paging?.next_page || null;
    }
    return vehicles;
  }

  async function loadGameData() {
    const [vehicles, buildings] = await Promise.all([
      fetchAllVehiclesV2(),
      fetchJSON("/api/buildings"),
    ]);
    const buildingsById = new Map(buildings.map(b => [String(b.id), b]));
    return { vehicles, buildingsById };
  }

  //////////////////////////////////////////////////
  // Umbenennen: Low-Level-Requests fuer Fahrzeuge und Gebaeude (Wachen/Leitstellen)
  //////////////////////////////////////////////////

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function renameVehicle(vehicleId, newName) {
    // Schritt 1: das interne Formular-Fragment holen (enthaelt authenticity_token,
    // _method-Feld fuer PATCH/PUT, Formular-Action etc.)
    const res = await fetch(`/vehicles/${vehicleId}/editName`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Formular für Fahrzeug ${vehicleId} nicht ladbar (${res.status})`);
    const html = await res.text();

    // Wichtig: NICHT ins Dokument einhaengen und NICHT per form.submit()/trigger('submit')
    // abschicken - das fuehrt zu einer echten Seiten-Navigation und bricht die
    // restliche Umbenennungs-Schleife ab.
    const container = document.createElement("div");
    container.innerHTML = html;

    const input =
      container.querySelector(`#vehicle_new_name_${vehicleId}`) ||
      container.querySelector('input[type="text"]');
    const form =
      container.querySelector(`#vehicle_form_${vehicleId}`) ||
      container.querySelector("form");
    if (!input || !form) throw new Error(`Formular-Elemente für Fahrzeug ${vehicleId} nicht gefunden.`);

    input.value = newName;

    // Schritt 2: den AJAX-Request, den die Seite normalerweise selbst schicken wuerde,
    // manuell per fetch() nachbauen. FormData funktioniert auch mit einem Formular,
    // das nicht im Dokument haengt.
    const action = form.getAttribute("action") || form.action;
    const formData = new FormData(form);

    const res2 = await fetch(action, {
      method: "POST", // die tatsaechliche Methode (PATCH/PUT) steckt im _method-Feld von FormData
      body: formData,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/javascript, application/json, */*; q=0.01",
      },
    });

    if (!res2.ok) throw new Error(`Speichern für Fahrzeug ${vehicleId} fehlgeschlagen (${res2.status})`);
  }

  // Gleiches Formular-Muster wie renameVehicle: echtes Bearbeiten-Formular holen statt
  // Feldnamen zu raten. Das Namensfeld heisst bei Gebaeuden "building[name]" (Input-ID
  // "building_name"), nicht "caption" - "caption" ist nur der Name in der /api-Antwort.
  async function renameBuilding(buildingId, newName) {
    const res = await fetch(`/buildings/${buildingId}/edit`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Formular für Gebäude ${buildingId} nicht ladbar (${res.status})`);
    const html = await res.text();

    const container = document.createElement("div");
    container.innerHTML = html;

    const input =
      container.querySelector("#building_name") ||
      container.querySelector('input[type="text"]');
    const form =
      container.querySelector(`#edit_building_${buildingId}`) ||
      container.querySelector("form");
    if (!input || !form) throw new Error(`Formular-Elemente für Gebäude ${buildingId} nicht gefunden.`);

    input.value = newName;

    const action = form.getAttribute("action") || form.action;
    const formData = new FormData(form);

    const res2 = await fetch(action, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/javascript, application/json, */*; q=0.01",
      },
    });

    if (!res2.ok) throw new Error(`Speichern für Gebäude ${buildingId} fehlgeschlagen (${res2.status})`);
  }

  //////////////////////////////////////////////////
  // Umbenennen-Engine (gemeinsam fuer Fahrzeuge, Wachen und Leitstellen -
  // arbeitet ueber renameVehicle/renameBuilding, unabhaengig vom Item-Typ)
  //////////////////////////////////////////////////

  // Versucht ein Umbenennen, mit einem automatischen zweiten Versuch bei Fehlern
  // (z.B. kurzer Lag/Verbindungsaussetzer). renameFn ist renameVehicle oder
  // renameBuilding - dieselbe Retry-Logik fuer beide.
  async function renameItemWithRetry(renameFn, id, newName, maxAttempts = 2) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await renameFn(id, newName);
        return;
      } catch (e) {
        lastError = e;
        if (attempt < maxAttempts) await sleep(1000);
      }
    }
    throw lastError;
  }

  // Wie viele Umbenennungen gleichzeitig laufen duerfen - moderat gewaehlt, um bei
  // sehr grossen Mengen (mehrere Tausend Fahrzeuge) deutlich schneller zu sein als
  // rein sequentiell, ohne den Server mit zu vielen Anfragen auf einmal zu fluten.
  const RENAME_CONCURRENCY = 5;

  // Fuehrt einen Umbenennungs-/Reset-Plan aus (mit Fortschrittsbalken und Abbrechen-
  // Button) und zeigt am Ende die Abschluss-Ansicht. Wird auch fuer den "erneut
  // versuchen"-Button mit nur den zuvor fehlgeschlagenen Eintraegen wiederverwendet.
  // renameFn/itemNoun erlauben die Wiederverwendung fuer Fahrzeuge, Wachen und
  // Leitstellen (alle drei sind technisch dasselbe Formular-Umbenennen-Muster).
  async function executeRenamePlan(plan, verb, goBack, renameFn = renameVehicle, itemNoun = "Fahrzeug(e)") {
    const body = document.getElementById("vehicle-naming-modal-body");
    renameCancelled = false;

    body.innerHTML = `
      <div class="progress" style="position:relative; margin-bottom: 12px; height: 24px;">
        <div id="vn-exec-progress-bar" class="progress-bar" role="progressbar" style="width:0%;"></div>
        <div id="vn-exec-progress-text" style="position:absolute; top:0; left:0; right:0; height:24px;
             line-height:24px; font-size:12px; text-align:center; color:#000; white-space:nowrap;
             overflow:hidden; text-overflow:ellipsis; padding:0 6px;">
        </div>
      </div>
      <button id="vn-btn-cancel-run" type="button" class="btn btn-danger">
        <span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen
      </button>
    `;
    const progressBarEl = document.getElementById("vn-exec-progress-bar");
    // Eigenes, fest positioniertes Element fuer den Text - liegt ueber der gesamten
    // Balkenbreite und wandert dadurch nicht mit, wenn der farbige Balken waechst.
    const progressTextEl = document.getElementById("vn-exec-progress-text");
    document.getElementById("vn-btn-cancel-run").addEventListener("click", () => {
      renameCancelled = true;
    });

    let done = 0;
    let finished = 0;
    const failedItems = [];
    const errors = [];
    let cancelled = false;

    // Mehrere Eintraege gleichzeitig statt strikt nacheinander - bei sehr grossen
    // Mengen (mehrere Tausend Fahrzeuge) waere rein sequentiell viel zu langsam.
    // RENAME_CONCURRENCY begrenzt das bewusst auf einen moderaten Wert statt
    // unbegrenzt zu parallelisieren, um den Server nicht zu ueberlasten.
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < plan.length) {
        if (renameCancelled) {
          cancelled = true;
          return;
        }
        const i = nextIndex++;
        const item = plan[i];
        try {
          await renameItemWithRetry(renameFn, item.id, item.newName);
          done++;
        } catch (e) {
          console.error("[FuxTools] Fehler bei", itemNoun, item.id, e);
          failedItems.push(item);
          if (errors.length < 5) errors.push(`${itemNoun} ${item.id} (${item.newName}): ${e.message}`);
        }
        finished++;
        progressBarEl.style.width = `${Math.round((finished / plan.length) * 100)}%`;
        progressTextEl.textContent = `${finished}/${plan.length}: ${item.oldName || "(leer)"} -> ${item.newName}`;
      }
    }

    const workerCount = Math.min(RENAME_CONCURRENCY, plan.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // Ein zusammengefasster Verlaufs-Eintrag pro Lauf (Typ + Anzahl), keine
    // Einzeleintraege pro Fahrzeug/Wache - siehe Kommentar bei HISTORY_STORAGE_KEY.
    if (done > 0) {
      await logHistoryEntry({
        type: renameHistoryType(itemNoun, verb),
        label: `${done} ${itemNoun}${failedItems.length ? ` (${failedItems.length} fehlgeschlagen)` : ""}`,
      });
    }

    renderCompletionScreen({ verb, done, failed: failedItems.length, plan, errors, failedItems, goBack, cancelled, itemNoun, renameFn });
  }

  function renderCompletionScreen({ verb, done, failed, plan, errors, failedItems, goBack, cancelled, itemNoun = "Fahrzeug(e)", renameFn = renameVehicle }) {
    const body = document.getElementById("vehicle-naming-modal-body");

    // Pro Wache/Kategorie zusammenfassen, statt jedes einzelne Element aufzulisten
    const perStation = new Map();
    for (const item of plan) {
      perStation.set(item.station, (perStation.get(item.station) || 0) + 1);
    }
    const stationRows = [...perStation.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => `<li>${escapeHtml(name)}: ${count} ${itemNoun}</li>`)
      .join("");

    let errorBlock = "";
    if (errors.length) {
      errorBlock = `
        <p class="text-danger" style="margin-top:10px;"><b>Fehler (erste ${errors.length}):</b></p>
        <pre style="white-space:pre-wrap; font-size:11px;">${escapeHtml(errors.join("\n"))}</pre>
      `;
    }

    const cancelledNote = cancelled
      ? `<p class="text-warning"><b>Abgebrochen</b> nach ${done + failed} von ${plan.length} geplanten ${itemNoun}.</p>`
      : "";

    const retryButton =
      failedItems && failedItems.length
        ? `<button id="vn-btn-retry" type="button" class="btn btn-warning">
             <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span>
             Fehlgeschlagene erneut versuchen (${failedItems.length})
           </button>`
        : "";

    body.innerHTML = `
      ${cancelledNote}
      <p>
        <span class="glyphicon glyphicon-ok-sign text-success" aria-hidden="true"></span>
        <b>${done} ${itemNoun} ${verb}</b>${failed ? `, <span class="text-danger">${failed} fehlgeschlagen</span>` : ""}
        (von ${plan.length} geplant).
      </p>
      <ul style="max-height: 200px; overflow-y: auto;">${stationRows}</ul>
      ${errorBlock}
      <p class="text-muted" style="font-size: 12px;">Lade die Seite neu, um die neuen Namen im Spiel zu sehen.</p>
      <div class="form-group" style="margin-top: 12px;">
        ${retryButton}
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-main-menu" type="button" class="btn btn-primary">Hauptmenü</button>
        <button id="vn-btn-close" type="button" class="btn btn-default">Schließen</button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-main-menu").addEventListener("click", renderMainMenu);
    document.getElementById("vn-btn-close").addEventListener("click", closeModal);
    if (failedItems && failedItems.length) {
      document.getElementById("vn-btn-retry").addEventListener("click", () => {
        executeRenamePlan(failedItems, verb, goBack, renameFn, itemNoun);
      });
    }
  }

  //////////////////////////////////////////////////
  // Modal-Markup (Bootstrap-Modal, Grundgeruest fuer alle Bildschirme)
  //////////////////////////////////////////////////

  function elementFromString(htmlString) {
    const template = document.createElement("template");
    template.innerHTML = htmlString.trim();
    return template.content.firstElementChild;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // Eigene Styles fuer Elemente, die vom dunklen Theme der Seite nicht abgedeckt sind
  // (z.B. Bootstraps list-group-item ist standardmaessig weiss) - schmal auf unser
  // Modal begrenzt, um den Rest der Seite nicht zu beeinflussen.
  function addCustomStyles() {
    if (document.getElementById("fuxtools-custom-styles")) return;
    const style = document.createElement("style");
    style.id = "fuxtools-custom-styles";
    style.textContent = `
      #vehicle-naming-modal-body .vn-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background-color: rgba(255, 255, 255, 0.06);
        color: inherit;
        border-color: rgba(255, 255, 255, 0.15);
      }
      #vehicle-naming-modal-body .vn-menu-item:hover,
      #vehicle-naming-modal-body .vn-menu-item:focus {
        background-color: rgba(255, 255, 255, 0.14);
        color: inherit;
      }
      #vehicle-naming-modal-body .vn-menu-item .glyphicon {
        font-size: 16px;
        width: 18px;
        text-align: center;
      }
      #vehicle-naming-modal-body .vn-btn-max-level {
        background-color: #7a2020;
        border-color: #6b1c1c;
        color: #fff;
      }
      #vehicle-naming-modal-body .vn-btn-max-level:hover,
      #vehicle-naming-modal-body .vn-btn-max-level:focus {
        background-color: #8f2626;
        border-color: #7a2020;
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  async function initModal() {
    if (document.getElementById(modalId)) return;

    addCustomStyles();

    const closeSpan = document.createElement("span");
    closeSpan.setAttribute("aria-hidden", "true");
    closeSpan.textContent = "\u00d7";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "close";
    closeButton.setAttribute("data-dismiss", "modal");
    closeButton.setAttribute("aria-label", "Close");
    closeButton.appendChild(closeSpan);

    const logoImg = document.createElement("img");
    logoImg.src = LOGO_URL;
    logoImg.alt = "";
    logoImg.style.cssText = "height:28px; width:28px; vertical-align:middle; margin-right:8px; border-radius:4px;";
    // Fehlt das Logo mal (z.B. Netzwerkfehler) soll es einfach verschwinden statt als
    // kaputtes Bild-Icon angezeigt zu werden.
    logoImg.addEventListener("error", () => logoImg.remove());

    const modalTitle = document.createElement("h4");
    modalTitle.id = "vehicle-naming-modal-title";
    modalTitle.className = "modal-title";
    modalTitle.style.display = "flex";
    modalTitle.style.alignItems = "center";
    modalTitle.appendChild(logoImg);
    modalTitle.appendChild(document.createTextNode(CHANNEL === "beta" ? "FuxTools Beta" : "FuxTools"));

    const modalHeader = document.createElement("div");
    modalHeader.className = "modal-header";
    modalHeader.appendChild(closeButton);
    modalHeader.appendChild(modalTitle);

    const modalBody = document.createElement("div");
    modalBody.className = "modal-body";
    modalBody.id = "vehicle-naming-modal-body";
    // Feste Hoehe mit eigenem Scrollbereich: Kopf- und Fusszeile bleiben so immer an
    // Ort und Stelle sichtbar, auch wenn eine Liste (z.B. viele Fahrzeugtypen) laenger
    // ist als der Bildschirm - dann scrollt nur dieser Bereich, nicht das ganze Fenster.
    modalBody.style.cssText = "max-height: 72vh; overflow-y: auto;";
    modalBody.innerHTML = `<p><em>Lade Wachen &amp; Fahrzeuge ...</em></p>`;

    const modalFooter = document.createElement("div");
    modalFooter.className = "modal-footer";
    modalFooter.style.cssText = "display:flex; align-items:center; font-size:11px; color:#888; padding:6px 12px;";
    modalFooterEl = modalFooter;
    renderFooter();

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content";
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);

    const modalDialog = document.createElement("div");
    modalDialog.id = "vehicle-naming-modal-dialog";
    modalDialog.className = "modal-dialog";
    modalDialog.role = "document";
    modalDialog.appendChild(modalContent);
    // Startbreite direkt am Element setzen (noch nicht im DOM - setModalWidth()
    // findet es ueber getElementById erst, sobald es angehaengt ist).
    modalDialog.style.minWidth = `min(${MODAL_WIDTH_COMPACT}px, 95%)`;
    modalDialog.style.maxWidth = `min(${MODAL_WIDTH_COMPACT}px, 95%)`;

    const modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = modalId;
    modal.tabIndex = -1;
    modal.role = "dialog";
    modal.setAttribute("aria-labelledby", "vehicle-naming-modal-title");
    modal.appendChild(modalDialog);
    modal.style.zIndex = "5000";

    document.body.appendChild(modal);

    // show.bs.modal feuert SOFORT beim Oeffnen, noch bevor die Fade-in-Animation
    // startet - so wird das Hauptmenue gesetzt, bevor ueberhaupt etwas sichtbar ist.
    // (shown.bs.modal wuerde erst NACH der Animation feuern und kurz den alten
    // Inhalt vom letzten Mal aufblitzen lassen.)
    // Seiten-jQuery ueber unsafeWindow: seit @grant nicht mehr "none" ist, laeuft das
    // Script in einer Sandbox und sieht das von der Seite geladene $/jQuery nicht direkt.
    const pageJQuery = unsafeWindow.jQuery || unsafeWindow.$;
    pageJQuery(modal).on("show.bs.modal", () => {
      // Einmaliger Reload, falls seit dem letzten Oeffnen ein Update-Tab geoeffnet wurde
      // (siehe pendingReloadAfterUpdate) - stellt sicher, dass eine im anderen Tab
      // installierte neue Version auch tatsaechlich hier laeuft.
      if (pendingReloadAfterUpdate) {
        pendingReloadAfterUpdate = false;
        location.reload();
        return;
      }
      renderMainMenu();
    });

    // Schliessen waehrend einer laufenden Umbenennung (X oben, Klick daneben, Escape)
    // soll die Umbenennung stoppen statt einfach im Hintergrund weiterzulaufen.
    pageJQuery(modal).on("hide.bs.modal", () => {
      renameCancelled = true;
    });
  }

  function closeModal() {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const pageJQuery = unsafeWindow.jQuery || unsafeWindow.$;
    pageJQuery(modal).modal("hide");
  }

  function getCurrentUsername() {
    // Versucht den eingeloggten Namen automatisch aus der Seite zu lesen,
    // damit das Script fuer jeden Spieler funktioniert (kein hartkodierter Name).
    const candidates = [
      'a[href="/profile"]',
      'a[href^="/profile"]',
      '.dropdown-toggle[href^="/profile"]',
    ];
    for (const selector of candidates) {
      const el = document.querySelector(selector);
      const text = el?.textContent?.trim();
      if (text) return text;
    }
    return null;
  }

  let currentMode = "rename"; // "rename" oder "reset"

  function renderMainMenu() {
    checkForUpdateInBackground(); // gedrosselt, blockiert das Rendern nicht (kein await)
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const username = getCurrentUsername();
    const greeting = username ? `Hey ${escapeHtml(username)}, was möchtest du tun?` : "Was möchtest du tun?";
    const sectionLabelStyle =
      "font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin:14px 0 4px; font-weight:bold;";

    body.innerHTML = `
      <div style="max-width:420px; margin:0 auto;">
        <p>${greeting}</p>

        <p class="text-muted" style="${sectionLabelStyle} margin-top:0;">Fahrzeuge</p>
        <div class="list-group">
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-vehicles">
            <span class="glyphicon glyphicon-road" aria-hidden="true"></span>
            Fahrzeuge umbenennen
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-reset">
            <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>
            Fahrzeuge zurücksetzen <span class="text-muted">(nur Typname, keine Nummer)</span>
          </button>
        </div>

        <p class="text-muted" style="${sectionLabelStyle}">Wachen &amp; Leitstellen</p>
        <div class="list-group">
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-stations">
            <span class="glyphicon glyphicon-home" aria-hidden="true"></span>
            Wachen umbenennen
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-leitstellen">
            <span class="glyphicon glyphicon-map-marker" aria-hidden="true"></span>
            Leitstellen umbenennen
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-station-check">
            <span class="glyphicon glyphicon-tasks" aria-hidden="true"></span>
            Wachen-Check <span class="text-muted">(Ausbauten, Personal, Werben)</span>
          </button>
        </div>

        <p class="text-muted" style="${sectionLabelStyle}">Sonstiges</p>
        <div class="list-group">
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-history">
            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span>
            Verlauf
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-settings">
            <span class="glyphicon glyphicon-cog" aria-hidden="true"></span>
            Einstellungen
          </button>
        </div>
      </div>
    `;
    document.getElementById("vn-menu-vehicles").addEventListener("click", () => {
      currentMode = "rename";
      renderLeitstelleSelection();
    });
    document.getElementById("vn-menu-reset").addEventListener("click", () => {
      currentMode = "reset";
      renderLeitstelleSelection();
    });
    document.getElementById("vn-menu-stations").addEventListener("click", renderStationRenameScreen);
    document.getElementById("vn-menu-leitstellen").addEventListener("click", renderLeitstelleRenameScreen);
    document.getElementById("vn-menu-station-check").addEventListener("click", renderStationCheckScreen);
    document.getElementById("vn-menu-history").addEventListener("click", renderHistoryScreen);
    document.getElementById("vn-menu-settings").addEventListener("click", renderSettingsScreen);
  }

  //////////////////////////////////////////////////
  // Einstellungen: Kanal-Info + Update-Check (manuell und im Hintergrund)
  //////////////////////////////////////////////////

  function renderFooter() {
    if (!modalFooterEl) return;
    const channelSuffix = CHANNEL === "beta" ? " (Beta)" : "";
    // Bewusst ein Button statt eines Links: das Update selbst wird ausschliesslich in
    // den Einstellungen ausgeloest (siehe openUpdateTab) - der Badge hier soll nur
    // dorthin fuehren, nicht selbst schon einen Tab oeffnen.
    const updateBadge = availableUpdateVersion
      ? `<button type="button" id="vn-footer-update-badge" class="btn btn-link"
                 style="padding:0; border:0; color:#d9534f; font-weight:bold; font-size:inherit;">
           Update verfügbar (v${escapeHtml(availableUpdateVersion)})
         </button>`
      : "";
    // margin-left:auto auf der Versions-Span schiebt sie an den rechten Rand, egal ob
    // der Update-Hinweis davor existiert oder nicht (robuster als space-between mit
    // einem Platzhalter-Element, das je nach Inhalt/Whitespace die Verteilung kippt).
    modalFooterEl.innerHTML = `${updateBadge}<span style="margin-left:auto;">FuxTools v${escapeHtml(SCRIPT_VERSION)}${channelSuffix} · © Fuxaro · CC BY-NC-SA 4.0</span>`;
    document.getElementById("vn-footer-update-badge")?.addEventListener("click", renderSettingsScreen);
  }

  async function fetchRemoteVersion() {
    const res = await fetch(`${UPDATE_CHECK_URL}?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const match = text.match(/@version\s+([\d.]+)/);
    if (!match) throw new Error("Version im Remote-Script nicht gefunden.");
    return match[1];
  }

  // Einzige Stelle, die tatsaechlich einen Update-Tab oeffnet - sowohl "Jetzt
  // aktualisieren" als auch "Neuinstallation erzwingen" nutzen diese eine Funktion,
  // statt das Oeffnen+Reload-Merken jeweils selbst zu duplizieren.
  function openUpdateTab() {
    pendingReloadAfterUpdate = true;
    window.open(`${UPDATE_CHECK_URL}?_=${Date.now()}`, "_blank", "noopener");
  }

  // Gedrosselter Hintergrund-Check (max. alle UPDATE_CHECK_INTERVAL_MS), wird beim
  // Start und bei jedem Oeffnen des Hauptmenues angestossen. Fehler bleiben still
  // (kein Popup) - der Footer-Hinweis ist nur ein Bonus, kein kritischer Pfad.
  async function checkForUpdateInBackground() {
    const now = Date.now();
    if (now - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) return;
    lastUpdateCheckAt = now;
    try {
      const remoteVersion = await fetchRemoteVersion();
      availableUpdateVersion = isNewerVersion(remoteVersion, SCRIPT_VERSION) ? remoteVersion : null;
    } catch (e) {
      console.warn("[FuxTools] Hintergrund-Update-Check fehlgeschlagen:", e);
    }
    renderFooter();
  }

  // Einfacher numerischer Vergleich fuer Versionsnummern wie "0.1.4" (kein Semver mit
  // Vorabversionen, reicht fuer unser X.Y.Z-Schema).
  function isNewerVersion(remote, local) {
    const r = remote.split(".").map(n => parseInt(n, 10) || 0);
    const l = local.split(".").map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
      const rv = r[i] || 0;
      const lv = l[i] || 0;
      if (rv > lv) return true;
      if (rv < lv) return false;
    }
    return false;
  }

  function renderSettingsScreen() {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const channelLabel = CHANNEL === "beta" ? "Beta" : "Stable";

    body.innerHTML = `
      <p>
        Version <b>${escapeHtml(SCRIPT_VERSION)}</b>
        <span class="label ${CHANNEL === "beta" ? "label-warning" : "label-success"}" style="margin-left:6px;">${channelLabel}</span>
      </p>
      <p class="text-muted" style="font-size:12px;">
        ${
          CHANNEL === "beta"
            ? "Du nutzt den Beta-Kanal (eigener Branch, kann instabiler sein)."
            : "Du nutzt den Stable-Kanal (main-Branch)."
        }
      </p>
      <div class="form-group">
        <button id="vn-btn-check-update" type="button" class="btn btn-primary">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Nach Updates suchen
        </button>
        <button id="vn-btn-force-reinstall" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span> Neuinstallation erzwingen
        </button>
      </div>
      <p class="text-muted" style="font-size:11px; margin-top:-4px;">
        Erzwingt den Installations-Dialog für den aktuellen Kanal (${channelLabel}), auch wenn sich
        die Versionsnummer nicht geändert hat - praktisch beim Testen auf dem Beta-Kanal, ohne
        jedes Mal die Version hochzählen zu müssen. Öffnet wie "Jetzt aktualisieren" einen Tab und
        lädt FuxTools hier automatisch neu, sobald du das nächste Mal etwas öffnest.
      </p>
      <div id="vn-update-status" style="margin-top: 10px;"></div>

      <hr>
      <p><b>Kanal wechseln</b></p>
      <p class="text-muted" style="font-size:12px;">
        ${
          CHANNEL === "beta"
            ? "Zurück zum stabilen Kanal wechseln. Der Beta-Kanal kann Vorab-Versionen mit neuen, noch nicht final getesteten Funktionen enthalten."
            : "Zum Beta-Kanal wechseln, um neue Funktionen vorab zu testen, bevor sie im Stable-Kanal landen. Kann instabiler sein."
        }
      </p>
      <a id="vn-switch-channel" class="btn btn-default" href="${CHANNEL === "beta" ? STABLE_URL : BETA_URL}" target="_blank" rel="noopener">
        <span class="glyphicon glyphicon-transfer" aria-hidden="true"></span>
        ${CHANNEL === "beta" ? "Zu Stable wechseln" : "Zu Beta wechseln"}
      </a>
      <p class="text-muted" style="font-size:11px; margin-top:6px;">
        Öffnet den Script-Code des anderen Kanals in einem neuen Tab. Tampermonkey erkennt es als
        Update dieses Scripts und fragt einmal um Bestätigung - danach läuft der neue Kanal
        inklusive Auto-Update, bis du hier erneut wechselst.
      </p>

      <hr>
      <p><b>Speicher löschen</b></p>
      <p class="text-muted" style="font-size:12px;">
        Setzt FuxTools auf den Zustand einer Neuinstallation zurück: alle gespeicherten
        Fahrzeugtyp-Namen und Namens-Bausteine-Einstellungen werden gelöscht.
      </p>
      <button id="vn-btn-clear-storage" type="button" class="btn btn-danger">
        <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Speicher löschen
      </button>
      <div id="vn-clear-status" style="margin-top:10px;"></div>

      <hr>
      <div class="form-group">
        <button type="button" id="vn-btn-back" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);

    document.getElementById("vn-btn-clear-storage").addEventListener("click", async () => {
      const confirmed = confirm(
        "Achtung: Dadurch werden ALLE von FuxTools gespeicherten Daten (Fahrzeugtyp-Namen, " +
          "Namens-Bausteine-Einstellungen) unwiderruflich gelöscht - als wäre das Script gerade " +
          "neu installiert worden. Fortfahren?"
      );
      if (!confirmed) return;

      const statusEl = document.getElementById("vn-clear-status");
      statusEl.innerHTML = `<em>Speicher wird gelöscht ...</em>`;
      try {
        await clearAllStoredData();
        statusEl.innerHTML = `<span class="text-success">Erledigt. Seite wird neu geladen ...</span>`;
        location.reload();
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler beim Löschen: ${escapeHtml(e.message)}</span>`;
      }
    });

    document.getElementById("vn-btn-force-reinstall").addEventListener("click", () => {
      openUpdateTab();
      renderUpdateTabOpenedStatus(document.getElementById("vn-update-status"));
    });

    document.getElementById("vn-btn-check-update").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-update-status");
      statusEl.innerHTML = `<em>Suche nach Updates ...</em>`;
      try {
        const remoteVersion = await fetchRemoteVersion();

        if (isNewerVersion(remoteVersion, SCRIPT_VERSION)) {
          availableUpdateVersion = remoteVersion;
          renderUpdateAvailableStatus(statusEl, remoteVersion);
        } else {
          availableUpdateVersion = null;
          statusEl.innerHTML = `<span class="text-success">Du bist bereits aktuell (v${escapeHtml(SCRIPT_VERSION)}).</span>`;
        }
        renderFooter();
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler beim Suchen nach Updates: ${escapeHtml(e.message)}</span>`;
      }
    });

    // Falls schon von einem frueheren (Hintergrund-)Check bekannt, direkt anzeigen -
    // man muss dann nicht erst nochmal manuell auf "Nach Updates suchen" klicken.
    if (availableUpdateVersion) {
      renderUpdateAvailableStatus(document.getElementById("vn-update-status"), availableUpdateVersion);
    }
  }

  // Zeigt "Update verfuegbar" mit einem einzigen "Jetzt aktualisieren"-Button, der
  // ueber openUpdateTab() den Tab oeffnet - gemeinsam genutzt vom manuellen Update-
  // Check und vom initialen Zustand (wenn schon ein Hintergrund-Check ein Update kannte).
  function renderUpdateAvailableStatus(statusEl, version) {
    statusEl.innerHTML = `
      <span class="text-success"><b>Update verfügbar: v${escapeHtml(version)}</b></span>
      <div style="margin-top:6px;">
        <button id="vn-btn-do-update" type="button" class="btn btn-success btn-sm">
          <span class="glyphicon glyphicon-cloud-download" aria-hidden="true"></span> Jetzt aktualisieren
        </button>
      </div>
    `;
    document.getElementById("vn-btn-do-update").addEventListener("click", () => {
      openUpdateTab();
      renderUpdateTabOpenedStatus(statusEl);
    });
  }

  function renderUpdateTabOpenedStatus(statusEl) {
    statusEl.innerHTML = `
      <span class="text-success">
        Tab geöffnet - bitte dort in Tampermonkey bestätigen. FuxTools lädt hier automatisch
        neu, sobald du das nächste Mal etwas öffnest.
      </span>
    `;
  }

  // Verlauf: zeigt alle ueber FuxTools durchgefuehrten Aktionen (Ausbauten, Lagerraeume,
  // Ausbaustufen, Umbenennen/Zuruecksetzen von Fahrzeugen/Wachen/Leitstellen) mit Datum,
  // Uhrzeit und Kosten - rein informativ, nur lokal gespeichert (kein Bezug zum
  // Spielserver). Gleiches Grundprinzip wie der Wachen-Check: Suchfeld + Dropdown-Filter.
  async function renderHistoryScreen() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Verlauf ...</p>`;

    const history = await getHistory();

    function applyRowVisibility() {
      const query = document.getElementById("vn-history-search")?.value.trim().toLowerCase() || "";
      const typeFilter = document.getElementById("vn-history-type-filter")?.value || "";
      body.querySelectorAll(".vn-history-row").forEach(row => {
        const matchesQuery = !query || row.dataset.search.includes(query);
        const matchesType = !typeFilter || row.dataset.type === typeFilter;
        row.style.display = matchesQuery && matchesType ? "" : "none";
      });
    }

    const rows = history
      .map(entry => {
        const date = new Date(entry.timestamp);
        const typeLabel = HISTORY_TYPE_LABELS[entry.type] || entry.type || "-";
        const costLabel =
          entry.cost == null
            ? "-"
            : entry.currency === "coins"
              ? `${entry.cost.toLocaleString("de-DE")} Coins`
              : `${entry.cost.toLocaleString("de-DE")} Credits`;
        const searchText = `${entry.label || ""} ${entry.station || ""}`.toLowerCase();
        return `
          <tr class="vn-history-row" data-type="${escapeHtml(entry.type || "")}" data-search="${escapeHtml(searchText)}">
            <td>${escapeHtml(date.toLocaleDateString("de-DE"))}</td>
            <td>${escapeHtml(date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))}</td>
            <td>
              ${escapeHtml(typeLabel)}: ${escapeHtml(entry.label || "-")}
              <br><small class="text-muted">${escapeHtml(entry.station || "-")} · v${escapeHtml(entry.version || "?")}</small>
            </td>
            <td>${escapeHtml(costLabel)}</td>
          </tr>
        `;
      })
      .join("");

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Zeigt Ausbauten, Lagerräume, Ausbaustufen sowie Umbenennen/Zurücksetzen von
        Fahrzeugen, Wachen und Leitstellen, die über FuxTools durchgeführt wurden - nur
        auf diesem Gerät gespeichert.
      </p>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <select id="vn-history-type-filter" class="form-control" style="max-width:220px;">
          <option value="">Alle Aktionen</option>
          <option value="extension">Ausbau</option>
          <option value="storage">Lagerraum</option>
          <option value="level">Ausbaustufe</option>
          <option value="vehicle_rename">Fahrzeuge umbenennen</option>
          <option value="vehicle_reset">Fahrzeuge zurücksetzen</option>
          <option value="station_rename">Wachen umbenennen</option>
          <option value="leitstelle_rename">Leitstellen umbenennen</option>
        </select>
        <input type="text" id="vn-history-search" class="form-control" placeholder="Suchen ..." style="flex:1;">
      </div>
      <div style="max-height:55vh; overflow:auto;">
        <table class="table table-condensed table-striped" style="font-size:12px; table-layout:fixed; width:100%;">
          <colgroup>
            <col style="width:14%;">
            <col style="width:11%;">
            <col style="width:55%;">
            <col style="width:20%;">
          </colgroup>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Uhrzeit</th>
              <th>Funktion</th>
              <th>Kosten</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="4" class="text-muted">Noch keine Aktionen aufgezeichnet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <button id="vn-btn-back" type="button" class="btn btn-default" style="margin-top:10px;">
        <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Hauptmenü
      </button>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-history-search").addEventListener("input", applyRowVisibility);
    document.getElementById("vn-history-type-filter").addEventListener("change", applyRowVisibility);
  }

  function addMenuEntry() {
    const icon = document.createElement("span");
    icon.className = "glyphicon glyphicon-wrench";
    icon.setAttribute("aria-hidden", "true");

    const a = document.createElement("a");
    a.href = "#";
    a.appendChild(icon);
    a.appendChild(document.createTextNode(CHANNEL === "beta" ? " FuxTools Beta" : " FuxTools"));

    const li = document.createElement("li");
    li.role = "presentation";
    li.setAttribute("data-toggle", "modal");
    li.setAttribute("data-target", `#${modalId}`);
    li.appendChild(a);

    const aaosLi = document.querySelector('a[href="/aaos"]').parentNode;
    aaosLi.parentNode.insertBefore(li, aaosLi.nextSibling);
  }

  //////////////////////////////////////////////////
  // Fahrzeuge umbenennen - Schritt 1: Leitstelle(n) auswaehlen
  //////////////////////////////////////////////////

  let gameVehicles = [];
  let gameBuildingsById = new Map();
  let allStations = []; // alle Wachen mit Fahrzeugen, inkl. Leitstellen-Zuordnung
  let selectedLeitstelleIds = [];

  async function renderLeitstelleSelection() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Leitstellen, Wachen &amp; Fahrzeuge ...</em></p>`;

    try {
      const data = await loadGameData();
      gameVehicles = data.vehicles;
      gameBuildingsById = data.buildingsById;
    } catch (e) {
      body.innerHTML = `<p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>`;
      return;
    }

    const byBuilding = new Map();
    for (const v of gameVehicles) {
      const bId = String(v.building_id ?? v.building);
      if (!byBuilding.has(bId)) byBuilding.set(bId, []);
      byBuilding.get(bId).push(v);
    }

    allStations = [...byBuilding.entries()]
      .map(([id, list]) => {
        const building = gameBuildingsById.get(id) || {};
        const leitstelleId =
          building.leitstelle_building_id != null ? String(building.leitstelle_building_id) : null;
        const leitstelleBuilding = leitstelleId ? gameBuildingsById.get(leitstelleId) : null;
        return {
          id,
          name: building.caption || `Wache ${id}`,
          category: categoryForBuilding(building),
          leitstelleId: leitstelleId || "none",
          leitstelleName: leitstelleId
            ? leitstelleBuilding?.caption || `Leitstelle ${leitstelleId}`
            : "Ohne Leitstelle",
          vehicles: list,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Nach Leitstelle gruppieren
    const byLeitstelle = new Map();
    for (const s of allStations) {
      if (!byLeitstelle.has(s.leitstelleId)) {
        byLeitstelle.set(s.leitstelleId, { name: s.leitstelleName, stations: [] });
      }
      byLeitstelle.get(s.leitstelleId).stations.push(s);
    }

    const rows = [...byLeitstelle.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, info]) => {
        const vehicleCount = info.stations.reduce((sum, s) => sum + s.vehicles.length, 0);
        return `
        <div class="checkbox" style="margin: 2px 0; break-inside: avoid;">
          <label>
            <input type="checkbox" class="vn-leitstelle-check" value="${id}">
            ${escapeHtml(info.name)} <span class="text-muted">(${info.stations.length} Wachen, ${vehicleCount} Fahrzeuge)</span>
          </label>
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <p>Wähle die Leitstelle(n) aus:</p>
      <div style="max-height: 380px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 4px; column-count: 2; column-gap: 20px;">
        ${rows || '<p class="text-muted"><em>Keine Leitstellen gefunden.</em></p>'}
      </div>
      <div class="form-group" style="margin-top: 14px;">
        <button type="button" id="vn-btn-back" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-next-leitstelle" type="button" class="btn btn-primary">
          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);

    document.getElementById("vn-btn-next-leitstelle").addEventListener("click", () => {
      const ids = [...body.querySelectorAll(".vn-leitstelle-check:checked")].map(el => el.value);
      if (!ids.length) {
        alert("Bitte mindestens eine Leitstelle auswählen.");
        return;
      }
      selectedLeitstelleIds = ids;
      renderStationSelection();
    });
  }

  //////////////////////////////////////////////////
  // Fahrzeuge umbenennen - Schritt 2: Wachen auswaehlen (gefiltert auf die
  // zuvor gewaehlten Leitstellen, nach Kategorie sortiert)
  //////////////////////////////////////////////////

  function renderStationSelection() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    const body = document.getElementById("vehicle-naming-modal-body");

    const stations = allStations.filter(s => selectedLeitstelleIds.includes(s.leitstelleId));

    // Nach Kategorie gruppieren (Feuerwehr, Rettungsdienst, Polizei, ...)
    const byCategory = new Map();
    for (const s of stations) {
      if (!byCategory.has(s.category)) byCategory.set(s.category, []);
      byCategory.get(s.category).push(s);
    }

    const categoryBlocks = CATEGORY_ORDER.filter(cat => byCategory.has(cat))
      .map((cat, idx) => {
        const catStations = byCategory.get(cat);
        const collapseId = `vn-cat-collapse-${idx}`;
        const stationRows = catStations
          .map(
            s => `
          <div class="checkbox" style="margin: 2px 0; break-inside: avoid;">
            <label>
              <input type="checkbox" class="vn-station-check" value="${s.id}">
              ${escapeHtml(s.name)} <span class="text-muted">(${s.vehicles.length} Fahrzeuge)</span>
            </label>
          </div>`
          )
          .join("");
        return `
        <div class="panel panel-default" style="margin-bottom: 8px;">
          <div class="panel-heading" style="padding:8px 12px; cursor:pointer;" data-toggle="collapse" data-target="#${collapseId}">
            <span class="glyphicon glyphicon-triangle-right" aria-hidden="true"></span>
            <b>${escapeHtml(cat)}</b>
            <span class="text-muted">(${catStations.length} Wachen)</span>
            <label style="font-size:11px; float:right; font-weight:normal; margin:0; cursor:pointer;">
              <input type="checkbox" class="vn-category-master" data-category="${escapeHtml(cat)}">
              alle auswählen
            </label>
          </div>
          <div id="${collapseId}" class="panel-collapse collapse">
            <div class="panel-body" style="column-count: 2; column-gap: 20px;">
              ${stationRows}
            </div>
          </div>
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <p>Wähle die Wachen aus, deren Fahrzeuge du umbenennen möchtest (Kategorie anklicken zum Auf-/Zuklappen):</p>
      <div style="max-height: 460px; overflow-y: auto; padding: 4px;">
        ${categoryBlocks || '<p class="text-muted"><em>Keine Fahrzeuge gefunden.</em></p>'}
      </div>
      <div class="form-group" style="margin-top: 14px;">
        <button type="button" id="vn-btn-back" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-next" type="button" class="btn btn-primary">
          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderLeitstelleSelection);

    // "alle auswaehlen" Checkbox pro Kategorie
    body.querySelectorAll(".vn-category-master").forEach(master => {
      // Klick soll NICHT das Auf-/Zuklappen der Kategorie ausloesen
      master.addEventListener("click", e => e.stopPropagation());
      master.closest("label").addEventListener("click", e => e.stopPropagation());

      const cat = master.dataset.category;
      const childCheckboxes = byCategory
        .get(cat)
        .map(s => body.querySelector(`.vn-station-check[value="${s.id}"]`));

      master.addEventListener("change", () => {
        childCheckboxes.forEach(cb => (cb.checked = master.checked));
      });

      function updateMasterState() {
        const checkedCount = childCheckboxes.filter(cb => cb.checked).length;
        master.checked = checkedCount === childCheckboxes.length;
        master.indeterminate = checkedCount > 0 && checkedCount < childCheckboxes.length;
      }

      childCheckboxes.forEach(cb => cb.addEventListener("change", updateMasterState));
      updateMasterState();
    });

    document.getElementById("vn-btn-next").addEventListener("click", () => {
      const selectedIds = [...body.querySelectorAll(".vn-station-check:checked")].map(el => el.value);
      if (!selectedIds.length) {
        alert("Bitte mindestens eine Wache auswählen.");
        return;
      }
      const selected = stations.filter(s => selectedIds.includes(s.id));
      if (currentMode === "reset") {
        renderResetScreen(selected);
      } else {
        renderNameForm(selected);
      }
    });
  }

  //////////////////////////////////////////////////
  // Fahrzeuge umbenennen - Schritt 3: Namen pro Wache + Fahrzeugtyp vergeben
  //////////////////////////////////////////////////

  // Text1/Text2 kommen mit einem Beispielwert vorausgefuellt, sind aber standardmaessig
  // deaktiviert - so sieht man sofort, wie die Bausteine funktionieren, ohne dass beim
  // ersten Ausfuehren versehentlich "DE"/"-SH-" mit umbenannt wird.
  const defaultTemplate = {
    useText1: false,
    text1: "DE",
    useType: true,
    useText2: false,
    text2: "-SH-",
    useNumber: true,
  };

  function getTemplate() {
    return Object.assign({}, defaultTemplate, namesStore.__template || {});
  }

  // Setzt einen Namen aus den Bausteinen zusammen - gemeinsam genutzt von der
  // Live-Vorschau und dem eigentlichen Umbenennen, damit beide immer exakt
  // dasselbe Ergebnis anzeigen/erzeugen.
  function composeName(tpl, enteredName, caption, nr, padding) {
    const segments = [];
    if (tpl.useText1 && tpl.text1) segments.push(tpl.text1);
    if (tpl.useType) segments.push(enteredName || caption);
    if (tpl.useText2 && tpl.text2) segments.push(tpl.text2);
    if (tpl.useNumber) segments.push(padding ? String(nr).padStart(2, "0") : String(nr));
    return segments.join(" ") || enteredName || caption;
  }

  function renderNameForm(selectedStations) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const tpl = getTemplate();

    // Fahrzeugtypen UEBER ALLE ausgewaehlten Wachen hinweg zusammenfassen,
    // damit der Name pro Typ nur einmal eingegeben werden muss.
    const byType = new Map();
    for (const station of selectedStations) {
      for (const v of station.vehicles) {
        const typeId = String(v.vehicle_type ?? v.type);
        if (!byType.has(typeId)) {
          const caption = vehicleTypeCaptions[typeId] || v.vehicle_type_caption || `Typ ${typeId}`;
          byType.set(typeId, { caption, count: 0 });
        }
        byType.get(typeId).count++;
      }
    }

    // Checkbox pro Zeile waehlt aus, ob der Typ ueberhaupt umbenannt wird. Das
    // Textfeld ist immer optional (leer = offizieller Fahrzeugtypname) - fuer rein
    // manuelle volle Namen (z.B. "STW -SH-") einfach Text 1/Text 2 unten deaktivieren
    // und den gewuenschten Namen direkt hier eintragen.
    const typeRows = [...byType.entries()]
      .sort((a, b) => a[1].caption.localeCompare(b[1].caption))
      .map(([typeId, info]) => {
        const savedName = namesStore[typeId] || "";
        return `
        <div class="form-group vn-type-row" data-type="${typeId}" data-caption="${escapeHtml(info.caption)}" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <label style="flex: 0 0 24px; margin: 0;">
            <input type="checkbox" class="vn-type-include" checked>
          </label>
          <label style="flex: 0 0 196px; margin: 0;">${escapeHtml(info.caption)} <span class="text-muted">(${info.count}x insgesamt)</span></label>
          <input type="text" class="form-control vn-name-input" placeholder="eigenes Kürzel (optional), sonst Fahrzeugtypname" value="${escapeHtml(savedName)}" style="flex:1;">
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <p class="text-muted">${selectedStations.length} Wache(n) ausgewählt.</p>

      <fieldset style="border:1px solid #ddd; border-radius:4px; padding:10px; margin-bottom:12px;">
        <legend style="font-size:13px; font-weight:bold; width:auto; padding:0 6px; margin-bottom:8px; border:none;">Namens-Bausteine</legend>
        <div style="display:grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap:4px 10px; align-items:end;">
          <div>
            <label style="display:flex; align-items:center; gap:4px; margin:0 0 4px;">
              <input type="checkbox" id="vn-use-text1" ${tpl.useText1 ? "checked" : ""}> Text 1
            </label>
            <input type="text" id="vn-text1" class="form-control input-sm" style="width:100%;" placeholder="z.B. DE" value="${escapeHtml(tpl.text1)}">
          </div>
          <div style="color:#999; padding-bottom:6px;">&rarr;</div>
          <div>
            <label style="display:flex; align-items:center; gap:4px; margin:0 0 4px;">
              <input type="checkbox" id="vn-use-type" ${tpl.useType ? "checked" : ""}> Fahrzeugtyp-Name
            </label>
          </div>
          <div style="color:#999; padding-bottom:6px;">&rarr;</div>
          <div>
            <label style="display:flex; align-items:center; gap:4px; margin:0 0 4px;">
              <input type="checkbox" id="vn-use-text2" ${tpl.useText2 ? "checked" : ""}> Text 2
            </label>
            <input type="text" id="vn-text2" class="form-control input-sm" style="width:100%;" placeholder="z.B. -SH-" value="${escapeHtml(tpl.text2)}">
          </div>
        </div>
        <p class="text-muted" style="font-size:11px; margin:10px 0 0;">
          Deaktivierte oder leere Bausteine werden übersprungen, die Nummer kommt immer ans Ende.
          Text 1/Text 2 gelten global für alle ausgewählten Fahrzeugtypen.
        </p>
        <p class="text-muted" style="font-size:11px; margin:4px 0 0;">
          Für einen komplett manuellen, freien Namen: Text 1 und Text 2 hier deaktivieren und den
          gewünschten Namen direkt ins Kürzel-Feld pro Fahrzeugtyp unten eintragen.
        </p>
      </fieldset>

      <div class="alert alert-info" style="padding:8px 12px; margin-bottom:12px;">
        Vorschau: <b id="vn-preview-text">-</b>
      </div>

      <p class="text-muted" style="font-size:11px;">
        Häkchen pro Zeile wählt aus, welche Fahrzeugtypen überhaupt umbenannt werden. Das
        Kürzel-Textfeld ist nur relevant, wenn "Fahrzeugtyp-Name" oben aktiv ist (leer = offizieller
        Fahrzeugtypname) - sonst ist es ausgegraut und wirkungslos.
      </p>
      <fieldset style="border:1px solid #ddd; border-radius:4px; padding:10px; margin-bottom:12px;">
        ${typeRows}
      </fieldset>
      <div class="form-inline" style="margin: 10px 0;">
        <label style="margin-right: 16px; display:inline-flex; align-items:center; gap:4px;" id="vn-number-toggle-wrap">
          <input type="checkbox" id="vn-use-number" ${tpl.useNumber ? "checked" : ""}> Nummer anhängen
        </label>
        <label style="margin-right: 16px;">Start-Nummer
          <input type="number" id="vn-start-nr" class="form-control input-sm" value="1" style="width:70px; margin-left:6px;">
        </label>
        <label>
          <input type="checkbox" id="vn-padding" checked> Führende Nullen (01, 02, ...)
        </label>
      </div>
      <p class="text-muted" style="font-size:11px;">Nummeriert wird <b>pro Wache separat</b> (jede Wache startet wieder bei der Start-Nummer).</p>
      <div class="form-group">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-run" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Fahrzeuge umbenennen
        </button>
      </div>
      <div id="vn-status" style="margin-top: 10px; font-weight: bold; white-space: pre-wrap;"></div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderStationSelection);
    document.getElementById("vn-btn-run").addEventListener("click", () => runRenaming(selectedStations));

    // Bausteine sofort dauerhaft speichern, sobald sie geaendert werden - nicht erst beim Umbenennen
    function persistTemplate() {
      namesStore.__template = {
        useText1: document.getElementById("vn-use-text1").checked,
        text1: document.getElementById("vn-text1").value.trim(),
        useType: document.getElementById("vn-use-type").checked,
        useText2: document.getElementById("vn-use-text2").checked,
        text2: document.getElementById("vn-text2").value.trim(),
        useNumber: document.getElementById("vn-use-number").checked,
      };
      saveNamesStore();
    }
    ["vn-use-text1", "vn-text1", "vn-use-type", "vn-use-text2", "vn-text2", "vn-use-number"].forEach(id => {
      document.getElementById(id).addEventListener("change", persistTemplate);
    });

    // Nummer-Felder ausgrauen, wenn "Nummer anhaengen" deaktiviert ist
    const useNumberCheckbox = document.getElementById("vn-use-number");
    const startNrInput = document.getElementById("vn-start-nr");
    const paddingCheckbox = document.getElementById("vn-padding");
    function syncNumberControls() {
      const enabled = useNumberCheckbox.checked;
      startNrInput.disabled = !enabled;
      paddingCheckbox.disabled = !enabled;
    }
    useNumberCheckbox.addEventListener("change", syncNumberControls);
    syncNumberControls();

    // Kuerzel-Felder pro Typ ausgrauen, wenn "Fahrzeugtyp-Name" oben deaktiviert ist -
    // sie wirken sich dann auf den Namen nicht aus, sollen also auch nicht aktiv aussehen.
    const useTypeCheckbox = document.getElementById("vn-use-type");
    function syncTypeNameInputs() {
      const enabled = useTypeCheckbox.checked;
      body.querySelectorAll(".vn-name-input").forEach(input => {
        input.disabled = !enabled;
        // explizite Inline-Styles statt uns auf CSS von der Seite zu verlassen -
        // so ist der ausgegraute Zustand immer sichtbar, egal welches Theme aktiv ist.
        input.style.backgroundColor = enabled ? "" : "#eee";
        input.style.color = enabled ? "" : "#999";
        input.style.cursor = enabled ? "" : "not-allowed";
        input.placeholder = enabled ? "eigenes Kürzel (optional), sonst Fahrzeugtypname" : "wird nicht verwendet (Fahrzeugtyp-Name oben deaktiviert)";
      });
    }
    useTypeCheckbox.addEventListener("change", syncTypeNameInputs);
    syncTypeNameInputs();

    // Live-Vorschau: zeigt anhand des ersten Fahrzeugtyps in der Liste, wie ein Name
    // mit den aktuell gewaehlten Bausteinen/Einstellungen aussehen wuerde.
    const previewEl = document.getElementById("vn-preview-text");
    function updatePreview() {
      const previewTpl = {
        useText1: document.getElementById("vn-use-text1").checked,
        text1: document.getElementById("vn-text1").value.trim(),
        useType: document.getElementById("vn-use-type").checked,
        useText2: document.getElementById("vn-use-text2").checked,
        text2: document.getElementById("vn-text2").value.trim(),
        useNumber: document.getElementById("vn-use-number").checked,
      };
      const startNr = parseInt(document.getElementById("vn-start-nr").value, 10) || 1;
      const padding = document.getElementById("vn-padding").checked;

      const firstRow = body.querySelector(".vn-type-row");
      const enteredName = firstRow ? firstRow.querySelector(".vn-name-input").value.trim() : "";
      const caption = firstRow ? firstRow.dataset.caption : "Fahrzeugtyp";

      previewEl.textContent = composeName(previewTpl, enteredName, caption, startNr, padding);
    }
    body.addEventListener("input", updatePreview);
    body.addEventListener("change", updatePreview);
    updatePreview();

    // Namen sofort dauerhaft speichern, sobald sie eingegeben werden - nicht erst beim Umbenennen
    body.querySelectorAll(".vn-name-input").forEach(input => {
      input.addEventListener("change", () => {
        const typeId = input.closest(".vn-type-row").dataset.type;
        const value = input.value.trim();
        if (value) {
          namesStore[typeId] = value;
        } else {
          delete namesStore[typeId];
        }
        saveNamesStore();
      });
    });
  }

  async function runRenaming(selectedStations) {
    const body = document.getElementById("vehicle-naming-modal-body");
    const startNr = parseInt(document.getElementById("vn-start-nr").value, 10) || 1;
    const padding = document.getElementById("vn-padding").checked;
    const statusEl = document.getElementById("vn-status");

    const tpl = {
      useText1: document.getElementById("vn-use-text1").checked,
      text1: document.getElementById("vn-text1").value.trim(),
      useType: document.getElementById("vn-use-type").checked,
      useText2: document.getElementById("vn-use-text2").checked,
      text2: document.getElementById("vn-text2").value.trim(),
      useNumber: document.getElementById("vn-use-number").checked,
    };
    namesStore.__template = tpl;

    const plan = [];

    body.querySelectorAll(".vn-type-row").forEach(row => {
      const input = row.querySelector(".vn-name-input");
      const enteredName = input.value.trim();
      const typeId = row.dataset.type;
      const caption = row.dataset.caption || `Typ ${typeId}`;

      // Checkbox pro Zeile entscheidet ueber die Auswahl, das Textfeld ist nur ein
      // optionales Kuerzel (leer = offizieller Typname).
      if (!row.querySelector(".vn-type-include").checked) return;

      if (enteredName) {
        namesStore[typeId] = enteredName;
      } else {
        delete namesStore[typeId];
      }

      // Nummerierung laeuft pro Wache separat, auch wenn der Name global gilt.
      // Wir benennen der Einfachheit halber immer um, unabhaengig vom aktuellen Namen.
      for (const station of selectedStations) {
        const vList = station.vehicles
          .filter(v => String(v.vehicle_type ?? v.type) === typeId)
          .sort((a, b) => a.id - b.id);

        vList.forEach((v, idx) => {
          const newName = composeName(tpl, enteredName, caption, startNr + idx, padding);
          plan.push({ id: v.id, oldName: v.caption, newName, station: station.name });
        });
      }
    });

    await saveNamesStore();

    if (!plan.length) {
      statusEl.textContent = "Keine Fahrzeugtypen ausgewählt (Häkchen prüfen).";
      return;
    }

    renderRenameConfirmation(selectedStations, plan);
  }

  // Letzter Bestaetigungsschritt vor dem eigentlichen Umbenennen: zeigt nochmal ein
  // Beispiel aus dem fertigen Plan und laesst zwischen Umbenennen/Zurueck waehlen,
  // bevor irgendetwas im Spiel geaendert wird.
  function renderRenameConfirmation(selectedStations, plan) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const exampleName = plan.length ? plan[0].newName : "-";

    body.innerHTML = `
      <p>Bereit zum Umbenennen von <b>${plan.length}</b> Fahrzeug(en) in <b>${selectedStations.length}</b> Wache(n).</p>
      <div class="alert alert-info" style="padding:8px 12px; margin-bottom:12px;">
        Vorschau: <b>${escapeHtml(exampleName)}</b>
      </div>
      <p class="text-muted" style="font-size:12px;">Wirklich umbenennen, oder nochmal zurück zu den Einstellungen?</p>
      <div class="form-group">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-confirm-run" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Umbenennen
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", () => renderNameForm(selectedStations));
    document.getElementById("vn-btn-confirm-run").addEventListener("click", () => {
      executeRenamePlan(plan, "umbenannt", () => renderNameForm(selectedStations));
    });
  }

  //////////////////////////////////////////////////
  // Zuruecksetzen: alle Fahrzeuge der ausgewaehlten
  // Wachen auf ihren reinen Fahrzeugtyp-Namen zuruecksetzen
  //////////////////////////////////////////////////

  function renderResetScreen(selectedStations) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const totalVehicles = selectedStations.reduce((sum, s) => sum + s.vehicles.length, 0);

    body.innerHTML = `
      <p class="text-muted">${selectedStations.length} Wache(n) ausgewählt.</p>
      <p>Alle <b>${totalVehicles}</b> Fahrzeuge in diesen Wachen werden auf ihren reinen Fahrzeugtyp-Namen zurückgesetzt (keine Nummer, kein Präfix).</p>
      <div class="form-group">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-reset" type="button" class="btn btn-danger">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Auf Standard zurücksetzen
        </button>
      </div>
      <div id="vn-status" style="margin-top: 10px; font-weight: bold; white-space: pre-wrap;"></div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderStationSelection);
    document.getElementById("vn-btn-reset").addEventListener("click", () => runReset(selectedStations));
  }

  async function runReset(selectedStations) {
    const statusEl = document.getElementById("vn-status");

    const plan = [];
    for (const station of selectedStations) {
      for (const v of station.vehicles) {
        const typeId = String(v.vehicle_type ?? v.type);
        const typeName = vehicleTypeCaptions[typeId] || v.vehicle_type_caption || `Typ ${typeId}`;
        plan.push({ id: v.id, oldName: v.caption, newName: typeName, station: station.name });
      }
    }

    if (!plan.length) {
      statusEl.textContent = "Keine Fahrzeuge gefunden.";
      return;
    }

    await executeRenamePlan(plan, "zurückgesetzt", () => renderResetScreen(selectedStations));
  }

  //////////////////////////////////////////////////
  // Wachen umbenennen (nach Kategorie sortiert) und
  // Leitstellen umbenennen (flache Liste, keine Kategorien)
  //////////////////////////////////////////////////

  // Ermittelt Leitstellen ueber die leitstelle_building_id-Verweise anderer Gebaeude
  // (dieselbe Methode wie in renderLeitstelleSelection) - eigenstaendig von den
  // Fahrzeug-Screens, da hier auch Wachen ohne Fahrzeuge auftauchen sollen.
  async function loadAllBuildings() {
    const buildings = await fetchJSON("/api/buildings");

    const leitstelleIds = new Set();
    for (const b of buildings) {
      if (b.leitstelle_building_id != null) leitstelleIds.add(String(b.leitstelle_building_id));
    }

    const leitstellen = buildings
      .filter(b => leitstelleIds.has(String(b.id)))
      .map(b => ({ id: String(b.id), name: b.caption || `Leitstelle ${b.id}` }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const stations = buildings
      .filter(b => !leitstelleIds.has(String(b.id)) && categoryForBuilding(b) !== "Unbekannt")
      .map(b => ({ id: String(b.id), name: b.caption || `Wache ${b.id}`, category: categoryForBuilding(b) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { leitstellen, stations };
  }

  // Letzter Bestaetigungsschritt vor dem Umbenennen von Wachen/Leitstellen - zeigt
  // nur die Anzahl, da hier (anders als bei Fahrzeugen) kein Namens-Baustein-System
  // existiert, das eine Vorschau bräuchte.
  function renderBuildingRenameConfirm(plan, verb, goBack, itemNoun) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `
      <p>Bereit, <b>${plan.length} ${escapeHtml(itemNoun)}</b> umzubenennen.</p>
      <div class="form-group">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-confirm-run" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Umbenennen
        </button>
      </div>
    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-confirm-run").addEventListener("click", () => {
      executeRenamePlan(plan, verb, goBack, renameBuilding, itemNoun);
    });
  }

  async function renderStationRenameScreen() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Wachen ...</em></p>`;

    let stations;
    try {
      ({ stations } = await loadAllBuildings());
    } catch (e) {
      body.innerHTML = `<p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>`;
      return;
    }

    const byCategory = new Map();
    for (const s of stations) {
      if (!byCategory.has(s.category)) byCategory.set(s.category, []);
      byCategory.get(s.category).push(s);
    }

    const categoryBlocks = CATEGORY_ORDER.filter(cat => byCategory.has(cat))
      .map((cat, idx) => {
        const catStations = byCategory.get(cat);
        const collapseId = `vn-wache-cat-collapse-${idx}`;
        const rows = catStations
          .map(
            s => `
          <div class="form-group vn-building-row" data-id="${s.id}" data-category="${escapeHtml(cat)}" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <label style="flex: 0 0 45%; margin:0;">${escapeHtml(s.name)}</label>
            <span class="glyphicon glyphicon-arrow-right" aria-hidden="true" style="color:#999;"></span>
            <input type="text" class="form-control vn-building-name-input" placeholder="leer = keine Änderung" style="flex:1;">
          </div>`
          )
          .join("");
        return `
        <div class="panel panel-default" style="margin-bottom: 8px;">
          <div class="panel-heading" style="padding:8px 12px; cursor:pointer;" data-toggle="collapse" data-target="#${collapseId}">
            <span class="glyphicon glyphicon-triangle-right" aria-hidden="true"></span>
            <b>${escapeHtml(cat)}</b> <span class="text-muted">(${catStations.length} Wachen)</span>
          </div>
          <div id="${collapseId}" class="panel-collapse collapse">
            <div class="panel-body">${rows}</div>
          </div>
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <p class="text-muted">Aktueller Name → neuer Name, nach Art sortiert. Leeres Feld = keine Änderung.</p>
      ${categoryBlocks || '<p class="text-muted"><em>Keine Wachen gefunden.</em></p>'}
      <div class="form-group" style="margin-top: 14px;">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-save-buildings" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-floppy-disk" aria-hidden="true"></span> Speichern
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-btn-save-buildings").addEventListener("click", () => {
      const plan = [];
      body.querySelectorAll(".vn-building-row").forEach(row => {
        const newName = row.querySelector(".vn-building-name-input").value.trim();
        if (!newName) return;
        plan.push({
          id: row.dataset.id,
          oldName: row.querySelector("label").textContent,
          newName,
          station: row.dataset.category,
        });
      });
      if (!plan.length) {
        alert("Kein neuer Name eingetragen.");
        return;
      }
      renderBuildingRenameConfirm(plan, "umbenannt", renderStationRenameScreen, "Wache(n)");
    });
  }

  async function renderLeitstelleRenameScreen() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Leitstellen ...</em></p>`;

    let leitstellen;
    try {
      ({ leitstellen } = await loadAllBuildings());
    } catch (e) {
      body.innerHTML = `<p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>`;
      return;
    }

    const rows = leitstellen
      .map(
        l => `
      <div class="form-group vn-building-row" data-id="${l.id}" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="flex: 0 0 45%; margin:0;">${escapeHtml(l.name)}</label>
        <span class="glyphicon glyphicon-arrow-right" aria-hidden="true" style="color:#999;"></span>
        <input type="text" class="form-control vn-building-name-input" placeholder="leer = keine Änderung" style="flex:1;">
      </div>`
      )
      .join("");

    body.innerHTML = `
      <p class="text-muted">Aktueller Name → neuer Name. Leeres Feld = keine Änderung. Sortierung nach Art ist bei Leitstellen nicht nötig.</p>
      ${rows || '<p class="text-muted"><em>Keine Leitstellen gefunden.</em></p>'}
      <div class="form-group" style="margin-top: 14px;">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-save-buildings" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-floppy-disk" aria-hidden="true"></span> Speichern
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-btn-save-buildings").addEventListener("click", () => {
      const plan = [];
      body.querySelectorAll(".vn-building-row").forEach(row => {
        const newName = row.querySelector(".vn-building-name-input").value.trim();
        if (!newName) return;
        plan.push({
          id: row.dataset.id,
          oldName: row.querySelector("label").textContent,
          newName,
          station: "Leitstellen",
        });
      });
      if (!plan.length) {
        alert("Kein neuer Name eingetragen.");
        return;
      }
      renderBuildingRenameConfirm(plan, "umbenannt", renderLeitstelleRenameScreen, "Leitstelle(n)");
    });
  }

  //////////////////////////////////////////////////
  // Wachen-Check: Tabelle je Wache mit Ausbauten, Ausbaustufe und Lagerräumen, jeweils
  // mit echtem Namen, Kosten und direkter Bau-Moeglichkeit (Credits oder Coins - jede
  // Aktion fragt vorher, mit welcher Waehrung bezahlt werden soll). Dazu Personal und
  // automatisches Werben als reine Info-Spalten.
  //////////////////////////////////////////////////

  async function getUserCredits() {
    const data = await fetchJSON("/api/userinfo");
    return { credits: data.credits_user_current, coins: data.coins_user_current };
  }

  // Baut eine einzelne Ausbau/Lager/Stufen-Aktion. Alle drei Endpunkte sind vom
  // Referenzskript "Erweiterungs-Manager" (Caddy21) uebernommen und dort im Einsatz
  // bestaetigt. currency ist immer "credits" oder "coins" - der Spieler waehlt das
  // in einem Bestaetigungsdialog vor jeder Aktion selbst aus.
  async function buildExtension(buildingId, extensionId, currency) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!csrfToken) throw new Error(`CSRF-Token nicht gefunden (Gebäude ${buildingId}).`);
    const res = await fetch(`/buildings/${buildingId}/extension/${currency}/${extensionId}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": csrfToken,
      },
    });
    if (!res.ok) throw new Error(`Bauen fehlgeschlagen (${res.status})`);
  }

  async function buildStorage(buildingId, storageId, currency) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!csrfToken) throw new Error(`CSRF-Token nicht gefunden (Gebäude ${buildingId}).`);
    const res = await fetch(
      `/buildings/${buildingId}/storage_upgrade/${currency}/${storageId}?redirect_building_id=${buildingId}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-CSRF-Token": csrfToken,
        },
      }
    );
    if (!res.ok) throw new Error(`Bauen fehlgeschlagen (${res.status})`);
  }

  async function buildLevel(buildingId, currency, level) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!csrfToken) throw new Error(`CSRF-Token nicht gefunden (Gebäude ${buildingId}).`);
    // WICHTIG: redirect "manual" statt des fetch()-Standards "follow". Dieser Endpunkt
    // antwortet bei Erfolg mit einer Weiterleitung (302) - mit "follow" würde fetch()
    // automatisch eine ZWEITE echte Anfrage an das Ziel der Weiterleitung schicken, ohne
    // dass wir das kontrollieren. Das war vermutlich die Ursache fuer eine doppelte
    // Abbuchung beim Wachen-Ausbau. Mit "manual" senden wir garantiert nur eine Anfrage.
    const res = await fetch(`/buildings/${buildingId}/expand_do/${currency}?level=${level}`, {
      method: "GET",
      credentials: "same-origin",
      redirect: "manual",
      headers: { "X-CSRF-Token": csrfToken },
    });
    // Bei redirect:"manual" liefert eine erfolgreiche Weiterleitung type "opaqueredirect"
    // und status 0 - das ist hier der ERWARTETE Erfolgsfall, kein Fehler.
    if (res.type !== "opaqueredirect" && !res.ok) {
      throw new Error(`Ausbauen fehlgeschlagen (${res.status})`);
    }
  }

  async function loadBuildingsForCheck() {
    const buildings = await fetchJSON("/api/buildings");

    const leitstelleIds = new Set();
    for (const b of buildings) {
      if (b.leitstelle_building_id != null) leitstelleIds.add(String(b.leitstelle_building_id));
    }
    const buildingsById = new Map(buildings.map(b => [String(b.id), b]));

    return buildings
      .filter(b => !leitstelleIds.has(String(b.id)) && categoryForBuilding(b) !== "Unbekannt")
      .map(b => {
        const pseudoId = getPseudoBuildingTypeId(b);
        const buildingKey = getBuildingKey(b);
        const recommendedExtensions = pseudoId ? RECOMMENDED_EXTENSIONS_BY_PSEUDO_ID[pseudoId] || [] : [];
        const extensions = Array.isArray(b.extensions) ? b.extensions : [];
        const missingExtensions = recommendedExtensions.filter(id => !extensions.some(e => e.type_id === id));
        const leitstelle = b.leitstelle_building_id ? buildingsById.get(String(b.leitstelle_building_id)) : null;

        const levelCatalog = LEVEL_CATALOG[buildingKey] || null;
        const currentLevel = typeof b.level === "number" && b.level >= 0 ? b.level : -1;

        const storageCatalog = STORAGE_CATALOG[buildingKey] || null;
        const ownedStorageIds = new Set((b.storage_upgrades || []).map(u => u.type_id));

        return {
          id: String(b.id),
          name: b.caption || `Wache ${b.id}`,
          category: categoryForBuilding(b),
          typeName: BUILDING_TYPE_NAMES[buildingKey] || null,
          leitstelleName: leitstelle ? leitstelle.caption : null,
          pseudoId,
          buildingKey,
          extensions,
          recommendedExtensions,
          missingExtensions,
          personnelCount: b.personal_count ?? null,
          personnelSetPoint: pseudoId ? (PERSONNEL_SET_POINT_BY_PSEUDO_ID[pseudoId] ?? null) : null,
          automaticHiring: b.hiring_automatic === true,
          levelCatalog,
          currentLevel,
          storageCatalog,
          ownedStorageIds,
        };
      });
  }

  // Personal-Zelle: aktuell nur die reine Anzahl (keine Soll-Wert-Farbe) - Soll-Personal
  // wird schon geladen (siehe personnelSetPoint), aber bewusst noch nicht angezeigt.
  // Kann spaeter leicht als farbige aktuell/soll-Anzeige ergaenzt werden.
  function renderPersonnelCell(station) {
    return `${station.personnelCount ?? "-"}`;
  }

  // Ausbau-Badges einer Wache: gruen = gebaut und aktiv, blau = wird gerade gebaut, orange =
  // nicht gebaut, aber auf der Referenz-Liste aus RECOMMENDED_EXTENSIONS_BY_PSEUDO_ID
  // ("gefordert"), grau = nicht gebaut und nicht auf der Liste. Bedeutung 1:1 vom
  // Referenzskript uebernommen. Namen/Kosten kommen aus dem fest einprogrammierten
  // EXTENSION_CATALOG. Fehlende Ausbauten sind anklickbar und oeffnen den Bau-Dialog
  // (Kosten werden vorher angezeigt, Waehrung wird dort ausgewaehlt).
  function renderExtensionBadges(station) {
    const catalogEntries = EXTENSION_CATALOG[station.buildingKey] || [];
    const entries = catalogEntries.length
      ? catalogEntries
      : station.recommendedExtensions.map(id => ({ id, name: null, cost: null, coins: null }));

    if (!entries.length) return '<span class="text-muted">-</span>';

    const recommendedIds = new Set(station.recommendedExtensions);

    return entries
      .map(entry => {
        const owned = station.extensions.find(e => e.type_id === entry.id);
        const label = entry.name || `Ausbau ${entry.id}`;

        if (owned) {
          const cssClass = owned.available_at ? "label-primary" : "label-success";
          const title = owned.available_at ? `${label} (im Bau, verfügbar ab ${owned.available_at})` : label;
          return `<span class="label ${cssClass}" title="${escapeHtml(title)}" style="margin:1px;">${entry.id}</span>`;
        }

        const cssClass = recommendedIds.has(entry.id) ? "label-warning" : "label-default";
        const suffix = recommendedIds.has(entry.id) ? " (gefordert)" : "";
        const title =
          entry.cost != null
            ? `${label}${suffix} – ${entry.cost.toLocaleString("de-DE")} Credits oder ${entry.coins} Coins`
            : `${label}${suffix} (noch nicht gebaut)`;
        if (entry.cost == null) {
          return `<span class="label ${cssClass}" title="${escapeHtml(title)}" style="margin:1px;">${entry.id}</span>`;
        }
        return `<button type="button" class="label ${cssClass} vn-build-extension" title="${escapeHtml(title)}"
                   style="margin:1px; border:none; cursor:pointer;"
                   data-building-id="${station.id}" data-extension-id="${entry.id}"
                   data-name="${escapeHtml(label)}" data-cost="${entry.cost}" data-coins="${entry.coins}"
                   data-station-name="${escapeHtml(station.name)}">${entry.id}</button>`;
      })
      .join("");
  }

  // Ausbaustufe (getrenntes System von den Ausbauten oben): zeigt "Stufe X von Y" plus
  // einen Button fuer die naechste Stufe, wenn eine LEVEL_CATALOG-Eintrag existiert und
  // die Wache noch nicht auf der letzten Stufe ist.
  // WICHTIG: Das Level-Feld der API entspricht direkt der im Spiel angezeigten
  // "Stufe"-Nummer (bestaetigt: API-Wert 1 == Spiel zeigt "Stufe: 1") - keine eigene
  // +1-Verschiebung mehr vornehmen, das fuehrte vorher zu falscher Anzeige UND einem
  // falschen Zielwert beim Bauen.
  function renderLevelCell(station) {
    if (!station.levelCatalog) return '<span class="text-muted">-</span>';
    const maxLevel = station.levelCatalog[station.levelCatalog.length - 1].id;
    const shownLevel = station.currentLevel < 0 ? 1 : station.currentLevel;
    const label = `Stufe ${shownLevel} / ${maxLevel}`;
    if (station.currentLevel >= maxLevel) {
      return `<span class="label label-success">${label}</span>`;
    }
    const nextLevel = station.levelCatalog[station.currentLevel + 1];
    const remaining = station.levelCatalog.slice(station.currentLevel + 1, maxLevel + 1);
    const maxCost = remaining.reduce((sum, l) => sum + l.cost, 0);
    const maxCoins = remaining.reduce((sum, l) => sum + l.coins, 0);
    return `
      <div>${label}</div>
      <button type="button" class="btn btn-xs btn-warning vn-build-level" style="margin-top:2px;"
              data-building-id="${station.id}" data-level="${nextLevel.id}"
              data-cost="${nextLevel.cost}" data-coins="${nextLevel.coins}"
              data-station-name="${escapeHtml(station.name)}">
        Nächste Stufe (${nextLevel.cost.toLocaleString("de-DE")} Credits / ${nextLevel.coins} Coins)
      </button>
      <button type="button" class="btn btn-xs vn-build-level-max vn-btn-max-level" style="margin-top:2px; margin-left:2px;"
              data-building-id="${station.id}" data-level="${maxLevel}"
              data-cost="${maxCost}" data-coins="${maxCoins}"
              data-station-name="${escapeHtml(station.name)}"
              title="Direkt auf Stufe ${maxLevel} ausbauen (springt alle verbleibenden Stufen auf einmal)">
        Max ausbauen auf Stufe ${maxLevel} (${maxCost.toLocaleString("de-DE")} Credits / ${maxCoins} Coins)
      </button>
    `;
  }

  // Lagerraum-Badges - gleiches Prinzip wie die Ausbau-Badges, aber eigener Katalog
  // (STORAGE_CATALOG) und eigener Bau-Endpunkt (buildStorage).
  function renderStorageCell(station) {
    if (!station.storageCatalog || !station.storageCatalog.length) return '<span class="text-muted">-</span>';
    return station.storageCatalog
      .map(room => {
        const owned = station.ownedStorageIds.has(room.id);
        if (owned) {
          return `<span class="label label-success" title="${escapeHtml(room.name)}" style="margin:1px;">✓</span>`;
        }
        const title = `${room.name} – ${room.cost.toLocaleString("de-DE")} Credits oder ${room.coins} Coins`;
        return `<button type="button" class="label label-warning vn-build-storage" title="${escapeHtml(title)}"
                   style="margin:1px; border:none; cursor:pointer;"
                   data-building-id="${station.id}" data-storage-id="${room.id}"
                   data-name="${escapeHtml(room.name)}" data-cost="${room.cost}" data-coins="${room.coins}"
                   data-station-name="${escapeHtml(station.name)}">+</button>`;
      })
      .join("");
  }

  // Anzahl bereits fertig gebauter (nicht mehr im Bau befindlicher) Ausbauten einer
  // Wache - dient nur als grobe Vergleichsgroesse zum Sortieren nach Ausbau-Fortschritt.
  function getBuiltExtensionsCount(station) {
    const catalogEntries = EXTENSION_CATALOG[station.buildingKey] || [];
    const entries = catalogEntries.length ? catalogEntries : station.recommendedExtensions.map(id => ({ id }));
    return entries.filter(entry => {
      const owned = station.extensions.find(e => e.type_id === entry.id);
      return owned && !owned.available_at;
    }).length;
  }

  // Kompakter Bau-Bestaetigungs-Bildschirm: zeigt Namen + Kosten, fragt immer nach der
  // Waehrung (Credits oder Coins - nie automatisch eine Wahl treffen), fuehrt dann den
  // uebergebenen Bau-Aufruf aus und kehrt zum Wachen-Check zurueck (frisch geladen,
  // damit der neue Stand sofort sichtbar ist).
  function renderBuildConfirmScreen({
    title,
    costCredits,
    costCoins,
    onConfirm,
    goBack,
    historyType,
    historyLabel,
    historyStation,
  }) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const back = goBack || renderStationCheckScreen;
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `
      <p>Bauen: <b>${escapeHtml(title)}</b></p>
      <p class="text-muted" style="font-size:12px;">Womit soll bezahlt werden?</p>
      <div class="form-group">
        <button id="vn-btn-pay-credits" type="button" class="btn btn-success">
          Mit Credits bauen (${costCredits.toLocaleString("de-DE")})
        </button>
        <button id="vn-btn-pay-coins" type="button" class="btn btn-danger">
          Mit Coins bauen (${costCoins.toLocaleString("de-DE")})
        </button>
      </div>
      <div id="vn-build-status" style="margin-top:10px;"></div>
      <button id="vn-btn-back" type="button" class="btn btn-default" style="margin-top:10px;">
        <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen
      </button>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", back);

    const statusEl = document.getElementById("vn-build-status");
    const creditsBtn = document.getElementById("vn-btn-pay-credits");
    const coinsBtn = document.getElementById("vn-btn-pay-coins");

    async function pay(currency) {
      creditsBtn.disabled = true;
      coinsBtn.disabled = true;
      statusEl.innerHTML = `<em>Wird gebaut ...</em>`;
      try {
        await onConfirm(currency);
        await logHistoryEntry({
          type: historyType,
          label: historyLabel,
          station: historyStation,
          cost: currency === "coins" ? costCoins : costCredits,
          currency,
        });
        statusEl.innerHTML = `<span class="text-success">Erfolgreich gebaut. Lade neu ...</span>`;
        setTimeout(back, 600);
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
        creditsBtn.disabled = false;
        coinsBtn.disabled = false;
      }
    }

    creditsBtn.addEventListener("click", () => pay("credits"));
    coinsBtn.addEventListener("click", () => pay("coins"));
  }

  async function renderStationCheckScreen(preservedState) {
    setModalWidth(MODAL_WIDTH_WIDE);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Wachen-Daten ...</p>`;

    let stations;
    try {
      stations = await loadBuildingsForCheck();
    } catch (e) {
      body.innerHTML = `
        <p class="text-danger">Fehler beim Laden der Wachen: ${escapeHtml(e.message)}</p>
        <button id="vn-btn-back" type="button" class="btn btn-default">Hauptmenü</button>
      `;
      document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
      return;
    }

    const withMissingExtensionsCount = stations.filter(s => s.missingExtensions.length > 0).length;

    // "category" ist der Standard-Sortiermodus (nach Kategorie gruppiert, dann Name) -
    // die anderen Spalten sind einfache auf-/absteigend umschaltbare Sortierungen.
    let sortColumn = preservedState?.sortColumn || "category";
    let sortAscending = preservedState?.sortAscending ?? true;

    const columnLabels = {
      category: "Wache",
      personnel: "Personal",
      hiring: "Automat. Werben",
      extensions: "Ausbauten",
    };

    // Kategorien bleiben IMMER erhalten (sonst verliert man bei vielen Wachen die
    // Uebersicht) - sortColumn/sortAscending bestimmen nur die Reihenfolge INNERHALB
    // jeder Kategorie, nicht ob ueberhaupt gruppiert wird.
    function sortedStations() {
      const dir = sortAscending ? 1 : -1;
      return [...stations].sort((a, b) => {
        const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        if (catDiff !== 0) return catDiff;

        if (sortColumn === "category") return a.name.localeCompare(b.name);

        let diff = 0;
        if (sortColumn === "personnel") diff = (a.personnelCount ?? -1) - (b.personnelCount ?? -1);
        else if (sortColumn === "hiring") diff = Number(a.automaticHiring) - Number(b.automaticHiring);
        else if (sortColumn === "extensions") diff = getBuiltExtensionsCount(a) - getBuiltExtensionsCount(b);
        // Der Namens-Rueckfall bei Gleichstand bleibt bewusst IMMER aufsteigend -
        // sonst dreht sich bei vielen gleichen Werten (z.B. ueberall "300"/"Ja") nur
        // die Namensreihenfolge mit der Sortierrichtung, was wie ein kaputter Sortierer
        // aussieht (nur "dir" auf den eigentlichen Spaltenvergleich anwenden).
        return diff !== 0 ? diff * dir : a.name.localeCompare(b.name);
      });
    }

    function headerHtml(column) {
      const label = columnLabels[column];
      const icon =
        column !== sortColumn
          ? "glyphicon-sort text-muted"
          : sortAscending
            ? "glyphicon-sort-by-attributes"
            : "glyphicon-sort-by-attributes-alt";
      return `<span style="white-space:nowrap;">${label}&nbsp;<span class="glyphicon ${icon}" style="font-size:10px;"></span></span>`;
    }

    // Aktueller Filter-/Sortierzustand - wird beim Oeffnen eines Bau-Dialogs mitgegeben,
    // damit man nach dem Bauen (oder Abbrechen) genau hier wieder landet statt in der
    // Standardansicht.
    function currentState() {
      return {
        sortColumn,
        sortAscending,
        searchQuery: document.getElementById("vn-station-check-search")?.value || "",
        typeFilter: document.getElementById("vn-station-check-type-filter")?.value || "",
      };
    }

    // Blendet Wachen-Zeilen anhand von Sucheingabe und Typ-Filter ein/aus, ohne die
    // Tabelle neu aufzubauen.
    function applyRowVisibility() {
      const query = document.getElementById("vn-station-check-search")?.value.trim().toLowerCase() || "";
      const typeFilter = document.getElementById("vn-station-check-type-filter")?.value || "";

      body.querySelectorAll(".vn-check-station-row").forEach(row => {
        const matchesQuery = !query || row.dataset.name.includes(query);
        const matchesType = !typeFilter || row.dataset.type === typeFilter;
        row.style.display = matchesQuery && matchesType ? "" : "none";
      });
    }

    function renderTable() {
      const list = sortedStations();

      const rows = list
        .map(s => {
          return `
            <tr class="vn-check-station-row" data-name="${escapeHtml(s.name.toLowerCase())}"
                data-category="${escapeHtml(s.category)}" data-type="${escapeHtml(s.typeName || "")}">
              <td>
                <a href="/buildings/${s.id}" target="_blank">${escapeHtml(s.name)}</a>
                <br><small class="text-muted">${escapeHtml(s.typeName || s.category)}${s.leitstelleName ? ` · ${escapeHtml(s.leitstelleName)}` : ""}</small>
              </td>
              <td>${renderPersonnelCell(s)}</td>
              <td>
                <span class="label ${s.automaticHiring ? "label-success" : "label-default"}">
                  ${s.automaticHiring ? "Ja" : "Nein"}
                </span>
              </td>
              <td>${renderExtensionBadges(s)}</td>
              <td>${renderLevelCell(s)}</td>
              <td>${renderStorageCell(s)}</td>
            </tr>
          `;
        })
        .join("");

      body.querySelector("thead").innerHTML = `
        <tr>
          <th class="vn-check-sort-header" data-column="category" style="cursor:pointer; white-space:nowrap;">${headerHtml("category")}</th>
          <th class="vn-check-sort-header" data-column="personnel" style="cursor:pointer; white-space:nowrap;">${headerHtml("personnel")}</th>
          <th class="vn-check-sort-header" data-column="hiring" style="cursor:pointer; white-space:nowrap;">${headerHtml("hiring")}</th>
          <th class="vn-check-sort-header" data-column="extensions" style="cursor:pointer; white-space:nowrap;">${headerHtml("extensions")}</th>
          <th>Stufe</th>
          <th>Lagerräume</th>
        </tr>
      `;
      body.querySelector("tbody").innerHTML = rows;

      body.querySelectorAll(".vn-check-sort-header").forEach(th => {
        th.addEventListener("click", () => {
          const column = th.dataset.column;
          if (column === sortColumn && column !== "category") {
            sortAscending = !sortAscending;
          } else {
            sortColumn = column;
            sortAscending = true;
          }
          renderTable();
        });
      });


      body.querySelectorAll(".vn-build-extension").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const buildingId = btn.dataset.buildingId;
          const extensionId = Number(btn.dataset.extensionId);
          // Zustand JETZT sichern (Suche/Filter/Sortierung), nicht erst wenn goBack
          // ausgefuehrt wird - die Suchleiste/das Dropdown existieren dann nicht mehr,
          // weil der Bau-Bestaetigungs-Bildschirm den Inhalt schon ersetzt hat.
          const savedState = currentState();
          renderBuildConfirmScreen({
            title: btn.dataset.name,
            costCredits: Number(btn.dataset.cost),
            costCoins: Number(btn.dataset.coins),
            onConfirm: currency => buildExtension(buildingId, extensionId, currency),
            goBack: () => renderStationCheckScreen(savedState),
            historyType: "extension",
            historyLabel: btn.dataset.name,
            historyStation: btn.dataset.stationName,
          });
        });
      });

      body.querySelectorAll(".vn-build-storage").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const buildingId = btn.dataset.buildingId;
          const storageId = btn.dataset.storageId;
          const savedState = currentState();
          renderBuildConfirmScreen({
            title: btn.dataset.name,
            costCredits: Number(btn.dataset.cost),
            costCoins: Number(btn.dataset.coins),
            onConfirm: currency => buildStorage(buildingId, storageId, currency),
            goBack: () => renderStationCheckScreen(savedState),
            historyType: "storage",
            historyLabel: btn.dataset.name,
            historyStation: btn.dataset.stationName,
          });
        });
      });

      body.querySelectorAll(".vn-build-level, .vn-build-level-max").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const buildingId = btn.dataset.buildingId;
          const level = Number(btn.dataset.level);
          const savedState = currentState();
          renderBuildConfirmScreen({
            title: `Ausbaustufe ${level}`,
            costCredits: Number(btn.dataset.cost),
            costCoins: Number(btn.dataset.coins),
            onConfirm: currency => buildLevel(buildingId, currency, level),
            goBack: () => renderStationCheckScreen(savedState),
            historyType: "level",
            historyLabel: `Ausbaustufe ${level}`,
            historyStation: btn.dataset.stationName,
          });
        });
      });

      applyRowVisibility();
    }

    const typeOptions = [...new Set(stations.map(s => s.typeName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "de"),
    );

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Grün = gebaut und aktiv, Blau = in Bau, Orange = nicht gebaut, aber gefordert, Grau = nicht
        gebaut. Maus über einen Ausbau halten zeigt Namen und Kosten. Klick auf einen nicht gebauten
        Ausbau öffnet den Bau-Dialog (Credits oder Coins, du entscheidest) – kostet Spielgeld!
        ${withMissingExtensionsCount} von ${stations.length} Wachen fehlt noch mindestens ein
        geforderter Ausbau. Spaltenüberschriften sind klickbar zum Sortieren.
      </p>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <select id="vn-station-check-type-filter" class="form-control" style="max-width:260px;">
          <option value="">Alle Gebäudetypen</option>
          ${typeOptions.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
        </select>
        <input type="text" id="vn-station-check-search" class="form-control" placeholder="Wache suchen ..."
               value="${escapeHtml(preservedState?.searchQuery || "")}" style="flex:1;">
      </div>
      <div style="max-height:55vh; overflow:auto;">
        <table class="table table-condensed table-striped" style="font-size:12px; table-layout:fixed; width:100%;">
          <colgroup>
            <col style="width:20%;">
            <col style="width:8%;">
            <col style="width:11%;">
            <col style="width:33%;">
            <col style="width:13%;">
            <col style="width:15%;">
          </colgroup>
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
      <button id="vn-btn-back" type="button" class="btn btn-default" style="margin-top:10px;">
        <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Hauptmenü
      </button>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    if (preservedState?.typeFilter) {
      document.getElementById("vn-station-check-type-filter").value = preservedState.typeFilter;
    }
    document.getElementById("vn-station-check-search").addEventListener("input", applyRowVisibility);
    document.getElementById("vn-station-check-type-filter").addEventListener("change", applyRowVisibility);

    renderTable();
  }

  //////////////////////////////////////////////////
  // Main
  //////////////////////////////////////////////////

  async function main() {
    console.log(
      "%cFuxTools%c by Fuxaro - lizenziert unter CC BY-NC-SA 4.0 (Namensnennung, nicht-kommerziell, Weitergabe unter gleichen Bedingungen). https://creativecommons.org/licenses/by-nc-sa/4.0/",
      "color:#337ab7; font-weight:bold;",
      "color:inherit; font-weight:normal;"
    );
    await migrateLegacyIndexedDbNames();
    await Promise.all([initModal(), initVehicleTypeCaptions(), initNamesStore()]);
    addMenuEntry();
    checkForUpdateInBackground(); // gedrosselt, blockiert den Start nicht (kein await)
  }

  main();
})();
