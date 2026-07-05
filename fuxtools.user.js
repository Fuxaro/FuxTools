// ==UserScript==
// @name        * FuxTools
// @namespace   custom.leitstellenspiel.de
// @version     0.1.4
// @author      Fuxaro
// @license     CC BY-NC-SA 4.0 - https://creativecommons.org/licenses/by-nc-sa/4.0/
// @description FuxTools - Wachen- und Fahrzeugverwaltung fuer leitstellenspiel.de: Wache(n) auswaehlen, pro Fahrzeugtyp einen Namen vergeben, automatisch durchnummeriert umbenennen oder zuruecksetzen.
// @match       https://www.leitstellenspiel.de/
// @match       https://polizei.leitstellenspiel.de/
// @icon        https://www.google.com/s2/favicons?sz=64&domain=leitstellenspiel.de
// @updateURL   https://raw.githubusercontent.com/Fuxaro/Fuxtools/main/fuxtools.user.js
// @downloadURL https://raw.githubusercontent.com/Fuxaro/Fuxtools/main/fuxtools.user.js
// @run-at      document-idle
// @grant       none
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
  // WICHTIG: muss manuell synchron mit dem @version-Wert im Header oben gehalten werden
  const SCRIPT_VERSION = "0.1.4";

  // "stable" auf dem main-Branch, "beta" auf dem beta-Branch - identifiziert den
  // installierten Kanal in der UI (Einstellungen) und bestimmt, welcher Link zum
  // Wechseln angezeigt wird. Muss manuell pro Branch synchron mit CHANNEL,
  // @updateURL/@downloadURL im Header oben gehalten werden.
  const CHANNEL = "stable";
  const STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js";
  const BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/fuxtools.user.js";
  const UPDATE_CHECK_URL = CHANNEL === "beta" ? BETA_URL : STABLE_URL;

  const modalId = "vehicle-naming-modal";
  const databaseName = "CustomVehicleNaming";
  const objectStoreName = "main";
  const cacheKeyVehicleTypes = "vehicleTypes";

  let vehicleTypeCaptions = {};
  let namesStore = {};

  // Kategorisierung der Gebaeudetypen (building_type-ID), analog zu LSSM's buildingCategories
  const BUILDING_CATEGORIES = {
    Feuerwehr: [0, 1, 18],
    Rettungsdienst: [2, 3, 5, 12, 15, 20, 21, 25],
    Polizei: [6, 8, 11, 13, 17, 19, 24],
    THW: [9, 10],
    Seenotrettung: [26, 27, 28],
    Sonstiges: [4, 7, 14, 16, 22, 23],
  };
  const BUILDING_TYPE_TO_CATEGORY = {};
  for (const [category, ids] of Object.entries(BUILDING_CATEGORIES)) {
    for (const id of ids) BUILDING_TYPE_TO_CATEGORY[id] = category;
  }
  const CATEGORY_ORDER = ["Feuerwehr", "Rettungsdienst", "Polizei", "THW", "Seenotrettung", "Sonstiges", "Unbekannt"];

  function categoryForBuilding(building) {
    const typeId = building?.building_type ?? building?.type;
    return BUILDING_TYPE_TO_CATEGORY[typeId] ?? "Unbekannt";
  }

  //////////////////////////////////////////////////
  // IndexedDB (wie im Wachenbauplaene-Script)
  //////////////////////////////////////////////////

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(databaseName, 1);

      request.onerror = () => reject("Failed to open the database");
      request.onsuccess = event => resolve(event.target.result);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(objectStoreName)) {
          db.createObjectStore(objectStoreName);
        }
      };
    });
  }

  async function storeData(data, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([objectStoreName], "readwrite");
      const store = tx.objectStore(objectStoreName);
      const request = store.put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject("Failed to store data");
    });
  }

  async function retrieveData(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([objectStoreName], "readonly");
      const store = tx.objectStore(objectStoreName);
      const request = store.get(key);
      request.onsuccess = event => resolve(event.target.result);
      request.onerror = () => reject("Failed to retrieve data");
    });
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

  async function loadGameData() {
    const [vehicles, buildings] = await Promise.all([
      fetchJSON("/api/vehicles"),
      fetchJSON("/api/buildings"),
    ]);
    const buildingsById = new Map(buildings.map(b => [String(b.id), b]));
    return { vehicles, buildingsById };
  }

  //////////////////////////////////////////////////
  // Umbenennen ueber das interne Inline-Formular der Seite
  //////////////////////////////////////////////////

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async function renameVehicle(vehicleId, newName) {
    // Schritt 1: das interne Formular-Fragment holen (enthaelt authenticity_token,
    // _method-Feld fuer PATCH/PUT, Formular-Action etc.)
    const res = await fetch(`/vehicles/${vehicleId}/editName`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Formular fuer Fahrzeug ${vehicleId} nicht ladbar (${res.status})`);
    const html = await res.text();

    // Wichtig: NICHT ins Dokument einhaengen und NICHT per form.submit()/trigger('submit')
    // abschicken - das fuehrt zu einer echten Seiten-Navigation (siehe Bug-Report) und
    // bricht die restliche Umbenennungs-Schleife ab.
    const container = document.createElement("div");
    container.innerHTML = html;

    const input =
      container.querySelector(`#vehicle_new_name_${vehicleId}`) ||
      container.querySelector('input[type="text"]');
    const form =
      container.querySelector(`#vehicle_form_${vehicleId}`) ||
      container.querySelector("form");
    if (!input || !form) throw new Error(`Formular-Elemente fuer Fahrzeug ${vehicleId} nicht gefunden.`);

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

    if (!res2.ok) throw new Error(`Speichern fuer Fahrzeug ${vehicleId} fehlgeschlagen (${res2.status})`);
  }

  //////////////////////////////////////////////////
  // Modal-Markup (Bootstrap, wie im Wachenbauplaene-Script)
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

  async function initModal() {
    if (document.getElementById(modalId)) return;

    const closeSpan = document.createElement("span");
    closeSpan.setAttribute("aria-hidden", "true");
    closeSpan.textContent = "\u00d7";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "close";
    closeButton.setAttribute("data-dismiss", "modal");
    closeButton.setAttribute("aria-label", "Close");
    closeButton.appendChild(closeSpan);

    const modalTitle = document.createElement("h4");
    modalTitle.id = "vehicle-naming-modal-title";
    modalTitle.className = "modal-title";
    modalTitle.textContent = CHANNEL === "beta" ? "FuxTools Beta" : "FuxTools";

    const modalHeader = document.createElement("div");
    modalHeader.className = "modal-header";
    modalHeader.appendChild(closeButton);
    modalHeader.appendChild(modalTitle);

    const modalBody = document.createElement("div");
    modalBody.className = "modal-body";
    modalBody.id = "vehicle-naming-modal-body";
    modalBody.innerHTML = `<p><em>Lade Wachen &amp; Fahrzeuge ...</em></p>`;

    const modalFooter = document.createElement("div");
    modalFooter.className = "modal-footer";
    modalFooter.style.cssText = "text-align:right; font-size:11px; color:#888; padding:6px 12px;";
    const channelSuffix = CHANNEL === "beta" ? " (Beta)" : "";
    modalFooter.textContent = `FuxTools v${SCRIPT_VERSION}${channelSuffix} \u00b7 \u00a9 Fuxaro \u00b7 CC BY-NC-SA 4.0`;

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content";
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);

    const modalDialog = document.createElement("div");
    modalDialog.className = "modal-dialog";
    modalDialog.role = "document";
    modalDialog.style.minWidth = "min(900px, 90%)";
    modalDialog.style.maxWidth = "min(900px, 90%)";
    modalDialog.appendChild(modalContent);

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
    $(modal).on("show.bs.modal", () => renderMainMenu());
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
    const body = document.getElementById("vehicle-naming-modal-body");
    const username = getCurrentUsername();
    const greeting = username ? `Hey ${escapeHtml(username)}, was moechtest du tun?` : "Was moechtest du tun?";
    body.innerHTML = `
      <p>${greeting}</p>
      <div class="list-group">
        <button type="button" class="list-group-item" id="vn-menu-vehicles">
          <span class="glyphicon glyphicon-road" aria-hidden="true"></span>
          &nbsp; Fahrzeuge umbenennen
        </button>
        <button type="button" class="list-group-item" id="vn-menu-reset">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>
          &nbsp; Fahrzeuge zuruecksetzen <span class="text-muted">(nur Typname, keine Nummer)</span>
        </button>
        <button type="button" class="list-group-item disabled" id="vn-menu-stations" disabled>
          <span class="glyphicon glyphicon-home" aria-hidden="true"></span>
          &nbsp; Wachen umbenennen <span class="text-muted">(bald verfuegbar)</span>
        </button>
        <button type="button" class="list-group-item disabled" id="vn-menu-leitstellen" disabled>
          <span class="glyphicon glyphicon-map-marker" aria-hidden="true"></span>
          &nbsp; Leitstellen umbenennen <span class="text-muted">(bald verfuegbar)</span>
        </button>
        <button type="button" class="list-group-item" id="vn-menu-settings">
          <span class="glyphicon glyphicon-cog" aria-hidden="true"></span>
          &nbsp; Einstellungen
        </button>
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
    document.getElementById("vn-menu-settings").addEventListener("click", renderSettingsScreen);
  }

  //////////////////////////////////////////////////
  // Einstellungen: Kanal-Info + manueller Update-Check
  //////////////////////////////////////////////////

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
    const body = document.getElementById("vehicle-naming-modal-body");
    const channelLabel = CHANNEL === "beta" ? "Beta" : "Stable";

    body.innerHTML = `
      <p><a href="#" id="vn-back-to-menu">&larr; Hauptmenue</a></p>
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
      </div>
      <div id="vn-update-status" style="margin-top: 10px;"></div>

      <hr>
      <p><b>Kanal wechseln</b></p>
      <p class="text-muted" style="font-size:12px;">
        ${
          CHANNEL === "beta"
            ? "Zurueck zum stabilen Kanal wechseln. Der Beta-Kanal kann Vorab-Versionen mit neuen, noch nicht final getesteten Funktionen enthalten."
            : "Zum Beta-Kanal wechseln, um neue Funktionen vorab zu testen, bevor sie im Stable-Kanal landen. Kann instabiler sein."
        }
      </p>
      <a id="vn-switch-channel" class="btn btn-default" href="${CHANNEL === "beta" ? STABLE_URL : BETA_URL}" target="_blank" rel="noopener">
        <span class="glyphicon glyphicon-transfer" aria-hidden="true"></span>
        ${CHANNEL === "beta" ? "Zu Stable wechseln" : "Zu Beta wechseln"}
      </a>
      <p class="text-muted" style="font-size:11px; margin-top:6px;">
        Oeffnet den Script-Code des anderen Kanals in einem neuen Tab. Tampermonkey erkennt es als
        Update dieses Scripts und fragt einmal um Bestaetigung - danach laeuft der neue Kanal
        inklusive Auto-Update, bis du hier erneut wechselst.
      </p>
    `;

    document.getElementById("vn-back-to-menu").addEventListener("click", e => {
      e.preventDefault();
      renderMainMenu();
    });

    document.getElementById("vn-btn-check-update").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-update-status");
      statusEl.innerHTML = `<em>Suche nach Updates ...</em>`;
      try {
        const res = await fetch(`${UPDATE_CHECK_URL}?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const match = text.match(/@version\s+([\d.]+)/);
        if (!match) throw new Error("Version im Remote-Script nicht gefunden.");
        const remoteVersion = match[1];

        if (isNewerVersion(remoteVersion, SCRIPT_VERSION)) {
          statusEl.innerHTML = `
            <span class="text-success"><b>Update verfuegbar: v${escapeHtml(remoteVersion)}</b></span><br>
            <a href="${UPDATE_CHECK_URL}" target="_blank" rel="noopener">Script oeffnen, um zu aktualisieren</a>
            (Tampermonkey zeigt dann den Installations-/Update-Dialog).
          `;
        } else {
          statusEl.innerHTML = `<span class="text-success">Du bist bereits aktuell (v${escapeHtml(SCRIPT_VERSION)}).</span>`;
        }
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler beim Suchen nach Updates: ${escapeHtml(e.message)}</span>`;
      }
    });
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
  // Schritt 1: Leitstelle(n) auswaehlen
  //////////////////////////////////////////////////

  let gameVehicles = [];
  let gameBuildingsById = new Map();
  let allStations = []; // alle Wachen mit Fahrzeugen, inkl. Leitstellen-Zuordnung
  let selectedLeitstelleIds = [];

  async function renderLeitstelleSelection() {
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
      <p><a href="#" id="vn-back-to-menu">&larr; Hauptmenue</a></p>
      <p>Waehle die Leitstelle(n) aus:</p>
      <div style="max-height: 380px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 4px; column-count: 2; column-gap: 20px;">
        ${rows || '<p class="text-muted"><em>Keine Leitstellen gefunden.</em></p>'}
      </div>
      <div class="form-group" style="margin-top: 14px;">
        <button id="vn-btn-next-leitstelle" type="button" class="btn btn-primary">
          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>
        </button>
      </div>
    `;

    document.getElementById("vn-back-to-menu").addEventListener("click", e => {
      e.preventDefault();
      renderMainMenu();
    });

    document.getElementById("vn-btn-next-leitstelle").addEventListener("click", () => {
      const ids = [...body.querySelectorAll(".vn-leitstelle-check:checked")].map(el => el.value);
      if (!ids.length) {
        alert("Bitte mindestens eine Leitstelle auswaehlen.");
        return;
      }
      selectedLeitstelleIds = ids;
      renderStationSelection();
    });
  }

  //////////////////////////////////////////////////
  // Schritt 2: Wachen auswaehlen (gefiltert auf die
  // zuvor gewaehlten Leitstellen, nach Kategorie sortiert)
  //////////////////////////////////////////////////

  function renderStationSelection() {
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
              alle auswaehlen
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
      <p><a href="#" id="vn-back-to-leitstelle">&larr; Leitstellen-Auswahl</a></p>
      <p>Waehle die Wachen aus, deren Fahrzeuge du umbenennen moechtest (Kategorie anklicken zum Auf-/Zuklappen):</p>
      <div style="max-height: 460px; overflow-y: auto; padding: 4px;">
        ${categoryBlocks || '<p class="text-muted"><em>Keine Fahrzeuge gefunden.</em></p>'}
      </div>
      <div class="form-group" style="margin-top: 14px;">
        <button id="vn-btn-next" type="button" class="btn btn-primary">
          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>
        </button>
      </div>
    `;

    document.getElementById("vn-back-to-leitstelle").addEventListener("click", e => {
      e.preventDefault();
      renderLeitstelleSelection();
    });

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
        alert("Bitte mindestens eine Wache auswaehlen.");
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
  // Schritt 2: Namen pro Wache + Fahrzeugtyp vergeben
  //////////////////////////////////////////////////

  const defaultTemplate = {
    useText1: false,
    text1: "",
    useType: true,
    useText2: false,
    text2: "",
    useNumber: true,
  };

  function getTemplate() {
    return Object.assign({}, defaultTemplate, namesStore.__template || {});
  }

  function renderNameForm(selectedStations) {
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

    const typeRows = [...byType.entries()]
      .sort((a, b) => a[1].caption.localeCompare(b[1].caption))
      .map(([typeId, info]) => {
        const savedName = namesStore[typeId] || "";
        return `
        <div class="form-group vn-type-row" data-type="${typeId}" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <label style="flex: 0 0 220px; margin: 0;">${escapeHtml(info.caption)} <span class="text-muted">(${info.count}x insgesamt)</span></label>
          <input type="text" class="form-control vn-name-input" placeholder="Name eingeben, z.B. LF" value="${escapeHtml(savedName)}" style="flex:1;">
        </div>`;
      })
      .join("");

    body.innerHTML = `
      <p class="text-muted">${selectedStations.length} Wache(n) ausgewaehlt.</p>
      <fieldset style="border:1px solid #ddd; border-radius:4px; padding:10px; margin-bottom:12px;">
        <legend style="font-size:13px; font-weight:bold; width:auto; padding:0 6px; margin-bottom:8px; border:none;">Namens-Bausteine</legend>
        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px;">
          <label style="display:flex; align-items:center; gap:4px; margin:0;">
            <input type="checkbox" id="vn-use-text1" ${tpl.useText1 ? "checked" : ""}> Text 1
          </label>
          <input type="text" id="vn-text1" class="form-control input-sm" style="width:140px;" placeholder="z.B. Bereitschaft" value="${escapeHtml(tpl.text1)}">

          <label style="display:flex; align-items:center; gap:4px; margin:0;">
            <input type="checkbox" id="vn-use-type" ${tpl.useType ? "checked" : ""}> Fahrzeugtyp-Name
          </label>

          <label style="display:flex; align-items:center; gap:4px; margin:0;">
            <input type="checkbox" id="vn-use-text2" ${tpl.useText2 ? "checked" : ""}> Text 2
          </label>
          <input type="text" id="vn-text2" class="form-control input-sm" style="width:140px;" placeholder="z.B. -SH-" value="${escapeHtml(tpl.text2)}">

          <label style="display:flex; align-items:center; gap:4px; margin:0;">
            <input type="checkbox" id="vn-use-number" ${tpl.useNumber ? "checked" : ""}> Nummer
          </label>
        </div>
        <p class="text-muted" style="font-size:11px; margin:8px 0 0;">
          Reihenfolge im Namen: Text 1 &rarr; Fahrzeugtyp-Name &rarr; Text 2 &rarr; Nummer. Deaktivierte oder leere
          Bausteine werden uebersprungen. Text 1/Text 2 gelten global fuer alle ausgewaehlten Fahrzeugtypen.
        </p>
      </fieldset>
      <p class="text-muted">Der Name pro Fahrzeugtyp gilt fuer alle ausgewaehlten Wachen. Nummeriert wird trotzdem <b>pro Wache separat</b> (jede Wache startet wieder bei der Start-Nummer). Leeres Feld = Typ wird nicht angefasst, auch wenn "Fahrzeugtyp-Name" oben deaktiviert ist.</p>
      <fieldset style="border:1px solid #ddd; border-radius:4px; padding:10px; margin-bottom:12px;">
        ${typeRows}
      </fieldset>
      <div class="form-inline" style="margin: 10px 0;">
        <label style="margin-right: 16px;">Start-Nummer
          <input type="number" id="vn-start-nr" class="form-control input-sm" value="1" style="width:70px; margin-left:6px;">
        </label>
        <label>
          <input type="checkbox" id="vn-padding" checked> Fuehrende Nullen (01, 02, ...)
        </label>
      </div>
      <div class="form-group">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurueck
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

    // Nummer-Felder ausgrauen, wenn der Baustein "Nummer" deaktiviert ist
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

  function renderCompletionScreen({ verb, done, failed, plan, errors, failedItems }) {
    const body = document.getElementById("vehicle-naming-modal-body");

    // Pro Wache zusammenfassen, statt jedes einzelne Fahrzeug aufzulisten
    const perStation = new Map();
    for (const item of plan) {
      perStation.set(item.station, (perStation.get(item.station) || 0) + 1);
    }
    const stationRows = [...perStation.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => `<li>${escapeHtml(name)}: ${count} Fahrzeug(e)</li>`)
      .join("");

    let errorBlock = "";
    if (errors.length) {
      errorBlock = `
        <p class="text-danger" style="margin-top:10px;"><b>Fehler (erste ${errors.length}):</b></p>
        <pre style="white-space:pre-wrap; font-size:11px;">${escapeHtml(errors.join("\n"))}</pre>
      `;
    }

    const retryButton =
      failedItems && failedItems.length
        ? `<button id="vn-btn-retry" type="button" class="btn btn-warning">
             <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span>
             Fehlgeschlagene erneut versuchen (${failedItems.length})
           </button>`
        : "";

    body.innerHTML = `
      <p>
        <span class="glyphicon glyphicon-ok-sign text-success" aria-hidden="true"></span>
        <b>${done} Fahrzeug(e) ${verb}</b>${failed ? `, <span class="text-danger">${failed} fehlgeschlagen</span>` : ""}
        (von ${plan.length} geplant).
      </p>
      <ul style="max-height: 200px; overflow-y: auto;">${stationRows}</ul>
      ${errorBlock}
      <p class="text-muted" style="font-size: 12px;">Lade die Seite neu, um die neuen Namen im Spiel zu sehen.</p>
      <div class="form-group" style="margin-top: 12px;">
        ${retryButton}
        <button id="vn-btn-finish" type="button" class="btn btn-primary">Beenden</button>
      </div>
    `;

    document.getElementById("vn-btn-finish").addEventListener("click", renderMainMenu);
    if (failedItems && failedItems.length) {
      document.getElementById("vn-btn-retry").addEventListener("click", () => {
        executeRenamePlan(failedItems, verb);
      });
    }
  }

  // Versucht ein Fahrzeug umzubenennen, mit einem automatischen zweiten Versuch
  // bei Fehlern (z.B. kurzer Lag/Verbindungsaussetzer).
  async function renameVehicleWithRetry(id, newName, maxAttempts = 2) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await renameVehicle(id, newName);
        return;
      } catch (e) {
        lastError = e;
        if (attempt < maxAttempts) await sleep(1000);
      }
    }
    throw lastError;
  }

  // Fuehrt einen Umbenennungs-/Reset-Plan aus (mit Fortschrittsanzeige) und zeigt
  // am Ende die Abschluss-Ansicht. Wird auch fuer den "erneut versuchen"-Button
  // mit nur den zuvor fehlgeschlagenen Eintraegen wiederverwendet.
  async function executeRenamePlan(plan, verb) {
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p id="vn-exec-status" style="font-weight: bold; white-space: pre-wrap;"></p>`;
    const progressEl = document.getElementById("vn-exec-status");

    let done = 0;
    const failedItems = [];
    const errors = [];

    for (const item of plan) {
      progressEl.textContent = `${done + failedItems.length + 1}/${plan.length}: ${item.oldName || "(leer)"} -> ${item.newName}`;
      try {
        await renameVehicleWithRetry(item.id, item.newName);
        done++;
      } catch (e) {
        console.error("[FuxTools] Fehler bei Fahrzeug", item.id, e);
        failedItems.push(item);
        if (errors.length < 5) errors.push(`Fahrzeug ${item.id} (${item.newName}): ${e.message}`);
      }
      await sleep(700);
    }

    renderCompletionScreen({ verb, done, failed: failedItems.length, plan, errors, failedItems });
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
      const baseName = input.value.trim();
      const typeId = row.dataset.type;
      if (!baseName) {
        delete namesStore[typeId];
        return;
      }
      namesStore[typeId] = baseName;

      // Nummerierung laeuft pro Wache separat, auch wenn der Name global gilt.
      // Wir benennen der Einfachheit halber immer um, unabhaengig vom aktuellen Namen.
      for (const station of selectedStations) {
        const vList = station.vehicles
          .filter(v => String(v.vehicle_type ?? v.type) === typeId)
          .sort((a, b) => a.id - b.id);

        vList.forEach((v, idx) => {
          const segments = [];
          if (tpl.useText1 && tpl.text1) segments.push(tpl.text1);
          if (tpl.useType) segments.push(baseName);
          if (tpl.useText2 && tpl.text2) segments.push(tpl.text2);
          if (tpl.useNumber) {
            const nr = startNr + idx;
            segments.push(padding ? String(nr).padStart(2, "0") : String(nr));
          }
          const newName = segments.join(" ") || baseName;
          plan.push({ id: v.id, oldName: v.caption, newName, station: station.name });
        });
      }
    });

    await saveNamesStore();

    if (!plan.length) {
      statusEl.textContent = "Keine Fahrzeugtypen mit Namen ausgefuellt.";
      return;
    }

    await executeRenamePlan(plan, "umbenannt");
  }

  //////////////////////////////////////////////////
  // Zuruecksetzen: alle Fahrzeuge der ausgewaehlten
  // Wachen auf ihren reinen Fahrzeugtyp-Namen zuruecksetzen
  //////////////////////////////////////////////////

  function renderResetScreen(selectedStations) {
    const body = document.getElementById("vehicle-naming-modal-body");
    const totalVehicles = selectedStations.reduce((sum, s) => sum + s.vehicles.length, 0);

    body.innerHTML = `
      <p class="text-muted">${selectedStations.length} Wache(n) ausgewaehlt.</p>
      <p>Alle <b>${totalVehicles}</b> Fahrzeuge in diesen Wachen werden auf ihren reinen Fahrzeugtyp-Namen zurueckgesetzt (keine Nummer, kein Praefix).</p>
      <div class="form-group">
        <button id="vn-btn-back" type="button" class="btn btn-default">
          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurueck
        </button>
        <button id="vn-btn-reset" type="button" class="btn btn-danger">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Auf Standard zuruecksetzen
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

    await executeRenamePlan(plan, "zurueckgesetzt");
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
    await Promise.all([initModal(), initVehicleTypeCaptions(), initNamesStore()]);
    addMenuEntry();
  }

  main();
})();
