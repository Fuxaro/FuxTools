// ==UserScript==
// @name        * FuxTools
// @namespace   custom.leitstellenspiel.de
// @version     0.1.5
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
  // WICHTIG: muss manuell synchron mit dem @version-Wert im Header oben gehalten werden
  const SCRIPT_VERSION = "0.1.5";

  // "stable" auf dem main-Branch, "beta" auf dem beta-Branch - identifiziert den
  // installierten Kanal in der UI (Einstellungen) und bestimmt, welcher Link zum
  // Wechseln angezeigt wird. Muss manuell pro Branch synchron mit CHANNEL,
  // @updateURL/@downloadURL im Header oben gehalten werden.
  const CHANNEL = "beta";
  const STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js";
  const BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/fuxtools.user.js";
  const UPDATE_CHECK_URL = CHANNEL === "beta" ? BETA_URL : STABLE_URL;

  // Hintergrund-Update-Check: wird beim Start und bei jedem Oeffnen des Hauptmenues
  // ausgeloest (gedrosselt), Ergebnis erscheint als Hinweis im Footer.
  let modalFooterEl = null;
  let availableUpdateVersion = null;
  let lastUpdateCheckAt = 0;
  const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

  // Wird beim Schliessen des Modals waehrend einer laufenden Umbenennung gesetzt,
  // damit die Umbenennungs-Schleife stoppt statt im Hintergrund weiterzulaufen.
  let renameCancelled = false;

  const modalId = "vehicle-naming-modal";
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

  // Loescht alle von FuxTools angelegten GM-Speicher-Eintraege (Namen/Bausteine-
  // Einstellungen + Fahrzeugtyp-Cache) - fuer den "Speicher loeschen"-Button in den
  // Einstellungen, simuliert damit den Zustand einer Neuinstallation.
  async function clearAllStoredData() {
    await GM.deleteValue("names");
    await GM.deleteValue(cacheKeyVehicleTypes);

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
    if (!res.ok) throw new Error(`Formular für Fahrzeug ${vehicleId} nicht ladbar (${res.status})`);
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
    modalFooter.style.cssText = "display:flex; align-items:center; font-size:11px; color:#888; padding:6px 12px;";
    modalFooterEl = modalFooter;
    renderFooter();

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
    // Seiten-jQuery ueber unsafeWindow: seit @grant nicht mehr "none" ist, laeuft das
    // Script in einer Sandbox und sieht das von der Seite geladene $/jQuery nicht direkt.
    const pageJQuery = unsafeWindow.jQuery || unsafeWindow.$;
    pageJQuery(modal).on("show.bs.modal", () => renderMainMenu());

    // Schliessen waehrend einer laufenden Umbenennung (X oben, Klick daneben, Escape)
    // soll die Umbenennung stoppen statt einfach im Hintergrund weiterzulaufen.
    pageJQuery(modal).on("hide.bs.modal", () => {
      renameCancelled = true;
    });
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
    const body = document.getElementById("vehicle-naming-modal-body");
    const username = getCurrentUsername();
    const greeting = username ? `Hey ${escapeHtml(username)}, was möchtest du tun?` : "Was möchtest du tun?";
    body.innerHTML = `
      <p>${greeting}</p>
      <div class="list-group">
        <button type="button" class="list-group-item" id="vn-menu-vehicles">
          <span class="glyphicon glyphicon-road" aria-hidden="true"></span>
          &nbsp; Fahrzeuge umbenennen
        </button>
        <button type="button" class="list-group-item" id="vn-menu-reset">
          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>
          &nbsp; Fahrzeuge zurücksetzen <span class="text-muted">(nur Typname, keine Nummer)</span>
        </button>
        <button type="button" class="list-group-item disabled" id="vn-menu-stations" disabled>
          <span class="glyphicon glyphicon-home" aria-hidden="true"></span>
          &nbsp; Wachen umbenennen <span class="text-muted">(bald verfügbar)</span>
        </button>
        <button type="button" class="list-group-item disabled" id="vn-menu-leitstellen" disabled>
          <span class="glyphicon glyphicon-map-marker" aria-hidden="true"></span>
          &nbsp; Leitstellen umbenennen <span class="text-muted">(bald verfügbar)</span>
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
  // Einstellungen: Kanal-Info + Update-Check (manuell und im Hintergrund)
  //////////////////////////////////////////////////

  function renderFooter() {
    if (!modalFooterEl) return;
    const channelSuffix = CHANNEL === "beta" ? " (Beta)" : "";
    const updateBadge = availableUpdateVersion
      ? `<a href="${UPDATE_CHECK_URL}" target="_blank" rel="noopener" style="color:#d9534f; font-weight:bold;">Update verfügbar (v${escapeHtml(availableUpdateVersion)})</a>`
      : "";
    // margin-left:auto auf der Versions-Span schiebt sie an den rechten Rand, egal ob
    // der Update-Hinweis davor existiert oder nicht (robuster als space-between mit
    // einem Platzhalter-Element, das je nach Inhalt/Whitespace die Verteilung kippt).
    modalFooterEl.innerHTML = `${updateBadge}<span style="margin-left:auto;">FuxTools v${escapeHtml(SCRIPT_VERSION)}${channelSuffix} · © Fuxaro · CC BY-NC-SA 4.0</span>`;
  }

  async function fetchRemoteVersion() {
    const res = await fetch(`${UPDATE_CHECK_URL}?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const match = text.match(/@version\s+([\d.]+)/);
    if (!match) throw new Error("Version im Remote-Script nicht gefunden.");
    return match[1];
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
        jedes Mal die Version hochzählen zu müssen.
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
      renderReloadOnlyScreen();
      window.open(`${UPDATE_CHECK_URL}?_=${Date.now()}`, "_blank", "noopener");
    });

    document.getElementById("vn-btn-check-update").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-update-status");
      statusEl.innerHTML = `<em>Suche nach Updates ...</em>`;
      try {
        const remoteVersion = await fetchRemoteVersion();

        if (isNewerVersion(remoteVersion, SCRIPT_VERSION)) {
          availableUpdateVersion = remoteVersion;
          statusEl.innerHTML = `
            <span class="text-success"><b>Update verfügbar: v${escapeHtml(remoteVersion)}</b></span><br>
            <a href="${UPDATE_CHECK_URL}" target="_blank" rel="noopener">Script öffnen, um zu aktualisieren</a>
            (Tampermonkey zeigt dann den Installations-/Update-Dialog).
          `;
        } else {
          availableUpdateVersion = null;
          statusEl.innerHTML = `<span class="text-success">Du bist bereits aktuell (v${escapeHtml(SCRIPT_VERSION)}).</span>`;
        }
        renderFooter();
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
  // Schritt 2: Namen pro Wache + Fahrzeugtyp vergeben
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

  function closeModal() {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const pageJQuery = unsafeWindow.jQuery || unsafeWindow.$;
    pageJQuery(modal).modal("hide");
  }

  // Exklusiver Screen nach "Neuinstallation erzwingen": bewusst OHNE andere Buttons
  // (kein Zurueck, kein Hauptmenue) - erst nach dem Neuladen soll man mit FuxTools
  // weiterarbeiten, damit man nicht mit der alten Version weitermacht, waehrend im
  // anderen Tab schon eine neue Version installiert wurde.
  function renderReloadOnlyScreen() {
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `
      <p>
        <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>
        Neuer Tab wird geöffnet - bitte dort die Installation/Aktualisierung in Tampermonkey bestätigen.
      </p>
      <p>Lade diese Seite danach neu, um mit der aktuellen Version weiterzumachen:</p>
      <button id="vn-btn-reload-page" type="button" class="btn btn-warning btn-lg">
        <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Seite neu laden
      </button>
    `;
    document.getElementById("vn-btn-reload-page").addEventListener("click", () => location.reload());
  }

  function renderCompletionScreen({ verb, done, failed, plan, errors, failedItems, goBack, cancelled }) {
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

    const cancelledNote = cancelled
      ? `<p class="text-warning"><b>Abgebrochen</b> nach ${done + failed} von ${plan.length} geplanten Fahrzeugen.</p>`
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
        <b>${done} Fahrzeug(e) ${verb}</b>${failed ? `, <span class="text-danger">${failed} fehlgeschlagen</span>` : ""}
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
        executeRenamePlan(failedItems, verb, goBack);
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

  // Zeit zwischen zwei Umbenennungen - bewusst nicht 0, um den Server nicht zu
  // fluten, aber deutlich kuerzer als frueher (700ms), um bei vielen Fahrzeugen
  // spuerbar schneller durchzukommen.
  const RENAME_DELAY_MS = 400;

  // Fuehrt einen Umbenennungs-/Reset-Plan aus (mit Fortschrittsbalken und Abbrechen-
  // Button) und zeigt am Ende die Abschluss-Ansicht. Wird auch fuer den "erneut
  // versuchen"-Button mit nur den zuvor fehlgeschlagenen Eintraegen wiederverwendet.
  //
  // Keine Nach-Verifikation ueber /api/vehicles mehr: der Vergleich lief zu schnell
  // nach dem Umbenennen und zeigte durch serverseitige Verzoegerung/Caching falsche
  // Abweichungen an, obwohl die Umbenennung tatsaechlich geklappt hatte. Ob ein
  // einzelnes Fahrzeug erfolgreich war, sagt weiterhin die HTTP-Antwort beim
  // Umbenennen selbst (done/failed unten).
  async function executeRenamePlan(plan, verb, goBack) {
    const body = document.getElementById("vehicle-naming-modal-body");
    renameCancelled = false;

    body.innerHTML = `
      <div class="progress" style="margin-bottom: 12px; height: 24px;">
        <div id="vn-exec-progress-bar" class="progress-bar" role="progressbar"
             style="width:0%; line-height:24px; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        </div>
      </div>
      <button id="vn-btn-cancel-run" type="button" class="btn btn-danger">
        <span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen
      </button>
    `;
    const progressBarEl = document.getElementById("vn-exec-progress-bar");
    document.getElementById("vn-btn-cancel-run").addEventListener("click", () => {
      renameCancelled = true;
    });

    let done = 0;
    const failedItems = [];
    const errors = [];
    let cancelled = false;

    for (let i = 0; i < plan.length; i++) {
      if (renameCancelled) {
        cancelled = true;
        break;
      }
      const item = plan[i];
      progressBarEl.style.width = `${Math.round(((i + 1) / plan.length) * 100)}%`;
      progressBarEl.textContent = `${i + 1}/${plan.length}: ${item.oldName || "(leer)"} -> ${item.newName}`;
      try {
        await renameVehicleWithRetry(item.id, item.newName);
        done++;
      } catch (e) {
        console.error("[FuxTools] Fehler bei Fahrzeug", item.id, e);
        failedItems.push(item);
        if (errors.length < 5) errors.push(`Fahrzeug ${item.id} (${item.newName}): ${e.message}`);
      }
      if (i < plan.length - 1 && !renameCancelled) await sleep(RENAME_DELAY_MS);
    }

    renderCompletionScreen({ verb, done, failed: failedItems.length, plan, errors, failedItems, goBack, cancelled });
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
