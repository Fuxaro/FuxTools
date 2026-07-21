// ==UserScript==
// @name        * FuxTools
// @namespace   custom.leitstellenspiel.de
// @version     0.9.38
// @author      Fuxaro
// @license     CC BY-NC-SA 4.0 - https://creativecommons.org/licenses/by-nc-sa/4.0/
// @description FuxTools - Wachen- und Fahrzeugverwaltung für leitstellenspiel.de: Wache(n) auswählen, pro Fahrzeugtyp einen Namen vergeben, automatisch durchnummeriert umbenennen oder zurücksetzen.
// @match       https://www.leitstellenspiel.de/
// @match       https://polizei.leitstellenspiel.de/
// @icon        https://raw.githubusercontent.com/Fuxaro/FuxTools/main/logo-small.png
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
  const SCRIPT_VERSION = "0.9.38";
  const CHANNEL = "beta"; // "stable" oder "beta"
  //////////////////////////////////////////////////////////////////////////////

  const STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js";
  const BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/fuxtools.user.js";
  const UPDATE_CHECK_URL = CHANNEL === "beta" ? BETA_URL : STABLE_URL;
  // Immer main, unabhaengig vom Kanal - das Logo ist ein reines Bild-Asset ohne
  // Versionsbezug und liegt deshalb nur auf einem Branch (main), nicht auf beta.
  const LOGO_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/logo-small.png";
  // Eigene Kopie des Fahrzeug-Katalogs im FuxTools-Repo (siehe data/vehicle-types-fallback.json)
  // - wird NUR genutzt, wenn die eigentliche Quelle api.lss-manager.de nicht erreichbar ist
  // (siehe fetchVehicleTypeCatalog()). Ist zwangslaeufig irgendwann veraltet, verhindert aber,
  // dass FuxTools komplett ohne Fahrzeugdaten dasteht, falls die fremde Seite mal down geht
  // oder ganz verschwindet.
  const VEHICLE_TYPES_FALLBACK_STABLE_URL =
    "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/data/vehicle-types-fallback.json";
  const VEHICLE_TYPES_FALLBACK_BETA_URL =
    "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/data/vehicle-types-fallback.json";
  const VEHICLE_TYPES_FALLBACK_URL = CHANNEL === "beta" ? VEHICLE_TYPES_FALLBACK_BETA_URL : VEHICLE_TYPES_FALLBACK_STABLE_URL;
  // Fuer den "Changelog anzeigen"-Button in den Einstellungen - zeigt immer den Stand des
  // eigenen Kanals (Beta liest von beta, Stable von main), analog zu STABLE_URL/BETA_URL.
  const CHANGELOG_STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/CHANGELOG.md";
  const CHANGELOG_BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/CHANGELOG.md";
  const CHANGELOG_URL = CHANNEL === "beta" ? CHANGELOG_BETA_URL : CHANGELOG_STABLE_URL;

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

  // Zeigt im Modal-Header IMMER, in welchem Menue/Untermenue man sich gerade befindet (z.B.
  // "› Wachen-Bauplaner › Anwenden"), statt dass man das nur am Bildschirminhalt selbst
  // erkennen kann. Wird von jedem render*Screen zu Beginn aufgerufen; leer = nur der reine
  // Hauptmenue-Titel (siehe renderMainMenu).
  function setScreenTitle(text) {
    const el = document.getElementById("vehicle-naming-modal-breadcrumb");
    if (el) el.textContent = text ? `› ${text}` : "";
  }

  // Sichtbarer Fehler-Hinweis fuer kritische, sonst nur in der Browser-Konsole sichtbare
  // Fehler - Beta-Tester oeffnen die Konsole normalerweise nicht, ein reines console.error()
  // geht also spurlos unter. Erscheint bewusst IMMER direkt auf der Seite (nicht im
  // FuxTools-Modal), da manche dieser Fehler schon vor dem Oeffnen des Modals passieren
  // (z.B. beim Start) oder das Modal deswegen ueberhaupt nicht erreichbar ist (z.B. wenn der
  // Navbar-Eintrag selbst fehlschlaegt - siehe addMenuEntry()). Bleibt bis zum manuellen
  // Schliessen stehen, damit Tester Zeit haben, einen Screenshot fuer den Bug-Report zu machen.
  function showErrorBanner(message) {
    let container = document.getElementById("fuxtools-error-toasts");
    if (!container) {
      container = document.createElement("div");
      container.id = "fuxtools-error-toasts";
      container.style.cssText =
        "position:fixed; bottom:16px; right:16px; z-index:99999; max-width:380px; " +
        "display:flex; flex-direction:column; gap:8px; font-family:sans-serif;";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.style.cssText =
      "background:#d9534f; color:#fff; padding:10px 32px 10px 14px; border-radius:4px; " +
      "box-shadow:0 2px 10px rgba(0,0,0,0.4); font-size:13px; line-height:1.4; position:relative;";
    toast.innerHTML = `<b>FuxTools-Fehler:</b> ${escapeHtml(message)}`;

    const closeBtn = document.createElement("span");
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Schließen");
    closeBtn.style.cssText =
      "position:absolute; top:4px; right:10px; cursor:pointer; font-weight:bold; font-size:16px; line-height:1;";
    closeBtn.addEventListener("click", () => toast.remove());
    toast.appendChild(closeBtn);

    container.appendChild(toast);
  }

  function reportError(context, error) {
    const message = error?.message || String(error);
    console.error(`[FuxTools] ${context}:`, error);
    showErrorBanner(`${context} - ${message}`);
    logErrorToStorage(context, message).catch(e =>
      console.error("[FuxTools] Fehlerprotokoll konnte nicht gespeichert werden:", e)
    );
  }

  const modalId = "vehicle-naming-modal";
  const cacheKeyVehicleTypes = "vehicleTypes";

  let vehicleTypeCaptions = {};
  // Roh-Katalog von api.lss-manager.de (id -> {caption, staff: {min, max, training}, ...}) -
  // "staff.training" beschreibt je Fahrzeugtyp, welche Ausbildungs-Slugs die Besatzung
  // braucht (siehe getVehicleTypeRequirement() bei der Fahrzeug-Besatzung).
  let vehicleTypeCatalog = {};
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
  // teils andere empfohlene Ausbauten - deshalb eigene IDs hier.
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

  //////////////////////////////////////////////////
  // Ausbau-Katalog: echte Namen und Kosten (Credits/Coins) fuer Ausbauten, Lagerraeume
  // und Ausbaustufen, wie sie im Spiel angezeigt werden. Schluessel: "<building_type>_
  // normal" oder "<building_type>_small" (Kleinwache). Ermoeglicht das direkte Bauen aus
  // FuxTools heraus.
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
      // Bis Stufe 19 (nicht 18) - bestaetigt durch eine Wache, die im Spiel bereits auf
      // Stufe 19 stand, waehrend der Katalog hier noch bei 18 endete.
      ...buildUniformLevels(18, 100000, 20).map((l, i) => ({ id: i + 2, cost: l.cost, coins: l.coins })),
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

  // Fehlerprotokoll: die letzten kritischen Fehler (siehe reportError()) werden zusaetzlich
  // hier gespeichert, nicht nur als Toast angezeigt - ein Beta-Tester kann den Toast leicht
  // wegklicken oder verpassen, bevor er einen Screenshot macht. Rein diagnostisch (Export in
  // den Einstellungen), hat keinen Einfluss auf die eigentliche Funktion von FuxTools.
  const ERROR_LOG_KEY = "errorLog";
  const ERROR_LOG_MAX_ENTRIES = 20;

  async function getErrorLog() {
    return (await retrieveData(ERROR_LOG_KEY)) || [];
  }

  async function logErrorToStorage(context, message) {
    const log = await getErrorLog();
    log.unshift({ timestamp: Date.now(), version: SCRIPT_VERSION, context, message });
    if (log.length > ERROR_LOG_MAX_ENTRIES) log.length = ERROR_LOG_MAX_ENTRIES;
    await storeData(log, ERROR_LOG_KEY);
  }
  const HISTORY_TYPE_LABELS = {
    extension: "Ausbau",
    vehicle: "Fahrzeug-Kauf",
    vehicle_sell: "Fahrzeug verkauft",
    storage: "Lagerraum",
    level: "Ausbaustufe",
    vehicle_rename: "Fahrzeuge umbenennen",
    vehicle_reset: "Fahrzeuge zurücksetzen",
    station_rename: "Wachen umbenennen",
    leitstelle_rename: "Leitstellen umbenennen",
    required_extensions_config: "Geforderte Ausbauten",
    personnel_requirements_config: "Personal-Standard",
    schooling_start: "Schulung gestartet",
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
  // Verlaufs-Typ zu. itemNoun ist immer eine der drei folgenden Werte (siehe alle
  // executeRenamePlan-Aufrufstellen).
  function renameHistoryType(itemNoun, verb) {
    if (itemNoun === "Fahrzeug(e)") return verb === "zurückgesetzt" ? "vehicle_reset" : "vehicle_rename";
    if (itemNoun === "Wache(n)") return "station_rename";
    return "leitstelle_rename";
  }

  // Ueberschreibt optional, welche Ausbauten je Gebaeudetyp im Wachen-Check als
  // "gefordert" (orange) markiert werden - Standard ist RECOMMENDED_EXTENSIONS_BY_
  // PSEUDO_ID. Komplett fehlend (kein GM-Wert gespeichert) bedeutet "ueberall Standard
  // verwenden"; sobald einmal in den Einstellungen gespeichert, wird die komplette
  // Konfiguration aus dem GM-Speicher genutzt (kein Mischen von Standard + Custom).
  const CUSTOM_REQUIRED_EXTENSIONS_KEY = "customRequiredExtensions";

  async function getRequiredExtensionsOverrides() {
    return await retrieveData(CUSTOM_REQUIRED_EXTENSIONS_KEY);
  }

  function getDefaultRequiredExtensions(pseudoId) {
    return RECOMMENDED_EXTENSIONS_BY_PSEUDO_ID[pseudoId] || [];
  }

  // Personal-Check: es gibt keine JSON-API fuer Personal-Ausbildungen, nur die HTML-
  // Seite jeder Wache (/buildings/{id}/personals). Dort traegt jede Personal-Zeile ein
  // data-filterable-by="[...]"-Attribut mit den Ausbildungs-Slugs dieser Person (z.B.
  // "elw2"), die "Ausbildung"-Spalte zeigt dazu den Klartext-Namen. Da das pro Wache
  // eine eigene Anfrage braucht (keine Sammel-API wie bei Gebaeuden), scannt ein Lauf
  // IMMER alle Kategorien zusammen (schnell genug), nicht mehr einzeln - siehe
  // scanAllPersonnel(). Wird automatisch angestossen, wenn der letzte Scan laut
  // PERSONNEL_SCAN_META_KEY laenger als PERSONNEL_SCAN_STALE_MS her ist (siehe
  // ensureFreshPersonnelScan()), zusaetzlich jederzeit manuell ausloesbar.
  const PERSONNEL_SCAN_KEY = "personnelScanData"; // { [buildingId]: { counts, names, total, ... } }
  const PERSONNEL_SCAN_META_KEY = "personnelScanMeta"; // { lastScanAt: timestamp } - EIN Zeitstempel fuer alle Kategorien
  const PERSONNEL_QUALIFICATIONS_KEY = "personnelQualifications"; // { [slug]: displayName }, waechst mit jedem Scan
  // Mindest-Personalstaerke (scan.total) einer Wache, bevor Schulungen (siehe unten) ueberhaupt
  // Personal von ihr einplant - schuetzt frisch gebaute/kleine Wachen mit wenig Personal davor,
  // sofort leergeraeumt zu werden. 0 = Standard = keine Einschraenkung.
  const PERSONNEL_SCHOOLING_MIN_STAFF_KEY = "personnelSchoolingMinStaff";
  // Bei Fahrzeugen mit Teil-Anforderung (z.B. GRTW/NAW: nur 1 von 6 mit Notarzt-Ausbildung)
  // legt das fest, ob die Fahrzeug-Besatzung nur das echte Minimum ("min", spart Personal
  // fuer andere Fahrzeuge) oder gleich die volle Besatzung ("full") mit Ausbildung befuellt.
  const VEHICLE_CREW_STAFFING_MODE_KEY = "vehicleCrewStaffingMode";

  async function getVehicleCrewStaffingMode() {
    const mode = await retrieveData(VEHICLE_CREW_STAFFING_MODE_KEY);
    return mode === "full" ? "full" : "min";
  }

  // Ob die Fahrzeug-Besatzung auch normale Fahrzeuge OHNE Ausbildungsanforderung mit
  // einbezieht (siehe getVehicleTypeCrewTarget/loadCrewCheckVehicles) - Standard AUS, damit
  // sich am bisherigen (nur Spezialfahrzeuge) Verhalten nichts aendert, bis bewusst
  // aktiviert.
  const VEHICLE_CREW_INCLUDE_NORMAL_KEY = "vehicleCrewIncludeNormal";

  async function getVehicleCrewIncludeNormal() {
    return !!(await retrieveData(VEHICLE_CREW_INCLUDE_NORMAL_KEY));
  }

  // Merkt sich die zuletzt bekannten Besatzungs-Probleme (Fahrzeug-id -> {message, since}) ueber
  // Schliessen/Wiederoeffnen des Fahrzeug-Besatzung-Screens hinweg, damit nicht nach jedem
  // Oeffnen alle Kategorien neu geprueft werden muessen. Beim Oeffnen wird das mit der
  // frisch geladenen Fahrzeugliste abgeglichen (siehe renderVehicleCrewScreen) - Fahrzeuge,
  // die es nicht mehr gibt (verkauft/umgebaut), fallen dabei automatisch raus. "since" ist der
  // Zeitpunkt, seit dem dieses Fahrzeug OHNE UNTERBRECHUNG als Problem gefuehrt wird (bleibt
  // beim erneuten Pruefen erhalten, nur "message" wird aktualisiert) - hilft beim Aufraeumen,
  // alte von frischen Eintraegen zu unterscheiden.
  const VEHICLE_CREW_PROBLEMS_KEY = "vehicleCrewProblems"; // { [vehicleId]: { message, since } }

  // Alte Versionen speicherten hier nur einen reinen String statt {message, since} - beim
  // Lesen auf das neue Format hochziehen (since: null = Zeitpunkt unbekannt), statt eine
  // Migration zu erzwingen.
  async function getVehicleCrewProblems() {
    const raw = (await retrieveData(VEHICLE_CREW_PROBLEMS_KEY)) || {};
    const result = {};
    for (const [id, value] of Object.entries(raw)) {
      result[id] = typeof value === "string" ? { message: value, since: null } : value;
    }
    return result;
  }

  async function saveVehicleCrewProblems(problemsById) {
    const plain = {};
    for (const [id, { message, since }] of problemsById) plain[id] = { message, since };
    await storeData(plain, VEHICLE_CREW_PROBLEMS_KEY);
  }

  async function getPersonnelScanData() {
    return (await retrieveData(PERSONNEL_SCAN_KEY)) || {};
  }

  async function getPersonnelScanMeta() {
    return (await retrieveData(PERSONNEL_SCAN_META_KEY)) || {};
  }

  async function getPersonnelQualifications() {
    return (await retrieveData(PERSONNEL_QUALIFICATIONS_KEY)) || {};
  }

  async function getPersonnelSchoolingMinStaff() {
    return (await retrieveData(PERSONNEL_SCHOOLING_MIN_STAFF_KEY)) || 0;
  }

  // Wachen-Bauplaner: Vorlagen, wie eine Wache eines bestimmten Typs ausgebaut/ausgestattet
  // sein soll (Ausbauten, Fahrzeuge+Anzahl, Sollpersonal) - siehe renderStationBlueprints*.
  const STATION_BLUEPRINTS_KEY = "stationBlueprints"; // { [id]: Blueprint }

  async function getStationBlueprints() {
    return (await retrieveData(STATION_BLUEPRINTS_KEY)) || {};
  }

  async function saveStationBlueprints(blueprints) {
    await storeData(blueprints, STATION_BLUEPRINTS_KEY);
  }

  // Alle von FuxTools angelegten GM-Speicher-Eintraege - EINZIGE Quelle dieser Liste,
  // genutzt fuer "Speicher loeschen" UND fuer Einstellungen exportieren/importieren
  // (siehe renderSettingsScreen). vehicleTypes bewusst NICHT enthalten: reiner, jederzeit
  // neu ladbarer API-Cache, keine echte Einstellung.
  const ALL_SETTINGS_KEYS = [
    "names",
    HISTORY_STORAGE_KEY,
    CUSTOM_REQUIRED_EXTENSIONS_KEY,
    PERSONNEL_SCAN_KEY,
    PERSONNEL_SCAN_META_KEY,
    PERSONNEL_QUALIFICATIONS_KEY,
    PERSONNEL_SCHOOLING_MIN_STAFF_KEY,
    STATION_BLUEPRINTS_KEY,
    VEHICLE_CREW_STAFFING_MODE_KEY,
    VEHICLE_CREW_PROBLEMS_KEY,
    VEHICLE_CREW_INCLUDE_NORMAL_KEY,
  ];

  // Loescht alle von FuxTools angelegten GM-Speicher-Eintraege (Namen/Bausteine-
  // Einstellungen, Fahrzeugtyp-Cache, Verlauf, geforderte-Ausbauten-/Personal-
  // Konfiguration inkl. Scan-Daten) - fuer den "Speicher loeschen"-Button in den
  // Einstellungen, simuliert damit den Zustand einer Neuinstallation.
  async function clearAllStoredData() {
    await GM.deleteValue(cacheKeyVehicleTypes);
    await GM.deleteValue(ERROR_LOG_KEY);
    for (const key of ALL_SETTINGS_KEYS) await GM.deleteValue(key);
  }

  // Buendelt alle Einstellungen (siehe ALL_SETTINGS_KEYS) in ein JSON-Objekt, fuer den
  // "Herunterladen"-Button in den Einstellungen (Backup vor Neuinstallation o.ae.).
  async function exportAllSettings() {
    const data = {};
    for (const key of ALL_SETTINGS_KEYS) {
      const value = await GM.getValue(key, undefined);
      if (value !== undefined) data[key] = value;
    }
    return { fuxtools: true, version: SCRIPT_VERSION, exportedAt: Date.now(), data };
  }

  // Gegenstueck zu exportAllSettings(): schreibt nur bekannte Schluessel (ALL_SETTINGS_KEYS)
  // zurueck - ignoriert alles andere in der Datei, statt beliebige Schluessel zu uebernehmen.
  async function importAllSettings(parsed) {
    if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
      throw new Error("Datei hat kein gültiges FuxTools-Einstellungen-Format.");
    }
    for (const key of ALL_SETTINGS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(parsed.data, key)) {
        await GM.setValue(key, parsed.data[key]);
      }
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  }

  async function storeVehicleTypes(data, expiresInMs) {
    const expirationDate = new Date(Date.now() + expiresInMs);
    await storeData({ data, expirationDate }, cacheKeyVehicleTypes);
  }

  // Holt den Fahrzeug-Katalog primaer von api.lss-manager.de. Schlaegt das fehl (Seite down,
  // Netzwerkfehler, Adblocker), wird als Notfall-Ersatz die eigene, im FuxTools-Repo gepflegte
  // Kopie (VEHICLE_TYPES_FALLBACK_URL, siehe data/vehicle-types-fallback.json) geladen - die ist
  // zwangslaeufig irgendwann veraltet, deshalb nur 1 Stunde statt 1 Tag gecacht, damit beim
  // naechsten Laden gleich wieder die echte, aktuelle Quelle versucht wird.
  async function fetchVehicleTypeCatalog() {
    try {
      const data = await fetchJson("https://api.lss-manager.de/de_DE/vehicles");
      await storeVehicleTypes(data, 24 * 60 * 60 * 1000);
      return data;
    } catch (primaryError) {
      console.error("[FuxTools] Fahrzeug-Katalog von api.lss-manager.de nicht erreichbar, versuche Fallback:", primaryError);
      try {
        const data = await fetchJson(VEHICLE_TYPES_FALLBACK_URL);
        await storeVehicleTypes(data, 60 * 60 * 1000);
        return data;
      } catch (fallbackError) {
        console.error("[FuxTools] Auch Fallback-Fahrzeug-Katalog nicht erreichbar:", fallbackError);
        throw fallbackError;
      }
    }
  }

  async function initVehicleTypeCaptions() {
    const cached = await retrieveData(cacheKeyVehicleTypes);
    let types = cached?.data;
    const expirationDate = cached?.expirationDate;

    if (!types || !expirationDate || new Date(expirationDate) < new Date()) {
      try {
        types = await fetchVehicleTypeCatalog();
      } catch (error) {
        // Beide Quellen down: lieber mit den alten (evtl. abgelaufenen) Cache-Daten
        // weiterarbeiten als mit gar keinen, falls welche vorhanden sind.
        if (!types) throw error;
      }
    }

    vehicleTypeCaptions = {};
    vehicleTypeCatalog = types || {};
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
      <div class="vn-sticky-footer">
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

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // Sehr einfacher Markdown->HTML-Renderer NUR fuer den "Changelog anzeigen"-Bildschirm - kein
  // Anspruch auf vollstaendiges Markdown, deckt bewusst nur ab, was CHANGELOG.md tatsaechlich
  // nutzt: #/##-Ueberschriften, "- "-Listen (inkl. eingerueckter Folgezeilen als Fortsetzung
  // desselben Punkts) und **fett**. Alles wird escaped, bevor **fett** angewendet wird - kein
  // XSS-Risiko, auch wenn der Inhalt von einer fremden Quelle (GitHub) kommt.
  function inlineMarkdown(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }

  function renderMarkdownLite(markdown) {
    let html = "";
    let inList = false;
    const closeList = () => {
      if (inList) { html += "</ul>"; inList = false; }
    };
    for (const rawLine of markdown.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        closeList();
        continue;
      }
      if (line.startsWith("## ")) {
        closeList();
        html += `<h4>${inlineMarkdown(line.slice(3))}</h4>`;
      } else if (line.startsWith("# ")) {
        closeList();
        html += `<h3>${inlineMarkdown(line.slice(2))}</h3>`;
      } else if (/^-\s+/.test(line)) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${inlineMarkdown(line.replace(/^-\s+/, ""))}</li>`;
      } else if (/^\s+\S/.test(rawLine) && inList) {
        // Eingerueckte Fortsetzungszeile eines Listenpunkts (Zeilenumbruch in CHANGELOG.md).
        html = html.replace(/<\/li>$/, ` ${inlineMarkdown(line.trim())}</li>`);
      } else {
        closeList();
        html += `<p>${inlineMarkdown(line)}</p>`;
      }
    }
    closeList();
    return html;
  }

  // Gemeinsame Such-/Typ-Filter-Logik fuer die Tabellen-Bildschirme (Verlauf, Wachen-
  // Check, Personal-Check): blendet Zeilen anhand von Sucheingabe und Typ-Dropdown ein/
  // aus, ohne die Tabelle neu aufzubauen. rowSelector matcht die Zeilen, deren
  // data-[searchField]- und data-type-Attribute verglichen werden.
  function makeRowVisibilityFilter({ container, searchInputId, typeFilterId, rowSelector, searchField }) {
    return function applyRowVisibility() {
      const query = document.getElementById(searchInputId)?.value.trim().toLowerCase() || "";
      const typeFilter = document.getElementById(typeFilterId)?.value || "";
      container.querySelectorAll(rowSelector).forEach(row => {
        const matchesQuery = !query || row.dataset[searchField].includes(query);
        const matchesType = !typeFilter || row.dataset.type === typeFilter;
        row.style.display = matchesQuery && matchesType ? "" : "none";
      });
    };
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
      #vehicle-naming-modal-body .vn-settings-card {
        padding: 12px 14px;
        background-color: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
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
      /* Bootstraps Standard-Rot fuer .text-danger (#a94442) ist auf dem dunklen Seiten-Theme
         kaum lesbar (fuer helle Hintergruende gedacht) - hier durchgaengig auf ein helleres,
         kontrastreicheres Rot angehoben. Betrifft alle Fehlermeldungen/Status-Texte im Script. */
      #vehicle-naming-modal-body .text-danger {
        color: #ff6b6b;
      }
      #vehicle-naming-modal-body .vn-changelog h3 {
        margin-top: 0;
      }
      #vehicle-naming-modal-body .vn-changelog h4 {
        margin: 18px 0 8px;
      }
      #vehicle-naming-modal-body .vn-changelog ul {
        padding-left: 20px;
      }
      #vehicle-naming-modal-body .vn-changelog li {
        margin-bottom: 6px;
      }
      /* Aktions-/Zurueck-Buttons: wird von modalBody automatisch in #vehicle-naming-modal-
         actions verschoben (siehe Object.defineProperty auf modalBody.innerHTML weiter
         unten) - eine eigene, nicht scrollende Zeile, damit beim Scrollen durch lange
         Listen (z.B. viele Fahrzeugtypen) nichts mehr sichtbar dahinter durchrutscht. */
      .vn-sticky-footer {
        margin-top: 10px;
        padding: 10px 0 2px;
        background: var(--vn-modal-bg, #333);
        border-top: 1px solid rgba(255, 255, 255, 0.15);
      }
      #vehicle-naming-modal-actions {
        flex-shrink: 0;
      }
      #vehicle-naming-modal-actions:empty {
        display: none;
      }
      /* Feste Gesamthoehe fuer die Modal-Box statt variabler Hoehe: verhindert, dass bei
         langen Screens ZWEI verschachtelte Scrollbereiche entstehen (das ganze Bootstrap-
         Modal UND unser eigener Body-Bereich) - dadurch stand der .vn-sticky-footer bisher
         manchmal nicht am echten unteren Rand des sichtbaren Fensters, sondern nur am
         unteren Rand des inneren (mitgescrollten) Bereichs. Mit einer festen Modal-Hoehe
         (Header/Footer fix, nur der Body dazwischen scrollt) bleibt das Verhalten auf
         JEDEM Screen gleich.
       */
      #vehicle-naming-modal-dialog .modal-content {
        display: flex;
        flex-direction: column;
        max-height: 90vh;
      }
      #vehicle-naming-modal-dialog .modal-header,
      #vehicle-naming-modal-dialog .modal-footer {
        flex-shrink: 0;
      }
      #vehicle-naming-modal-body {
        flex: 1 1 auto;
        overflow-y: auto;
        /* min-height:0 ist noetig, damit ein Flex-Kind ueberhaupt kleiner als sein
           Inhalt werden und selbst scrollen darf (sonst wuerde es sich einfach auf die
           volle Inhaltshoehe aufblaehen und .modal-content wieder ueber max-height
           hinaus wachsen lassen). */
        min-height: 0;
      }
    `;
    document.head.appendChild(style);
  }

  async function initModal() {
    if (document.getElementById(modalId)) return;

    addCustomStyles();

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

    const breadcrumb = document.createElement("span");
    breadcrumb.id = "vehicle-naming-modal-breadcrumb";
    breadcrumb.className = "text-muted";
    breadcrumb.style.cssText = "margin-left:8px; font-size:13px; font-weight:normal;";
    modalTitle.appendChild(breadcrumb);

    const modalHeader = document.createElement("div");
    modalHeader.className = "modal-header";
    modalHeader.appendChild(modalTitle);

    const modalBody = document.createElement("div");
    modalBody.className = "modal-body";
    modalBody.id = "vehicle-naming-modal-body";
    // Hoehe/Scrollverhalten kommt jetzt komplett aus addCustomStyles() (Flexbox-Layout auf
    // .modal-content) - Kopf- und Fusszeile bleiben so immer an Ort und Stelle sichtbar,
    // auch wenn eine Liste (z.B. viele Fahrzeugtypen) laenger ist als der Bildschirm - dann
    // scrollt nur dieser Bereich, nicht das ganze Fenster/Modal.
    modalBody.innerHTML = `<p><em>Lade Wachen &amp; Fahrzeuge ...</em></p>`;

    const modalActions = document.createElement("div");
    modalActions.id = "vehicle-naming-modal-actions";

    // Jede render*Screen()-Funktion schreibt ihre Aktions-Buttons als ".vn-sticky-footer"
    // einfach MIT in modalBody.innerHTML (unveraendert, keine Anpassung an jedem der 30+
    // Aufrufe noetig). Frueher hielt CSS position:sticky diesen Block am unteren Rand des
    // SCROLLENDEN Bereichs fest - bei langen Listen (z.B. viele Fahrzeugtypen bei "Fahrzeuge
    // umbenennen") rutschten aber noch nicht gescrollte Zeilen sichtbar darunter durch,
    // weil sie im DOM VOR dem Footer stehen und der Scrollbereich weiterlaeuft. Hier wird
    // der Footer deshalb bei JEDER Vollersetzung von modalBody automatisch in eine EIGENE,
    // nicht scrollende Zeile (Sibling von modalBody, wie Kopf-/Fusszeile) verschoben - dort
    // kann nichts mehr dahinter durchscrollen. Ein gezielter Override von .innerHTML NUR auf
    // diesem einen Element (nicht am Element.prototype!) reicht dafuer aus und faengt auch
    // Screens ohne eigene Anpassung automatisch mit ab; Teil-Updates einzelner Kind-Elemente
    // (z.B. nur die Problem-Liste) loesen das bewusst NICHT aus, weil sie nicht ueber
    // modalBody.innerHTML laufen.
    const nativeBodyInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    Object.defineProperty(modalBody, "innerHTML", {
      configurable: true,
      get() {
        return nativeBodyInnerHTML.get.call(this);
      },
      set(html) {
        nativeBodyInnerHTML.set.call(this, html);
        modalActions.innerHTML = "";
        const footer = this.querySelector(".vn-sticky-footer");
        if (footer) modalActions.appendChild(footer);
      },
    });

    const modalFooter = document.createElement("div");
    modalFooter.className = "modal-footer";
    modalFooter.style.cssText = "display:flex; align-items:center; font-size:11px; color:#888; padding:6px 12px;";
    modalFooterEl = modalFooter;
    renderFooter();

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content";
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalActions);
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
    // Aktionsleiste (siehe .vn-sticky-footer) braucht einen deckenden Hintergrund - liest
    // dafuer die TATSAECHLICHE Hintergrundfarbe des Modals aus (Seiten-Theme, kein von uns
    // geratener Farbwert), statt einen festen Hex-Wert zu hinterlegen, der bei einem anderen
    // Theme/Subdomain nicht mehr passt. Auf modalContent gesetzt (nicht modalBody), weil die
    // Aktionsleiste jetzt in #vehicle-naming-modal-actions liegt - einem Sibling von
    // modalBody, das die Custom Property sonst nicht erben wuerde.
    modalContent.style.setProperty("--vn-modal-bg", getComputedStyle(modalContent).backgroundColor);

    // show.bs.modal feuert SOFORT beim Oeffnen, noch bevor die Fade-in-Animation
    // startet - so wird das Hauptmenue gesetzt, bevor ueberhaupt etwas sichtbar ist.
    // (shown.bs.modal wuerde erst NACH der Animation feuern und kurz den alten
    // Inhalt vom letzten Mal aufblitzen lassen.)
    // Seiten-jQuery ueber unsafeWindow: seit @grant nicht mehr "none" ist, laeuft das
    // Script in einer Sandbox und sieht das von der Seite geladene $/jQuery nicht direkt.
    const pageJQuery = unsafeWindow.jQuery || unsafeWindow.$;
    pageJQuery(modal).on("show.bs.modal", () => {
      // Falls seit dem letzten Oeffnen ein Update-Tab geoeffnet wurde (siehe
      // pendingReloadAfterUpdate), bleibt der Neuladen-Bildschirm bestehen statt des
      // Hauptmenues - kein automatischer Reload, der Nutzer klickt bewusst selbst.
      if (pendingReloadAfterUpdate) {
        renderUpdateRequiredScreen();
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
    setScreenTitle("");
    const body = document.getElementById("vehicle-naming-modal-body");
    const username = getCurrentUsername();
    const greeting = username ? `Hey ${escapeHtml(username)}, was möchtest du tun?` : "Was möchtest du tun?";
    const sectionLabelStyle =
      "font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin:14px 0 4px; font-weight:bold;";

    body.innerHTML = `
      <div style="max-width:420px; margin:0 auto;">
        <p>${greeting}</p>

        <p class="text-muted" style="${sectionLabelStyle} margin-top:0;">Wachenplanung</p>
        <div class="list-group">
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-station-blueprints">
            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span>
            Wachen-Bauplaner
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-personnel-check">
            <span class="glyphicon glyphicon-user" aria-hidden="true"></span>
            Personal-Check
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-schooling">
            <span class="glyphicon glyphicon-education" aria-hidden="true"></span>
            Schulungen
          </button>
        </div>

        <p class="text-muted" style="${sectionLabelStyle}">Helfer</p>
        <div class="list-group">
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-vehicle-crew">
            <span class="glyphicon glyphicon-wrench" aria-hidden="true"></span>
            Fahrzeug-Besatzung
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-station-check">
            <span class="glyphicon glyphicon-tasks" aria-hidden="true"></span>
            Wachenausbau
          </button>
        </div>

        <p class="text-muted" style="${sectionLabelStyle}">Schnellumbenennung</p>
        <div class="list-group">
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-vehicles">
            <span class="glyphicon glyphicon-road" aria-hidden="true"></span>
            Fahrzeuge umbenennen
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-reset">
            <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>
            Fahrzeugnamen zurücksetzen
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-stations">
            <span class="glyphicon glyphicon-home" aria-hidden="true"></span>
            Wachen umbenennen
          </button>
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-leitstellen">
            <span class="glyphicon glyphicon-map-marker" aria-hidden="true"></span>
            Leitstellen umbenennen
          </button>
        </div>

        <p class="text-muted" style="${sectionLabelStyle}">Sonstiges</p>
        <div class="list-group">
          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-how-it-works">
            <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>
            So funktioniert's
          </button>
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
    document.getElementById("vn-menu-stations").addEventListener("click", renderStationRenameLeitstelleSelection);
    document.getElementById("vn-menu-leitstellen").addEventListener("click", renderLeitstelleRenameScreen);
    document.getElementById("vn-menu-station-check").addEventListener("click", renderStationCheckScreen);
    document.getElementById("vn-menu-personnel-check").addEventListener("click", renderPersonalCheckScreen);
    document.getElementById("vn-menu-schooling").addEventListener("click", () => renderSchoolingScreen());
    document.getElementById("vn-menu-vehicle-crew").addEventListener("click", () => renderVehicleCrewLeitstelleSelection());
    document.getElementById("vn-menu-station-blueprints").addEventListener("click", () => renderStationBlueprintsListScreen());
    document.getElementById("vn-menu-history").addEventListener("click", renderHistoryScreen);
    document.getElementById("vn-menu-settings").addEventListener("click", renderSettingsScreen);
    document.getElementById("vn-menu-how-it-works").addEventListener("click", () => renderHowItWorksScreen(renderMainMenu));
  }

  // Kurze Einstiegs-Anleitung fuer neue (Beta-)Nutzer: Wachen-Bauplaner, Personal-Check und
  // Schulungen haengen zusammen (Bauplan -> Personalbedarf -> Schulungen), Fahrzeug-Besatzung
  // und Wachenausbau (Sektion "Helfer") funktionieren dagegen unabhaengig davon - das ist ohne
  // Kontext nicht unbedingt selbsterklaerend. Rein statischer Text, kein Netzwerk-Aufruf noetig
  // (anders als renderChangelogScreen).
  function renderHowItWorksScreen(goBack) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("So funktioniert's");
    const body = document.getElementById("vehicle-naming-modal-body");

    body.innerHTML = `
      <p>Empfohlene Reihenfolge:</p>

      <ol style="padding-left:20px;">
        <li style="margin-bottom:8px;">
          <b>Wachen-Bauplaner</b>: Bauplan je Gebäudetyp anlegen (Ausbauten, Fahrzeuge) - Personal
          wird automatisch berechnet. Nur ein Bauplan je Typ aktiv.
        </li>
        <li style="margin-bottom:8px;">
          <b>Bauplan "Anwenden"</b>: Soll/Ist je Wache, direkt bauen/kaufen/verkaufen.
        </li>
        <li style="margin-bottom:8px;">
          <b>Personal-Check &amp; Schulungen</b>: fehlendes Ausbildungspersonal, Lehrgänge starten.
        </li>
        <li style="margin-bottom:8px;">
          <b>Fahrzeug-Besatzung</b>: weist passendes Personal automatisch zu.
        </li>
        <li>
          <b>Wachenausbau</b> und <b>Schnellumbenennung</b> funktionieren unabhängig davon.
        </li>
      </ol>

      <div class="vn-sticky-footer">
        <button type="button" id="vn-btn-back" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
      </div>
    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
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
    modalFooterEl.innerHTML = `
      ${updateBadge}
      <span style="margin-left:auto;">FuxTools v${escapeHtml(SCRIPT_VERSION)}${channelSuffix} · © Fuxaro · CC BY-NC-SA 4.0</span>
      <button type="button" id="vn-footer-close" class="btn btn-default btn-xs" style="margin-left:10px;">
        <span class="glyphicon glyphicon-remove" aria-hidden="true"></span> Beenden
      </button>
    `;
    // Ueber modalFooterEl.querySelector statt document.getElementById: renderFooter() wird
    // beim allerersten Aufruf (initModal()) VOR dem Anhaengen ans Dokument ausgefuehrt -
    // document.getElementById wuerde die Buttons dann noch nicht finden (null).
    modalFooterEl.querySelector("#vn-footer-update-badge")?.addEventListener("click", renderSettingsScreen);
    modalFooterEl.querySelector("#vn-footer-close").addEventListener("click", closeModal);
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
  // statt das Oeffnen+Reload-Merken jeweils selbst zu duplizieren. Sperrt das Script HIER
  // (nicht erst beim naechsten Oeffnen) auf einen Neuladen-Bildschirm, damit garantiert
  // nicht mit der alten Version weitergearbeitet wird, waehrend im anderen Tab schon eine
  // neue Version installiert wird.
  function openUpdateTab() {
    pendingReloadAfterUpdate = true;
    window.open(`${UPDATE_CHECK_URL}?_=${Date.now()}`, "_blank", "noopener");
    renderUpdateRequiredScreen();
  }

  // Blockierender Bildschirm nach dem Oeffnen eines Update-Tabs: absichtlich ohne
  // "Zurück"/Navigation zu anderen Bildschirmen - einzige Aktion ist der Neuladen-Button,
  // damit nicht versehentlich mit der alten Version weiter agiert wird.
  function renderUpdateRequiredScreen() {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `
      <p><span class="glyphicon glyphicon-cloud-download" aria-hidden="true"></span> <b>Update-Tab geöffnet</b></p>
      <p class="text-muted" style="font-size:12px;">
        Bitte im geöffneten Tab die neue Version in Tampermonkey bestätigen. FuxTools ist hier
        erst nach einem Neuladen der Seite wieder bedienbar - so wird garantiert nicht
        versehentlich mit der alten Version weitergearbeitet.
      </p>
      <button id="vn-btn-reload-now" type="button" class="btn btn-primary">
        <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Seite neu laden
      </button>
    `;
    document.getElementById("vn-btn-reload-now").addEventListener("click", () => location.reload());
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
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Einstellungen");
    const body = document.getElementById("vehicle-naming-modal-body");
    const channelLabel = CHANNEL === "beta" ? "Beta" : "Stable";

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
        <div class="vn-settings-card">
          <p style="margin-top:0;">
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
            <button id="vn-btn-show-changelog" type="button" class="btn btn-default">
              <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Changelog anzeigen
            </button>
          </div>
          <p class="text-muted" style="font-size:11px;">
            Erzwingt den Installations-Dialog für den aktuellen Kanal (${channelLabel}), auch wenn sich
            die Versionsnummer nicht geändert hat.
          </p>
          <div id="vn-update-status"></div>
        </div>

        <div class="vn-settings-card">
          <p style="margin-top:0;"><b>Kanal wechseln</b></p>
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
          <p class="text-muted" style="font-size:11px; margin-top:6px; margin-bottom:0;">
            Öffnet den Script-Code des anderen Kanals in einem neuen Tab. Tampermonkey erkennt es als
            Update dieses Scripts und fragt einmal um Bestätigung.
          </p>
        </div>

        <div class="vn-settings-card">
          <p style="margin-top:0;"><b>Geforderte Ausbauten (Wachenausbau)</b></p>
          <p class="text-muted" style="font-size:12px;">
            Legt fest, welche Ausbauten im Wachenausbau je Gebäudetyp orange als "gefordert"
            markiert werden. Standardmäßig eine feste Empfehlungs-Liste - hier anpassbar.
          </p>
          <button id="vn-btn-required-extensions" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Geforderte Ausbauten anpassen
          </button>
        </div>

        <div class="vn-settings-card">
          <p style="margin-top:0;"><b>Einstellungen sichern</b></p>
          <p class="text-muted" style="font-size:12px;">
            Lädt alle FuxTools-Einstellungen (Namens-Bausteine, Wachen-Bauplaner, geforderte
            Ausbauten, Verlauf) als Datei herunter bzw. stellt sie aus so einer Datei wieder
            her - praktisch vor einer Neuinstallation oder für einen anderen Rechner.
          </p>
          <button id="vn-btn-export-settings" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-download" aria-hidden="true"></span> Herunterladen
          </button>
          <button id="vn-btn-import-settings" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-upload" aria-hidden="true"></span> Hochladen
          </button>
          <input type="file" id="vn-import-settings-file" accept="application/json" style="display:none;">
          <div id="vn-settings-transfer-status" style="margin-top:10px;"></div>
        </div>

        <div class="vn-settings-card">
          <p style="margin-top:0;"><b>Fehlerprotokoll</b></p>
          <p class="text-muted" style="font-size:12px;">
            Speichert die letzten ${ERROR_LOG_MAX_ENTRIES} kritischen Fehler (mit Zeitstempel
            und Version) - hilfreich für Bug-Reports während der Beta. Rein lokal, wird
            nirgendwo automatisch hochgeladen.
          </p>
          <button id="vn-btn-export-errorlog" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-download" aria-hidden="true"></span> Fehlerprotokoll exportieren
          </button>
          <div id="vn-errorlog-status" style="margin-top:10px;"></div>
        </div>

        <div class="vn-settings-card" style="border-color:#a94442;">
          <p style="margin-top:0;"><b>Speicher löschen</b></p>
          <p class="text-muted" style="font-size:12px;">
            Setzt FuxTools auf den Zustand einer Neuinstallation zurück: alle gespeicherten
            Fahrzeugtyp-Namen und Namens-Bausteine-Einstellungen werden gelöscht.
          </p>
          <button id="vn-btn-clear-storage" type="button" class="btn btn-danger">
            <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Speicher löschen
          </button>
        </div>
      </div>

      <div class="vn-sticky-footer">
        <button type="button" id="vn-btn-back" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-btn-required-extensions").addEventListener("click", () => renderRequiredExtensionsSettingsScreen());
    document.getElementById("vn-btn-show-changelog").addEventListener("click", () => renderChangelogScreen(renderSettingsScreen));

    document.getElementById("vn-btn-export-settings").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-settings-transfer-status");
      statusEl.innerHTML = `<em>Einstellungen werden zusammengestellt ...</em>`;
      try {
        const bundle = await exportAllSettings();
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fuxtools-einstellungen-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        statusEl.innerHTML = `<span class="text-success">Herunterladen gestartet.</span>`;
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
      }
    });

    document.getElementById("vn-btn-export-errorlog").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-errorlog-status");
      const log = await getErrorLog();
      if (!log.length) {
        statusEl.innerHTML = `<span class="text-muted">Keine protokollierten Fehler vorhanden.</span>`;
        return;
      }
      const bundle = { fuxtools: true, version: SCRIPT_VERSION, exportedAt: Date.now(), errors: log };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fuxtools-fehlerprotokoll-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      statusEl.innerHTML = `<span class="text-success">Herunterladen gestartet (${log.length} Einträge).</span>`;
    });

    document.getElementById("vn-btn-import-settings").addEventListener("click", () => {
      document.getElementById("vn-import-settings-file").click();
    });

    document.getElementById("vn-import-settings-file").addEventListener("change", async e => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      const statusEl = document.getElementById("vn-settings-transfer-status");
      const confirmed = confirm(
        "Achtung: Dadurch werden die aktuellen FuxTools-Einstellungen mit dem Inhalt der " +
          "Datei überschrieben. Fortfahren?"
      );
      if (!confirmed) return;

      statusEl.innerHTML = `<em>Einstellungen werden importiert ...</em>`;
      try {
        const parsed = JSON.parse(await file.text());
        await importAllSettings(parsed);
        statusEl.innerHTML = `<span class="text-success">Importiert. Seite wird neu geladen ...</span>`;
        location.reload();
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler beim Importieren: ${escapeHtml(e.message)}</span>`;
      }
    });

    document.getElementById("vn-btn-clear-storage").addEventListener("click", () => {
      renderClearStorageConfirmScreen(renderSettingsScreen);
    });

    document.getElementById("vn-btn-force-reinstall").addEventListener("click", () => {
      openUpdateTab();
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

  // Laedt CHANGELOG.md live vom aktuellen Kanal-Branch (siehe CHANGELOG_URL) und zeigt es im
  // FuxTools-eigenen Design an, statt dass Tester dafuer extra auf GitHub nachschauen muessen.
  // cache:"no-store" + Cachebuster-Query wie bei fetchRemoteVersion(), damit nicht versehentlich
  // eine alte, vom Browser gecachte Version angezeigt wird.
  async function renderChangelogScreen(goBack) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Einstellungen › Changelog");
    const body = document.getElementById("vehicle-naming-modal-body");

    body.innerHTML = `
      <div class="vn-changelog"><p><em>Changelog wird geladen ...</em></p></div>
      <div class="vn-sticky-footer">
        <button type="button" id="vn-btn-back" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
      </div>
    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);

    try {
      const res = await fetch(`${CHANGELOG_URL}?_=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();
      body.querySelector(".vn-changelog").innerHTML = renderMarkdownLite(markdown);
    } catch (e) {
      body.querySelector(".vn-changelog").innerHTML =
        `<p class="text-danger">Changelog konnte nicht geladen werden: ${escapeHtml(e.message)}</p>`;
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
    document.getElementById("vn-btn-do-update").addEventListener("click", openUpdateTab);
  }

  // Gebaeudetypen, die im "Geforderte Ausbauten anpassen"-Bildschirm ueberhaupt gezeigt
  // werden - nur Typen mit echten, benannten Ausbauten (EXTENSION_CATALOG), da man ohne
  // Namen nichts sinnvoll anhaken koennte.
  function requiredExtensionsConfigurableTypes() {
    return PSEUDO_BUILDING_TYPES.map(t => {
      const buildingKey = getBuildingKey({ building_type: t.buildingType, small_building: t.smallBuilding });
      return {
        pseudoId: t.id,
        buildingKey,
        typeName: BUILDING_TYPE_NAMES[buildingKey] || `Typ ${buildingKey}`,
        extensions: EXTENSION_CATALOG[buildingKey] || [],
      };
    }).filter(t => t.extensions.length > 0);
  }

  // Einstellungen > "Geforderte Ausbauten anpassen": pro Gebaeudetyp ankreuzbare Liste
  // aller bekannten Ausbauten. Ohne eigene Speicherung (kein Klick auf "Speichern") gilt
  // weiterhin die feste Standard-Liste (RECOMMENDED_EXTENSIONS_BY_PSEUDO_ID) - "Speichern"
  // schreibt die komplette angezeigte Konfiguration, "Zurücksetzen" loescht sie wieder.
  async function renderRequiredExtensionsSettingsScreen(goBack = renderSettingsScreen) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Einstellungen › Geforderte Ausbauten");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade ...</p>`;

    const overrides = await getRequiredExtensionsOverrides();
    const types = requiredExtensionsConfigurableTypes();

    function isChecked(pseudoId, extensionId) {
      const list = overrides ? overrides[pseudoId] || [] : getDefaultRequiredExtensions(pseudoId);
      return list.includes(extensionId);
    }

    const groupsHtml = types
      .map(
        t => `
          <div style="margin-bottom:14px;">
            <p style="font-weight:bold; margin:0 0 4px;">${escapeHtml(t.typeName)}</p>
            <div>
              ${t.extensions
                .map(
                  ext => `
                    <label style="display:inline-flex; align-items:center; gap:4px; margin:2px 10px 2px 0; font-weight:normal;">
                      <input type="checkbox" class="vn-required-ext-checkbox" data-pseudo-id="${t.pseudoId}"
                             data-extension-id="${ext.id}" ${isChecked(t.pseudoId, ext.id) ? "checked" : ""}>
                      ${escapeHtml(ext.name)}
                    </label>
                  `,
                )
                .join("")}
            </div>
          </div>
        `,
      )
      .join("");

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Angehakte Ausbauten werden im Wachenausbau orange als "gefordert" markiert.
        Änderungen gelten erst nach "Speichern".
        ${overrides ? "" : "Aktuell aktiv: die Standard-Empfehlungen."}
      </p>
      <div style="max-height:55vh; overflow:auto; padding-right:4px;">
        ${groupsHtml}
      </div>
      <div id="vn-required-ext-status" style="margin-top:6px;"></div>
      <div class="vn-sticky-footer">
        <button id="vn-btn-save-required" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-ok" aria-hidden="true"></span> Speichern
        </button>
        <button id="vn-btn-reset-required" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span> Zurücksetzen auf Standard
        </button>
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);

    document.getElementById("vn-btn-save-required").addEventListener("click", async () => {
      const newOverrides = {};
      for (const t of types) newOverrides[t.pseudoId] = [];
      body.querySelectorAll(".vn-required-ext-checkbox:checked").forEach(cb => {
        newOverrides[cb.dataset.pseudoId].push(Number(cb.dataset.extensionId));
      });

      // Diff gegen den Stand beim Oeffnen dieses Bildschirms, fuer einen lesbaren
      // Verlaufs-Eintrag (welche Ausbauten je Gebaeudetyp neu/nicht mehr gefordert sind).
      const changes = [];
      for (const t of types) {
        const before = new Set(t.extensions.filter(ext => isChecked(t.pseudoId, ext.id)).map(ext => ext.id));
        const after = new Set(newOverrides[t.pseudoId]);
        const added = t.extensions.filter(ext => after.has(ext.id) && !before.has(ext.id)).map(ext => ext.name);
        const removed = t.extensions.filter(ext => before.has(ext.id) && !after.has(ext.id)).map(ext => ext.name);
        if (!added.length && !removed.length) continue;
        const parts = [];
        if (added.length) parts.push(`+${added.join(", ")}`);
        if (removed.length) parts.push(`-${removed.join(", ")}`);
        changes.push(`${t.typeName}: ${parts.join(", ")}`);
      }

      await storeData(newOverrides, CUSTOM_REQUIRED_EXTENSIONS_KEY);
      if (changes.length) {
        await logHistoryEntry({ type: "required_extensions_config", label: changes.join(" · ") });
      }
      document.getElementById("vn-required-ext-status").innerHTML =
        '<span class="text-success">Gespeichert.</span>';
    });

    document.getElementById("vn-btn-reset-required").addEventListener("click", async () => {
      const confirmed = confirm("Eigene Einstellung löschen und zu den Standard-Empfehlungen zurückkehren?");
      if (!confirmed) return;
      const hadOverrides = !!overrides;
      await GM.deleteValue(CUSTOM_REQUIRED_EXTENSIONS_KEY);
      if (hadOverrides) {
        await logHistoryEntry({
          type: "required_extensions_config",
          label: "Zurückgesetzt auf Standard-Empfehlungen",
        });
      }
      renderRequiredExtensionsSettingsScreen(goBack);
    });
  }

  // Verlauf: zeigt alle ueber FuxTools durchgefuehrten Aktionen (Ausbauten, Lagerraeume,
  // Ausbaustufen, Umbenennen/Zuruecksetzen von Fahrzeugen/Wachen/Leitstellen) mit Datum,
  // Uhrzeit und Kosten - rein informativ, nur lokal gespeichert (kein Bezug zum
  // Spielserver). Gleiches Grundprinzip wie der Wachen-Check: Suchfeld + Dropdown-Filter.
  async function renderHistoryScreen() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Verlauf");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Verlauf ...</p>`;

    const history = await getHistory();

    const applyRowVisibility = makeRowVisibilityFilter({
      container: body,
      searchInputId: "vn-history-search",
      typeFilterId: "vn-history-type-filter",
      rowSelector: ".vn-history-row",
      searchField: "search",
    });

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
          <option value="required_extensions_config">Geforderte Ausbauten</option>
          <option value="personnel_requirements_config">Personal-Standard</option>
          <option value="schooling_start">Schulung gestartet</option>
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
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-history-search").addEventListener("input", applyRowVisibility);
    document.getElementById("vn-history-type-filter").addEventListener("change", applyRowVisibility);
  }

  function addMenuEntry() {
    const logoImg = document.createElement("img");
    logoImg.src = LOGO_URL;
    logoImg.alt = "";
    logoImg.style.cssText = "height:24px; width:24px; border-radius:3px; vertical-align:middle; margin-right:6px;";
    // Fehlt das Logo mal (z.B. Netzwerkfehler), auf das alte Schraubenschluessel-Icon
    // zurueckfallen statt eines kaputten Bild-Icons.
    logoImg.addEventListener("error", () => {
      logoImg.replaceWith(
        Object.assign(document.createElement("span"), {
          className: "glyphicon glyphicon-wrench",
          style: "margin-right:6px;",
        }),
      );
    });

    const a = document.createElement("a");
    a.href = "#";
    a.style.cssText = "display:flex; align-items:center; height:100%; padding:15px;";
    a.appendChild(logoImg);
    a.appendChild(document.createTextNode(CHANNEL === "beta" ? "FuxTools Beta" : "FuxTools"));

    const li = document.createElement("li");
    li.role = "presentation";
    li.setAttribute("data-toggle", "modal");
    li.setAttribute("data-target", `#${modalId}`);
    li.appendChild(a);

    // Eigener Punkt DIREKT in der Navigationsleiste, links neben dem gruen hervorgehobenen
    // Profil-Menue - nicht mehr versteckt in dessen Dropdown. Klassen des Profil-<li> werden
    // uebernommen, damit Hoehe/Hover-Optik zu den Nachbar-Eintraegen passt. Kein stiller
    // Rueckfall auf die alte Position mehr (bewusst) - aber ein fehlendes #menu_profile darf
    // trotzdem nicht den kompletten Start abbrechen (main() wuerde sonst auch
    // checkForUpdateInBackground() nie erreichen) - deshalb hier nur ein sichtbarer Hinweis
    // statt eines uncaught TypeError. Ohne diesen Menuepunkt ist das Modal fuer den Nutzer gar
    // nicht erreichbar, deshalb reportError() (Seiten-Banner) statt nur console.error().
    const profileLi = document.querySelector("#menu_profile")?.closest("li");
    if (!profileLi) {
      reportError("Navbar-Eintrag konnte nicht eingefügt werden", new Error("#menu_profile nicht gefunden - FuxTools ist über das Menü nicht erreichbar."));
      return;
    }
    li.className = profileLi.className;
    profileLi.parentNode.insertBefore(li, profileLi);
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
    setScreenTitle(currentMode === "reset" ? "Fahrzeugnamen zurücksetzen" : "Fahrzeuge umbenennen");
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
      <div class="vn-sticky-footer">
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
      <div class="vn-sticky-footer">
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
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-run" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Fahrzeuge umbenennen
        </button>
        <button id="vn-btn-reset-template" type="button" class="btn btn-default"
                title="Setzt Text 1, Fahrzeugtyp-Name, Text 2 und Nummer auf die Standardeinstellung zurück">
          <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span> Bausteine zurücksetzen
        </button>
      </div>
      <div id="vn-status" style="margin-top: 10px; font-weight: bold; white-space: pre-wrap;"></div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderStationSelection);
    document.getElementById("vn-btn-run").addEventListener("click", () => runRenaming(selectedStations));
    document.getElementById("vn-btn-reset-template").addEventListener("click", async () => {
      const confirmed = confirm(
        "Achtung: Das setzt die Namens-Bausteine-Vorlage (Text 1, Fahrzeugtyp-Name, Text 2, " +
          "Nummer) wieder auf die Standardeinstellung zurück. Fortfahren?"
      );
      if (!confirmed) return;
      delete namesStore.__template;
      await saveNamesStore();
      renderNameForm(selectedStations);
    });

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
      <div class="vn-sticky-footer">
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
      <div class="vn-sticky-footer">
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
    const buildingsById = new Map(buildings.map(b => [String(b.id), b]));

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
      .map(b => {
        const leitstelleId = b.leitstelle_building_id != null ? String(b.leitstelle_building_id) : null;
        const leitstelleBuilding = leitstelleId ? buildingsById.get(leitstelleId) : null;
        return {
          id: String(b.id),
          name: b.caption || `Wache ${b.id}`,
          category: categoryForBuilding(b),
          leitstelleId: leitstelleId || "none",
          leitstelleName: leitstelleId ? leitstelleBuilding?.caption || `Leitstelle ${leitstelleId}` : "Ohne Leitstelle",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return { leitstellen, stations };
  }

  //////////////////////////////////////////////////
  // Wachen umbenennen - Schritt 0: Leitstelle(n) auswaehlen (analog zu "Fahrzeuge
  // umbenennen" - dieselbe Filterung, damit man sich bei vielen Leitstellen auf einen Teil
  // beschraenken kann, statt immer ALLE Wachen im Account angezeigt zu bekommen).
  //////////////////////////////////////////////////

  async function renderStationRenameLeitstelleSelection() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Wachen umbenennen › Leitstelle wählen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Leitstellen &amp; Wachen ...</em></p>`;

    let stations;
    try {
      ({ stations } = await loadAllBuildings());
    } catch (e) {
      body.innerHTML = `<p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>`;
      return;
    }

    const byLeitstelle = new Map();
    for (const s of stations) {
      if (!byLeitstelle.has(s.leitstelleId)) byLeitstelle.set(s.leitstelleId, { name: s.leitstelleName, stations: [] });
      byLeitstelle.get(s.leitstelleId).stations.push(s);
    }

    const rows = [...byLeitstelle.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, info]) => `
        <div class="checkbox" style="margin: 2px 0; break-inside: avoid;">
          <label>
            <input type="checkbox" class="vn-leitstelle-check" value="${id}">
            ${escapeHtml(info.name)} <span class="text-muted">(${info.stations.length} Wachen)</span>
          </label>
        </div>`)
      .join("");

    body.innerHTML = `
      <p>Wähle die Leitstelle(n) aus:</p>
      <div style="max-height: 380px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 4px; column-count: 2; column-gap: 20px;">
        ${rows || '<p class="text-muted"><em>Keine Leitstellen gefunden.</em></p>'}
      </div>
      <div class="vn-sticky-footer">
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
      renderStationRenameScreen(ids);
    });
  }

  // Letzter Bestaetigungsschritt vor dem Umbenennen von Wachen/Leitstellen - zeigt
  // nur die Anzahl, da hier (anders als bei Fahrzeugen) kein Namens-Baustein-System
  // existiert, das eine Vorschau bräuchte.
  function renderBuildingRenameConfirm(plan, verb, goBack, itemNoun) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `
      <p>Bereit, <b>${plan.length} ${escapeHtml(itemNoun)}</b> umzubenennen.</p>
      <div class="vn-sticky-footer">
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

  async function renderStationRenameScreen(selectedLeitstelleIds) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Wachen umbenennen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Wachen ...</em></p>`;

    let stations;
    try {
      ({ stations } = await loadAllBuildings());
    } catch (e) {
      body.innerHTML = `<p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>`;
      return;
    }
    if (selectedLeitstelleIds) {
      stations = stations.filter(s => selectedLeitstelleIds.includes(s.leitstelleId));
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
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-save-buildings" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-floppy-disk" aria-hidden="true"></span> Speichern
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderStationRenameLeitstelleSelection);
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
      renderBuildingRenameConfirm(plan, "umbenannt", () => renderStationRenameScreen(selectedLeitstelleIds), "Wache(n)");
    });
  }

  async function renderLeitstelleRenameScreen() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Leitstellen umbenennen");
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
      <div class="vn-sticky-footer">
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

  // Baut eine einzelne Ausbau/Lager/Stufen-Aktion. currency ist immer "credits" oder
  // "coins" - der Spieler waehlt das in einem Bestaetigungsdialog vor jeder Aktion selbst
  // aus.
  function getCsrfTokenOrThrow(buildingId) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!csrfToken) throw new Error(`CSRF-Token nicht gefunden (Gebäude ${buildingId}).`);
    return csrfToken;
  }

  async function buildExtension(buildingId, extensionId, currency) {
    const csrfToken = getCsrfTokenOrThrow(buildingId);
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

  // Kauft EIN Fahrzeug eines Typs an einer Wache. Endpunkt/URL-Muster (buildingId taucht
  // bewusst zweimal auf) stammt aus den Community-Scripten "Beschaffungsagent" (BOS-Ernie)
  // und "[LSS] Fahrzeug-Manager" (Caddy21), die beide unabhaengig denselben Endpunkt nutzen -
  // hier per POST + X-CSRF-Token analog zu buildExtension()/buildStorage() statt der dortigen
  // GET-Variante, damit es zu unserem sonstigen Bau-Code passt.
  async function buyVehicle(buildingId, vehicleTypeId, currency) {
    const csrfToken = getCsrfTokenOrThrow(buildingId);
    const res = await fetch(`/buildings/${buildingId}/vehicle/${buildingId}/${vehicleTypeId}/${currency}?building=${buildingId}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": csrfToken,
      },
    });
    if (!res.ok) throw new Error(`Kauf fehlgeschlagen (${res.status})`);
  }

  // Verkauft/zerstoert EIN Fahrzeug unwiderruflich. Endpunkt per Live-Diagnose im Browser
  // bestaetigt: der echte "Verkaufen"-Link im Spiel ist ein Rails-UJS-Link mit
  // data-method="delete" - der Browser wandelt das in ein POST-Formular mit den Feldern
  // _method=delete + authenticity_token um (Rails behandelt das serverseitig dann als
  // DELETE). Hier nachgebaut per fetch: POST + X-CSRF-Token-Header (wie bei buildExtension())
  // plus _method=delete im Body, damit Rails' Method-Override das erkennt.
  async function sellVehicle(vehicleId) {
    const csrfToken = getCsrfTokenOrThrow(vehicleId);
    const res = await fetch(`/vehicles/${vehicleId}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": csrfToken,
      },
      body: new URLSearchParams({ _method: "delete" }),
    });
    if (!res.ok) throw new Error(`Verkaufen fehlgeschlagen (${res.status})`);
  }

  async function buildStorage(buildingId, storageId, currency) {
    const csrfToken = getCsrfTokenOrThrow(buildingId);
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
    const csrfToken = getCsrfTokenOrThrow(buildingId);
    // WICHTIG: redirect "manual" statt des fetch()-Standards "follow". Dieser Endpunkt
    // antwortet bei Erfolg mit einer Weiterleitung (302) - mit "follow" wuerde fetch()
    // automatisch eine ZWEITE echte Anfrage an das Ziel der Weiterleitung schicken und
    // damit den Ausbau doppelt abbuchen. Mit "manual" senden wir garantiert nur eine
    // Anfrage.
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
    const requiredExtensionOverrides = await getRequiredExtensionsOverrides();

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
        const recommendedExtensions = pseudoId
          ? requiredExtensionOverrides
            ? requiredExtensionOverrides[pseudoId] || []
            : getDefaultRequiredExtensions(pseudoId)
          : [];
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
          automaticHiring: b.hiring_automatic === true,
          levelCatalog,
          currentLevel,
          storageCatalog,
          ownedStorageIds,
        };
      });
  }

  // Personal-Zelle: reine Anzahl, ohne Soll-Wert-Vergleich (dafuer gibt es den
  // Personal-Check mit dem aus dem aktiven Wachenbauplan berechneten Sollwert).
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
  // +1-Verschiebung vornehmen, sonst stimmen Anzeige und Bau-Zielstufe nicht mehr.
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
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen
        </button>
      </div>
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

  // Eigene Bestaetigung fuer eine zerstoerende Aktion (aktuell: Fahrzeug verkaufen) statt
  // eines blossen browser confirm() - analog zu renderBuildConfirmScreen, aber ohne
  // Waehrungswahl (kostet nichts) und mit deutlich rot markierter Warnung.
  function renderVehicleSellConfirmScreen({ vehicleId, vehicleName, stationName, goBack }) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `
      <p class="text-danger"><b>Fahrzeug wirklich verkaufen?</b></p>
      <p>
        <b>${escapeHtml(vehicleName)}</b> (${escapeHtml(stationName)}) wird unwiderruflich
        zerstört/verkauft - das kann NICHT rückgängig gemacht werden.
      </p>
      <div id="vn-sell-status" style="margin-top:10px;"></div>
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen
        </button>
        <button id="vn-btn-sell-confirm" type="button" class="btn btn-danger">
          <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Verkaufen
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);

    const statusEl = document.getElementById("vn-sell-status");
    const confirmBtn = document.getElementById("vn-btn-sell-confirm");
    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      statusEl.innerHTML = `<em>Wird verkauft ...</em>`;
      try {
        await sellVehicle(vehicleId);
        await logHistoryEntry({ type: "vehicle_sell", label: vehicleName, station: stationName });
        statusEl.innerHTML = `<span class="text-success">Verkauft. Lade neu ...</span>`;
        setTimeout(goBack, 600);
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
        confirmBtn.disabled = false;
      }
    });
  }

  // Eigene Bestaetigung fuer "Speicher loeschen" (Einstellungen) statt eines blossen browser
  // confirm() - der Button bleibt gesperrt, bis das Bestaetigungswort exakt eingetippt wurde,
  // damit ein versehentlicher Klick nicht sofort alle Daten loescht.
  const CLEAR_STORAGE_CONFIRM_WORD = "löschen";

  function renderClearStorageConfirmScreen(goBack) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("Einstellungen › Speicher löschen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `
      <p class="text-danger"><b>Speicher wirklich löschen?</b></p>
      <p>
        Dadurch werden ALLE von FuxTools gespeicherten Daten (Fahrzeugtyp-Namen,
        Namens-Bausteine, Wachen-Bauplaner, Verlauf, ...) unwiderruflich
        gelöscht - als wäre das Script gerade neu installiert worden.
      </p>
      <div class="form-group">
        <label for="vn-clear-confirm-input">
          Tippe zum Bestätigen <code>${escapeHtml(CLEAR_STORAGE_CONFIRM_WORD)}</code> ein:
        </label>
        <input type="text" id="vn-clear-confirm-input" class="form-control" autocomplete="off">
      </div>
      <div id="vn-clear-confirm-status" style="margin-top:10px;"></div>
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen
        </button>
        <button id="vn-btn-clear-confirm" type="button" class="btn btn-danger" disabled>
          <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Speicher endgültig löschen
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);

    const input = document.getElementById("vn-clear-confirm-input");
    const confirmBtn = document.getElementById("vn-btn-clear-confirm");
    const statusEl = document.getElementById("vn-clear-confirm-status");

    input.addEventListener("input", () => {
      confirmBtn.disabled = input.value.trim().toLowerCase() !== CLEAR_STORAGE_CONFIRM_WORD;
    });
    input.focus();

    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      input.disabled = true;
      statusEl.innerHTML = `<em>Speicher wird gelöscht ...</em>`;
      try {
        await clearAllStoredData();
        statusEl.innerHTML = `<span class="text-success">Erledigt. Seite wird neu geladen ...</span>`;
        location.reload();
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler beim Löschen: ${escapeHtml(e.message)}</span>`;
        confirmBtn.disabled = false;
        input.disabled = false;
      }
    });
  }

  async function renderStationCheckScreen(preservedState) {
    setModalWidth(MODAL_WIDTH_WIDE);
    setScreenTitle("Wachenausbau");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Wachen-Daten ...</p>`;

    let stations;
    try {
      stations = await loadBuildingsForCheck();
    } catch (e) {
      body.innerHTML = `
        <p class="text-danger">Fehler beim Laden der Wachen: ${escapeHtml(e.message)}</p>
        <button id="vn-btn-back" type="button" class="btn btn-default"><span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück</button>
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
    const applyRowVisibility = makeRowVisibilityFilter({
      container: body,
      searchInputId: "vn-station-check-search",
      typeFilterId: "vn-station-check-type-filter",
      rowSelector: ".vn-check-station-row",
      searchField: "name",
    });

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
        Grün = gebaut/aktiv, Blau = in Bau, Orange = gefordert, Grau = nicht gebaut.
        ${withMissingExtensionsCount} von ${stations.length} Wachen fehlt noch ein Ausbau.
      </p>
      <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
        <select id="vn-station-check-type-filter" class="form-control" style="max-width:220px;">
          <option value="">Alle Gebäudetypen</option>
          ${typeOptions.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
        </select>
        <input type="text" id="vn-station-check-search" class="form-control" placeholder="Wache suchen ..."
               value="${escapeHtml(preservedState?.searchQuery || "")}" style="max-width:200px;">
        <button id="vn-btn-required-extensions-from-check" type="button" class="btn btn-default" style="margin-left:auto; white-space:nowrap;">
          <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Geforderte Ausbauten anpassen
        </button>
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
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    if (preservedState?.typeFilter) {
      document.getElementById("vn-station-check-type-filter").value = preservedState.typeFilter;
    }
    document.getElementById("vn-station-check-search").addEventListener("input", applyRowVisibility);
    document.getElementById("vn-station-check-type-filter").addEventListener("change", applyRowVisibility);
    document.getElementById("vn-btn-required-extensions-from-check").addEventListener("click", () => {
      const savedState = currentState();
      renderRequiredExtensionsSettingsScreen(() => renderStationCheckScreen(savedState));
    });

    renderTable();
  }

  //////////////////////////////////////////////////
  // Personal-Check: prueft je Wache, ob genug Personal mit bestimmten Ausbildungen
  // vorhanden ist (z.B. ELW-2-Fahrer). Es gibt dafuer keine JSON-API - die Personal-
  // Seite jeder Wache (/buildings/{id}/personals) wird als HTML geladen und die
  // Tabelle darin ausgewertet (data-filterable-by-Attribut = Ausbildungs-Slugs pro
  // Person). Automatischer Scan beim Oeffnen von Personal-Check/Schulungen, wenn der
  // letzte Scan mehr als PERSONNEL_SCAN_STALE_MS her ist (siehe ensureFreshPersonnelScan),
  // zusaetzlich jederzeit per Button manuell ausloesbar.
  //////////////////////////////////////////////////

  const PERSONNEL_SCAN_CONCURRENCY = 5;

  async function loadPersonnelCheckStations() {
    const buildings = await fetchJSON("/api/buildings");
    const leitstelleIds = new Set();
    for (const b of buildings) {
      if (b.leitstelle_building_id != null) leitstelleIds.add(String(b.leitstelle_building_id));
    }
    return buildings
      .filter(
        b =>
          !leitstelleIds.has(String(b.id)) &&
          categoryForBuilding(b) !== "Unbekannt" &&
          // Krankenhaeuser und Schulen haben kein zuweisbares Personal (nur Betten
          // bzw. Lehrgaenge), "Sonstiges" (Leitstelle, Komplexe, Verbandszellen,
          // Bereitstellungsraum) hat ebenfalls kein Personal mit Ausbildungen - fuer den
          // Personal-Check ohne Bedeutung.
          categoryForBuilding(b) !== "Krankenhäuser & Schulen" &&
          categoryForBuilding(b) !== "Sonstiges",
      )
      .map(b => {
        const pseudoId = getPseudoBuildingTypeId(b);
        const buildingKey = getBuildingKey(b);
        return {
          id: String(b.id),
          name: b.caption || `Wache ${b.id}`,
          category: categoryForBuilding(b),
          typeName: BUILDING_TYPE_NAMES[buildingKey] || null,
          pseudoId,
        };
      });
  }

  // Liest jede Personal-Zeile aus der HTML-Personalseite einer Wache aus: Name, die
  // Ausbildungs-Slugs (data-filterable-by), den Klartext-Namen der Ausbildung (Spalte
  // "Ausbildung" - nur eindeutig, wenn die Person genau einen Slug hat) und den Status
  // (Spalte "Status", z.B. "Verfügbar" oder "Im Unterricht"). Liefert ALLE Zeilen, auch
  // Personen ganz ohne Ausbildung, damit sich Gesamtzahlen berechnen lassen.
  function parsePersonalPageHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rows = doc.querySelectorAll("#personal_table tbody tr");
    const entries = [];
    rows.forEach(row => {
      let slugs;
      try {
        slugs = JSON.parse(row.dataset.filterableBy || "[]");
      } catch {
        slugs = [];
      }
      if (!Array.isArray(slugs)) slugs = [];
      const name = row.children[1]?.textContent.trim() || "";
      const educationText = row.children[2]?.textContent.trim() || "";
      const statusText = row.children[4]?.textContent.trim() || "";
      entries.push({ slugs, name, educationText, statusText });
    });
    return entries;
  }

  async function fetchPersonalPage(buildingId) {
    const res = await fetch(`/buildings/${buildingId}/personals`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Fehler beim Laden von Personal (Gebäude ${buildingId}): ${res.status}`);
    return await res.text();
  }

  // Ab wann ein vorhandener Scan als "veraltet" gilt und automatisch neu gescannt wird
  // (siehe ensureFreshPersonnelScan()) - beim Oeffnen von Personal-Check oder Schulungen.
  const PERSONNEL_SCAN_STALE_MS = 15 * 60 * 1000;

  // Scannt ALLE Wachen aller Kategorien in einem Lauf (Concurrency begrenzt, wie beim
  // Umbenennen grosser Fahrzeugmengen) und speichert je Wache die Ausbildungs-Anzahl pro
  // Slug. Ein einzelner, gemeinsamer Zeitstempel (PERSONNEL_SCAN_META_KEY) statt einem
  // Zeitstempel pro Wache - das Laden ist schnell genug, um nicht mehr pro Kategorie
  // einzeln zu scannen. Neu entdeckte Slug->Name-Zuordnungen werden dauerhaft mitgesammelt.
  async function scanAllPersonnel(onProgress) {
    const stations = await loadPersonnelCheckStations();
    const scanData = await getPersonnelScanData();
    const qualifications = await getPersonnelQualifications();

    let nextIndex = 0;
    let finished = 0;
    async function worker() {
      while (nextIndex < stations.length) {
        const station = stations[nextIndex++];
        try {
          const html = await fetchPersonalPage(station.id);
          const entries = parsePersonalPageHtml(html);
          const counts = {};
          const names = {};
          let withoutEducation = 0;
          let available = 0;
          let inTraining = 0;
          entries.forEach(({ slugs, name, educationText, statusText }) => {
            if (!slugs.length) withoutEducation++;
            if (statusText.includes("Unterricht")) inTraining++;
            else if (statusText.includes("Verfügbar")) available++;
            slugs.forEach(slug => {
              counts[slug] = (counts[slug] || 0) + 1;
              if (name) (names[slug] || (names[slug] = [])).push(name);
              if (!qualifications[slug] && slugs.length === 1 && educationText) {
                qualifications[slug] = educationText;
              }
            });
          });
          scanData[station.id] = { counts, names, total: entries.length, withoutEducation, available, inTraining };
        } catch (e) {
          console.warn("[FuxTools] Personal-Scan fehlgeschlagen für Wache", station.id, e);
        }
        finished++;
        onProgress?.(finished, stations.length);
      }
    }
    const workerCount = Math.min(PERSONNEL_SCAN_CONCURRENCY, stations.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    await storeData(scanData, PERSONNEL_SCAN_KEY);
    await storeData(qualifications, PERSONNEL_QUALIFICATIONS_KEY);
    await storeData({ lastScanAt: Date.now() }, PERSONNEL_SCAN_META_KEY);
    return stations.length;
  }

  // Wird beim Oeffnen von Personal-Check/Schulungen aufgerufen: scannt automatisch neu,
  // wenn noch nie oder vor mehr als PERSONNEL_SCAN_STALE_MS gescannt wurde, sonst werden
  // einfach die vorhandenen Daten verwendet (kein Zwangs-Scan bei jedem Oeffnen).
  async function ensureFreshPersonnelScan(onProgress) {
    const meta = await getPersonnelScanMeta();
    if (meta.lastScanAt && Date.now() - meta.lastScanAt < PERSONNEL_SCAN_STALE_MS) {
      return false;
    }
    await scanAllPersonnel(onProgress);
    return true;
  }

  // Zeigt je Wache, ob genug Personal mit den in den Einstellungen GESPEICHERTEN
  // Ausbildungs-Anforderungen vorhanden ist. Ohne eigene, gespeicherte Konfiguration ist
  // ueberall 0 gefordert (Standard). Badges erscheinen aber nicht nur fuer konfigurierte
  // Anforderungen, sondern auch fuer jede tatsaechlich vorhandene Ausbildung (have > 0) -
  // sonst wuerde bereits vorhandenes Personal mit Ausbildung bei "0 gefordert" komplett
  // unter den Tisch fallen ("-" statt z.B. "5/0").
  // Gruen = genau passend, Gelb = zu wenig, Rot = mehr als gefordert (ueberbesetzt, auch
  // bei 0 gefordert), Grau = fuer diesen Gebaeudetyp weder etwas gefordert noch vorhanden,
  // "Nicht gescannt" = noch keine Scan-Daten vorhanden. Die Namen der Personen mit der
  // jeweiligen Ausbildung stehen im Tooltip (title).
  function renderPersonnelBadges(station, requirements, qualifications, scanData) {
    const scan = scanData[station.id];
    if (!scan) return '<span class="label label-default">Nicht gescannt</span>';

    const req = requirements[station.pseudoId] || {};
    const slugs = new Set([
      ...Object.keys(req).filter(slug => req[slug] > 0),
      ...Object.keys(scan.counts).filter(slug => scan.counts[slug] > 0),
    ]);

    const badges = [...slugs]
      .sort((a, b) => (qualifications[a] || a).localeCompare(qualifications[b] || b, "de"))
      .map(slug => {
        const required = req[slug] || 0;
        const have = scan.counts[slug] || 0;
        const name = qualifications[slug] || slug;
        const namesList = (scan.names?.[slug] || []).join(", ");
        const title = namesList ? `${name}: ${namesList}` : name;

        let cssClass;
        let label;
        if (have < required) {
          cssClass = "label-warning";
          label = `${name} ${have}/${required} (${required - have} fehlen)`;
        } else if (have === required) {
          cssClass = "label-success";
          label = `${name} ${have}/${required}`;
        } else {
          cssClass = "label-danger";
          label = `${name} ${have}/${required} (${have - required} zu viel)`;
        }
        return `<span class="label ${cssClass}" style="margin:1px;" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
      });
    return badges.join(" ") || '<span class="text-muted">-</span>';
  }

  // Kompakte Personal-Gesamtuebersicht einer Wache (gesamt / ohne Ausbildung /
  // verfuegbar / im Unterricht), analog zu einer im Forum gesehenen Referenz - eigene,
  // kompakte Umsetzung im FuxTools-Stil statt einer grossen Detail-Ansicht.
  function renderPersonnelOverview(station, scanData) {
    const scan = scanData[station.id];
    if (!scan) return '<span class="text-muted">-</span>';
    return `
      <div>${scan.total} gesamt</div>
      <div class="text-muted">${scan.withoutEducation} ohne Ausbildung</div>
      <div class="text-muted">${scan.available} verfügbar · ${scan.inTraining} im Unterricht</div>
    `;
  }

  async function renderPersonalCheckScreen() {
    setModalWidth(MODAL_WIDTH_WIDE);
    setScreenTitle("Personal-Check");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Wachen-Daten ...</p>`;

    let stations;
    try {
      stations = await loadPersonnelCheckStations();
    } catch (e) {
      body.innerHTML = `
        <p class="text-danger">Fehler beim Laden der Wachen: ${escapeHtml(e.message)}</p>
        <button id="vn-btn-back" type="button" class="btn btn-default"><span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück</button>
      `;
      document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
      return;
    }

    body.innerHTML = `<p>Prüfe letzten Scan ...</p>`;
    await ensureFreshPersonnelScan((done, of) => {
      body.innerHTML = `<p>Scanne Personal ... (${done}/${of})</p>`;
    });

    let scanData = await getPersonnelScanData();
    let scanMeta = await getPersonnelScanMeta();
    const requirements = await computePersonnelRequirementsFromBlueprints();
    const qualifications = await getPersonnelQualifications();

    const applyRowVisibility = makeRowVisibilityFilter({
      container: body,
      searchInputId: "vn-personnel-search",
      typeFilterId: "vn-personnel-type-filter",
      rowSelector: ".vn-personnel-row",
      searchField: "name",
    });

    // Summe der fehlenden Personen ueber alle geforderten Ausbildungen einer Wache -
    // Grundlage fuer "nach unvollstaendigen Wachen sortieren". Nicht gescannte Wachen
    // zaehlen als am unvollstaendigsten (unbekannt = zuerst pruefen), Wachen ohne
    // Anforderung als am vollstaendigsten (0).
    function personnelMissingCount(station) {
      const req = requirements[station.pseudoId] || {};
      const entries = Object.entries(req).filter(([, required]) => required > 0);
      if (!entries.length) return 0;
      const scan = scanData[station.id];
      if (!scan) return Number.MAX_SAFE_INTEGER;
      return entries.reduce((sum, [slug, required]) => sum + Math.max(0, required - (scan.counts[slug] || 0)), 0);
    }

    // "category" (Standard, nach Kategorie+Name) oder "missing" (nach fehlendem
    // Personal) - umschaltbar ueber Klick auf die Spaltenueberschriften.
    let sortColumn = "category";
    let sortAscending = true;

    function sortedStations() {
      const dir = sortAscending ? 1 : -1;
      return [...stations].sort((a, b) => {
        if (sortColumn === "category") {
          const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
          return catDiff !== 0 ? catDiff : a.name.localeCompare(b.name);
        }
        const diff = personnelMissingCount(b) - personnelMissingCount(a);
        return diff !== 0 ? diff * dir : a.name.localeCompare(b.name);
      });
    }

    function sortIcon(column) {
      if (column !== sortColumn) return "glyphicon-sort text-muted";
      return sortAscending ? "glyphicon-sort-by-attributes" : "glyphicon-sort-by-attributes-alt";
    }

    function renderTable() {
      const list = sortedStations();

      const rows = list
        .map(s => {
          return `
            <tr class="vn-personnel-row" data-name="${escapeHtml(s.name.toLowerCase())}" data-type="${escapeHtml(s.typeName || "")}">
              <td>
                <a href="/buildings/${s.id}/personals" target="_blank">${escapeHtml(s.name)}</a>
                <br><small class="text-muted">${escapeHtml(s.typeName || s.category)}</small>
              </td>
              <td><small>${renderPersonnelOverview(s, scanData)}</small></td>
              <td>${renderPersonnelBadges(s, requirements, qualifications, scanData)}</td>
            </tr>
          `;
        })
        .join("");

      document.getElementById("vn-personnel-results-body").innerHTML = rows;
      body.querySelector("#vn-personnel-header-wache .glyphicon").className = `glyphicon ${sortIcon("category")}`;
      body.querySelector("#vn-personnel-header-ausbildungen .glyphicon").className = `glyphicon ${sortIcon("missing")}`;
      applyRowVisibility();
    }

    const typeOptions = [...new Set(stations.map(s => s.typeName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "de"),
    );

    function lastScanLabel() {
      return scanMeta.lastScanAt
        ? `Letzter Scan: ${new Date(scanMeta.lastScanAt).toLocaleString("de-DE")}`
        : "Noch nie gescannt";
    }

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Grün = passend, Gelb = zu wenig, Rot = mehr als gefordert, Grau = nichts gefordert.
        Bedarf kommt aus dem aktiven Wachenbauplan je Gebäudetyp.
      </p>
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
        <button type="button" id="vn-personnel-goto-blueprints" class="btn btn-default btn-sm">
          <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Wachen-Bauplaner verwalten
        </button>
        <button type="button" id="vn-personnel-goto-schooling" class="btn btn-primary btn-sm">
          <span class="glyphicon glyphicon-education" aria-hidden="true"></span> Schulungen starten
        </button>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <select id="vn-personnel-type-filter" class="form-control" style="max-width:260px;">
          <option value="">Alle Gebäudetypen</option>
          ${typeOptions.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
        </select>
        <input type="text" id="vn-personnel-search" class="form-control" placeholder="Wache suchen ..." style="flex:1;">
      </div>
      <div style="max-height:45vh; overflow:auto;">
        <table class="table table-condensed table-striped" style="font-size:12px; table-layout:fixed; width:100%;">
          <colgroup>
            <col style="width:25%;">
            <col style="width:18%;">
            <col style="width:57%;">
          </colgroup>
          <thead>
            <tr>
              <th id="vn-personnel-header-wache" style="cursor:pointer; white-space:nowrap;">
                Wache <span class="glyphicon ${sortIcon("category")}" style="font-size:10px;"></span>
              </th>
              <th>Personal</th>
              <th id="vn-personnel-header-ausbildungen" style="cursor:pointer; white-space:nowrap;">
                Personal-Ausbildungen <span class="glyphicon ${sortIcon("missing")}" style="font-size:10px;"></span>
              </th>
            </tr>
          </thead>
          <tbody id="vn-personnel-results-body"></tbody>
        </table>
      </div>
      <div class="vn-sticky-footer" style="display:flex; align-items:center; gap:10px;">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button type="button" id="vn-personnel-scan-btn" class="btn btn-primary">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Scan jetzt starten
        </button>
        <span class="label label-default" id="vn-personnel-scan-status" style="font-size:12px;">
          ${escapeHtml(lastScanLabel())}
        </span>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-personnel-search").addEventListener("input", applyRowVisibility);
    document.getElementById("vn-personnel-type-filter").addEventListener("change", applyRowVisibility);
    document
      .getElementById("vn-personnel-goto-blueprints")
      .addEventListener("click", () => renderStationBlueprintsListScreen(renderPersonalCheckScreen));
    document
      .getElementById("vn-personnel-goto-schooling")
      .addEventListener("click", () => renderSchoolingScreen(renderPersonalCheckScreen));
    document.getElementById("vn-personnel-header-wache").addEventListener("click", () => {
      sortColumn = "category";
      sortAscending = true;
      renderTable();
    });
    document.getElementById("vn-personnel-header-ausbildungen").addEventListener("click", () => {
      if (sortColumn === "missing") {
        sortAscending = !sortAscending;
      } else {
        sortColumn = "missing";
        sortAscending = true;
      }
      renderTable();
    });

    document.getElementById("vn-personnel-scan-btn").addEventListener("click", async () => {
      const btn = document.getElementById("vn-personnel-scan-btn");
      const statusEl = document.getElementById("vn-personnel-scan-status");
      btn.disabled = true;
      try {
        await scanAllPersonnel((done, of) => {
          statusEl.textContent = `Scanne ${done}/${of} Wachen ...`;
        });
        scanData = await getPersonnelScanData();
        scanMeta = await getPersonnelScanMeta();
        statusEl.textContent = lastScanLabel();
        renderTable();
      } catch (e) {
        statusEl.textContent = `Fehler: ${e.message}`;
      } finally {
        btn.disabled = false;
      }
    });

    renderTable();
  }

  //////////////////////////////////////////////////
  // Schulungen: nutzt die im Personal-Check gescannten Zahlen (counts pro Wache+Slug)
  // und die aus dem je Gebaeudetyp aktiven Wachenbauplan berechnete Anforderung (siehe
  // computePersonnelRequirementsFromBlueprints), um fehlendes
  // Personal automatisch in die passende Schule zu schicken - ein Klassenraum fasst immer
  // 10 Personen (siehe free_space_for_personnel_selection() im Spiel selbst). Es gibt
  // dafuer keine JSON-API: der Lehrgang-Tab jeder Schule ist eine grosse HTML-Seite, und
  // die Personal-Auswahl pro Wache wird darin erst per AJAX nachgeladen (schooling_
  // personal_select) - deshalb zwei Anfragen pro Lauf (Schule fuer Token+Raum+Lehrgangs-
  // ID, dann jede betroffene Wache fuer die tatsaechlichen Personal-IDs).
  //////////////////////////////////////////////////

  // Schule (building_type) je Kategorie, in die Personal dieser Kategorie geschickt wird.
  const SCHOOL_BUILDING_TYPE_BY_CATEGORY = {
    Feuerwehr: 1, // Feuerwehrschule
    Rettungsdienst: 3, // Rettungsschule
    Polizei: 8, // Polizeischule
    THW: 10, // THW-Bundesschule
    Seenotrettung: 27, // Schule fuer Seefahrt und Seenotrettung
  };

  const SCHOOLING_SEATS_PER_ROOM = 10;

  // Jede Schule hat 1 Klassenraum als Standard, plus einen weiteren je gebautem "Weiterer
  // Klassenraum"-Ausbau (Ids 0/1/2, siehe EXTENSION_CATALOG - identisch bei allen 5
  // Schul-Gebaeudetypen) - im Spiel selbst auf der Gebaeudeseite sichtbar ("Bereits fertig
  // gebaut"/"Noch nicht gebaut"). Zuverlaessiger als die Raum-Auswahl im Lehrgangs-Formular
  // zu scrapen (die existiert nur, wenn gerade ein Raum frei ist - fuer die GESAMTZAHL der
  // Raeume ist das ungeeignet, siehe fetchSchoolPageInfo).
  const SCHOOL_CLASSROOM_EXTENSION_IDS = [0, 1, 2];

  function countSchoolClassrooms(building) {
    const extensions = Array.isArray(building.extensions) ? building.extensions : [];
    const builtExtraRooms = extensions.filter(e => SCHOOL_CLASSROOM_EXTENSION_IDS.includes(e.type_id)).length;
    return 1 + builtExtraRooms;
  }

  async function loadOwnedSchoolsByCategory() {
    const buildings = await fetchJSON("/api/buildings");
    const byCategory = {};
    for (const b of buildings) {
      const category = Object.keys(SCHOOL_BUILDING_TYPE_BY_CATEGORY).find(
        cat => SCHOOL_BUILDING_TYPE_BY_CATEGORY[cat] === b.building_type,
      );
      if (!category) continue;
      (byCategory[category] || (byCategory[category] = [])).push({
        id: String(b.id),
        name: b.caption || `Schule ${b.id}`,
        maxRooms: countSchoolClassrooms(b),
      });
    }
    return byCategory;
  }

  // Welche eigene Schule fuer eine Kategorie genutzt wird, ist fuer den Spieler egal (es gibt
  // keinen Unterschied zwischen zwei Feuerwehrschulen) - deshalb einfach die erste gefundene,
  // keine Auswahl-Notwendigkeit im UI.
  function pickSchoolForCategory(schoolsByCategory, category) {
    return (schoolsByCategory[category] || [])[0] || null;
  }

  // Ermittelt je Kategorie+Ausbildungs-Slug, wie viel Personal insgesamt fehlt (Summe ueber
  // alle Wachen dieser Kategorie) - Grundlage fuer die Schulungen-Uebersicht. Wachen ohne
  // Scan-Daten werden ausgelassen (wie bei den Badges im Personal-Check: unbekannt statt
  // faelschlich "fehlt nichts"), ebenso Wachen unter der Mindest-Personalstaerke (schuetzt
  // frisch gebaute/kleine Wachen davor, sofort leergeraeumt zu werden).
  function computeTrainingNeeds(stations, requirements, scanData, minStaff) {
    const needs = new Map();
    for (const station of stations) {
      const scan = scanData[station.id];
      if (!scan) continue;
      if (scan.total < minStaff) continue;
      const schoolBuildingType = SCHOOL_BUILDING_TYPE_BY_CATEGORY[station.category];
      if (!schoolBuildingType) continue;

      const req = requirements[station.pseudoId] || {};
      for (const [slug, required] of Object.entries(req)) {
        const deficit = required - (scan.counts[slug] || 0);
        if (deficit <= 0) continue;

        const key = `${station.category}::${slug}`;
        if (!needs.has(key)) {
          needs.set(key, { category: station.category, slug, stations: [], totalDeficit: 0 });
        }
        const need = needs.get(key);
        need.stations.push({ id: station.id, name: station.name, deficit });
        need.totalDeficit += deficit;
      }
    }
    return [...needs.values()];
  }

  // Laedt den Lehrgang-Tab der Schule und liest die Anzahl frei WAEHLBARER, komplett
  // ungenutzter Klassenraeume (Anzahl <option> in #building_rooms_use) aus - "slug" ist
  // optional und liefert zusaetzlich authenticity_token sowie den Formular-Wert des
  // gewuenschten Lehrgangs (Format "<slug>:<lehrgangsId>", siehe #education_select), wird
  // also nur gebraucht, wenn tatsaechlich ausgebildet werden soll.
  //
  // WICHTIG (per Live-Diagnose im Browser bestaetigt, zweimal): #building_rooms_use existiert
  // im HTML NUR, wenn die Schule mindestens einen KOMPLETT freien (noch nie belegten)
  // Klassenraum hat - laeuft ueberall schon ein Lehrgang (auch wenn der laut API noch
  // "open_spaces" zeigt - die sind NICHT mehr nutzbar, sobald der Lehrgang laeuft), fehlt der
  // Raum-Waehler, aber das <form> samt #education_select kann trotzdem noch vorhanden sein
  // (offenbar fuer den Fall, dass doch noch ein Raum frei wird). "occupied" (Anzahl aktuell
  // laufender Lehrgaenge laut /api/schoolings, siehe countOccupiedRooms) ist deshalb die
  // einzige verlaessliche Quelle fuer belegte Raeume - die Gesamtraumzahl ergibt sich als
  // occupied + frei-waehlbare Raeume (NIE geraten/hart codiert).
  async function fetchSchoolPageInfo(schoolId, occupied, slug = null) {
    const res = await fetch(`/buildings/${schoolId}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Schule (Gebäude ${schoolId}) konnte nicht geladen werden (${res.status}).`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const form = doc.querySelector(`form[action="/buildings/${schoolId}/education"]`);
    if (!form) {
      if (occupied > 0) return { maxRooms: occupied, freeRooms: 0 };
      throw new Error("Ausbildungs-Formular an dieser Schule nicht gefunden.");
    }

    const roomOptions = [...form.querySelectorAll("#building_rooms_use option")];
    const freeRooms = roomOptions.length ? Math.max(...roomOptions.map(o => Number(o.value) || 1)) : 0;
    const maxRooms = occupied + freeRooms;

    const result = { maxRooms, freeRooms };
    if (slug) {
      const authenticityToken = form.querySelector('input[name="authenticity_token"]')?.value;
      if (!authenticityToken) throw new Error("CSRF-Token im Ausbildungs-Formular nicht gefunden.");
      const educationOption = [...form.querySelectorAll("#education_select option")].find(o =>
        o.value.startsWith(`${slug}:`),
      );
      if (!educationOption) throw new Error("Dieser Lehrgang wird an dieser Schule nicht angeboten.");
      result.authenticityToken = authenticityToken;
      result.educationValue = educationOption.value;
      result.educationLabel = educationOption.textContent.trim();
    }
    return result;
  }

  // Liest die Lehrgangsdauer aus dem Options-Text (z.B. "Dekon-P Lehrgang (3 Tage)") - fuer
  // die Fertig-Schaetzung in der eigenen Bestaetigungs-Ansicht (siehe renderSchoolingConfirm-
  // Screen). null, falls das Format mal nicht passt (Anzeige laesst die Schaetzung dann weg).
  function parseEducationDurationDays(educationLabel) {
    const match = educationLabel?.match(/\((\d+)\s*Tage?\)/);
    return match ? Number(match[1]) : null;
  }

  // Echte Auslastung ueber /api/schoolings statt HTML-Raten: liefert je Lehrgangs-Instanz
  // (ein Eintrag = EIN belegter Klassenraum) building_id, ob sie noch laeuft und wann sie
  // fertig ist. Mehrere Instanzen pro Schule moeglich (mehrere Raeume gleichzeitig belegt).
  async function fetchSchoolingRuns() {
    return await fetchJSON("/api/schoolings");
  }

  // Anzahl der GERADE (oder demnaechst per verzoegertem Start) belegten Klassenraeume einer
  // Schule - NUR nach Fertig-Zeitpunkt in der Zukunft, bewusst OHNE das "running"-Flag zu
  // verlangen: ein per verzoegertem Start eingeplanter Lehrgang hat schon einen echten
  // finish_time in der Zukunft, obwohl "running" noch false ist (per Test bestaetigt) - der
  // Klassenraum ist trotzdem schon belegt/reserviert, das Flag hinkt hier also hinterher statt
  // umgekehrt.
  function countOccupiedRooms(schoolingRuns, schoolId) {
    const now = Date.now();
    return schoolingRuns.filter(
      run => String(run.building_id) === String(schoolId) && new Date(run.finish_time).getTime() > now,
    ).length;
  }

  // Fruehester Fertig-Zeitpunkt unter den (auch per verzoegertem Start) belegten
  // Klassenraeumen einer Schule (oder null, falls keiner belegt ist) - fuer die Anzeige
  // "belegt bis ..." statt nur "belegt".
  function earliestSchoolingFinish(schoolingRuns, schoolId) {
    const now = Date.now();
    const finishTimes = schoolingRuns
      .filter(run => String(run.building_id) === String(schoolId))
      .map(run => new Date(run.finish_time).getTime())
      .filter(t => t > now);
    return finishTimes.length ? Math.min(...finishTimes) : null;
  }

  // Laedt die Personal-Auswahl EINER Wache fuer den Lehrgang-Tab (eigene AJAX-Anfrage im
  // Spiel selbst, siehe personal-select-heading href) und liefert alle Personen, die diese
  // Ausbildung laut den per-Ausbildung true/false-Attributen der Checkboxen NICHT schon
  // haben (echte Vor-Ort-Daten statt der ggf. veralteten Scan-Zahlen).
  async function fetchAvailablePersonnelForEducation(stationId, slug) {
    const res = await fetch(`/buildings/${stationId}/schooling_personal_select`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Personal von Wache ${stationId} konnte nicht geladen werden (${res.status}).`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    return [...doc.querySelectorAll(`#personal_table_${stationId} input.schooling_checkbox`)]
      .filter(cb => cb.getAttribute(slug) === "false")
      .map(cb => ({
        id: cb.value,
        name: cb.closest("tr")?.children[1]?.textContent.trim() || cb.value,
      }));
  }

  // Ermittelt fuer einen Bedarf (eine Kategorie+Ausbildung, ueber ggf. mehrere Wachen) an
  // einer gewaehlten Schule GENAU, wer ausgebildet wuerde, OHNE etwas abzuschicken - Raeume/
  // Lehrgang ermitteln, je Wache (groesster Mangel zuerst) so viele freie Personen wie noetig
  // einsammeln (bis zur tatsaechlich freien Kapazitaet). Grundlage fuer die eigene
  // Bestaetigungs-Ansicht (siehe renderSchoolingConfirmScreen) statt eines blossen
  // Browser-confirm() - der Spieler soll VOR dem Klick exakt sehen, wer betroffen ist.
  async function planTrainingRun(need, school) {
    const schoolId = school.id;
    const schoolingRuns = await fetchSchoolingRuns();
    const occupied = countOccupiedRooms(schoolingRuns, schoolId);
    // freeRooms fuer die Zuteilung kommt aus der ECHTEN Raumzahl der Schule (school.maxRooms,
    // siehe countSchoolClassrooms) statt aus der Raum-Auswahl im Formular - die HTML-Anfrage
    // hier liefert weiterhin authenticityToken/educationValue, die es nur im echten Formular
    // gibt.
    const freeRooms = Math.max(0, school.maxRooms - occupied);
    if (freeRooms <= 0) {
      throw new Error("Keine freien Klassenräume an dieser Schule - es läuft bereits ein Lehrgang in jedem Raum.");
    }
    const { authenticityToken, educationValue, educationLabel } = await fetchSchoolPageInfo(schoolId, occupied, need.slug);

    const roomsWanted = Math.min(freeRooms, Math.max(1, Math.ceil(need.totalDeficit / SCHOOLING_SEATS_PER_ROOM)));
    const capacity = roomsWanted * SCHOOLING_SEATS_PER_ROOM;

    const stationsByDeficit = [...need.stations].sort((a, b) => b.deficit - a.deficit);
    const selectedByStation = [];
    for (const station of stationsByDeficit) {
      const alreadySelected = selectedByStation.reduce((sum, s) => sum + s.people.length, 0);
      if (alreadySelected >= capacity) break;
      const takeCount = Math.min(station.deficit, capacity - alreadySelected);
      if (takeCount <= 0) continue;
      const available = await fetchAvailablePersonnelForEducation(station.id, need.slug);
      const people = available.slice(0, takeCount);
      if (people.length) selectedByStation.push({ stationId: station.id, stationName: station.name, people });
    }

    const selected = selectedByStation.flatMap(s => s.people);
    if (!selected.length) {
      throw new Error("Kein verfügbares Personal ohne diese Ausbildung gefunden (evtl. schon in Ausbildung).");
    }

    const actualRooms = Math.min(freeRooms, Math.max(1, Math.ceil(selected.length / SCHOOLING_SEATS_PER_ROOM)));
    const durationDays = parseEducationDurationDays(educationLabel);
    const finishEstimate = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;

    return {
      schoolId,
      authenticityToken,
      educationValue,
      educationLabel,
      durationDays,
      finishEstimate,
      actualRooms,
      selectedByStation,
      selected,
    };
  }

  // Schickt einen zuvor mit planTrainingRun() erstellten, vom Spieler bestaetigten Plan
  // tatsaechlich ab (das echte Ausbilden-Formular der Schule).
  async function submitTrainingRun(plan) {
    const params = new URLSearchParams();
    params.append("utf8", "✓");
    params.append("authenticity_token", plan.authenticityToken);
    params.append("building_rooms_use", String(plan.actualRooms));
    params.append("education_select", plan.educationValue);
    params.append("alliance[duration]", "0"); // 0 = direkt starten, keine Verbandsfreigabe
    params.append("alliance[cost]", "0");
    plan.selected.forEach(p => params.append("personal_ids[]", p.id));

    const res = await fetch(`/buildings/${plan.schoolId}/education`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    // Erfolg = echte Weiterleitung (redirect_to der Rails-Action). Ohne Weiterleitung wird
    // stattdessen das Formular mit einer Fehlermeldung neu gerendert (z.B. keine freien
    // Plaetze mehr) - das ist trotz HTTP 200 KEIN Erfolg.
    if (!res.ok || !res.redirected) {
      throw new Error(`Ausbildung wurde nicht gestartet (Formular meldet einen Fehler, HTTP ${res.status}).`);
    }
  }

  // Eigene Bestaetigungs-Ansicht statt eines blossen Browser-confirm() - zeigt GENAU, wer
  // (aus welcher Wache, wie viele) zu welchem Lehrgang an welche Schule geschickt wird und
  // eine Fertig-Schaetzung, bevor tatsaechlich etwas an das Spiel abgeschickt wird.
  function renderSchoolingConfirmScreen({ need, school, qualificationName, plan, goBack }) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");

    const stationRows = plan.selectedByStation
      .map(
        s => `
          <tr>
            <td>${escapeHtml(s.stationName)}</td>
            <td>${s.people.length}</td>
          </tr>
        `,
      )
      .join("");

    const finishLabel = plan.finishEstimate
      ? plan.finishEstimate.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
      : "unbekannt (Lehrgangsdauer nicht erkannt)";

    body.innerHTML = `
      <p>
        <b>${escapeHtml(qualificationName)}</b> an <b>${escapeHtml(school.name)}</b>
        ${plan.durationDays ? `<span class="text-muted">(${plan.durationDays} Tage)</span>` : ""}
      </p>
      <table class="table table-condensed table-striped" style="font-size:12px;">
        <thead><tr><th>Wache</th><th>Personen</th></tr></thead>
        <tbody>${stationRows}</tbody>
      </table>
      <p>
        Insgesamt <b>${plan.selected.length}</b> Person(en) in <b>${plan.actualRooms}</b>
        Klassenraum/-räumen. Voraussichtlich fertig: <b>${escapeHtml(finishLabel)}</b>.
      </p>
      <p class="text-muted" style="font-size:12px;">
        Die Personen stehen währenddessen für Einsätze nicht zur Verfügung.
      </p>
      <div id="vn-schooling-confirm-status" style="margin-top:6px;"></div>
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen
        </button>
        <button id="vn-btn-confirm-schooling" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-education" aria-hidden="true"></span> Bestätigen
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-confirm-schooling").addEventListener("click", async () => {
      const confirmBtn = document.getElementById("vn-btn-confirm-schooling");
      const backBtn = document.getElementById("vn-btn-back");
      const statusEl = document.getElementById("vn-schooling-confirm-status");
      confirmBtn.disabled = true;
      backBtn.disabled = true;
      statusEl.innerHTML = `<em>Wird gestartet ...</em>`;
      try {
        await submitTrainingRun(plan);
        await logHistoryEntry({
          type: "schooling_start",
          label: qualificationName,
          station: `${school.name} (${plan.selected.length} Person(en): ${plan.selected.map(p => p.name).join(", ")})`,
        });
        statusEl.innerHTML = `<span class="text-success">Erfolgreich gestartet.</span>`;
        setTimeout(goBack, 600);
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
        confirmBtn.disabled = false;
        backBtn.disabled = false;
      }
    });
  }

  async function renderSchoolingScreen(goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Schulungen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Bedarf ...</p>`;

    let stations, schoolsByCategory;
    try {
      [stations, schoolsByCategory] = await Promise.all([loadPersonnelCheckStations(), loadOwnedSchoolsByCategory()]);
    } catch (e) {
      body.innerHTML = `
        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>
        <div class="vn-sticky-footer">
          <button id="vn-btn-back" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
          </button>
        </div>
      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }

    body.innerHTML = `<p>Prüfe letzten Scan ...</p>`;
    await ensureFreshPersonnelScan((done, of) => {
      body.innerHTML = `<p>Scanne Personal ... (${done}/${of})</p>`;
    });

    const requirements = await computePersonnelRequirementsFromBlueprints();
    let scanData = await getPersonnelScanData();
    let scanMeta = await getPersonnelScanMeta();
    const qualifications = await getPersonnelQualifications();
    let minStaff = await getPersonnelSchoolingMinStaff();

    // Schule je Kategorie ist fix fuer den ganzen Bildschirm (welche konkrete Schule genutzt
    // wird, ist egal - siehe pickSchoolForCategory) - Kapazitaet/Auslastung nur einmal pro
    // tatsaechlich benoetigter Schule laden, nicht pro Zeile.
    const schoolByCategory = {};
    for (const category of Object.keys(SCHOOL_BUILDING_TYPE_BY_CATEGORY)) {
      schoolByCategory[category] = pickSchoolForCategory(schoolsByCategory, category);
    }
    // Raumzahl kommt jetzt direkt aus den ECHTEN Ausbauten der Schule (school.maxRooms, siehe
    // countSchoolClassrooms) statt aus der Raum-Auswahl im Lehrgangs-Formular - die existiert
    // im HTML naemlich nur, wenn gerade ein Raum frei ist, und war deshalb als Quelle fuer die
    // GESAMTZAHL ungeeignet (siehe fetchSchoolPageInfo). Belegte Raeume kommen weiterhin aus
    // /api/schoolings (countOccupiedRooms) - kein HTML-Scraping mehr fuer die Uebersicht
    // noetig.
    const capacityBySchoolId = {};
    let schoolingRuns = [];
    try {
      schoolingRuns = await fetchSchoolingRuns();
    } catch (e) {
      console.warn("[FuxTools] /api/schoolings konnte nicht geladen werden:", e);
    }
    for (const school of Object.values(schoolByCategory)) {
      if (!school) continue;
      const occupied = countOccupiedRooms(schoolingRuns, school.id);
      const freeRooms = Math.max(0, school.maxRooms - occupied);
      const nextFreeAt = earliestSchoolingFinish(schoolingRuns, school.id);
      capacityBySchoolId[school.id] = { maxRooms: school.maxRooms, freeRooms, nextFreeAt };
    }

    let needs = [];
    function recomputeNeeds() {
      needs = computeTrainingNeeds(stations, requirements, scanData, minStaff);
    }
    recomputeNeeds();

    function capacityLabel(school) {
      if (!school) return `<span class="text-muted">Keine eigene Schule</span>`;
      const info = capacityBySchoolId[school.id];
      if (!info) return "";
      if (info.error) {
        return `${escapeHtml(school.name)} · <span class="text-danger">Kapazität unbekannt (${escapeHtml(info.error)})</span>`;
      }
      const freeSeats = info.freeRooms * SCHOOLING_SEATS_PER_ROOM;
      const untilLabel = info.nextFreeAt ? ` (bis ${new Date(info.nextFreeAt).toLocaleString("de-DE")})` : "";
      const statusBadge =
        info.freeRooms > 0
          ? `<span class="label label-success">${info.freeRooms}/${info.maxRooms} Klassenräume frei (${freeSeats} Plätze)</span>`
          : `<span class="label label-warning">alle ${info.maxRooms} Klassenräume belegt${escapeHtml(untilLabel)}</span>`;
      return `${escapeHtml(school.name)} · ${statusBadge}`;
    }

    // Kompakte Uebersicht ALLER eigenen Schulen samt Auslastung, unabhaengig davon, ob es
    // gerade einen Bedarf gibt - immer ganz oben sichtbar (anders als die Gruppen weiter
    // unten, die nur bei tatsaechlichem Personalmangel auftauchen).
    function renderSchoolOverview() {
      const categoriesWithSchool = CATEGORY_ORDER.filter(cat => schoolByCategory[cat]);
      if (!categoriesWithSchool.length) return "";
      const cards = categoriesWithSchool
        .map(
          category => `
            <div class="vn-settings-card" style="flex:1; min-width:220px;">
              <b>${escapeHtml(category)}</b><br>
              <small>${capacityLabel(schoolByCategory[category])}</small>
            </div>
          `,
        )
        .join("");
      return `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px;">${cards}</div>`;
    }

    function renderGroups() {
      if (!needs.length) {
        return `<p class="text-muted">Kein fehlendes Personal gefunden (oder noch nicht gescannt).</p>`;
      }
      const byCategory = new Map();
      for (const need of needs) {
        if (!byCategory.has(need.category)) byCategory.set(need.category, []);
        byCategory.get(need.category).push(need);
      }

      return CATEGORY_ORDER.filter(cat => byCategory.has(cat))
        .map(category => {
          const school = schoolByCategory[category];
          const categoryNeeds = byCategory
            .get(category)
            .sort((a, b) =>
              (qualifications[a.slug] || a.slug).localeCompare(qualifications[b.slug] || b.slug, "de"),
            );

          const rows = categoryNeeds
            .map(need => {
              const qualificationName = qualifications[need.slug] || need.slug;
              const stationTitle = need.stations.map(s => `${s.name} (${s.deficit} fehlen)`).join(", ");
              const needKey = `${need.category}::${need.slug}`;
              return `
                <tr>
                  <td style="vertical-align:middle;">${escapeHtml(qualificationName)}</td>
                  <td style="vertical-align:middle;" title="${escapeHtml(stationTitle)}">${need.totalDeficit} fehlen<br><small class="text-muted">${need.stations.length} Wache(n)</small></td>
                  <td style="vertical-align:middle;">
                    <button type="button" class="btn btn-primary btn-sm vn-schooling-start" data-key="${escapeHtml(needKey)}" ${school ? "" : "disabled"}>
                      <span class="glyphicon glyphicon-education" aria-hidden="true"></span> Ausbilden
                    </button>
                    <div class="vn-schooling-status" data-key="${escapeHtml(needKey)}" style="margin-top:4px; font-size:11px;"></div>
                  </td>
                </tr>
              `;
            })
            .join("");

          return `
            <div style="margin-bottom:16px;">
              <p style="margin-bottom:4px;"><b>${escapeHtml(category)}</b></p>
              <table class="table table-condensed table-striped" style="font-size:12px;">
                <thead>
                  <tr><th>Ausbildung</th><th>Fehlend</th><th>Aktion</th></tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          `;
        })
        .join("");
    }

    function render() {
      body.innerHTML = `
        <p class="text-muted" style="font-size:12px;">
          Zeigt fehlendes Ausbildungspersonal je Schultyp (Bedarf aus dem aktiven
          Wachenbauplan) und startet echte Lehrgänge - Personal steht währenddessen nicht für
          Einsätze zur Verfügung, Anzahl vorher prüfen.
        </p>
        <div id="vn-schooling-overview">${renderSchoolOverview()}</div>
        <div class="form-inline" style="margin-bottom:10px;">
          <label for="vn-schooling-min-staff" style="font-size:12px;">
            Erst ab wie viel Personal pro Wache schulen (schützt neue/kleine Wachen)?
          </label>
          <input type="number" min="0" id="vn-schooling-min-staff" class="form-control input-sm"
                 value="${minStaff}" style="width:70px; margin-left:8px;">
        </div>
        <div id="vn-schooling-groups" style="max-height:55vh; overflow:auto;">${renderGroups()}</div>
        <div class="vn-sticky-footer" style="display:flex; align-items:center; gap:10px;">
          <button id="vn-btn-back" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
          </button>
          <button type="button" id="vn-schooling-scan-btn" class="btn btn-primary">
            <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Scan jetzt starten
          </button>
          <button type="button" id="vn-schooling-goto-blueprints" class="btn btn-default">
            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Wachen-Bauplaner verwalten
          </button>
          <span class="label label-default" id="vn-schooling-scan-status" style="font-size:12px;">
            ${
              scanMeta.lastScanAt
                ? `Letzter Scan: ${escapeHtml(new Date(scanMeta.lastScanAt).toLocaleString("de-DE"))}`
                : "Noch nie gescannt"
            }
          </span>
        </div>
      `;

      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      document
        .getElementById("vn-schooling-goto-blueprints")
        .addEventListener("click", () => renderStationBlueprintsListScreen(() => renderSchoolingScreen(goBack)));

      document.getElementById("vn-schooling-min-staff").addEventListener("change", async e => {
        minStaff = Math.max(0, parseInt(e.target.value, 10) || 0);
        await storeData(minStaff, PERSONNEL_SCHOOLING_MIN_STAFF_KEY);
        recomputeNeeds();
        document.getElementById("vn-schooling-groups").innerHTML = renderGroups();
        wireStartButtons();
      });

      document.getElementById("vn-schooling-scan-btn").addEventListener("click", async () => {
        const btn = document.getElementById("vn-schooling-scan-btn");
        const statusEl = document.getElementById("vn-schooling-scan-status");
        btn.disabled = true;
        try {
          await scanAllPersonnel((done, of) => {
            statusEl.textContent = `Scanne ${done}/${of} Wachen ...`;
          });
          scanData = await getPersonnelScanData();
          scanMeta = await getPersonnelScanMeta();
          statusEl.textContent = `Letzter Scan: ${new Date(scanMeta.lastScanAt).toLocaleString("de-DE")}`;
          recomputeNeeds();
          document.getElementById("vn-schooling-groups").innerHTML = renderGroups();
          wireStartButtons();
        } catch (e) {
          statusEl.textContent = `Fehler: ${e.message}`;
        } finally {
          btn.disabled = false;
        }
      });

      wireStartButtons();
    }

    function wireStartButtons() {
      body.querySelectorAll(".vn-schooling-start").forEach(btn => {
        btn.addEventListener("click", async () => {
          const need = needs.find(n => `${n.category}::${n.slug}` === btn.dataset.key);
          if (!need) return;
          const school = schoolByCategory[need.category];
          if (!school) return;
          const statusEl = body.querySelector(`.vn-schooling-status[data-key="${btn.dataset.key}"]`);
          const qualificationName = qualifications[need.slug] || need.slug;

          btn.disabled = true;
          statusEl.textContent = "Lade Vorschau ...";
          try {
            const plan = await planTrainingRun(need, school);
            renderSchoolingConfirmScreen({
              need,
              school,
              qualificationName,
              plan,
              goBack: () => renderSchoolingScreen(goBack),
            });
          } catch (e) {
            statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
            btn.disabled = false;
          }
        });
      });
    }

    render();
  }

  //////////////////////////////////////////////////
  // Fahrzeug-Besatzung: manche Fahrzeugtypen brauchen eine KOMPLETT mit einer bestimmten
  // Ausbildung besetzte Besatzung (z.B. ELW 2 - jeder an Bord braucht den ELW-2-Lehrgang,
  // nicht nur der "Fahrer"). Weist dafuer verfuegbares, passend ausgebildetes Personal ueber
  // die echte Fahrzeug-Zuweisungsseite zu (/vehicles/{id}/zuweisung, dieselbe Seite wie im
  // Spiel unter "Besatzung zuweisen") und korrigiert danach den FMS-Status: FMS 6 (nicht
  // besetzt), wenn nicht alle Plaetze mit passendem Personal belegt sind, sonst FMS 2 (frei
  // auf Funk) - verhindert, dass ein Fahrzeug ohne die noetige Ausbildung zu einem Einsatz
  // ausrueckt, UND dass diese Personen versehentlich einem anderen Fahrzeug zugeteilt werden.
  //
  // Woher welche Fahrzeugtypen eine Ausbildung brauchen, kommt NICHT mehr aus einer von Hand
  // gepflegten Liste, sondern direkt aus dem ohnehin schon geladenen Katalog von
  // api.lss-manager.de (vehicleTypeCatalog, siehe initVehicleTypeCaptions()) - der enthaelt
  // je Fahrzeugtyp "staff.training" mit echten Slugs UND ob ALLE zugewiesenen Personen die
  // Ausbildung brauchen ({all:true}, z.B. ELW 2) oder nur ein Teil davon ({min:N}, z.B. GRTW
  // braucht nur 1 von 6 mit Notarzt-Ausbildung - der Rest darf beliebiges Personal sein).
  // Manche Fahrzeuge (z.B. Dekon-P) brauchen die Ausbildung nur IRGENDWO am Einsatzort
  // ("trainingAtScene"), nicht in der eigenen Besatzung - die werden hier bewusst ausgeschlossen,
  // ebenso Anhaenger ohne eigene Besatzung (staff.max = 0).
  //
  // Die Zuweisungs-Logik (Ablauf/Klassen/Spaltenaufbau der Zuweisungs-Seite) ist vom
  // Community-Script "Personalzuweiser" (BOS-Ernie) uebernommen, der FMS-Ablauf (welcher
  // Status wann gesetzt wird) vom Community-Script "FMS6" (LaLeLu4153) - beide bedienen
  // genau diese beiden Spiel-Funktionen bereits erfolgreich.
  //////////////////////////////////////////////////

  // Liefert je Fahrzeugtyp die Liste der benoetigten Ausbildungs-Slugs (min: null = ALLE
  // zugewiesenen Personen brauchen den Slug, min: <Zahl> = nur so viele davon) sowie die
  // echte Mindest-/Maximalbesatzung - oder null, wenn der Typ keine besondere Ausbildung fuer
  // seine EIGENE Besatzung braucht.
  function getVehicleTypeRequirement(vehicleTypeId) {
    const staff = vehicleTypeCatalog[vehicleTypeId]?.staff;
    if (!staff?.training || staff.trainingAtScene || !staff.max) return null;

    const requirements = [];
    for (const categoryTrainings of Object.values(staff.training)) {
      for (const [slug, spec] of Object.entries(categoryTrainings)) {
        const min = spec.all ? null : Number(spec.min) || 0;
        if (min === 0) continue; // z.B. Dekon-P: min:0 = keine Anforderung an die eigene Besatzung
        const existing = requirements.find(r => r.slug === slug);
        if (!existing) requirements.push({ slug, min });
        else if (existing.min !== null && (min === null || min > existing.min)) existing.min = min;
      }
    }
    if (!requirements.length) return null;

    return { requirements, staffMin: staff.min, staffMax: staff.max };
  }

  // FMS-Stati, bei denen ein Fahrzeug "an der Wache" ist (einsatzbereit auf Wache/Funk, oder
  // schon als nicht besetzt markiert) - NUR in diesem Zustand wird je eingegriffen. Alles
  // andere (Anfahrt, am Einsatzort, Patiententransport, ...) wird NIE angefasst, damit nie
  // versehentlich in einen laufenden Einsatz eingegriffen wird.
  const VEHICLE_FMS_AT_STATION = new Set([1, 2, 6]);
  const VEHICLE_FMS_NOT_STAFFED = 6;
  const VEHICLE_FMS_READY = 2;

  // Wie getVehicleTypeRequirement(), aber liefert auch fuer FAHRZEUGE OHNE Ausbildungs-
  // anforderung (normale Loeschfahrzeuge, RTW, ...) ein Ergebnis (requirements: leeres Array)
  // statt null - solange sie ueberhaupt eine eigene Besatzung haben (staff.max > 0, schliesst
  // reine Anhaenger/Geraetefahrzeuge ohne Besatzung aus). Grundlage fuer die "Normale
  // Fahrzeuge einbeziehen"-Option der Fahrzeug-Besatzung (siehe loadCrewCheckVehicles).
  function getVehicleTypeCrewTarget(vehicleTypeId) {
    const staff = vehicleTypeCatalog[vehicleTypeId]?.staff;
    if (!staff?.max) return null;
    const requirement = getVehicleTypeRequirement(vehicleTypeId);
    if (requirement) return requirement;
    return { requirements: [], staffMin: staff.min, staffMax: staff.max };
  }

  // Alle Ausbildungs-Slugs, die IRGENDEIN Fahrzeugtyp als Besatzungs-Anforderung braucht (z.B.
  // Notarzt fuer NAW/RTW-Sonderfahrzeuge) - Grundlage dafuer, bei normalen Fahrzeugen (siehe
  // assignAnyPersonnelToVehicle) genau DIESES Personal zu schonen. Wird nicht gecacht, da
  // vehicleTypeCatalog sich innerhalb einer Sitzung praktisch nie aendert und die Liste mit
  // ~180 Eintraegen trivial billig zu berechnen ist.
  function getSpecialTrainingSlugs() {
    const slugs = new Set();
    for (const typeId of Object.keys(vehicleTypeCatalog)) {
      const requirement = getVehicleTypeRequirement(Number(typeId));
      if (requirement) for (const req of requirement.requirements) slugs.add(req.slug);
    }
    return slugs;
  }

  // Laedt ALLE Fahrzeuge mit eigener Besatzung (staff.max > 0) - inklusive normaler
  // Fahrzeuge ohne Ausbildungsanforderung (Feld "special": false). Ob normale Fahrzeuge in
  // der Anzeige/beim Zuweisen tatsaechlich beruecksichtigt werden, entscheidet erst die UI
  // (Checkbox "Normale Fahrzeuge einbeziehen", siehe renderVehicleCrewScreen) - hier wird
  // bewusst IMMER die volle Liste geladen, damit das Umschalten der Checkbox keinen erneuten
  // Server-Roundtrip braucht.
  async function loadCrewCheckVehicles() {
    const [vehicles, buildings] = await Promise.all([fetchAllVehiclesV2(), fetchJSON("/api/buildings")]);
    const buildingsById = new Map(buildings.map(b => [String(b.id), b]));
    return vehicles
      .map(v => {
        const typeId = v.vehicle_type ?? v.type;
        const info = getVehicleTypeCrewTarget(typeId);
        if (!info) return null;
        const stationId = String(v.building_id ?? v.building);
        const station = buildingsById.get(stationId);
        const leitstelleId = station?.leitstelle_building_id != null ? String(station.leitstelle_building_id) : "none";
        const leitstelleBuilding = leitstelleId !== "none" ? buildingsById.get(leitstelleId) : null;
        return {
          id: String(v.id),
          caption: v.caption || `Fahrzeug ${v.id}`,
          requirements: info.requirements,
          staffMin: info.staffMin,
          staffMax: info.staffMax,
          special: info.requirements.length > 0,
          category: station ? categoryForBuilding(station) : "Unbekannt",
          stationId,
          stationName: station?.caption || `Wache ${stationId}`,
          leitstelleId,
          leitstelleName: leitstelleId !== "none" ? leitstelleBuilding?.caption || `Leitstelle ${leitstelleId}` : "Ohne Leitstelle",
        };
      })
      .filter(Boolean);
  }

  // Fragt den aktuellen FMS-Status frisch ab (NICHT aus einer evtl. veralteten Bulk-Liste) -
  // unmittelbar vor jedem Eingriff, als letztes Sicherheitsnetz gegen einen mittlerweile
  // ausgerueckten Wagen.
  async function fetchVehicleFmsReal(vehicleId) {
    const res = await fetch(`/api/v2/vehicles/${vehicleId}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Fahrzeug ${vehicleId} konnte nicht geladen werden (${res.status}).`);
    const data = await res.json();
    const vehicle = data.result || data;
    return vehicle.fms_real ?? vehicle.fms ?? null;
  }

  // Liest die Zuweisungs-Seite eines Fahrzeugs aus: je Person die Ausbildungs-Slugs
  // (data-filterable-by, wie auch auf der Personal-Seite einer Wache), ob sie "Im Unterricht"
  // (also nicht verfuegbar) ist, ob sie SCHON diesem Fahrzeug zugewiesen ist (Button mit
  // Klasse "btn-assigned", Link-Text "Fahrzeugbindung entfernen") und der Zuweisen-Link, falls
  // verfuegbar. Per Live-Diagnose im Browser bestaetigt: Personal, das bereits einem ANDEREN
  // Fahrzeug zugewiesen ist, bekommt KEINEN deaktivierten Button, sondern denselben
  // Zuweisen-Link wie freies Personal - nur mit Klasse "btn-warning" statt "btn-success". Ein
  // Klick auf diesen Link (POST auf denselben "/vehicles/{id}/zuweisungDo/{personal_id}"-
  // Endpunkt wie beim normalen Zuweisen) zieht die Person server-seitig automatisch vom alten
  // Fahrzeug ab und weist sie in EINEM Request diesem hier zu - kein separater Abzieh-Schritt
  // noetig, derselbe Endpunkt ist ein Toggle (siehe assignedElsewhere unten). Kapazitaet kommt
  // bewusst NICHT von hier (die #count_personal-Anzeige ist ein rein client-seitiger Zaehler,
  // der auf einer frisch geladenen Seite nicht den echten Stand zeigt), sondern aus dem
  // Fahrzeug-Katalog (vehicle.staffMax, siehe checkAndFixVehicleCrew).
  async function fetchVehicleAssignmentPage(vehicleId) {
    const res = await fetch(`/vehicles/${vehicleId}/zuweisung`, { credentials: "same-origin" });
    if (!res.ok) {
      throw new Error(`Zuweisungs-Seite von Fahrzeug ${vehicleId} konnte nicht geladen werden (${res.status}).`);
    }
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");

    const people = [...doc.querySelectorAll("#personal_table tr[data-filterable-by]")].map(row => {
      let slugs;
      try {
        slugs = JSON.parse(row.dataset.filterableBy || "[]");
      } catch {
        slugs = [];
      }
      const assignBtn = row.querySelector("a.btn-success[personal_id], a.btn-warning[personal_id]");
      return {
        slugs: Array.isArray(slugs) ? slugs : [],
        inTraining: row.textContent.includes("Im Unterricht"),
        assignedHere: !!row.querySelector("a.btn-assigned"),
        assignedElsewhere: !!row.querySelector("a.btn-warning[personal_id]"),
        assignHref: assignBtn?.getAttribute("href") || null,
        unassignHref: row.querySelector("a.btn-assigned[personal_id]")?.getAttribute("href") || null,
      };
    });

    return { people };
  }

  // Weist so viele verfuegbare (nicht im Unterricht, noch nicht diesem Fahrzeug zugewiesene)
  // Personen mit dem gesuchten Slug zu, wie fuer diese EINE Anforderung noch fehlen (target,
  // begrenzt durch staffMax). Zieht bei Bedarf auch Personal von einem ANDEREN Fahrzeug ab
  // (Klasse "btn-warning", siehe fetchVehicleAssignmentPage) - der Server macht das Umziehen in
  // einem einzigen POST, kein separater Abzieh-Schritt noetig (per Live-Diagnose bestaetigt).
  // Echte freie Personen werden aber IMMER zuerst verwendet, ein Umzug nur, wenn sonst niemand
  // mit dieser Ausbildung frei ist - unnoetiges Hin-und-her-Schieben wird so vermieden.
  async function assignQualifiedPersonnelToVehicleForSlug(vehicleId, slug, target, staffMax) {
    const { people } = await fetchVehicleAssignmentPage(vehicleId);
    const assignedCount = people.filter(p => p.assignedHere).length;
    const alreadyQualified = people.filter(p => p.assignedHere && p.slugs.includes(slug)).length;
    const csrfToken = getCsrfTokenOrThrow(vehicleId);
    let remaining = Math.min(Math.max(0, staffMax - assignedCount), Math.max(0, target - alreadyQualified));
    let assignedNow = 0;

    const eligible = people
      .filter(p => !p.assignedHere && !p.inTraining && p.assignHref && p.slugs.includes(slug))
      .sort((a, b) => Number(a.assignedElsewhere) - Number(b.assignedElsewhere));

    for (const person of eligible) {
      if (remaining <= 0) break;

      const res = await fetch(person.assignHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (!res.ok) throw new Error(`Zuweisen fehlgeschlagen (${res.status}).`);
      assignedNow++;
      remaining--;
      await new Promise(r => setTimeout(r, 100));
    }
    return assignedNow;
  }

  // Wie assignQualifiedPersonnelToVehicleForSlug(), aber OHNE Ausbildungs-Filter - fuer
  // normale Fahrzeuge ohne besondere Anforderung: einfach mit beliebigem verfuegbarem
  // Personal (kein Unterricht, noch niemand anderem zugewiesen) bis zum Ziel auffuellen.
  // Verteilt sich automatisch fair auf mehrere Fahrzeuge derselben Kategorie/Wache, WEIL
  // jedes Fahrzeug im "Alle ... pruefen & zuweisen"-Lauf nur bis zu seinem eigenen Ziel
  // (staffMin bei "Minimum", nicht staffMax) auffuellt statt sich das gesamte verfuegbare
  // Personal zu greifen.
  async function assignAnyPersonnelToVehicle(vehicleId, target, staffMax) {
    const { people } = await fetchVehicleAssignmentPage(vehicleId);
    const assignedCount = people.filter(p => p.assignedHere).length;
    const csrfToken = getCsrfTokenOrThrow(vehicleId);
    let remaining = Math.min(Math.max(0, staffMax - assignedCount), Math.max(0, target - assignedCount));
    let assignedNow = 0;

    // Prioritaet beim Zuweisen: 1) Personal OHNE jede Sonderausbildung zuerst - sonst
    // "verbraucht" ein normales Fahrzeug (z.B. LF20) wertvolles Personal wie Notarzt, das
    // eigentlich fuer NAW/RTW gebraucht wird. 2) unter gleichrangigen Kandidaten echte freie
    // Personen vor solchen, die von einem ANDEREN Fahrzeug abgezogen werden muessten (Klasse
    // "btn-warning", siehe fetchVehicleAssignmentPage) - vermeidet unnoetiges Hin-und-Her-
    // Schieben, wenn ohnehin schon genug frei verfuegbares Personal existiert.
    const specialSlugs = getSpecialTrainingSlugs();
    const eligible = people
      .filter(p => !p.assignedHere && !p.inTraining && p.assignHref)
      .sort((a, b) => {
        const aSpecial = Number(a.slugs.some(s => specialSlugs.has(s)));
        const bSpecial = Number(b.slugs.some(s => specialSlugs.has(s)));
        if (aSpecial !== bSpecial) return aSpecial - bSpecial;
        return Number(a.assignedElsewhere) - Number(b.assignedElsewhere);
      });

    for (const person of eligible) {
      if (remaining <= 0) break;

      const res = await fetch(person.assignHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (!res.ok) throw new Error(`Zuweisen fehlgeschlagen (${res.status}).`);
      assignedNow++;
      remaining--;
      await new Promise(r => setTimeout(r, 100));
    }
    return assignedNow;
  }

  async function setVehicleFms(vehicleId, fmsStatus) {
    const res = await fetch(`/vehicles/${vehicleId}/set_fms/${fmsStatus}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`FMS-Status konnte nicht auf ${fmsStatus} gesetzt werden (${res.status}).`);
  }

  // Prueft anhand einer bereits geladenen Zuweisungs-Seite, ob ALLE Anforderungen erfuellt
  // sind: Grundbesatzung (staffMin) erreicht, und je Anforderung entweder ALLE zugewiesenen
  // Personen (min:null) oder mindestens min Personen den Slug haben. Bei "alle" wird bewusst
  // zusaetzlich verlangt, dass UEBERHAUPT jemand zugewiesen ist (sonst waere ".every()" auf
  // einer leeren Liste faelschlich immer erfuellt).
  function isVehicleFullyStaffed(assignmentPage, vehicle) {
    const assignedPeople = assignmentPage.people.filter(p => p.assignedHere);
    if (assignedPeople.length < (Number(vehicle.staffMin) || 0)) return false;
    return vehicle.requirements.every(req => {
      if (req.min === null) return assignedPeople.length > 0 && assignedPeople.every(p => p.slugs.includes(req.slug));
      return assignedPeople.filter(p => p.slugs.includes(req.slug)).length >= req.min;
    });
  }

  // Kompletter Ablauf fuer EIN Fahrzeug: je Anforderung (z.B. bei GW-Verpflegung gleich zwei
  // verschiedene Ausbildungen) freie Plaetze mit passendem Personal auffuellen - zwischen den
  // Anforderungen wird die Zuweisungs-Seite neu geladen, damit die zweite Anforderung die
  // durch die erste schon belegten Plaetze beruecksichtigt. Bei Teil-Anforderungen (min:N)
  // bestimmt staffingMode das Ziel: "min" (Standard, spart Personal fuer andere Fahrzeuge)
  // oder "full" (gleich die volle Besatzung mit dieser Ausbildung befuellen). Fahrzeuge OHNE
  // Anforderung (requirements leer, siehe getVehicleTypeCrewTarget) werden stattdessen
  // einfach mit beliebigem verfuegbarem Personal bis staffMin ("Minimum") bzw. staffMax
  // ("Volle Besatzung") aufgefuellt - dasselbe staffingMode-Umschalten gilt fuer beide Faelle.
  // Danach wird geprueft, ob JETZT alle Anforderungen erfuellt sind (nicht nur die neu
  // zugewiesenen Personen - sonst wuerde trotz untrainierter Alt-Besatzung faelschlich FMS 2
  // gesetzt) und der FMS-Status gesetzt.
  // Zieht bei "Minimum" ueberzaehliges Personal wieder ab (z.B. Reste eines frueheren "Volle
  // Besatzung"-Laufs), bis staffMin erreicht ist - haelt dabei je Teil-Anforderung mindestens
  // req.min ein. Wird NIE fuer Anforderungen "alle muessen das koennen" (min:null) aufgerufen,
  // die zielen bewusst immer auf staffMax. Bevorzugt Personal OHNE Sonderausbildung zum
  // Abziehen (spezialisiertes Personal bleibt moeglichst zugewiesen, wird woanders gebraucht).
  async function trimVehicleCrewToStaffMin(vehicle) {
    const { people } = await fetchVehicleAssignmentPage(vehicle.id);
    const assigned = people.filter(p => p.assignedHere);
    let excess = assigned.length - (Number(vehicle.staffMin) || 0);
    if (excess <= 0) return 0;

    const slugCounts = new Map();
    for (const req of vehicle.requirements) {
      slugCounts.set(req.slug, assigned.filter(p => p.slugs.includes(req.slug)).length);
    }
    const specialSlugs = getSpecialTrainingSlugs();
    const candidates = [...assigned].sort((a, b) => {
      const aSpecial = Number(a.slugs.some(s => specialSlugs.has(s)));
      const bSpecial = Number(b.slugs.some(s => specialSlugs.has(s)));
      return aSpecial - bSpecial;
    });

    const csrfToken = getCsrfTokenOrThrow(vehicle.id);
    let removed = 0;
    for (const person of candidates) {
      if (excess <= 0) break;
      if (!person.unassignHref) continue;
      const wouldViolate = vehicle.requirements.some(
        req => person.slugs.includes(req.slug) && slugCounts.get(req.slug) - 1 < req.min
      );
      if (wouldViolate) continue;

      const res = await fetch(person.unassignHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (!res.ok) throw new Error(`Abziehen fehlgeschlagen (${res.status}).`);
      for (const req of vehicle.requirements) {
        if (person.slugs.includes(req.slug)) slugCounts.set(req.slug, slugCounts.get(req.slug) - 1);
      }
      excess--;
      removed++;
      await new Promise(r => setTimeout(r, 100));
    }
    return removed;
  }

  async function checkAndFixVehicleCrew(vehicle, staffingMode) {
    const fmsBefore = await fetchVehicleFmsReal(vehicle.id);
    if (fmsBefore == null) throw new Error("FMS-Status nicht ermittelbar - sicherheitshalber abgebrochen.");
    if (!VEHICLE_FMS_AT_STATION.has(fmsBefore)) {
      throw new Error("Fahrzeug ist gerade im Einsatz - übersprungen, um nicht einzugreifen.");
    }

    let assignedNow = 0;
    const targetByRequirement = new Map();
    const hasFullRequirement = vehicle.requirements.some(req => req.min === null);
    if (vehicle.requirements.length) {
      for (const req of vehicle.requirements) {
        const target = req.min === null || staffingMode === "full" ? vehicle.staffMax : req.min;
        targetByRequirement.set(req.slug, target);
        assignedNow += await assignQualifiedPersonnelToVehicleForSlug(vehicle.id, req.slug, target, vehicle.staffMax);
      }
      // Bei TEIL-Anforderungen (z.B. NAW: nur 1 Notarzt noetig, staffMax aber 3) blieben die
      // uebrigen Plaetze bisher leer, selbst wenn reichlich unqualifiziertes Personal frei war -
      // die Schleife oben fuellt ja nur die Ausbildungs-Slugs selbst auf. Deshalb danach mit
      // BELIEBIGEM verfuegbarem Personal bis staffMin/staffMax auffuellen - aber nur, wenn KEINE
      // Anforderung "alle muessen das koennen" ist (min:null, z.B. ELW 2). Dort waere ein
      // zusaetzlicher, unpassend ausgebildeter Platz ein Verstoss gegen genau diese Anforderung,
      // ein unvollstaendig besetztes ELW 2 ist also weiterhin korrekt und gewollt.
      if (!hasFullRequirement) {
        const overallTarget = staffingMode === "full" ? vehicle.staffMax : vehicle.staffMin;
        assignedNow += await assignAnyPersonnelToVehicle(vehicle.id, overallTarget, vehicle.staffMax);
      }
    } else {
      const target = staffingMode === "full" ? vehicle.staffMax : vehicle.staffMin;
      assignedNow += await assignAnyPersonnelToVehicle(vehicle.id, target, vehicle.staffMax);
    }

    // Wechsel von "Volle Besatzung" zurueck auf "Minimum": ueberzaehliges Personal (aus einem
    // frueheren Voll-Lauf) wird jetzt wieder abgezogen statt nur stehen zu bleiben - so wird
    // es fuer andere Fahrzeuge wieder frei. Nicht bei Anforderungen, die immer auf staffMax
    // zielen (min:null).
    if (staffingMode !== "full" && !hasFullRequirement) {
      await trimVehicleCrewToStaffMin(vehicle);
    }

    const after = await fetchVehicleAssignmentPage(vehicle.id);
    const fullyStaffed = isVehicleFullyStaffed(after, vehicle);
    const assignedCount = after.people.filter(p => p.assignedHere).length;

    // Fuer eine verstaendliche Anzeige (statt "X/Y passend besetzt", das wie ein Bruchteil
    // der Gesamtkapazitaet aussieht, obwohl es die belegten Plaetze zaehlt): wie viel vom
    // TATSAECHLICH GEFORDERTEN Personal (je Anforderung das gleiche Ziel wie beim Zuweisen
    // oben) schon mit passender Ausbildung zugewiesen ist. Ueberzaehlige Treffer je
    // Anforderung werden auf ihr Ziel gedeckelt, damit Ueberbesetzung einer Anforderung
    // nicht die Zahl einer anderen kaschiert. Fahrzeuge ohne Anforderung zeigen stattdessen
    // Belegung gegen ihr Ziel (staffMin/staffMax je nach Modus).
    const assignedPeople = after.people.filter(p => p.assignedHere);
    let requiredPersonnel = 0;
    let trainedPersonnel = 0;
    if (vehicle.requirements.length) {
      for (const req of vehicle.requirements) {
        const target = targetByRequirement.get(req.slug);
        const matching = assignedPeople.filter(p => p.slugs.includes(req.slug)).length;
        requiredPersonnel += target;
        trainedPersonnel += Math.min(matching, target);
      }
    } else {
      requiredPersonnel = staffingMode === "full" ? vehicle.staffMax : vehicle.staffMin;
      trainedPersonnel = Math.min(assignedCount, requiredPersonnel);
    }

    if (fullyStaffed) {
      if (fmsBefore === VEHICLE_FMS_NOT_STAFFED) await setVehicleFms(vehicle.id, VEHICLE_FMS_READY);
    } else if (fmsBefore !== VEHICLE_FMS_NOT_STAFFED) {
      await setVehicleFms(vehicle.id, VEHICLE_FMS_NOT_STAFFED);
    }

    return { assignedNow, assignedCount, capacity: vehicle.staffMax, requiredPersonnel, trainedPersonnel, fullyStaffed };
  }

  // Zieht ALLE aktuell zugewiesenen Personen von einem Fahrzeug ab - nutzt denselben
  // "/vehicles/{id}/zuweisungDo/{personal_id}"-Endpunkt wie das Zuweisen (Button "btn-assigned",
  // Link-Text "Fahrzeugbindung entfernen"), per Live-Diagnose im Browser als Toggle bestaetigt.
  async function unassignAllPersonnelFromVehicle(vehicleId) {
    const { people } = await fetchVehicleAssignmentPage(vehicleId);
    const csrfToken = getCsrfTokenOrThrow(vehicleId);
    let removed = 0;
    for (const person of people) {
      if (!person.assignedHere || !person.unassignHref) continue;
      const res = await fetch(person.unassignHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (!res.ok) throw new Error(`Abziehen fehlgeschlagen (${res.status}).`);
      removed++;
      await new Promise(r => setTimeout(r, 100));
    }
    return removed;
  }

  // Kompletter Ablauf fuer EIN Fahrzeug bei "Alle Zuweisungen rueckgaengig machen": wie
  // checkAndFixVehicleCrew() bei Fahrzeugen im Einsatz vorsichtig (nie anfassen), zieht danach
  // die komplette Besatzung ab und setzt FMS 6 (nicht besetzt) - konsistent mit dem Rest des
  // Tools, das FMS 6 immer als "keine passende Besatzung" verwendet.
  async function clearVehicleCrew(vehicle) {
    const fmsBefore = await fetchVehicleFmsReal(vehicle.id);
    if (fmsBefore == null) throw new Error("FMS-Status nicht ermittelbar - sicherheitshalber übersprungen.");
    if (!VEHICLE_FMS_AT_STATION.has(fmsBefore)) {
      throw new Error("Fahrzeug ist gerade im Einsatz - übersprungen, um nicht einzugreifen.");
    }
    // Bewusst KEIN setVehicleFms(..., VEHICLE_FMS_NOT_STAFFED) hier (anders als
    // checkAndFixVehicleCrew): laut Rueckmeldung loest FMS 6 im Spiel eine automatische
    // Nachbesetzung aus - genau das Gegenteil von dem, was "Alle Zuweisungen rueckgaengig
    // machen" erreichen soll. Nur die Besatzung abziehen, FMS-Status unangetastet lassen.
    return await unassignAllPersonnelFromVehicle(vehicle.id);
  }

  const VEHICLE_CREW_CHECK_CONCURRENCY = 3;

  // Schritt 1 von Fahrzeug-Besatzung: Leitstelle(n) auswaehlen, damit Pruefen/Zuweisen sich
  // gezielt auf einen Teil des Accounts beschraenken laesst statt immer auf alles. Laedt die
  // volle Fahrzeugliste einmal hier und reicht sie an renderVehicleCrewScreen weiter, damit
  // beim "Weiter"-Klick kein zweiter Server-Roundtrip noetig ist.
  async function renderVehicleCrewLeitstelleSelection(goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("Fahrzeug-Besatzung › Leitstelle wählen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Fahrzeuge ...</em></p>`;

    let allVehicles;
    try {
      allVehicles = await loadCrewCheckVehicles();
    } catch (e) {
      body.innerHTML = `
        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>
        <div class="vn-sticky-footer">
          <button id="vn-btn-back" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
          </button>
        </div>
      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }

    const byLeitstelle = new Map();
    for (const v of allVehicles) {
      if (!byLeitstelle.has(v.leitstelleId)) byLeitstelle.set(v.leitstelleId, { name: v.leitstelleName, vehicles: [] });
      byLeitstelle.get(v.leitstelleId).vehicles.push(v);
    }

    const rows = [...byLeitstelle.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name, "de"))
      .map(([id, info]) => {
        const stationCount = new Set(info.vehicles.map(v => v.stationId)).size;
        return `
        <div class="checkbox" style="margin: 2px 0;">
          <label>
            <input type="checkbox" class="vn-crew-leitstelle-check" value="${escapeHtml(id)}" checked>
            ${escapeHtml(info.name)} <span class="text-muted">(${stationCount} Wachen, ${info.vehicles.length} Fahrzeuge)</span>
          </label>
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Fahrzeug-Besatzung nur für ausgewählte Leitstelle(n) prüfen und zuweisen - praktisch,
        um gezielt einen Teil des Accounts zu bearbeiten statt immer alle Fahrzeuge.
      </p>
      <div style="max-height: 380px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 4px;">
        ${rows || '<p class="text-muted"><em>Keine passenden Fahrzeuge gefunden.</em></p>'}
      </div>
      <div class="vn-sticky-footer">
        <button type="button" id="vn-btn-back" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-next-crew-leitstelle" type="button" class="btn btn-primary">
          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-next-crew-leitstelle").addEventListener("click", () => {
      const ids = [...body.querySelectorAll(".vn-crew-leitstelle-check:checked")].map(el => el.value);
      if (!ids.length) {
        alert("Bitte mindestens eine Leitstelle auswählen.");
        return;
      }
      renderVehicleCrewScreen(() => renderVehicleCrewLeitstelleSelection(goBack), allVehicles, ids);
    });
  }

  // Zeigt einem Fahrzeug/einer Wache-Kombination nach dem Pruefen als anklickbaren Link,
  // wenn es NICHT vollstaendig besetzt ist bzw. ein Fehler auftrat - direkt ins Fahrzeug im
  // Spiel, statt einer langen Tabelle ALLER Fahrzeuge (bei vielen Fahrzeugen unuebersichtlich).
  // "allVehiclesFull"/"selectedLeitstelleIds" kommen von renderVehicleCrewLeitstelleSelection
  // (bereits geladene Fahrzeugliste + gewaehlte Leitstellen) - ohne die beiden Parameter wird
  // wie bisher die komplette Liste geladen und ungefiltert gezeigt.
  async function renderVehicleCrewScreen(goBack = renderMainMenu, allVehiclesFull = null, selectedLeitstelleIds = null) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Fahrzeug-Besatzung");
    const body = document.getElementById("vehicle-naming-modal-body");

    let allVehicles = allVehiclesFull;
    if (!allVehicles) {
      body.innerHTML = `<p>Lade Fahrzeuge ...</p>`;
      try {
        allVehicles = await loadCrewCheckVehicles();
      } catch (e) {
        body.innerHTML = `
          <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>
          <div class="vn-sticky-footer">
            <button id="vn-btn-back" type="button" class="btn btn-default">
              <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
            </button>
          </div>
        `;
        document.getElementById("vn-btn-back").addEventListener("click", goBack);
        return;
      }
    }

    // "scopeVehicles" ist die durch die Leitstellen-Auswahl eingegrenzte Teilmenge von
    // allVehicles (= ALLE Fahrzeuge account-weit, fuer den Existenz-Abgleich der Problem-Liste
    // unten noetig) - ohne Leitstellen-Filter identisch zu allVehicles.
    const scopeVehicles = selectedLeitstelleIds
      ? allVehicles.filter(v => selectedLeitstelleIds.includes(v.leitstelleId))
      : allVehicles;

    let staffingMode = await getVehicleCrewStaffingMode();
    let includeNormal = await getVehicleCrewIncludeNormal();

    // "vehicles" ist immer die aktuell SICHTBARE Teilmenge (haengt von Leitstellen-Auswahl UND
    // includeNormal ab) - wird beim Umschalten der Checkbox neu berechnet, ohne die
    // Fahrzeugliste erneut vom Server zu laden (siehe loadCrewCheckVehicles: laedt bewusst
    // IMMER alle Fahrzeuge).
    let vehicles;
    let byCategory;
    function recomputeVisibleVehicles() {
      vehicles = scopeVehicles.filter(v => v.special || includeNormal);
      byCategory = new Map();
      for (const v of vehicles) {
        if (!byCategory.has(v.category)) byCategory.set(v.category, []);
        byCategory.get(v.category).push(v);
      }
    }
    recomputeVisibleVehicles();

    // Problem-Liste: "allProblemsById" haelt ALLE gespeicherten Eintraege (auch fuer Fahrzeuge
    // ausserhalb der aktuellen Leitstellen-Auswahl), "problemsById" nur die im aktuellen Scope
    // sichtbaren/bearbeitbaren. Wichtig: Speichern MUSS immer ueber persistProblems() laufen,
    // das problemsById wieder in allProblemsById zurueckmischt - sonst wuerden beim Speichern
    // waehrend eines Leitstellen-Filters die Eintraege ausserhalb des Scopes geloescht, obwohl
    // die zugehoerigen Fahrzeuge ja weiterhin existieren (siehe Kommentar bei VEHICLE_CREW_PROBLEMS_KEY).
    const vehiclesById = new Map(allVehicles.map(v => [v.id, v]));
    const scopedIds = new Set(scopeVehicles.map(v => v.id));
    const persistedProblems = await getVehicleCrewProblems();
    const allProblemsById = new Map(); // vehicleId -> { vehicle, message, since }
    for (const [id, { message, since }] of Object.entries(persistedProblems)) {
      const vehicle = vehiclesById.get(id);
      if (vehicle) allProblemsById.set(id, { vehicle, message, since });
    }
    if (Object.keys(persistedProblems).length !== allProblemsById.size) {
      await saveVehicleCrewProblems(allProblemsById); // nur echte Karteileichen (verkauft/umgebaut) raus
    }
    const problemsById = new Map([...allProblemsById].filter(([id]) => scopedIds.has(id)));

    async function persistProblems() {
      for (const id of [...allProblemsById.keys()]) {
        if (scopedIds.has(id) && !problemsById.has(id)) allProblemsById.delete(id);
      }
      for (const [id, entry] of problemsById) allProblemsById.set(id, entry);
      await saveVehicleCrewProblems(allProblemsById);
    }

    function formatSince(since) {
      if (!since) return "unbekannt";
      const d = new Date(since);
      return `${d.toLocaleDateString("de-DE")}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    }

    function renderProblemsRows() {
      const rows = [...problemsById.entries()].sort(
        ([, a], [, b]) =>
          a.vehicle.category.localeCompare(b.vehicle.category, "de") ||
          a.vehicle.stationName.localeCompare(b.vehicle.stationName, "de") ||
          a.vehicle.caption.localeCompare(b.vehicle.caption, "de"),
      );
      if (!rows.length) {
        return `<tr><td colspan="6" class="text-muted">Noch keine Probleme gefunden (oder noch nicht geprüft).</td></tr>`;
      }
      return rows
        .map(
          ([id, { vehicle, message, since }]) => `
            <tr>
              <td>${escapeHtml(vehicle.category)}</td>
              <td>${escapeHtml(vehicle.stationName)}</td>
              <td><a href="/vehicles/${escapeHtml(vehicle.id)}" target="_blank">${escapeHtml(vehicle.caption)}</a></td>
              <td class="text-danger">${escapeHtml(message || "")}</td>
              <td class="text-muted" style="white-space:nowrap;">${escapeHtml(formatSince(since))}</td>
              <td>
                <button type="button" class="btn btn-default btn-xs vn-crew-problem-remove" data-id="${escapeHtml(id)}"
                        title="Aus der Liste entfernen (macht keine Zuweisung rückgängig)">
                  <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
                </button>
              </td>
            </tr>
          `,
        )
        .join("");
    }

    function bindProblemsRowButtons() {
      body.querySelectorAll(".vn-crew-problem-remove").forEach(btn => {
        btn.addEventListener("click", async () => {
          problemsById.delete(btn.dataset.id);
          document.getElementById("vn-crew-problems-body").innerHTML = renderProblemsRows();
          bindProblemsRowButtons();
          await persistProblems();
        });
      });
    }

    function renderGroups() {
      if (!vehicles.length) {
        return `<p class="text-muted">Keine passenden Fahrzeuge gefunden.</p>`;
      }
      return CATEGORY_ORDER.filter(cat => byCategory.has(cat))
        .map(
          category => `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
              <span style="display:inline-block; min-width:140px;">
                <b>${escapeHtml(category)}</b>
                <span class="text-muted" style="font-size:11px;">(${byCategory.get(category).length})</span>
              </span>
              <button type="button" class="btn btn-primary btn-sm vn-crew-check-category" style="min-width:220px;" data-category="${escapeHtml(category)}">
                <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Alle ${escapeHtml(category)} prüfen &amp; zuweisen
              </button>
              <small class="text-muted vn-crew-category-status" data-category="${escapeHtml(category)}"></small>
            </div>
          `,
        )
        .join("");
    }

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Weist passend ausgebildetes Personal zu (z.B. Notarzt), optional auch normale
        Fahrzeuge. Setzt danach FMS 2 (besetzt) oder FMS 6 (nicht besetzt).
      </p>
      <div class="form-inline" style="margin-bottom:4px; display:flex; align-items:center; gap:8px;">
        <label style="font-size:12px; margin:0;">Bei Teil-Anforderungen (z.B. GRTW/NAW) zuweisen:</label>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-sm ${staffingMode === "min" ? "btn-primary" : "btn-default"} vn-crew-mode" data-mode="min">
            Nur Minimum (spart Personal)
          </button>
          <button type="button" class="btn btn-sm ${staffingMode === "full" ? "btn-danger" : "btn-default"} vn-crew-mode" data-mode="full">
            Volle Besatzung
          </button>
        </div>
      </div>
      <p id="vn-crew-mode-status" class="text-muted" style="font-size:11px; margin-bottom:10px;"></p>
      <div class="form-inline" style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
        <label style="font-size:12px; margin:0; font-weight:normal;">
          <input type="checkbox" id="vn-crew-include-normal" ${includeNormal ? "checked" : ""}>
          Normale Fahrzeuge (ohne Ausbildungsanforderung) einbeziehen
        </label>
      </div>
      <div id="vn-crew-groups">${renderGroups()}</div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:14px; margin-bottom:4px;">
        <b>Nicht vollständig besetzte Fahrzeuge (FMS 6) / Fehler</b>
        <button type="button" id="vn-btn-clear-problems" class="btn btn-default btn-xs">
          <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Liste leeren
        </button>
      </div>
      <div style="max-height:35vh; overflow:auto;">
        <table class="table table-condensed table-striped" style="font-size:12px;">
          <thead>
            <tr><th>Kategorie</th><th>Wache</th><th>Fahrzeug</th><th>Status</th><th>Seit</th><th></th></tr>
          </thead>
          <tbody id="vn-crew-problems-body">${renderProblemsRows()}</tbody>
        </table>
      </div>
      <div class="vn-sticky-footer" style="display:flex; justify-content:space-between;">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-btn-unassign-all" type="button" class="btn btn-danger">
          <span class="glyphicon glyphicon-remove-circle" aria-hidden="true"></span> Alle Zuweisungen rückgängig machen
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-unassign-all").addEventListener("click", () => {
      renderVehicleCrewUnassignAllConfirmScreen(scopeVehicles, () => renderVehicleCrewScreen(goBack, allVehicles, selectedLeitstelleIds));
    });
    bindProblemsRowButtons();

    function updateModeStatus() {
      const statusEl = document.getElementById("vn-crew-mode-status");
      statusEl.innerHTML =
        staffingMode === "full"
          ? `<span class="text-danger"><b>Aktiv: Volle Besatzung</b> - belegt bei Teil-Anforderungen gleich alle Plätze mit passender Ausbildung. Kann dazu führen, dass Personal knapp wird und andere Fahrzeuge leer bleiben.</span>`
          : `<b>Aktiv: Nur Minimum</b> - spart Personal für andere Fahrzeuge, belegt bei Teil-Anforderungen nur so viele Plätze wie wirklich nötig.`;
    }
    updateModeStatus();

    document.getElementById("vn-btn-clear-problems").addEventListener("click", async () => {
      if (!problemsById.size) return;
      const confirmed = confirm(
        `${problemsById.size} Einträge aus der Liste entfernen? Macht keine Zuweisung im Spiel rückgängig, nur unsere Anzeige.`,
      );
      if (!confirmed) return;
      problemsById.clear();
      document.getElementById("vn-crew-problems-body").innerHTML = renderProblemsRows();
      bindProblemsRowButtons();
      await persistProblems();
    });

    body.querySelectorAll(".vn-crew-mode").forEach(btn => {
      btn.addEventListener("click", async () => {
        staffingMode = btn.dataset.mode;
        await storeData(staffingMode, VEHICLE_CREW_STAFFING_MODE_KEY);
        body.querySelectorAll(".vn-crew-mode").forEach(b => {
          const active = b.dataset.mode === staffingMode;
          b.classList.toggle("btn-primary", active && staffingMode === "min");
          b.classList.toggle("btn-danger", active && staffingMode === "full");
          b.classList.toggle("btn-default", !active);
        });
        updateModeStatus();
      });
    });

    // category -> laufender Abbrechen-Zustand ({cancelled:false}), solange ein Lauf aktiv ist.
    // Ein zweiter Klick auf denselben (jetzt rot/"Abbrechen" beschrifteten) Button bricht den
    // laufenden Durchlauf ab, statt einen zweiten parallel zu starten.
    const runningCategoryRuns = new Map();

    function bindCategoryButtons() {
      body.querySelectorAll(".vn-crew-check-category").forEach(btn => {
        const category = btn.dataset.category;
        const originalLabel = btn.innerHTML;
        btn.addEventListener("click", async () => {
          const running = runningCategoryRuns.get(category);
          if (running) {
            running.cancelled = true;
            return;
          }

          const state = { cancelled: false };
          runningCategoryRuns.set(category, state);
          const categoryVehicles = byCategory.get(category) || [];
          const categoryStatusEl = body.querySelector(`.vn-crew-category-status[data-category="${btn.dataset.category}"]`);
          btn.classList.remove("btn-primary");
          btn.classList.add("btn-danger");
          btn.innerHTML = `<span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen`;

          let done = 0;
          let ok = 0;
          let failed = 0;
          categoryStatusEl.textContent = `0/${categoryVehicles.length} geprüft ...`;

          // WICHTIG: Faehrzeuge DERSELBEN Wache duerfen nie parallel von zwei Workern
          // bearbeitet werden - fetchVehicleAssignmentPage() zeigt den STATIONS-weiten
          // Personal-Pool, und zwei gleichzeitig geladene Schnappschuesse koennen dieselbe
          // freie Person beide als verfuegbar sehen (klassische Read-Then-Write-Race). Ergebnis
          // war genau das gemeldete Symptom: manche Fahrzeuge bleiben trotz genug freiem
          // Personal unbesetzt, ein erneuter Klick (wenn nichts mehr parallel laeuft) behebt es
          // dann zufaellig. Deshalb: Warteschlange aus ganzen WACHEN statt einzelner Fahrzeuge -
          // Fahrzeuge derselben Wache laufen dadurch immer strikt nacheinander, verschiedene
          // Wachen weiterhin parallel (die teilen sich ja kein Personal).
          const stationGroups = new Map();
          for (const v of categoryVehicles) {
            if (!stationGroups.has(v.stationId)) stationGroups.set(v.stationId, []);
            stationGroups.get(v.stationId).push(v);
          }
          const stationQueue = [...stationGroups.values()];

          let nextStationIndex = 0;
          async function worker() {
            while (nextStationIndex < stationQueue.length) {
              if (state.cancelled) return;
              const stationVehicles = stationQueue[nextStationIndex++];
              for (const vehicle of stationVehicles) {
                if (state.cancelled) return;
                try {
                  const result = await checkAndFixVehicleCrew(vehicle, staffingMode);
                  if (result.fullyStaffed) {
                    ok++;
                    problemsById.delete(vehicle.id);
                  } else {
                    failed++;
                    const existing = problemsById.get(vehicle.id);
                    problemsById.set(vehicle.id, {
                      vehicle,
                      message: `${result.trainedPersonnel}/${result.requiredPersonnel} erforderliches Personal zugewiesen`,
                      since: existing?.since || Date.now(),
                    });
                  }
                } catch (e) {
                  failed++;
                  const existing = problemsById.get(vehicle.id);
                  problemsById.set(vehicle.id, { vehicle, message: e.message, since: existing?.since || Date.now() });
                }
                done++;
                categoryStatusEl.textContent = `${done}/${categoryVehicles.length} geprüft (${ok} passen, ${failed} nicht/Fehler)`;
                document.getElementById("vn-crew-problems-body").innerHTML = renderProblemsRows();
                bindProblemsRowButtons();
                await persistProblems();
              }
            }
          }
          const workerCount = Math.min(VEHICLE_CREW_CHECK_CONCURRENCY, stationQueue.length);
          await Promise.all(Array.from({ length: workerCount }, () => worker()));

          if (state.cancelled) {
            categoryStatusEl.textContent = `Abgebrochen: ${done}/${categoryVehicles.length} geprüft (${ok} passen, ${failed} nicht/Fehler)`;
          }
          runningCategoryRuns.delete(category);
          btn.classList.remove("btn-danger");
          btn.classList.add("btn-primary");
          btn.innerHTML = originalLabel;
        });
      });
    }
    bindCategoryButtons();

    document.getElementById("vn-crew-include-normal").addEventListener("change", async e => {
      includeNormal = e.target.checked;
      await storeData(includeNormal, VEHICLE_CREW_INCLUDE_NORMAL_KEY);
      recomputeVisibleVehicles();
      document.getElementById("vn-crew-groups").innerHTML = renderGroups();
      bindCategoryButtons();
    });
  }

  // Eigenes Bestaetigungsfenster (Abbrechen/Bestaetigen, wie beim Fahrzeug-Verkaufen) statt
  // eines einfachen confirm() - zieht bei ALLEN Fahrzeugen im aktuellen Leitstellen-Scope
  // (unabhaengig von der "Normale Fahrzeuge einbeziehen"-Anzeige-Checkbox) die komplette
  // Besatzung ab. Bewusst OHNE getippte Bestaetigung (anders als "Speicher loeschen") - reicht
  // laut Rueckmeldung als Sicherung.
  function renderVehicleCrewUnassignAllConfirmScreen(vehicles, goBack) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("Fahrzeug-Besatzung › Alle Zuweisungen rückgängig machen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `
      <p class="text-danger"><b>Wirklich bei ${vehicles.length} Fahrzeugen die komplette Besatzung abziehen?</b></p>
      <p>
        Betrifft alle Fahrzeuge der aktuellen Leitstellen-Auswahl. Sofort wirksam im Spiel,
        nicht per Klick rückgängig zu machen. Fahrzeuge im Einsatz werden übersprungen.
      </p>
      <div id="vn-crew-unassign-confirm-status" style="margin-top:10px;"></div>
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen
        </button>
        <button id="vn-btn-unassign-confirm" type="button" class="btn btn-danger">
          <span class="glyphicon glyphicon-remove-circle" aria-hidden="true"></span> Besatzung abziehen
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);

    const confirmBtn = document.getElementById("vn-btn-unassign-confirm");
    const statusEl = document.getElementById("vn-crew-unassign-confirm-status");

    let cancelRun = null;
    confirmBtn.addEventListener("click", async () => {
      // Waehrend des Laufs wird aus dem Bestaetigen- ein Abbrechen-Button - bei vielen
      // Fahrzeugen kann das eine Weile dauern, ohne Abbrechen muesste man sonst warten.
      if (cancelRun) {
        cancelRun.cancelled = true;
        return;
      }
      const state = { cancelled: false };
      cancelRun = state;
      confirmBtn.classList.remove("btn-danger");
      confirmBtn.classList.add("btn-default");
      confirmBtn.innerHTML = `<span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen`;
      document.getElementById("vn-btn-back").disabled = true;

      // Wie beim Kategorie-Check: Fahrzeuge DERSELBEN Wache strikt nacheinander (teilen sich
      // den Personal-Pool), verschiedene Wachen parallel.
      const stationGroups = new Map();
      for (const v of vehicles) {
        if (!stationGroups.has(v.stationId)) stationGroups.set(v.stationId, []);
        stationGroups.get(v.stationId).push(v);
      }
      const stationQueue = [...stationGroups.values()];

      let done = 0;
      let removedTotal = 0;
      let failed = 0;
      let nextStationIndex = 0;
      async function worker() {
        while (nextStationIndex < stationQueue.length) {
          if (state.cancelled) return;
          const stationVehicles = stationQueue[nextStationIndex++];
          for (const vehicle of stationVehicles) {
            if (state.cancelled) return;
            try {
              removedTotal += await clearVehicleCrew(vehicle);
            } catch {
              failed++;
            }
            done++;
            statusEl.innerHTML = `<em>${done}/${vehicles.length} Fahrzeuge bearbeitet (${removedTotal} Personen abgezogen${failed ? `, ${failed} übersprungen/Fehler` : ""}) ...</em>`;
          }
        }
      }
      const workerCount = Math.min(VEHICLE_CREW_CHECK_CONCURRENCY, stationQueue.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      const cancelSuffix = state.cancelled ? " (abgebrochen)" : "";
      statusEl.innerHTML = `<span class="text-success">Fertig${cancelSuffix}: ${removedTotal} Personen von ${done}/${vehicles.length} Fahrzeugen abgezogen${failed ? ` (${failed} übersprungen/Fehler)` : ""}.</span>`;
      cancelRun = null;
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="glyphicon glyphicon-ok" aria-hidden="true"></span> Erledigt`;
      document.getElementById("vn-btn-back").disabled = false;
    });
  }

  //////////////////////////////////////////////////
  // Wachen-Bauplaner: Vorlagen, wie eine Wache eines bestimmten Typs ausgebaut/ausgestattet
  // sein soll (welche Ausbauten, welche Fahrzeuge in welcher Anzahl, wie viel Sollpersonal).
  // Konzept und Datenmodell (Bauplan-Felder, Verfuegbar/Zugewiesen-Doppelliste fuer Ausbauten)
  // vom Community-Script "Wachenbaupläne" (BOS-Ernie) uebernommen - die Personal-
  // Bedarfsrechnung nutzt aber UNSERE getVehicleTypeRequirement() (siehe Fahrzeug-Besatzung
  // oben), die echte Teil-Anforderungen korrekt beruecksichtigt (das Original-Script rechnet
  // das laut eigenem Kommentar bewusst nur naeherungsweise).
  //////////////////////////////////////////////////

  function generateBlueprintId() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 8 }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
  }

  // Alle Fahrzeugtypen, die an einem Gebaeude dieses Pseudo-Typs ueberhaupt stationiert
  // werden koennen (Katalog-Feld possibleBuildings nennt den ECHTEN building_type, nicht den
  // Pseudo-Typ - Kleinwachen teilen sich daher bewusst denselben Fahrzeug-Pool wie ihr
  // normales Pendant, das entspricht dem echten Spielverhalten).
  function getVehicleTypesForPseudoId(pseudoId) {
    const pseudo = PSEUDO_BUILDING_TYPES.find(t => t.id === pseudoId);
    if (!pseudo) return [];
    return Object.entries(vehicleTypeCatalog)
      .filter(([, v]) => Array.isArray(v.possibleBuildings) && v.possibleBuildings.includes(pseudo.buildingType))
      .map(([id, v]) => ({ id, name: v.caption }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  // Summiert den Personalbedarf ueber alle Fahrzeuge eines Bauplans (Anzahl * Bedarf pro
  // Fahrzeug) je Ausbildungs-Slug - geht IMMER von der minimalen Besatzung aus (staffMin), wie
  // sie auch die Fahrzeug-Besatzung im Minimum-Modus zuweist: bei "all"-Anforderungen muessen
  // dann alle staffMin Personen die Ausbildung haben, bei "min"-Anforderungen weiterhin deren
  // tatsaechliche Mindestzahl. So verlangt der Bauplan nicht mehr Personal, als fuer den
  // Betrieb der Fahrzeuge wirklich noetig ist (vorher: volle Besatzung/staffMax bei "all").
  function computeBlueprintPersonnelRequirements(blueprint) {
    const totals = new Map();
    for (const { vehicleTypeId, quantity } of blueprint.vehicles) {
      if (!(quantity > 0)) continue;
      const requirement = getVehicleTypeRequirement(Number(vehicleTypeId));
      if (!requirement) continue;
      for (const req of requirement.requirements) {
        const perVehicle = req.min === null ? requirement.staffMin : req.min;
        totals.set(req.slug, (totals.get(req.slug) || 0) + perVehicle * quantity);
      }
    }
    return totals;
  }

  // Personal-Anforderung fuer Personal-Check/Schulungen: statt einer separaten, manuell
  // gepflegten Konfiguration kommt sie jetzt direkt aus dem je Gebaeudetyp AKTIVEN
  // Wachenbauplan (pro Typ kann nur einer aktiv sein, siehe renderStationBlueprintEditScreen -
  // automatische Deaktivierung anderer Plaene desselben Typs beim Speichern). Gebaeudetypen
  // ganz ohne aktiven Bauplan fordern nichts (0) - dieselbe Form wie frueher
  // PERSONNEL_REQUIREMENTS_KEY ({ [pseudoId]: { [slug]: requiredCount } }), damit
  // computeTrainingNeeds()/personnelMissingCount() unveraendert bleiben koennen.
  async function computePersonnelRequirementsFromBlueprints() {
    const blueprints = await getStationBlueprints();
    const result = {};
    for (const blueprint of Object.values(blueprints)) {
      if (!blueprint.enabled) continue;
      const totals = computeBlueprintPersonnelRequirements(blueprint);
      const obj = {};
      for (const [slug, count] of totals) obj[slug] = count;
      result[blueprint.pseudoId] = obj;
    }
    return result;
  }

  function typeNameForPseudoId(pseudoId) {
    const pseudo = PSEUDO_BUILDING_TYPES.find(t => t.id === pseudoId);
    if (!pseudo) return "Unbekannt";
    const key = getBuildingKey({ building_type: pseudo.buildingType, small_building: pseudo.smallBuilding });
    return BUILDING_TYPE_NAMES[key] || `Typ ${key}`;
  }

  // Hauptmenü > "Wachen-Bauplaner": Liste aller Baupläne mit Bearbeiten/
  // Löschen/Exportieren/Importieren, plus je Bauplan ein direkter Sprung zur Anwenden-
  // Ansicht (siehe renderStationBlueprintApplyScreen).
  async function renderStationBlueprintsListScreen(goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Wachen-Bauplaner");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Baupläne ...</p>`;

    const blueprints = await getStationBlueprints();

    function renderRows() {
      const entries = Object.values(blueprints);
      if (!entries.length) {
        return `<tr><td colspan="6" class="text-muted">Noch keine Baupläne vorhanden.</td></tr>`;
      }
      return entries
        .sort((a, b) => a.name.localeCompare(b.name, "de"))
        .map(bp => {
          const vehicleCount = bp.vehicles.reduce((sum, v) => sum + v.quantity, 0);
          return `
            <tr>
              <td>${escapeHtml(bp.name)}</td>
              <td>${escapeHtml(typeNameForPseudoId(bp.pseudoId))}</td>
              <td><span class="label ${bp.enabled ? "label-success" : "label-default"}">${bp.enabled ? "Ja" : "Nein"}</span></td>
              <td>${bp.extensions.length}</td>
              <td>${vehicleCount} (${bp.vehicles.length} Typen)</td>
              <td>
                <button type="button" class="btn btn-primary btn-xs vn-bp-apply" data-id="${escapeHtml(bp.id)}" title="Anwenden">
                  <span class="glyphicon glyphicon-tasks" aria-hidden="true"></span>
                </button>
                <button type="button" class="btn btn-default btn-xs vn-bp-edit" data-id="${escapeHtml(bp.id)}" title="Bearbeiten">
                  <span class="glyphicon glyphicon-pencil" aria-hidden="true"></span>
                </button>
                <button type="button" class="btn btn-danger btn-xs vn-bp-delete" data-id="${escapeHtml(bp.id)}" title="Löschen">
                  <span class="glyphicon glyphicon-trash" aria-hidden="true"></span>
                </button>
                <button type="button" class="btn btn-default btn-xs vn-bp-export" data-id="${escapeHtml(bp.id)}" title="Exportieren">
                  <span class="glyphicon glyphicon-export" aria-hidden="true"></span>
                </button>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Legt fest, welche Ausbauten, Fahrzeuge (mit Anzahl) und wie viel Sollpersonal eine
        Wache eines bestimmten Typs haben soll - anwendbar über den Haken-Button je Bauplan,
        um zu sehen, welche passenden Wachen wovon noch wie viel brauchen.
      </p>
      <div style="margin-bottom:12px;">
        <button type="button" id="vn-bp-new" class="btn btn-primary btn-sm">
          <span class="glyphicon glyphicon-plus" aria-hidden="true"></span> Neuer Bauplan
        </button>
        <button type="button" id="vn-bp-import" class="btn btn-default btn-sm">
          <span class="glyphicon glyphicon-import" aria-hidden="true"></span> Bauplan importieren
        </button>
        <input type="file" id="vn-bp-import-file" accept="application/json" style="display:none;">
      </div>
      <div style="max-height:50vh; overflow:auto;">
        <table class="table table-condensed table-striped" style="font-size:12px;">
          <thead>
            <tr><th>Name</th><th>Gebäudetyp</th><th>Aktiv</th><th>Ausbauten</th><th>Fahrzeuge</th><th>Aktionen</th></tr>
          </thead>
          <tbody id="vn-bp-results-body">${renderRows()}</tbody>
        </table>
      </div>
      <div id="vn-bp-list-status" style="margin-top:6px;"></div>
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-bp-new").addEventListener("click", () => {
      renderStationBlueprintEditScreen(null, () => renderStationBlueprintsListScreen(goBack));
    });
    document.getElementById("vn-bp-import").addEventListener("click", () => {
      document.getElementById("vn-bp-import-file").click();
    });
    document.getElementById("vn-bp-import-file").addEventListener("change", async e => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const statusEl = document.getElementById("vn-bp-list-status");
      try {
        const imported = JSON.parse(await file.text());
        if (!imported?.id || !imported?.pseudoId) throw new Error("Datei ist kein gültiger Bauplan.");
        const current = await getStationBlueprints();
        if (current[imported.id] && !confirm(`Ein Bauplan mit dieser Id existiert bereits. Überschreiben?`)) {
          imported.id = generateBlueprintId();
        }
        current[imported.id] = imported;
        await saveStationBlueprints(current);
        renderStationBlueprintsListScreen(goBack);
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler beim Importieren: ${escapeHtml(e.message)}</span>`;
      }
    });

    body.querySelectorAll(".vn-bp-apply").forEach(btn => {
      btn.addEventListener("click", () => {
        renderStationBlueprintApplyScreen(btn.dataset.id, () => renderStationBlueprintsListScreen(goBack));
      });
    });
    body.querySelectorAll(".vn-bp-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        renderStationBlueprintEditScreen(btn.dataset.id, () => renderStationBlueprintsListScreen(goBack));
      });
    });
    body.querySelectorAll(".vn-bp-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Diesen Bauplan wirklich löschen?")) return;
        const current = await getStationBlueprints();
        delete current[btn.dataset.id];
        await saveStationBlueprints(current);
        renderStationBlueprintsListScreen(goBack);
      });
    });
    body.querySelectorAll(".vn-bp-export").forEach(btn => {
      btn.addEventListener("click", () => {
        const blueprint = blueprints[btn.dataset.id];
        if (!blueprint) return;
        const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bauplan_${blueprint.id}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    });
  }

  // Erstellen/Bearbeiten eines Bauplans: Gebäudetyp, Name, Ausbauten (Verfügbar/Zugewiesen-
  // Doppelliste wie beim Vorbild-Script "Wachenbaupläne" (BOS-Ernie), statt einer Reihe
  // Checkboxen - uebersichtlicher bei vielen Ausbauten), Fahrzeuge+Anzahl (aus dem Fahrzeug-
  // Katalog gefiltert nach Gebäudetyp) - das benötigte Personal wird daraus automatisch
  // berechnet (computeBlueprintPersonnelRequirements) und mit dem Sollpersonal verglichen.
  // Bewusst OHNE Regex-Namensfilter (gab es im Vorbild-Script) - unnoetige Komplexitaet, ein
  // Bauplan gilt einfach fuer alle Wachen des gewaehlten Gebäudetyps.
  async function renderStationBlueprintEditScreen(blueprintId, goBack) {
    setModalWidth(MODAL_WIDTH_WIDE);
    setScreenTitle("Wachen-Bauplaner › Bearbeiten");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade ...</p>`;

    const blueprints = await getStationBlueprints();
    const existing = blueprintId ? blueprints[blueprintId] : null;
    const id = existing?.id || generateBlueprintId();
    const qualifications = await getPersonnelQualifications();

    const pseudoOptions = PSEUDO_BUILDING_TYPES.map(t => ({ id: t.id, name: typeNameForPseudoId(t.id) })).sort(
      (a, b) => a.name.localeCompare(b.name, "de"),
    );

    function extensionCatalogForPseudoId(pseudoId) {
      if (!pseudoId) return [];
      const pseudo = PSEUDO_BUILDING_TYPES.find(t => t.id === pseudoId);
      const buildingKey = getBuildingKey({ building_type: pseudo.buildingType, small_building: pseudo.smallBuilding });
      return EXTENSION_CATALOG[buildingKey] || [];
    }

    function sortSelectOptions(select) {
      const opts = [...select.options].sort((a, b) => a.textContent.localeCompare(b.textContent, "de"));
      opts.forEach(o => select.appendChild(o));
    }

    // Liefert die <option>-Listen fuer die beiden Auswahl-Boxen (Verfuegbar/Zugewiesen) -
    // getrennt gerendert statt live per DOM-Move, damit ein Gebaeudetyp-Wechsel die Boxen
    // sauber neu aufbauen kann.
    function extensionListsHtml(pseudoId) {
      const catalog = [...extensionCatalogForPseudoId(pseudoId)].sort((a, b) => a.name.localeCompare(b.name, "de"));
      if (!pseudoId) return { available: "", assigned: "" };
      if (!catalog.length) return { available: "", assigned: "" };
      const selectedIds = new Set(existing?.pseudoId === pseudoId ? existing.extensions : []);
      const option = ext => `<option value="${ext.id}">${escapeHtml(ext.name)}</option>`;
      return {
        available: catalog
          .filter(e => !selectedIds.has(e.id))
          .map(option)
          .join(""),
        assigned: catalog
          .filter(e => selectedIds.has(e.id))
          .map(option)
          .join(""),
      };
    }

    function bindExtensionLists() {
      const availableSelect = document.getElementById("vn-bp-ext-available");
      const assignedSelect = document.getElementById("vn-bp-ext-assigned");
      const moveSelected = (from, to) => {
        [...from.selectedOptions].forEach(opt => to.appendChild(opt));
        sortSelectOptions(to);
      };
      document.getElementById("vn-bp-ext-add").addEventListener("click", () => moveSelected(availableSelect, assignedSelect));
      document.getElementById("vn-bp-ext-remove").addEventListener("click", () => moveSelected(assignedSelect, availableSelect));
      availableSelect.addEventListener("dblclick", e => {
        if (e.target.tagName !== "OPTION") return;
        assignedSelect.appendChild(e.target);
        sortSelectOptions(assignedSelect);
      });
      assignedSelect.addEventListener("dblclick", e => {
        if (e.target.tagName !== "OPTION") return;
        availableSelect.appendChild(e.target);
        sortSelectOptions(availableSelect);
      });
    }

    function vehicleInputsHtml(pseudoId) {
      if (!pseudoId) return `<p class="text-muted">Bitte zuerst Gebäudetyp wählen ...</p>`;
      const types = getVehicleTypesForPseudoId(pseudoId);
      if (!types.length) return `<p class="text-muted">Keine Fahrzeuge für diesen Gebäudetyp bekannt.</p>`;
      const quantities = new Map(
        (existing?.pseudoId === pseudoId ? existing.vehicles : []).map(v => [String(v.vehicleTypeId), v.quantity]),
      );
      return `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(230px,1fr)); gap:6px;">
          ${types
            .map(
              t => `
                <label style="display:flex; align-items:center; gap:6px; font-weight:normal; margin:0;">
                  <span style="flex:1;">${escapeHtml(t.name)}</span>
                  <input type="number" min="0" class="form-control input-sm vn-bp-vehicle-qty" data-vehicle-type-id="${t.id}"
                         value="${quantities.get(t.id) || 0}" style="width:70px;">
                </label>
              `,
            )
            .join("")}
        </div>
      `;
    }

    function bindVehicleQuantityInputs() {
      body.querySelectorAll(".vn-bp-vehicle-qty").forEach(input => {
        input.addEventListener("change", updatePersonnelRequirements);
      });
    }

    function updatePersonnelRequirements() {
      const vehicles = [...body.querySelectorAll(".vn-bp-vehicle-qty")].map(input => ({
        vehicleTypeId: input.dataset.vehicleTypeId,
        quantity: parseInt(input.value, 10) || 0,
      }));
      const totals = computeBlueprintPersonnelRequirements({ vehicles });
      const totalSum = [...totals.values()].reduce((a, b) => a + b, 0);
      const rows = [...totals.entries()]
        .sort((a, b) => (qualifications[a[0]] || a[0]).localeCompare(qualifications[b[0]] || b[0], "de"))
        .map(([slug, count]) => `<tr><td>${count}</td><td>${escapeHtml(qualifications[slug] || slug)}</td></tr>`)
        .join("");
      document.getElementById("vn-bp-personnel-body").innerHTML =
        rows || `<tr><td colspan="2" class="text-muted">Keine Ausbildung erforderlich.</td></tr>`;

      const setPoint = parseInt(document.getElementById("vn-bp-personnel-set-point").value, 10) || 0;
      const hintEl = document.getElementById("vn-bp-personnel-hint");
      hintEl.textContent = `Benötigt insgesamt: ${totalSum} Person(en).`;
      hintEl.className = setPoint < totalSum ? "text-danger" : "text-muted";
    }

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Das benötigte Personal wird automatisch aus den ausgewählten Fahrzeugen berechnet
        (gleiche Logik wie bei der Fahrzeug-Besatzung).
      </p>
      <div class="form-horizontal">
        <div class="form-group">
          <label class="col-sm-2 control-label">Name</label>
          <div class="col-sm-10">
            <input type="text" id="vn-bp-name" class="form-control" value="${escapeHtml(existing?.name || "")}" placeholder="leer = Gebäudetyp-Name (z.B. Rettungswache)">
          </div>
        </div>
        <div class="form-group">
          <label class="col-sm-2 control-label">Aktiv</label>
          <div class="col-sm-10">
            <label class="radio-inline"><input type="radio" name="vn-bp-enabled" value="yes" ${existing?.enabled !== false ? "checked" : ""}> Ja</label>
            <label class="radio-inline"><input type="radio" name="vn-bp-enabled" value="no" ${existing?.enabled === false ? "checked" : ""}> Nein</label>
          </div>
        </div>
        <div class="form-group">
          <label class="col-sm-2 control-label">Gebäudetyp</label>
          <div class="col-sm-10">
            <select id="vn-bp-pseudo-id" class="form-control">
              <option value="">Bitte wählen ...</option>
              ${pseudoOptions.map(o => `<option value="${o.id}" ${existing?.pseudoId === o.id ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="col-sm-2 control-label">Ausbauten</label>
          <div class="col-sm-10" id="vn-bp-extensions">
            ${(() => {
              const lists = extensionListsHtml(existing?.pseudoId || "");
              return `
                <div style="display:flex; gap:10px; align-items:flex-start;">
                  <div style="flex:1;">
                    <label class="text-muted" style="font-size:11px; font-weight:normal;">Verfügbar (Doppelklick zum Hinzufügen)</label>
                    <select id="vn-bp-ext-available" multiple size="8" class="form-control">${lists.available}</select>
                  </div>
                  <div style="display:flex; flex-direction:column; gap:6px; margin-top:20px;">
                    <button type="button" id="vn-bp-ext-add" class="btn btn-default btn-sm" title="Hinzufügen">
                      <span class="glyphicon glyphicon-chevron-right" aria-hidden="true"></span>
                    </button>
                    <button type="button" id="vn-bp-ext-remove" class="btn btn-default btn-sm" title="Entfernen">
                      <span class="glyphicon glyphicon-chevron-left" aria-hidden="true"></span>
                    </button>
                  </div>
                  <div style="flex:1;">
                    <label class="text-muted" style="font-size:11px; font-weight:normal;">Zugewiesen (Doppelklick zum Entfernen)</label>
                    <select id="vn-bp-ext-assigned" multiple size="8" class="form-control">${lists.assigned}</select>
                  </div>
                </div>
              `;
            })()}
          </div>
        </div>
        <div class="form-group">
          <label class="col-sm-2 control-label">Fahrzeuge</label>
          <div class="col-sm-10" id="vn-bp-vehicles">${vehicleInputsHtml(existing?.pseudoId || "")}</div>
        </div>
        <div class="form-group">
          <label class="col-sm-2 control-label">Benötigtes Personal</label>
          <div class="col-sm-10">
            <table class="table table-condensed" style="font-size:12px; max-width:400px;">
              <thead><tr><th>Anzahl</th><th>Ausbildung</th></tr></thead>
              <tbody id="vn-bp-personnel-body"></tbody>
            </table>
          </div>
        </div>
        <div class="form-group">
          <label class="col-sm-2 control-label">Sollpersonal</label>
          <div class="col-sm-10">
            <input type="number" min="0" id="vn-bp-personnel-set-point" class="form-control" style="max-width:120px;" value="${existing?.personnelSetPoint ?? 0}">
            <div id="vn-bp-personnel-hint" class="text-muted" style="font-size:11px; margin-top:4px;"></div>
          </div>
        </div>
      </div>
      <div id="vn-bp-edit-status" style="margin-top:6px;"></div>
      <div class="vn-sticky-footer">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen
        </button>
        <button id="vn-bp-save" type="button" class="btn btn-success">
          <span class="glyphicon glyphicon-floppy-disk" aria-hidden="true"></span> Speichern
        </button>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    bindVehicleQuantityInputs();
    bindExtensionLists();
    updatePersonnelRequirements();

    document.getElementById("vn-bp-pseudo-id").addEventListener("change", e => {
      const pseudoId = e.target.value;
      const lists = extensionListsHtml(pseudoId);
      document.getElementById("vn-bp-ext-available").innerHTML = lists.available;
      document.getElementById("vn-bp-ext-assigned").innerHTML = lists.assigned;
      document.getElementById("vn-bp-vehicles").innerHTML = vehicleInputsHtml(pseudoId);
      bindVehicleQuantityInputs();
      updatePersonnelRequirements();
    });
    document.getElementById("vn-bp-personnel-set-point").addEventListener("change", updatePersonnelRequirements);

    document.getElementById("vn-bp-save").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-bp-edit-status");
      const pseudoId = document.getElementById("vn-bp-pseudo-id").value;
      if (!pseudoId) {
        statusEl.innerHTML = `<span class="text-danger">Bitte Gebäudetyp angeben.</span>`;
        return;
      }
      // Leerer Name -> Gebaeudetyp-Name als Standard (z.B. "Feuerwache"), statt einen Namen
      // zu erzwingen.
      const typedName = document.getElementById("vn-bp-name").value.trim();
      const name = typedName || typeNameForPseudoId(pseudoId);

      const enabled = document.querySelector('input[name="vn-bp-enabled"]:checked')?.value !== "no";
      const extensions = [...document.getElementById("vn-bp-ext-assigned").options].map(opt => Number(opt.value));
      const vehicles = [...body.querySelectorAll(".vn-bp-vehicle-qty")]
        .map(input => ({ vehicleTypeId: Number(input.dataset.vehicleTypeId), quantity: parseInt(input.value, 10) || 0 }))
        .filter(v => v.quantity > 0);
      const personnelSetPoint = parseInt(document.getElementById("vn-bp-personnel-set-point").value, 10) || 0;

      const current = await getStationBlueprints();

      // Namensdopplung (unabhaengig von Gross/Kleinschreibung) mit einem ANDEREN Bauplan -
      // vorher fragen, ob dieser ersetzt werden soll, statt zwei gleich benannte Plaene
      // nebeneinander stehen zu haben (kann sonst z.B. beim Anwenden verwirren).
      const duplicate = Object.values(current).find(
        bp => bp.id !== id && bp.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        const confirmed = confirm(`Ein Bauplan mit dem Namen "${name}" existiert bereits. Diesen überschreiben (ersetzen)?`);
        if (!confirmed) {
          statusEl.innerHTML = `<span class="text-danger">Abgebrochen - bitte einen anderen Namen wählen.</span>`;
          return;
        }
        delete current[duplicate.id];
      }

      current[id] = {
        id,
        enabled,
        pseudoId,
        name,
        personnelSetPoint,
        extensions,
        vehicles,
      };

      // Pro Gebaeudetyp darf nur EIN Bauplan aktiv sein - dessen Fahrzeuge liefern
      // automatisch die Personal-Anforderung fuer Personal-Check/Schulungen (siehe
      // computePersonnelRequirementsFromBlueprints). Wird hier ein Plan aktiviert, alle
      // ANDEREN aktiven Plaene desselben Typs automatisch deaktivieren, statt das dem
      // Nutzer manuell zu ueberlassen.
      let deactivated = [];
      if (enabled) {
        deactivated = Object.values(current).filter(bp => bp.id !== id && bp.pseudoId === pseudoId && bp.enabled);
        deactivated.forEach(bp => {
          current[bp.id] = { ...bp, enabled: false };
        });
      }

      await saveStationBlueprints(current);

      if (deactivated.length) {
        statusEl.innerHTML = `<span class="text-success">Gespeichert. "${escapeHtml(deactivated.map(bp => bp.name).join('", "'))}" wurde automatisch deaktiviert (nur ein aktiver Bauplan je Gebäudetyp).</span>`;
        setTimeout(goBack, 1800);
      } else {
        goBack();
      }
    });
  }

  // Anwenden eines Bauplans: zeigt alle passenden Wachen (gleicher Gebäudetyp) mit Soll/Ist-
  // Vergleich fuer Ausbauten, Fahrzeuge und Personal. Ausbauten koennen direkt gebaut werden
  // (wiederverwendet buildExtension/renderBuildConfirmScreen aus dem Wachen-Check), fehlende
  // Fahrzeuge direkt gekauft (buyVehicle), Personal-Luecken verweisen auf Fahrzeug-Besatzung/
  // Schulungen.
  async function renderStationBlueprintApplyScreen(blueprintId, goBack) {
    setModalWidth(MODAL_WIDTH_WIDE);
    setScreenTitle("Wachen-Bauplaner › Anwenden");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade ...</p>`;

    const blueprints = await getStationBlueprints();
    const blueprint = blueprints[blueprintId];
    if (!blueprint) {
      body.innerHTML = `
        <p class="text-danger">Bauplan nicht gefunden.</p>
        <div class="vn-sticky-footer">
          <button id="vn-btn-back" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
          </button>
        </div>
      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }

    let allStations, vehicles, scanData, qualifications, scanMeta;
    try {
      [allStations, vehicles, scanData, qualifications, scanMeta] = await Promise.all([
        loadBuildingsForCheck(),
        fetchAllVehiclesV2(),
        getPersonnelScanData(),
        getPersonnelQualifications(),
        getPersonnelScanMeta(),
      ]);
    } catch (e) {
      body.innerHTML = `
        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>
        <div class="vn-sticky-footer">
          <button id="vn-btn-back" type="button" class="btn btn-default">
            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
          </button>
        </div>
      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }

    const matchingStations = allStations.filter(s => s.pseudoId === blueprint.pseudoId);

    // Je Wache+Typ nicht nur die Anzahl, sondern auch die echten Fahrzeug-ids (fuer den
    // Direktlink zu einem einzelnen ueberzaehligen Fahrzeug, siehe vehicleCell unten).
    const vehiclesByStationAndType = new Map();
    for (const v of vehicles) {
      const stationId = String(v.building_id ?? v.building);
      const typeId = String(v.vehicle_type ?? v.type);
      if (!vehiclesByStationAndType.has(stationId)) vehiclesByStationAndType.set(stationId, new Map());
      const byType = vehiclesByStationAndType.get(stationId);
      if (!byType.has(typeId)) byType.set(typeId, []);
      byType.get(typeId).push(String(v.id));
    }

    const requiredPersonnel = computeBlueprintPersonnelRequirements(blueprint);

    // Liefert neben dem fertigen HTML auch die Sortier-Kennzahlen einer Zeile (siehe
    // sortableColumns unten) - einmal pro Wache berechnet, nicht bei jedem Klick auf eine
    // Spaltenueberschrift neu.
    function buildStationRow(station) {
      const missingExtensionIds = blueprint.extensions.filter(extId => !station.extensions.some(e => e.type_id === extId));
      const catalog = EXTENSION_CATALOG[station.buildingKey] || [];
      const extensionCell = missingExtensionIds.length
        ? missingExtensionIds
            .map(extId => {
              const ext = catalog.find(e => e.id === extId);
              if (!ext) return `<span class="label label-default">Ausbau ${extId}</span>`;
              return `
                <button type="button" class="btn btn-xs btn-warning vn-bp-build-ext" style="margin:1px;"
                        data-station-id="${station.id}" data-ext-id="${ext.id}" data-name="${escapeHtml(ext.name)}"
                        data-cost="${ext.cost}" data-coins="${ext.coins}">
                  ${escapeHtml(ext.name)}
                </button>
              `;
            })
            .join("")
        : `<span class="label label-success">alle gebaut</span>`;

      const byType = vehiclesByStationAndType.get(station.id) || new Map();
      let vehicleDeficit = 0;
      let vehicleSurplus = 0;
      const vehicleCell = blueprint.vehicles
        .map(bv => {
          const ownIds = byType.get(String(bv.vehicleTypeId)) || [];
          const have = ownIds.length;
          const missing = Math.max(bv.quantity - have, 0);
          const surplus = Math.max(have - bv.quantity, 0);
          vehicleDeficit += missing;
          vehicleSurplus += surplus;
          const name = vehicleTypeCaptions[bv.vehicleTypeId] || `Typ ${bv.vehicleTypeId}`;
          const cssClass = surplus ? "label-danger" : missing ? "label-warning" : "label-success";
          const label = `<span class="label ${cssClass}" style="margin:1px;">${escapeHtml(name)} ${have}/${bv.quantity}</span>`;
          if (surplus) {
            const excessVehicleId = ownIds[ownIds.length - 1];
            return `${label}
              <button type="button" class="btn btn-xs btn-danger vn-bp-sell-vehicle" style="margin:1px;"
                      data-vehicle-id="${excessVehicleId}" data-name="${escapeHtml(name)}" data-station-id="${station.id}"
                      title="Verkauft eines der überzähligen Fahrzeuge">
                <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> ${surplus}x zu viel
              </button>`;
          }
          if (!missing) return label;
          const catalogEntry = vehicleTypeCatalog[bv.vehicleTypeId];
          if (!catalogEntry) return label;
          return `${label}
            <button type="button" class="btn btn-xs btn-primary vn-bp-buy-vehicle" style="margin:1px;"
                    data-station-id="${station.id}" data-vehicle-type-id="${bv.vehicleTypeId}" data-name="${escapeHtml(name)}"
                    data-missing="${missing}" data-cost="${(catalogEntry.credits || 0) * missing}" data-coins="${(catalogEntry.coins || 0) * missing}">
              <span class="glyphicon glyphicon-shopping-cart" aria-hidden="true"></span> ${missing}x kaufen
            </button>`;
        })
        .join(" ");

      const scan = scanData[station.id];
      let personnelDeficit = scan ? 0 : -1;
      const personnelCell = scan
        ? [...requiredPersonnel.entries()]
            .map(([slug, required]) => {
              const have = scan.counts[slug] || 0;
              if (have < required) personnelDeficit += required - have;
              const name = qualifications[slug] || slug;
              const cssClass = have >= required ? "label-success" : "label-warning";
              return `<span class="label ${cssClass}" style="margin:1px;">${escapeHtml(name)} ${have}/${required}</span>`;
            })
            .join(" ") || '<span class="text-muted">keine Anforderung</span>'
        : '<span class="label label-default">Nicht gescannt</span>';

      const html = `
        <tr>
          <td><a href="/buildings/${station.id}" target="_blank">${escapeHtml(station.name)}</a></td>
          <td>${extensionCell}</td>
          <td>${vehicleCell}</td>
          <td>${personnelCell}</td>
        </tr>
      `;
      return {
        html,
        sortValues: {
          station: station.name,
          extensions: missingExtensionIds.length,
          vehicles: vehicleDeficit + vehicleSurplus,
          personnel: personnelDeficit,
        },
      };
    }

    const rows = matchingStations.map(buildStationRow);

    const sortableColumns = [
      { key: "station", label: "Wache" },
      { key: "extensions", label: "Fehlende Ausbauten" },
      { key: "vehicles", label: "Fahrzeuge" },
      { key: "personnel", label: "Personal" },
    ];
    let sortState = { key: "station", dir: "asc" };

    function sortedRowsHtml() {
      const { key, dir } = sortState;
      const sorted = [...rows].sort((a, b) => {
        const av = a.sortValues[key];
        const bv = b.sortValues[key];
        const cmp = typeof av === "string" ? av.localeCompare(bv, "de") : av - bv;
        return dir === "asc" ? cmp : -cmp;
      });
      return sorted.map(r => r.html).join("") || `<tr><td colspan="4" class="text-muted">Keine passenden Wachen gefunden.</td></tr>`;
    }

    function theadHtml() {
      return `
        <tr>
          ${sortableColumns
            .map(col => {
              const arrow = sortState.key === col.key ? (sortState.dir === "asc" ? " ▲" : " ▼") : "";
              return `<th class="vn-bp-sort-header" data-key="${col.key}" style="cursor:pointer; user-select:none;">${escapeHtml(col.label)}${arrow}</th>`;
            })
            .join("")}
        </tr>
      `;
    }

    function bindSortHeaders() {
      body.querySelectorAll(".vn-bp-sort-header").forEach(th => {
        th.addEventListener("click", () => {
          const key = th.dataset.key;
          sortState = { key, dir: sortState.key === key && sortState.dir === "asc" ? "desc" : "asc" };
          document.getElementById("vn-bp-apply-thead").innerHTML = theadHtml();
          document.getElementById("vn-bp-apply-tbody").innerHTML = sortedRowsHtml();
          bindSortHeaders();
          bindRowActions();
        });
      });
    }

    function bindRowActions() {
      body.querySelectorAll(".vn-bp-build-ext").forEach(btn => {
        btn.addEventListener("click", () => {
          const stationName = matchingStations.find(s => s.id === btn.dataset.stationId)?.name;
          renderBuildConfirmScreen({
            title: btn.dataset.name,
            costCredits: Number(btn.dataset.cost),
            costCoins: Number(btn.dataset.coins),
            onConfirm: currency => buildExtension(btn.dataset.stationId, Number(btn.dataset.extId), currency),
            goBack: () => renderStationBlueprintApplyScreen(blueprintId, goBack),
            historyType: "extension",
            historyLabel: btn.dataset.name,
            historyStation: stationName,
          });
        });
      });

      body.querySelectorAll(".vn-bp-buy-vehicle").forEach(btn => {
        btn.addEventListener("click", () => {
          const stationName = matchingStations.find(s => s.id === btn.dataset.stationId)?.name;
          const missing = Number(btn.dataset.missing);
          renderBuildConfirmScreen({
            title: `${missing}x ${btn.dataset.name}`,
            costCredits: Number(btn.dataset.cost),
            costCoins: Number(btn.dataset.coins),
            onConfirm: async currency => {
              for (let i = 0; i < missing; i++) {
                await buyVehicle(btn.dataset.stationId, Number(btn.dataset.vehicleTypeId), currency);
              }
            },
            goBack: () => renderStationBlueprintApplyScreen(blueprintId, goBack),
            historyType: "vehicle",
            historyLabel: `${missing}x ${btn.dataset.name}`,
            historyStation: stationName,
          });
        });
      });

      body.querySelectorAll(".vn-bp-sell-vehicle").forEach(btn => {
        btn.addEventListener("click", () => {
          const stationName = matchingStations.find(s => s.id === btn.dataset.stationId)?.name;
          renderVehicleSellConfirmScreen({
            vehicleId: btn.dataset.vehicleId,
            vehicleName: btn.dataset.name,
            stationName,
            goBack: () => renderStationBlueprintApplyScreen(blueprintId, goBack),
          });
        });
      });
    }

    const lastScanLabel = scanMeta.lastScanAt
      ? `Personal-Stand: ${new Date(scanMeta.lastScanAt).toLocaleString("de-DE")}`
      : "Personal noch nie gescannt";

    body.innerHTML = `
      <p class="text-muted" style="font-size:12px;">
        Bauplan "<b>${escapeHtml(blueprint.name)}</b>" auf ${matchingStations.length} Wache(n)
        angewendet. Fehlende Ausbauten/Fahrzeuge direkt kaufen, überzählige (rot) verkaufen,
        Personal über Personal-Check/Schulungen/Fahrzeug-Besatzung nachrüsten.
      </p>
      <div style="max-height:60vh; overflow:auto;">
        <table class="table table-condensed table-striped" style="font-size:12px;">
          <thead id="vn-bp-apply-thead">${theadHtml()}</thead>
          <tbody id="vn-bp-apply-tbody">${sortedRowsHtml()}</tbody>
        </table>
      </div>
      <div class="vn-sticky-footer" style="display:flex; align-items:center; gap:10px;">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück
        </button>
        <button id="vn-bp-apply-refresh" type="button" class="btn btn-primary">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Aktualisieren
        </button>
        <span class="label label-default" style="font-size:12px;">${escapeHtml(lastScanLabel)}</span>
      </div>
    `;

    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    bindSortHeaders();
    bindRowActions();

    document.getElementById("vn-bp-apply-refresh").addEventListener("click", async () => {
      const btn = document.getElementById("vn-bp-apply-refresh");
      btn.disabled = true;
      body.insertAdjacentHTML(
        "beforeend",
        `<p id="vn-bp-apply-refresh-status"><em>Wachen, Fahrzeuge und Personal werden neu geladen ...</em></p>`,
      );
      try {
        await scanAllPersonnel((done, of) => {
          const statusEl = document.getElementById("vn-bp-apply-refresh-status");
          if (statusEl) statusEl.innerHTML = `<em>Personal wird neu gescannt ... (${done}/${of})</em>`;
        });
      } catch (e) {
        console.warn("[FuxTools] Personal-Rescan im Wachenbauplan fehlgeschlagen:", e);
      }
      renderStationBlueprintApplyScreen(blueprintId, goBack);
    });
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
    // allSettled statt all: initVehicleTypeCaptions() haengt von einer FREMDEN Seite ab
    // (api.lss-manager.de) und wirft bei jedem Netzwerk-Hakler (Adblocker, CORS, Seite kurz
    // down) - mit Promise.all wuerde DAS allein addMenuEntry()/checkForUpdateInBackground()
    // nie erreichen lassen, FuxTools waere dann komplett unsichtbar/unbedienbar. So bleiben
    // Menuepunkt und Update-Check auch bei fehlgeschlagenem Fahrzeug-Katalog nutzbar
    // (betroffene Funktionen wie Umbenennen/Wachen-Bauplaner zeigen dann nur leere Daten,
    // statt das ganze Script lahmzulegen).
    const initSteps = ["Modal-Grundgerüst", "Fahrzeug-Katalog", "Namens-Speicher"];
    const results = await Promise.allSettled([initModal(), initVehicleTypeCaptions(), initNamesStore()]);
    results.forEach((r, i) => {
      if (r.status === "rejected") reportError(`Initialisierung fehlgeschlagen (${initSteps[i]})`, r.reason);
    });
    addMenuEntry();
    checkForUpdateInBackground(); // gedrosselt, blockiert den Start nicht (kein await)
  }

  main();
})();
