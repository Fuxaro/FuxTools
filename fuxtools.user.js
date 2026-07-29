// ==UserScript==
// @name        * FuxTools
// @namespace   custom.leitstellenspiel.de
// @version     1.0.6
// @author      Fuxaro
// @license     CC BY-NC-SA 4.0 - https://creativecommons.org/licenses/by-nc-sa/4.0/
// @description FuxTools - Wachen- und Fahrzeugverwaltung für leitstellenspiel.de: Wache(n) auswählen, pro Fahrzeugtyp einen Namen vergeben, automatisch durchnummeriert umbenennen oder zurücksetzen.
// @match       https://www.leitstellenspiel.de/
// @match       https://polizei.leitstellenspiel.de/
// @icon        https://raw.githubusercontent.com/Fuxaro/FuxTools/main/logo-small.png
// @updateURL   https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js
// @downloadURL https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js
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
//
// Credits: einige Konzepte sind von anderen Community-Skripten fuer leitstellenspiel.de
// inspiriert (Gebaeude- & Fuhrparkverwalter von BOS-Ernie & Thomas Felber, Personalzuweiser
// und Wachenbauplaene von BOS-Ernie, FMS6 von LaLeLu4153) - Details siehe README.md. Der
// Fahrzeug-Katalog stammt von api.lss-manager.de (reiner Datenabruf, siehe README.md).
// -----------------------------------------------------------------------------

(async function() {
  const SCRIPT_VERSION = "1.0.6";
  const CHANNEL = "stable";
  const STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/fuxtools.user.js";
  const BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/fuxtools.user.js";
  const UPDATE_CHECK_URL = CHANNEL === "beta" ? BETA_URL : STABLE_URL;
  const LOGO_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/logo-small.png";
  const VEHICLE_TYPES_FALLBACK_STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/data/vehicle-types-fallback.json";
  const VEHICLE_TYPES_FALLBACK_BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/data/vehicle-types-fallback.json";
  const VEHICLE_TYPES_FALLBACK_URL = CHANNEL === "beta" ? VEHICLE_TYPES_FALLBACK_BETA_URL : VEHICLE_TYPES_FALLBACK_STABLE_URL;
  const CHANGELOG_STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/CHANGELOG.md";
  const CHANGELOG_BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/CHANGELOG.md";
  const CHANGELOG_URL = CHANNEL === "beta" ? CHANGELOG_BETA_URL : CHANGELOG_STABLE_URL;
  const HOW_IT_WORKS_STABLE_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/main/HOW_IT_WORKS.md";
  const HOW_IT_WORKS_BETA_URL = "https://raw.githubusercontent.com/Fuxaro/FuxTools/beta/HOW_IT_WORKS.md";
  const HOW_IT_WORKS_URL = CHANNEL === "beta" ? HOW_IT_WORKS_BETA_URL : HOW_IT_WORKS_STABLE_URL;
  let modalFooterEl = null;
  let availableUpdateVersion = null;
  let lastUpdateCheckAt = 0;
  const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1e3;
  let pendingReloadAfterUpdate = false;
  let renameCancelled = false;
  let levelBuildCancelled = false;
  let backgroundTaskBadgeEl = null;
  let taskCenterEntryEl = null;
  const backgroundTaskQueue = [];
  let activeBackgroundTask = null;
  let finishedBackgroundTask = null;
  let activeCrewCategoryRunCount = 0;
  const runningCategoryRuns = new Map;
  const finishedCrewCategoryRuns = new Map;
  function isBackgroundTaskSlotBusy() {
    return !!activeBackgroundTask || activeCrewCategoryRunCount > 0;
  }
  function updateBackgroundTaskBadge() {
    if (!backgroundTaskBadgeEl || !taskCenterEntryEl) return;
    taskCenterEntryEl.style.display = "";
    if (isBackgroundTaskSlotBusy()) {
      const total = (activeBackgroundTask ? 1 : 0) + runningCategoryRuns.size + backgroundTaskQueue.length;
      backgroundTaskBadgeEl.innerHTML = `<span class="glyphicon glyphicon-refresh vn-task-spin" aria-hidden="true"></span>`;
      taskCenterEntryEl.title = total > 1 ? `FuxTools - ${total} Aufgaben laufen im Hintergrund` : "FuxTools - Aufgabe läuft im Hintergrund";
    } else if (finishedBackgroundTask || finishedCrewCategoryRuns.size > 0) {
      backgroundTaskBadgeEl.innerHTML = `<span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>`;
      taskCenterEntryEl.title = "FuxTools - Aufgabe fertig, klicken zum Ansehen";
    } else {
      backgroundTaskBadgeEl.innerHTML = `<span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>`;
      taskCenterEntryEl.title = "FuxTools - Aufgaben-Übersicht (nichts aktiv)";
    }
  }
  function updateBackgroundTaskProgress(percent, text) {
    if (!activeBackgroundTask) return;
    activeBackgroundTask.percent = percent;
    activeBackgroundTask.progressText = text;
    const bar = document.getElementById("vn-exec-progress-bar");
    const txt = document.getElementById("vn-exec-progress-text");
    if (bar) bar.style.width = `${percent}%`;
    if (txt) txt.textContent = text;
    const tcBar = document.getElementById("vn-tc-rename-bar");
    const tcTxt = document.getElementById("vn-tc-rename-text");
    if (tcBar) tcBar.style.width = `${percent}%`;
    if (tcTxt) tcTxt.textContent = text;
  }
  function renderBackgroundTaskProgressScreen() {
    if (!activeBackgroundTask) return;
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle(activeBackgroundTask.title);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">Läuft im Hintergrund weiter, auch wenn du dieses Fenster schließt.</p>\n      <div class="progress" style="position:relative; margin-bottom: 12px; height: 24px;">\n        <div id="vn-exec-progress-bar" class="progress-bar" role="progressbar" style="width:${activeBackgroundTask.percent || 0}%;"></div>\n        <div id="vn-exec-progress-text" style="position:absolute; top:0; left:0; right:0; height:24px;\n             line-height:24px; font-size:12px; text-align:center; color:#000; white-space:nowrap;\n             overflow:hidden; text-overflow:ellipsis; padding:0 6px;">${escapeHtml(activeBackgroundTask.progressText || "")}</div>\n      </div>\n      <button id="vn-btn-cancel-run" type="button" class="btn btn-danger">\n        <span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen\n      </button>\n    `;
    document.getElementById("vn-btn-cancel-run").addEventListener("click", () => activeBackgroundTask?.cancel());
  }
  function runOrQueueBackgroundTask(title, start) {
    if (isBackgroundTaskSlotBusy()) {
      backgroundTaskQueue.push({
        title: title,
        start: start
      });
      return "queued";
    }
    start(false);
    return "started";
  }
  function tryStartNextQueuedBackgroundTask() {
    if (isBackgroundTaskSlotBusy() || !backgroundTaskQueue.length) return;
    const next = backgroundTaskQueue.shift();
    next.start(true);
  }
  function beginBackgroundTask(title, cancel) {
    activeBackgroundTask = {
      title: title,
      percent: 0,
      progressText: "",
      cancel: cancel
    };
    finishedBackgroundTask = null;
    updateBackgroundTaskBadge();
    refreshTaskCenterIfVisible();
  }
  function finishBackgroundTask(title, renderResult, shownLive) {
    activeBackgroundTask = null;
    finishedBackgroundTask = shownLive ? null : {
      title: title,
      renderResult: renderResult
    };
    updateBackgroundTaskBadge();
    tryStartNextQueuedBackgroundTask();
    refreshTaskCenterIfVisible();
  }
  function renderBackgroundTaskQueuedScreen(title, goBack) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle(title);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p>\n        <span class="glyphicon glyphicon-time" aria-hidden="true"></span>\n        <b>${escapeHtml(activeBackgroundTask ? activeBackgroundTask.title : "Fahrzeug-Besatzung")}</b> läuft noch -\n        <b>${escapeHtml(title)}</b> startet automatisch danach (Warteschlange, um nicht zu viele Anfragen\n        gleichzeitig zu stellen).\n      </p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
  }
  function renderTaskCenterScreen() {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("FuxTools-Aufgaben");
    const body = document.getElementById("vehicle-naming-modal-body");
    const items = [];
    if (activeBackgroundTask) {
      items.push(`\n        <div class="vn-task-center-item">\n          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">\n            <b>${escapeHtml(activeBackgroundTask.title)}</b>\n            <button type="button" class="btn btn-danger btn-xs vn-task-center-cancel" data-kind="rename">\n              <span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen\n            </button>\n          </div>\n          <div class="progress" style="margin:6px 0 2px; height:16px;">\n            <div id="vn-tc-rename-bar" class="progress-bar" style="width:${activeBackgroundTask.percent || 0}%;"></div>\n          </div>\n          <div id="vn-tc-rename-text" class="text-muted" style="font-size:11px;">${escapeHtml(activeBackgroundTask.progressText || "")}</div>\n        </div>\n      `);
    }
    for (const [category, state] of runningCategoryRuns) {
      const percent = state.total > 0 ? Math.round(state.done / state.total * 100) : 0;
      items.push(`\n        <div class="vn-task-center-item">\n          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">\n            <b>Fahrzeug-Besatzung: ${escapeHtml(category)}</b>\n            <button type="button" class="btn btn-danger btn-xs vn-task-center-cancel" data-kind="crew" data-category="${escapeHtml(category)}">\n              <span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen\n            </button>\n          </div>\n          <div class="progress" style="margin:6px 0 2px; height:16px;">\n            <div class="progress-bar vn-tc-crew-bar" data-category="${escapeHtml(category)}" style="width:${percent}%;"></div>\n          </div>\n          <div class="text-muted vn-tc-crew-text" data-category="${escapeHtml(category)}" style="font-size:11px;">${escapeHtml(state.statusText || "läuft ...")}</div>\n        </div>\n      `);
    }
    for (const queued of backgroundTaskQueue) {
      items.push(`\n        <div class="vn-task-center-item text-muted">\n          <span class="glyphicon glyphicon-time" aria-hidden="true"></span> ${escapeHtml(queued.title)} - wartet, bis Platz frei ist ...\n        </div>\n      `);
    }
    const finishedBlocks = [];
    if (finishedBackgroundTask) {
      finishedBlocks.push(`\n        <div class="vn-task-center-item">\n          <span class="glyphicon glyphicon-ok-sign text-success" aria-hidden="true"></span>\n          <b>${escapeHtml(finishedBackgroundTask.title)}</b> ist fertig.\n          <button type="button" id="vn-task-center-view-result" class="btn btn-primary btn-xs" style="margin-left:8px;">\n            Ergebnis ansehen\n          </button>\n        </div>\n      `);
    }
    for (const [category, info] of finishedCrewCategoryRuns) {
      finishedBlocks.push(`\n        <div class="vn-task-center-item">\n          <span class="glyphicon glyphicon-ok-sign text-success" aria-hidden="true"></span>\n          <b>Fahrzeug-Besatzung: ${escapeHtml(category)}</b> ist fertig - ${escapeHtml(info.summary)}\n          <button type="button" class="btn btn-default btn-xs vn-task-center-dismiss-crew" data-category="${escapeHtml(category)}" style="margin-left:8px;">\n            Gesehen\n          </button>\n        </div>\n      `);
    }
    const emptyState = !items.length && !finishedBlocks.length ? `<p class="text-muted">Nichts in der Warteschlange - keine Hintergrund-Aufgaben gerade am Laufen.</p>` : "";
    body.innerHTML = `\n      <div id="vn-task-center-marker" style="display:none;"></div>\n      <p class="text-muted" style="font-size:12px;">Laufende und wartende Aufgaben im Hintergrund.</p>\n      ${finishedBlocks.join("")}\n      ${items.join("")}\n      ${emptyState}\n      <div id="vn-tc-schoolings"></div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Verlauf\n        </button>\n      </div>\n    `;
    loadRunningSchoolingsOverview().then(runs => {
      const container = document.getElementById("vn-tc-schoolings");
      if (!container || !runs.length) return;
      container.innerHTML = `\n          <p class="text-muted" style="font-size:12px; margin:10px 0 4px;"><b>Laufende Schulungen</b></p>\n          ${runs.map(r => `\n                <div class="vn-task-center-item text-muted" style="display:flex; justify-content:space-between; gap:8px;">\n                  <span><span class="glyphicon glyphicon-education" aria-hidden="true"></span> <b>${escapeHtml(r.schoolName)}</b>: ${escapeHtml(r.title)}</span>\n                  <span>fertig ${escapeHtml(new Date(r.finishAt).toLocaleString("de-DE"))}</span>\n                </div>\n              `).join("")}\n        `;
    }).catch(e => console.warn("[FuxTools] Laufende Schulungen konnten nicht geladen werden:", e));
    document.getElementById("vn-btn-back").addEventListener("click", renderHistoryScreen);
    body.querySelectorAll(".vn-task-center-dismiss-crew").forEach(btn => {
      btn.addEventListener("click", () => {
        finishedCrewCategoryRuns.delete(btn.dataset.category);
        updateBackgroundTaskBadge();
        renderTaskCenterScreen();
      });
    });
    document.getElementById("vn-task-center-view-result")?.addEventListener("click", () => {
      finishedBackgroundTask.renderResult();
      finishedBackgroundTask = null;
      updateBackgroundTaskBadge();
    });
    body.querySelectorAll(".vn-task-center-cancel").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.dataset.kind === "rename") {
          activeBackgroundTask?.cancel();
        } else {
          const state = runningCategoryRuns.get(btn.dataset.category);
          if (state) state.cancelled = true;
        }
        btn.disabled = true;
        btn.innerHTML = `<span class="glyphicon glyphicon-hourglass" aria-hidden="true"></span> Wird beendet ...`;
      });
    });
  }
  function refreshTaskCenterIfVisible() {
    if (document.getElementById("vn-task-center-marker")) renderTaskCenterScreen();
  }
  const MODAL_WIDTH_COMPACT = 520;
  const MODAL_WIDTH_DEFAULT = 900;
  const MODAL_WIDTH_WIDE = 1400;
  function setModalWidth(px) {
    const dialog = document.getElementById("vehicle-naming-modal-dialog");
    if (!dialog) return;
    dialog.style.minWidth = `min(${px}px, 95%)`;
    dialog.style.maxWidth = `min(${px}px, 95%)`;
  }
  function setScreenTitle(text) {
    const el = document.getElementById("vehicle-naming-modal-breadcrumb");
    if (el) el.textContent = text ? `› ${text}` : "";
  }
  function showErrorBanner(message) {
    let container = document.getElementById("fuxtools-error-toasts");
    if (!container) {
      container = document.createElement("div");
      container.id = "fuxtools-error-toasts";
      container.style.cssText = "position:fixed; bottom:16px; right:16px; z-index:99999; max-width:380px; " + "display:flex; flex-direction:column; gap:8px; font-family:sans-serif;";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.style.cssText = "background:#d9534f; color:#fff; padding:10px 32px 10px 14px; border-radius:4px; " + "box-shadow:0 2px 10px rgba(0,0,0,0.4); font-size:13px; line-height:1.4; position:relative;";
    toast.innerHTML = `<b>FuxTools-Fehler:</b> ${escapeHtml(message)}`;
    const closeBtn = document.createElement("span");
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Schließen");
    closeBtn.style.cssText = "position:absolute; top:4px; right:10px; cursor:pointer; font-weight:bold; font-size:16px; line-height:1;";
    closeBtn.addEventListener("click", () => toast.remove());
    toast.appendChild(closeBtn);
    container.appendChild(toast);
  }
  function reportError(context, error) {
    const message = error?.message || String(error);
    console.error(`[FuxTools] ${context}:`, error);
    showErrorBanner(`${context} - ${message}`);
    logErrorToStorage(context, message).catch(e => console.error("[FuxTools] Fehlerprotokoll konnte nicht gespeichert werden:", e));
  }
  window.addEventListener("unhandledrejection", e => {
    if (e.reason?.name === "NotAllowedError") return;
    reportError("Unerwarteter Fehler", e.reason);
  });
  const modalId = "vehicle-naming-modal";
  const cacheKeyVehicleTypes = "vehicleTypes";
  let vehicleTypeCaptions = {};
  let vehicleTypeCatalog = {};
  let namesStore = {};
  const BUILDING_CATEGORIES = {
    Feuerwehr: [ 0 ],
    Rettungsdienst: [ 2, 5, 12, 15, 21, 25 ],
    "Krankenhäuser & Schulen": [ 1, 3, 4, 8, 10, 27 ],
    Polizei: [ 6, 11, 13, 17, 24, 29 ],
    THW: [ 9 ],
    Seenotrettung: [ 26, 28 ],
    Sonstiges: [ 7, 14, 16, 22, 23 ]
  };
  const BUILDING_TYPE_TO_CATEGORY = {};
  for (const [category, ids] of Object.entries(BUILDING_CATEGORIES)) {
    for (const id of ids) BUILDING_TYPE_TO_CATEGORY[id] = category;
  }
  const CATEGORY_ORDER = [ "Feuerwehr", "Rettungsdienst", "Krankenhäuser & Schulen", "Polizei", "THW", "Seenotrettung", "Sonstiges", "Unbekannt" ];
  function categoryForBuilding(building) {
    const typeId = building?.building_type ?? building?.type;
    return BUILDING_TYPE_TO_CATEGORY[typeId] ?? "Unbekannt";
  }
  function sortStationsByCategory(stations, {sortColumn: sortColumn, sortAscending: sortAscending, alwaysGroupByCategory: alwaysGroupByCategory, columnDiff: columnDiff}) {
    const dir = sortAscending ? 1 : -1;
    return [ ...stations ].sort((a, b) => {
      if (alwaysGroupByCategory || sortColumn === "category") {
        const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        if (catDiff !== 0) return catDiff;
      }
      if (sortColumn === "category") return a.name.localeCompare(b.name);
      const diff = columnDiff(a, b);
      return diff !== 0 ? diff * dir : a.name.localeCompare(b.name);
    });
  }
  const PSEUDO_BUILDING_TYPES = [ {
    id: "0",
    buildingType: 0,
    smallBuilding: false
  }, {
    id: "1",
    buildingType: 1,
    smallBuilding: false
  }, {
    id: "2",
    buildingType: 2,
    smallBuilding: false
  }, {
    id: "3",
    buildingType: 3,
    smallBuilding: false
  }, {
    id: "4",
    buildingType: 4,
    smallBuilding: false
  }, {
    id: "5",
    buildingType: 5,
    smallBuilding: false
  }, {
    id: "6",
    buildingType: 6,
    smallBuilding: false
  }, {
    id: "7",
    buildingType: 7,
    smallBuilding: false
  }, {
    id: "8",
    buildingType: 8,
    smallBuilding: false
  }, {
    id: "9",
    buildingType: 9,
    smallBuilding: false
  }, {
    id: "10",
    buildingType: 10,
    smallBuilding: false
  }, {
    id: "11",
    buildingType: 11,
    smallBuilding: false
  }, {
    id: "12",
    buildingType: 12,
    smallBuilding: false
  }, {
    id: "13",
    buildingType: 13,
    smallBuilding: false
  }, {
    id: "14",
    buildingType: 14,
    smallBuilding: false
  }, {
    id: "15",
    buildingType: 15,
    smallBuilding: false
  }, {
    id: "17",
    buildingType: 17,
    smallBuilding: false
  }, {
    id: "18",
    buildingType: 0,
    smallBuilding: true
  }, {
    id: "19",
    buildingType: 6,
    smallBuilding: true
  }, {
    id: "20",
    buildingType: 2,
    smallBuilding: true
  }, {
    id: "21",
    buildingType: 21,
    smallBuilding: false
  }, {
    id: "24",
    buildingType: 24,
    smallBuilding: false
  }, {
    id: "25",
    buildingType: 25,
    smallBuilding: false
  }, {
    id: "26",
    buildingType: 26,
    smallBuilding: false
  }, {
    id: "27",
    buildingType: 27,
    smallBuilding: false
  }, {
    id: "28",
    buildingType: 28,
    smallBuilding: false
  }, {
    id: "29",
    buildingType: 29,
    smallBuilding: false
  } ];
  function getPseudoBuildingTypeId(building) {
    const entry = PSEUDO_BUILDING_TYPES.find(t => t.buildingType === building.building_type && t.smallBuilding === !!building.small_building);
    return entry ? entry.id : null;
  }
  const FIRE_VEHICLE_CATEGORY_ORDER = [ "Löschfahrzeuge", "Tanklöschfahrzeuge", "Schlauchwagen", "Andere Fahrzeuge", "Rettungsdienst", "Wasserrettung", "Werkfeuerwehr", "Flughafen", "Logistik-Fahrzeuge", "Netzersatzanlagen", "Lüfter", "Drohnen", "Verpflegungsdienst", "Bahnrettung", "Sonderlöschmittel", "Abrollbehälter" ];
  const FIRE_VEHICLE_NAME_CATEGORIES = {
    "Löschfahrzeuge": [ "HLF10", "HLF20", "LF20", "LF10", "TSF-W", "KLF", "MLF", "LF8/6", "LF20/16", "LF10/6", "LF16-TS" ],
    "Tanklöschfahrzeuge": [ "PTLF4000", "GTLF" ],
    Schlauchwagen: [ "GW-L2-Wasser", "SW1000", "SW2000", "SW2000-Tr", "SW-KatS", "SW Kats", "Anh Schlauch" ],
    "Andere Fahrzeuge": [ "DLK23", "ELW1", "RW", "GW-A", "GW-Öl", "GW-Messtechnik", "GW-Gefahrgut", "GW-Höhenrettung", "ELW2", "MTW", "Dekon-P", "FwK", "Kleintankwagen", "Tankwagen" ],
    Rettungsdienst: [ "RTW", "NEF", "KTW", "GRTW", "NAW", "ITW" ],
    Wasserrettung: [ "GW-Taucher", "GW-Wasserrettung", "MZB" ],
    Werkfeuerwehr: [ "GW-Werkfeuerwehr", "ULF mit Löscharm", "TM50", "Turbolöscher" ],
    Flughafen: [ "FLF", "Rettungstreppe" ],
    "Logistik-Fahrzeuge": [ "GW-L1", "GW-L2", "MTF-L", "LF-L", "AB-L" ],
    Netzersatzanlagen: [ "NEA50", "NEA200", "AB-NEA50", "AB-NEA200" ],
    "Lüfter": [ "GW-Lüfter", "Anh Lüfter", "AB-Lüfter" ],
    Drohnen: [ "MTF-Drohne", "MTF Drohne", "ELW-Drohne", "ELW Drohne", "ELW2-Drohne", "ELW2 Drohne" ],
    Verpflegungsdienst: [ "GW-Verpflegung", "GW-Küche", "MTW-Verpflegung", "FKH" ],
    Bahnrettung: [ "RW-Schiene", "HLF-Schiene", "HLF Schiene", "AB-Schiene" ],
    "Sonderlöschmittel": [ "SLF", "Anh Sonderlöschmittel", "AB-Sonderlöschmittel", "AB-Wasser/Schaum" ],
    "Abrollbehälter": [ "WLF" ]
  };
  function normalizeFireVehicleName(name) {
    return String(name || "").toUpperCase().replace(/\s+/g, "");
  }
  const FIRE_VEHICLE_NAME_LOOKUP = new Map;
  for (const [category, names] of Object.entries(FIRE_VEHICLE_NAME_CATEGORIES)) {
    for (const name of names) FIRE_VEHICLE_NAME_LOOKUP.set(normalizeFireVehicleName(name), category);
  }
  function categorizeFireVehicleName(name) {
    const normalized = normalizeFireVehicleName(name);
    const exact = FIRE_VEHICLE_NAME_LOOKUP.get(normalized);
    if (exact) return exact;
    if (normalized.startsWith("TLF")) return "Tanklöschfahrzeuge";
    if (normalized.startsWith("AB-")) return "Abrollbehälter";
    return "Andere Fahrzeuge";
  }
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
    "29_normal": "Autobahnpolizei"
  };
  const RECOMMENDED_EXTENSIONS_BY_PSEUDO_ID = {
    0: [ 16, 18, 25 ],
    1: [ 0, 1, 2 ],
    2: [],
    3: [ 0, 1, 2 ],
    4: [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ],
    5: [],
    6: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16 ],
    8: [ 0, 1, 2 ],
    9: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15 ],
    10: [ 0, 1, 2 ],
    11: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ],
    12: [ 0, 1, 3, 4, 5, 6 ],
    13: [],
    15: [],
    17: [],
    18: [ 18 ],
    19: [ 0, 1, 12 ],
    20: [],
    21: [],
    24: [],
    25: [ 0, 1, 2, 3 ],
    26: [],
    27: [ 0, 1, 2 ],
    28: [],
    29: []
  };
  function getBuildingKey(building) {
    return `${building.building_type}_${building.small_building ? "small" : "normal"}`;
  }
  const EXTENSION_CATALOG = {
    "0_normal": [ {
      id: 0,
      name: "Rettungsdienst",
      cost: 1e5,
      coins: 20
    }, {
      id: 1,
      name: "1te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 2,
      name: "2te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 3,
      name: "3te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 4,
      name: "4te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 5,
      name: "5te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 6,
      name: "Wasserrettung",
      cost: 4e5,
      coins: 25
    }, {
      id: 7,
      name: "6te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 8,
      name: "Flughafenfeuerwehr",
      cost: 3e5,
      coins: 25
    }, {
      id: 9,
      name: "Großwache",
      cost: 1e6,
      coins: 50
    }, {
      id: 10,
      name: "7te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 11,
      name: "8te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 12,
      name: "9te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 13,
      name: "Werkfeuerwehr",
      cost: 1e5,
      coins: 20
    }, {
      id: 14,
      name: "Netzersatzanlage 50",
      cost: 1e5,
      coins: 20
    }, {
      id: 15,
      name: "Netzersatzanlage 200",
      cost: 1e5,
      coins: 20
    }, {
      id: 16,
      name: "Großlüfter",
      cost: 75e3,
      coins: 15
    }, {
      id: 17,
      name: "10te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 18,
      name: "Drohneneinheit",
      cost: 15e4,
      coins: 25
    }, {
      id: 19,
      name: "Verpflegungsdienst",
      cost: 2e5,
      coins: 25
    }, {
      id: 20,
      name: "1te Anhänger Stellplatz",
      cost: 75e3,
      coins: 15
    }, {
      id: 21,
      name: "2te Anhänger Stellplatz",
      cost: 75e3,
      coins: 15
    }, {
      id: 22,
      name: "3te Anhänger Stellplatz",
      cost: 75e3,
      coins: 15
    }, {
      id: 23,
      name: "4te Anhänger Stellplatz",
      cost: 75e3,
      coins: 15
    }, {
      id: 24,
      name: "5te Anhänger Stellplatz",
      cost: 75e3,
      coins: 15
    }, {
      id: 25,
      name: "Bahnrettung",
      cost: 125e3,
      coins: 25
    }, {
      id: 26,
      name: "11te Ab-Stellplatz",
      cost: 15e4,
      coins: 20
    }, {
      id: 27,
      name: "12te Ab-Stellplatz",
      cost: 15e4,
      coins: 20
    } ],
    "0_small": [ {
      id: 0,
      name: "Rettungsdienst",
      cost: 1e5,
      coins: 20
    }, {
      id: 1,
      name: "1te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 2,
      name: "2te AB-Stellplatz",
      cost: 1e5,
      coins: 20
    }, {
      id: 6,
      name: "Wasserrettung",
      cost: 4e5,
      coins: 25
    }, {
      id: 8,
      name: "Flughafenfeuerwehr",
      cost: 3e5,
      coins: 25
    }, {
      id: 13,
      name: "Werkfeuerwehr",
      cost: 1e5,
      coins: 20
    }, {
      id: 14,
      name: "Netzersatzanlage 50",
      cost: 1e5,
      coins: 20
    }, {
      id: 16,
      name: "Großlüfter",
      cost: 75e3,
      coins: 25
    }, {
      id: 18,
      name: "Drohneneinheit",
      cost: 15e4,
      coins: 25
    }, {
      id: 19,
      name: "Verpflegungsdienst",
      cost: 2e5,
      coins: 25
    }, {
      id: 20,
      name: "1te Anhänger Stellplatz",
      cost: 75e3,
      coins: 15
    }, {
      id: 21,
      name: "2te Anhänger Stellplatz",
      cost: 75e3,
      coins: 15
    }, {
      id: 25,
      name: "Bahnrettung",
      cost: 125e3,
      coins: 25
    } ],
    "1_normal": [ {
      id: 0,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 1,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 2,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    } ],
    "2_normal": [ {
      id: 0,
      name: "Großwache",
      cost: 1e6,
      coins: 50
    } ],
    "3_normal": [ {
      id: 0,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 1,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 2,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    } ],
    "4_normal": [ {
      id: 0,
      name: "Allgemeine Innere",
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      name: "Allgemeine Chirurgie",
      cost: 1e4,
      coins: 10
    }, {
      id: 2,
      name: "Gynäkologie",
      cost: 7e4,
      coins: 15
    }, {
      id: 3,
      name: "Urologie",
      cost: 7e4,
      coins: 15
    }, {
      id: 4,
      name: "Unfallchirurgie",
      cost: 7e4,
      coins: 15
    }, {
      id: 5,
      name: "Neurologie",
      cost: 7e4,
      coins: 15
    }, {
      id: 6,
      name: "Neurochirurgie",
      cost: 7e4,
      coins: 15
    }, {
      id: 7,
      name: "Kardiologie",
      cost: 7e4,
      coins: 15
    }, {
      id: 8,
      name: "Kardiochirurgie",
      cost: 7e4,
      coins: 15
    }, {
      id: 9,
      name: "Großkrankenhaus",
      cost: 2e5,
      coins: 50
    } ],
    "5_normal": [ {
      id: 0,
      name: "Windenrettung",
      cost: 2e5,
      coins: 15
    } ],
    "6_normal": [ {
      id: 0,
      name: "1te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 1,
      name: "2te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 2,
      name: "3te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 3,
      name: "4te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 4,
      name: "5te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 5,
      name: "6te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 6,
      name: "7te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 7,
      name: "8te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 8,
      name: "9te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 9,
      name: "10te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 10,
      name: "Diensthundestaffel",
      cost: 1e5,
      coins: 10
    }, {
      id: 11,
      name: "Kriminalpolizei",
      cost: 1e5,
      coins: 20
    }, {
      id: 12,
      name: "Dienstgruppenleitung",
      cost: 2e5,
      coins: 25
    }, {
      id: 13,
      name: "Motorradstaffel",
      cost: 75e3,
      coins: 15
    }, {
      id: 14,
      name: "Großwache",
      cost: 1e6,
      coins: 50
    }, {
      id: 15,
      name: "Großgewahrsam",
      cost: 2e5,
      coins: 50
    }, {
      id: 16,
      name: "Autobahnpolizei",
      cost: 75e3,
      coins: 15
    } ],
    "6_small": [ {
      id: 0,
      name: "1te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 1,
      name: "2te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 10,
      name: "Diensthundestaffel",
      cost: 1e5,
      coins: 10
    }, {
      id: 11,
      name: "Kriminalpolizei",
      cost: 1e5,
      coins: 20
    }, {
      id: 12,
      name: "Dienstgruppenleitung",
      cost: 2e5,
      coins: 25
    }, {
      id: 13,
      name: "Motorradstaffel",
      cost: 75e3,
      coins: 15
    }, {
      id: 16,
      name: "Autobahnpolizei",
      cost: 75e3,
      coins: 15
    } ],
    "8_normal": [ {
      id: 0,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 1,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 2,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    } ],
    "9_normal": [ {
      id: 0,
      name: "1. Technischer Zug: Fachgruppe Notversorgung/Notinstandsetzung",
      cost: 25e3,
      coins: 5
    }, {
      id: 1,
      name: "1. Technischer Zug: Zugtrupp",
      cost: 25e3,
      coins: 5
    }, {
      id: 2,
      name: "Fachgruppe Räumen",
      cost: 25e3,
      coins: 5
    }, {
      id: 3,
      name: "Fachgruppe Wassergefahren",
      cost: 5e5,
      coins: 15
    }, {
      id: 4,
      name: "2. Technischer Zug - Bergungsgruppe",
      cost: 25e3,
      coins: 5
    }, {
      id: 5,
      name: "2. Technischer Zug: Notversorgung/Notinstandsetzung",
      cost: 25e3,
      coins: 5
    }, {
      id: 6,
      name: "2. Technischer Zug: Zugtrupp",
      cost: 25e3,
      coins: 5
    }, {
      id: 7,
      name: "Fachgruppe Ortung",
      cost: 45e4,
      coins: 25
    }, {
      id: 8,
      name: "Fachgruppe Wasserschaden/Pumpen",
      cost: 2e5,
      coins: 25
    }, {
      id: 9,
      name: "Fachgruppe Schwere Bergung",
      cost: 2e5,
      coins: 25
    }, {
      id: 10,
      name: "Fachgruppe Elektroversorgung",
      cost: 2e5,
      coins: 25
    }, {
      id: 11,
      name: "Ortsverband-Mannschaftstransportwagen",
      cost: 5e4,
      coins: 15
    }, {
      id: 12,
      name: "Trupp Unbemannte Luftfahrtsysteme",
      cost: 5e4,
      coins: 15
    }, {
      id: 13,
      name: "Fachzug Führung und Kommunikation",
      cost: 3e5,
      coins: 25
    }, {
      id: 14,
      name: "Fachgruppe Logistik-Verpflegung",
      cost: 5e4,
      coins: 15
    }, {
      id: 15,
      name: "Fachgruppe Brückenbau",
      cost: 5e4,
      coins: 15
    } ],
    "10_normal": [ {
      id: 0,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 1,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 2,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    } ],
    "11_normal": [ {
      id: 0,
      name: "2. Zug der 1. Hundertschaft",
      cost: 25e3,
      coins: 5
    }, {
      id: 1,
      name: "3. Zug der 1. Hundertschaft",
      cost: 25e3,
      coins: 5
    }, {
      id: 2,
      name: "Sonderfahrzeug: Gefangenenkraftwagen",
      cost: 25e3,
      coins: 5
    }, {
      id: 3,
      name: "Technischer Zug: Wasserwerfer",
      cost: 25e3,
      coins: 5
    }, {
      id: 4,
      name: "SEK: 1. Zug",
      cost: 1e5,
      coins: 10
    }, {
      id: 5,
      name: "SEK: 2. Zug",
      cost: 1e5,
      coins: 10
    }, {
      id: 6,
      name: "MEK: 1. Zug",
      cost: 1e5,
      coins: 10
    }, {
      id: 7,
      name: "MEK: 2. Zug",
      cost: 1e5,
      coins: 10
    }, {
      id: 8,
      name: "Diensthundestaffel",
      cost: 1e5,
      coins: 10
    }, {
      id: 9,
      name: "Reiterstaffel",
      cost: 3e5,
      coins: 25
    }, {
      id: 10,
      name: "Lautsprecherkraftwagen",
      cost: 1e5,
      coins: 10
    } ],
    "12_normal": [ {
      id: 0,
      name: "Führung",
      cost: 25e3,
      coins: 5
    }, {
      id: 1,
      name: "Sanitätsdienst",
      cost: 25e3,
      coins: 5
    }, {
      id: 2,
      name: "Wasserrettung",
      cost: 5e5,
      coins: 25
    }, {
      id: 3,
      name: "Rettungshundestaffel",
      cost: 35e4,
      coins: 25
    }, {
      id: 4,
      name: "SEG-Drohne",
      cost: 5e4,
      coins: 15
    }, {
      id: 5,
      name: "Betreuungs- und Verpflegungsdienst",
      cost: 2e5,
      coins: 25
    }, {
      id: 6,
      name: "Technik und Sicherheit",
      cost: 2e5,
      coins: 25
    } ],
    "13_normal": [ {
      id: 0,
      name: "Außenlastbehälter",
      cost: 2e5,
      coins: 15
    }, {
      id: 1,
      name: "Windenrettung",
      cost: 2e5,
      coins: 15
    } ],
    "17_normal": [ {
      id: 0,
      name: "SEK: 1. Zug",
      cost: 1e5,
      coins: 10
    }, {
      id: 1,
      name: "SEK: 2. Zug",
      cost: 1e5,
      coins: 10
    }, {
      id: 2,
      name: "MEK: 1. Zug",
      cost: 1e5,
      coins: 10
    }, {
      id: 3,
      name: "MEK: 2. Zug",
      cost: 1e5,
      coins: 10
    }, {
      id: 4,
      name: "Diensthundestaffel",
      cost: 1e5,
      coins: 10
    } ],
    "24_normal": [ {
      id: 0,
      name: "Reiterstaffel",
      cost: 3e5,
      coins: 25
    }, {
      id: 1,
      name: "Reiterstaffel",
      cost: 3e5,
      coins: 25
    }, {
      id: 2,
      name: "Reiterstaffel",
      cost: 3e5,
      coins: 25
    }, {
      id: 3,
      name: "Reiterstaffel",
      cost: 3e5,
      coins: 25
    }, {
      id: 4,
      name: "Reiterstaffel",
      cost: 3e5,
      coins: 25
    }, {
      id: 5,
      name: "Reiterstaffel",
      cost: 3e5,
      coins: 25
    } ],
    "25_normal": [ {
      id: 0,
      name: "Höhenrettung",
      cost: 5e4,
      coins: 25
    }, {
      id: 1,
      name: "Drohneneinheit",
      cost: 75e3,
      coins: 25
    }, {
      id: 2,
      name: "Rettungshundestaffel",
      cost: 35e4,
      coins: 25
    }, {
      id: 3,
      name: "Rettungsdienst",
      cost: 1e5,
      coins: 20
    } ],
    "27_normal": [ {
      id: 0,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 1,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    }, {
      id: 2,
      name: "Weiterer Klassenraum",
      cost: 4e5,
      coins: 40
    } ],
    "29_normal": [ {
      id: 0,
      name: "1te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 1,
      name: "2te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 2,
      name: "3te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 3,
      name: "4te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 4,
      name: "5te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 5,
      name: "6te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 6,
      name: "7te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 7,
      name: "8te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 8,
      name: "9te Zelle",
      cost: 25e3,
      coins: 5
    }, {
      id: 9,
      name: "10te Zelle",
      cost: 25e3,
      coins: 5
    } ]
  };
  const STORAGE_CATALOG = {
    "0_normal": [ {
      id: "initial_containers",
      name: "Lagerraum",
      cost: 25e3,
      coins: 10
    }, {
      id: "additional_containers_1",
      name: "1te Zusätzlicher Lagerraum",
      cost: 5e4,
      coins: 12
    }, {
      id: "additional_containers_2",
      name: "2te Zusätzlicher Lagerraum",
      cost: 5e4,
      coins: 12
    }, {
      id: "additional_containers_3",
      name: "3te Zusätzlicher Lagerraum",
      cost: 1e5,
      coins: 15
    }, {
      id: "additional_containers_4",
      name: "4te Zusätzlicher Lagerraum",
      cost: 1e5,
      coins: 15
    }, {
      id: "additional_containers_5",
      name: "5te Zusätzlicher Lagerraum",
      cost: 1e5,
      coins: 15
    }, {
      id: "additional_containers_6",
      name: "6te Zusätzlicher Lagerraum",
      cost: 1e5,
      coins: 15
    }, {
      id: "additional_containers_7",
      name: "7te Zusätzlicher Lagerraum",
      cost: 1e5,
      coins: 15
    } ],
    "0_small": [ {
      id: "initial_containers",
      name: "Lagerraum",
      cost: 25e3,
      coins: 10
    }, {
      id: "additional_containers_1",
      name: "1te Zusätzlicher Lagerraum",
      cost: 5e4,
      coins: 10
    }, {
      id: "additional_containers_2",
      name: "2te Zusätzlicher Lagerraum",
      cost: 5e4,
      coins: 10
    } ],
    "5_normal": [ {
      id: "initial_helicopter_equipment",
      name: "Lagerraum",
      cost: 25e3,
      coins: 10
    } ],
    "13_normal": [ {
      id: "initial_helicopter_equipment",
      name: "Lagerraum",
      cost: 25e3,
      coins: 10
    } ]
  };
  function buildUniformLevels(count, cost, coins) {
    return Array.from({
      length: count
    }, (_, i) => ({
      id: i,
      cost: cost,
      coins: coins
    }));
  }
  const LEVEL_CATALOG = {
    "0_normal": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, ...buildUniformLevels(18, 1e5, 20).map((l, i) => ({
      id: i + 2,
      cost: l.cost,
      coins: l.coins
    })) ],
    "0_small": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, {
      id: 2,
      cost: 1e5,
      coins: 20
    }, {
      id: 3,
      cost: 1e5,
      coins: 20
    }, {
      id: 4,
      cost: 1e5,
      coins: 20
    } ],
    "2_normal": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, ...Array.from({
      length: 12
    }, (_, i) => ({
      id: i + 2,
      cost: 1e5,
      coins: 20
    })) ],
    "2_small": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, {
      id: 2,
      cost: 1e5,
      coins: 20
    }, {
      id: 3,
      cost: 1e5,
      coins: 20
    }, {
      id: 4,
      cost: 1e5,
      coins: 20
    } ],
    "4_normal": Array.from({
      length: 20
    }, (_, i) => ({
      id: i,
      cost: 19e3,
      coins: 11
    })),
    "6_normal": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, ...Array.from({
      length: 12
    }, (_, i) => ({
      id: i + 2,
      cost: 1e5,
      coins: 20
    })) ],
    "6_small": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, {
      id: 2,
      cost: 1e5,
      coins: 20
    }, {
      id: 3,
      cost: 1e5,
      coins: 20
    }, {
      id: 4,
      cost: 1e5,
      coins: 20
    } ],
    "15_normal": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, {
      id: 2,
      cost: 1e5,
      coins: 20
    }, {
      id: 3,
      cost: 1e5,
      coins: 20
    }, {
      id: 4,
      cost: 1e5,
      coins: 20
    } ],
    "25_normal": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, ...Array.from({
      length: 12
    }, (_, i) => ({
      id: i + 2,
      cost: 1e5,
      coins: 20
    })) ],
    "26_normal": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, {
      id: 2,
      cost: 1e5,
      coins: 20
    }, {
      id: 3,
      cost: 1e5,
      coins: 20
    }, {
      id: 4,
      cost: 1e5,
      coins: 20
    } ],
    "29_normal": [ {
      id: 0,
      cost: 1e4,
      coins: 10
    }, {
      id: 1,
      cost: 5e4,
      coins: 15
    }, ...Array.from({
      length: 7
    }, (_, i) => ({
      id: i + 2,
      cost: 1e5,
      coins: 20
    })) ]
  };
  async function storeData(data, key) {
    await GM.setValue(key, data);
  }
  async function retrieveData(key) {
    return await GM.getValue(key, undefined);
  }
  const HISTORY_STORAGE_KEY = "actionHistory";
  const HISTORY_MAX_ENTRIES = 300;
  const ERROR_LOG_KEY = "errorLog";
  const ERROR_LOG_MAX_ENTRIES = 20;
  async function getErrorLog() {
    return await retrieveData(ERROR_LOG_KEY) || [];
  }
  async function logErrorToStorage(context, message) {
    const log = await getErrorLog();
    log.unshift({
      timestamp: Date.now(),
      version: SCRIPT_VERSION,
      context: context,
      message: message
    });
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
    crew_assignment: "Fahrzeug-Besatzung",
    crew_unassign_all: "Besatzung abgezogen"
  };
  async function getHistory() {
    return await retrieveData(HISTORY_STORAGE_KEY) || [];
  }
  async function logHistoryEntry(entry) {
    const history = await getHistory();
    history.unshift({
      timestamp: Date.now(),
      version: SCRIPT_VERSION,
      status: "done",
      ...entry
    });
    if (history.length > HISTORY_MAX_ENTRIES) history.length = HISTORY_MAX_ENTRIES;
    await storeData(history, HISTORY_STORAGE_KEY);
  }
  async function startHistoryEntry(entry) {
    const history = await getHistory();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    history.unshift({
      id: id,
      timestamp: Date.now(),
      version: SCRIPT_VERSION,
      status: "running",
      ...entry
    });
    if (history.length > HISTORY_MAX_ENTRIES) history.length = HISTORY_MAX_ENTRIES;
    await storeData(history, HISTORY_STORAGE_KEY);
    return id;
  }
  async function updateHistoryEntry(id, updates) {
    if (!id) return;
    const history = await getHistory();
    const entry = history.find(e => e.id === id);
    if (!entry) return;
    Object.assign(entry, updates);
    await storeData(history, HISTORY_STORAGE_KEY);
  }
  function renameHistoryType(itemNoun, verb) {
    if (itemNoun === "Fahrzeug(e)") return verb === "zurückgesetzt" ? "vehicle_reset" : "vehicle_rename";
    if (itemNoun === "Wache(n)") return "station_rename";
    return "leitstelle_rename";
  }
  const CUSTOM_REQUIRED_EXTENSIONS_KEY = "customRequiredExtensions";
  async function getRequiredExtensionsOverrides() {
    return await retrieveData(CUSTOM_REQUIRED_EXTENSIONS_KEY);
  }
  function getDefaultRequiredExtensions(pseudoId) {
    return RECOMMENDED_EXTENSIONS_BY_PSEUDO_ID[pseudoId] || [];
  }
  const PERSONNEL_SCAN_KEY = "personnelScanData";
  const PERSONNEL_SCAN_META_KEY = "personnelScanMeta";
  const PERSONNEL_QUALIFICATIONS_KEY = "personnelQualifications";
  const PERSONNEL_SCHOOLING_MIN_STAFF_KEY = "personnelSchoolingMinStaff";
  const VEHICLE_CREW_STAFFING_MODE_KEY = "vehicleCrewStaffingMode";
  async function getVehicleCrewStaffingMode() {
    const mode = await retrieveData(VEHICLE_CREW_STAFFING_MODE_KEY);
    return mode === "full" ? "full" : "min";
  }
  const VEHICLE_CREW_INCLUDE_NORMAL_KEY = "vehicleCrewIncludeNormal";
  async function getVehicleCrewIncludeNormal() {
    return !!await retrieveData(VEHICLE_CREW_INCLUDE_NORMAL_KEY);
  }
  const VEHICLE_CREW_UNTRAINED_ONLY_KEY = "vehicleCrewUntrainedOnly";
  async function getVehicleCrewUntrainedOnly() {
    return !!await retrieveData(VEHICLE_CREW_UNTRAINED_ONLY_KEY);
  }
  const VEHICLE_CREW_TRIM_KEY = "vehicleCrewTrimEnabled";
  async function getVehicleCrewTrimEnabled() {
    const stored = await retrieveData(VEHICLE_CREW_TRIM_KEY);
    return stored === undefined ? true : !!stored;
  }
  const VEHICLE_CREW_AUTO_FMS_KEY = "vehicleCrewAutoFms";
  async function getVehicleCrewAutoFms() {
    const stored = await retrieveData(VEHICLE_CREW_AUTO_FMS_KEY);
    return stored === undefined ? true : !!stored;
  }
  const VEHICLE_CREW_PROBLEMS_KEY = "vehicleCrewProblems";
  async function getVehicleCrewProblems() {
    const raw = await retrieveData(VEHICLE_CREW_PROBLEMS_KEY) || {};
    const result = {};
    for (const [id, value] of Object.entries(raw)) {
      result[id] = typeof value === "string" ? {
        message: value,
        since: null
      } : value;
    }
    return result;
  }
  async function saveVehicleCrewProblems(problemsById) {
    const plain = {};
    for (const [id, {message: message, since: since}] of problemsById) plain[id] = {
      message: message,
      since: since
    };
    await storeData(plain, VEHICLE_CREW_PROBLEMS_KEY);
  }
  async function getPersonnelScanData() {
    return await retrieveData(PERSONNEL_SCAN_KEY) || {};
  }
  async function getPersonnelScanMeta() {
    return await retrieveData(PERSONNEL_SCAN_META_KEY) || {};
  }
  async function getPersonnelQualifications() {
    return await retrieveData(PERSONNEL_QUALIFICATIONS_KEY) || {};
  }
  async function getPersonnelSchoolingMinStaff() {
    return await retrieveData(PERSONNEL_SCHOOLING_MIN_STAFF_KEY) || 0;
  }
  const STATION_BLUEPRINTS_KEY = "stationBlueprints";
  async function getStationBlueprints() {
    return await retrieveData(STATION_BLUEPRINTS_KEY) || {};
  }
  async function saveStationBlueprints(blueprints) {
    await storeData(blueprints, STATION_BLUEPRINTS_KEY);
  }
  async function getStationWizardSelection(storageKey, blueprintId) {
    const all = await retrieveData(storageKey) || {};
    const saved = all[blueprintId];
    if (!saved) return null;
    if (Array.isArray(saved)) return saved;
    if (Array.isArray(saved.stationIds)) {
      const migrated = saved.stationIds;
      all[blueprintId] = migrated;
      await storeData(all, storageKey);
      return migrated;
    }
    delete all[blueprintId];
    await storeData(all, storageKey);
    return null;
  }
  async function saveStationWizardSelection(storageKey, blueprintId, stationIds) {
    const all = await retrieveData(storageKey) || {};
    all[blueprintId] = stationIds;
    await storeData(all, storageKey);
  }
  const SCHOOLING_STATION_SELECTION_KEY = "schoolingStationSelection";
  const getSchoolingStationSelection = blueprintId => getStationWizardSelection(SCHOOLING_STATION_SELECTION_KEY, blueprintId);
  const saveSchoolingStationSelection = (blueprintId, stationIds) => saveStationWizardSelection(SCHOOLING_STATION_SELECTION_KEY, blueprintId, stationIds);
  const STATION_CHECK_SELECTION_KEY = "stationCheckSelection";
  const getStationCheckSelection = blueprintId => getStationWizardSelection(STATION_CHECK_SELECTION_KEY, blueprintId);
  const saveStationCheckSelection = (blueprintId, stationIds) => saveStationWizardSelection(STATION_CHECK_SELECTION_KEY, blueprintId, stationIds);
  const ORPHANED_STORAGE_KEYS = [ "excludedBlueprintStations" ];
  async function cleanupOrphanedStorageKeys() {
    for (const key of ORPHANED_STORAGE_KEYS) {
      if (await retrieveData(key) !== undefined) await GM.deleteValue(key);
    }
  }
  const ALL_SETTINGS_KEYS = [ "names", HISTORY_STORAGE_KEY, CUSTOM_REQUIRED_EXTENSIONS_KEY, PERSONNEL_SCAN_KEY, PERSONNEL_SCAN_META_KEY, PERSONNEL_QUALIFICATIONS_KEY, PERSONNEL_SCHOOLING_MIN_STAFF_KEY, STATION_BLUEPRINTS_KEY, ...ORPHANED_STORAGE_KEYS, SCHOOLING_STATION_SELECTION_KEY, STATION_CHECK_SELECTION_KEY, VEHICLE_CREW_STAFFING_MODE_KEY, VEHICLE_CREW_PROBLEMS_KEY, VEHICLE_CREW_INCLUDE_NORMAL_KEY, VEHICLE_CREW_UNTRAINED_ONLY_KEY, VEHICLE_CREW_TRIM_KEY, VEHICLE_CREW_AUTO_FMS_KEY ];
  async function clearAllStoredData() {
    await GM.deleteValue(cacheKeyVehicleTypes);
    await GM.deleteValue(ERROR_LOG_KEY);
    for (const key of ALL_SETTINGS_KEYS) await GM.deleteValue(key);
  }
  async function exportAllSettings() {
    const data = {};
    for (const key of ALL_SETTINGS_KEYS) {
      const value = await GM.getValue(key, undefined);
      if (value !== undefined) data[key] = value;
    }
    return {
      fuxtools: true,
      version: SCRIPT_VERSION,
      exportedAt: Date.now(),
      data: data
    };
  }
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
  const FETCH_TIMEOUT_MS = 2e4;
  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController;
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } catch (e) {
      if (e.name === "AbortError") {
        const message = `Zeitüberschreitung nach ${FETCH_TIMEOUT_MS / 1e3}s: ${url}`;
        logErrorToStorage("Netzwerk-Timeout", message).catch(() => {});
        throw new Error(message);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  async function fetchJson(url) {
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  }
  async function storeVehicleTypes(data, expiresInMs) {
    const expirationDate = new Date(Date.now() + expiresInMs);
    await storeData({
      data: data,
      expirationDate: expirationDate
    }, cacheKeyVehicleTypes);
  }
  async function fetchVehicleTypeCatalog() {
    try {
      const data = await fetchJson("https://api.lss-manager.de/de_DE/vehicles");
      await storeVehicleTypes(data, 24 * 60 * 60 * 1e3);
      return data;
    } catch (primaryError) {
      console.error("[FuxTools] Fahrzeug-Katalog von api.lss-manager.de nicht erreichbar, versuche Fallback:", primaryError);
      try {
        const data = await fetchJson(VEHICLE_TYPES_FALLBACK_URL);
        await storeVehicleTypes(data, 60 * 60 * 1e3);
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
    if (!types || !expirationDate || new Date(expirationDate) < new Date) {
      try {
        types = await fetchVehicleTypeCatalog();
      } catch (error) {
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
    namesStore = await retrieveData("names") || {};
  }
  async function saveNamesStore() {
    await storeData(namesStore, "names");
  }
  async function fetchJSON(path) {
    const res = await fetchWithTimeout(path, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Fehler beim Laden von ${path}: ${res.status}`);
    const data = await res.json();
    const result = data.result || data;
    return Array.isArray(result) ? result : Object.values(result);
  }
  async function fetchAllPagesV2(firstPageUrl) {
    let items = [];
    let nextPage = firstPageUrl;
    while (nextPage) {
      const res = await fetchWithTimeout(nextPage, {
        credentials: "same-origin"
      });
      if (!res.ok) throw new Error(`Fehler beim Laden von ${nextPage}: ${res.status}`);
      const data = await res.json();
      items = items.concat(data.result || []);
      nextPage = data.paging?.next_page || null;
    }
    return items;
  }
  async function fetchAllVehiclesV2() {
    return fetchAllPagesV2("/api/v2/vehicles?limit=2000");
  }
  async function fetchAllBuildingsV2() {
    return fetchAllPagesV2("/api/v2/buildings");
  }
  const GAME_DATA_CACHE_TTL_MS = 60 * 1e3;
  let gameDataCache = null;
  let gameDataFetchPromise = null;
  const SESSION_CACHE_TTL_MS = 5 * 60 * 1e3;
  function readSessionCache(key) {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key));
      if (!parsed || !Array.isArray(parsed.value)) return null;
      const userId = getCurrentUserId();
      if (userId !== null && parsed.user_id !== userId) return null;
      if (Date.now() - parsed.lastUpdate >= SESSION_CACHE_TTL_MS) return null;
      return parsed.value;
    } catch {
      return null;
    }
  }
  function writeSessionCache(key, value) {
    const userId = getCurrentUserId();
    if (userId === null) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({
        value: value,
        lastUpdate: Date.now(),
        user_id: userId
      }));
    } catch {}
  }
  async function loadWithSessionCache(key, cachedValue, fetchFn) {
    if (cachedValue) return cachedValue;
    const value = await fetchFn();
    writeSessionCache(key, value);
    return value;
  }
  function invalidateGameDataCache() {
    gameDataCache = null;
    sessionStorage.removeItem("aVehicles");
    sessionStorage.removeItem("aBuildings");
  }
  async function loadGameData(forceRefresh = false) {
    if (!forceRefresh && gameDataCache && Date.now() - gameDataCache.fetchedAt < GAME_DATA_CACHE_TTL_MS) {
      return gameDataCache;
    }
    if (!forceRefresh && gameDataFetchPromise) {
      return gameDataFetchPromise;
    }
    gameDataFetchPromise = (async () => {
      const cachedVehicles = !forceRefresh ? readSessionCache("aVehicles") : null;
      const cachedBuildings = !forceRefresh ? readSessionCache("aBuildings") : null;
      const [vehicles, buildings] = await Promise.all([ loadWithSessionCache("aVehicles", cachedVehicles, fetchAllVehiclesV2), loadWithSessionCache("aBuildings", cachedBuildings, fetchAllBuildingsV2) ]);
      const buildingsById = new Map(buildings.map(b => [ String(b.id), b ]));
      gameDataCache = {
        vehicles: vehicles,
        buildings: buildings,
        buildingsById: buildingsById,
        fetchedAt: Date.now()
      };
      return gameDataCache;
    })();
    try {
      return await gameDataFetchPromise;
    } finally {
      gameDataFetchPromise = null;
    }
  }
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
  async function renameVehicle(vehicleId, newName) {
    const res = await fetchWithTimeout(`/vehicles/${vehicleId}/editName`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Formular für Fahrzeug ${vehicleId} nicht ladbar (${res.status})`);
    const html = await res.text();
    const container = document.createElement("div");
    container.innerHTML = html;
    const input = container.querySelector(`#vehicle_new_name_${vehicleId}`);
    const form = container.querySelector(`#vehicle_form_${vehicleId}`);
    if (!input || !form) throw new Error(`Formular-Elemente für Fahrzeug ${vehicleId} nicht gefunden.`);
    input.value = newName;
    const action = form.getAttribute("action") || form.action;
    const formData = new FormData(form);
    const res2 = await fetchWithTimeout(action, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/javascript, application/json, */*; q=0.01"
      }
    });
    if (!res2.ok) throw new Error(`Speichern für Fahrzeug ${vehicleId} fehlgeschlagen (${res2.status})`);
  }
  async function renameBuilding(buildingId, newName) {
    const res = await fetchWithTimeout(`/buildings/${buildingId}/edit`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Formular für Gebäude ${buildingId} nicht ladbar (${res.status})`);
    const html = await res.text();
    const container = document.createElement("div");
    container.innerHTML = html;
    const input = container.querySelector("#building_name");
    const form = container.querySelector(`#edit_building_${buildingId}`);
    if (!input || !form) throw new Error(`Formular-Elemente für Gebäude ${buildingId} nicht gefunden.`);
    input.value = newName;
    const action = form.getAttribute("action") || form.action;
    const formData = new FormData(form);
    const res2 = await fetchWithTimeout(action, {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/javascript, application/json, */*; q=0.01"
      }
    });
    if (!res2.ok) throw new Error(`Speichern für Gebäude ${buildingId} fehlgeschlagen (${res2.status})`);
  }
  async function renameItemWithRetry(renameFn, id, newName, maxAttempts = 2) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await renameFn(id, newName);
        return;
      } catch (e) {
        lastError = e;
        if (attempt < maxAttempts) await sleep(1e3);
      }
    }
    throw lastError;
  }
  const RENAME_CONCURRENCY = 5;
  function executeRenamePlan(plan, verb, goBack, renameFn = renameVehicle, itemNoun = "Fahrzeug(e)") {
    const title = `${itemNoun} ${verb === "umbenannt" ? "umbenennen" : "zurücksetzen"}`;
    const queued = runOrQueueBackgroundTask(title, viaQueue => runRenamePlan(plan, verb, goBack, renameFn, itemNoun, title, viaQueue));
    if (queued === "queued") renderBackgroundTaskQueuedScreen(title, goBack);
  }
  async function runRenamePlan(plan, verb, goBack, renameFn, itemNoun, title, viaQueue) {
    renameCancelled = false;
    const historyId = await startHistoryEntry({
      type: renameHistoryType(itemNoun, verb),
      label: `0/${plan.length} gestartet ...`
    });
    beginBackgroundTask(title, () => {
      renameCancelled = true;
      updateHistoryEntry(historyId, {
        status: "cancelled",
        label: "Abbruch angefordert ..."
      });
    });
    if (!viaQueue) renderBackgroundTaskProgressScreen();
    let done = 0;
    let finished = 0;
    const failedItems = [];
    const errors = [];
    let cancelled = false;
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
        updateBackgroundTaskProgress(Math.round(finished / plan.length * 100), `${finished}/${plan.length}: ${item.oldName || "(leer)"} -> ${item.newName}`);
      }
    }
    const workerCount = Math.min(RENAME_CONCURRENCY, plan.length);
    await Promise.all(Array.from({
      length: workerCount
    }, () => worker()));
    await updateHistoryEntry(historyId, {
      label: `${done} ${itemNoun}${failedItems.length ? ` (${failedItems.length} fehlgeschlagen)` : ""}`,
      status: cancelled ? "cancelled" : "done"
    });
    const renderResult = () => renderCompletionScreen({
      verb: verb,
      done: done,
      failed: failedItems.length,
      plan: plan,
      errors: errors,
      failedItems: failedItems,
      goBack: goBack,
      cancelled: cancelled,
      itemNoun: itemNoun,
      renameFn: renameFn
    });
    const stillOnOwnProgressScreen = !!document.getElementById("vn-exec-progress-bar");
    if (stillOnOwnProgressScreen) renderResult();
    finishBackgroundTask(title, renderResult, stillOnOwnProgressScreen);
  }
  function renderCompletionScreen({verb: verb, done: done, failed: failed, plan: plan, errors: errors, failedItems: failedItems, goBack: goBack, cancelled: cancelled, itemNoun: itemNoun = "Fahrzeug(e)", renameFn: renameFn = renameVehicle}) {
    const body = document.getElementById("vehicle-naming-modal-body");
    const perStation = new Map;
    for (const item of plan) {
      perStation.set(item.station, (perStation.get(item.station) || 0) + 1);
    }
    const stationRows = [ ...perStation.entries() ].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => `<li>${escapeHtml(name)}: ${count} ${itemNoun}</li>`).join("");
    let errorBlock = "";
    if (errors.length) {
      errorBlock = `\n        <p class="text-danger" style="margin-top:10px;"><b>Fehler (erste ${errors.length}):</b></p>\n        <pre style="white-space:pre-wrap; font-size:11px;">${escapeHtml(errors.join("\n"))}</pre>\n      `;
    }
    const cancelledNote = cancelled ? `<p class="text-warning"><b>Abgebrochen</b> nach ${done + failed} von ${plan.length} geplanten ${itemNoun}.</p>` : "";
    const retryButton = failedItems && failedItems.length ? `<button id="vn-btn-retry" type="button" class="btn btn-warning">\n             <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span>\n             Fehlgeschlagene erneut versuchen (${failedItems.length})\n           </button>` : "";
    body.innerHTML = `\n      ${cancelledNote}\n      <p>\n        <span class="glyphicon glyphicon-ok-sign text-success" aria-hidden="true"></span>\n        <b>${done} ${itemNoun} ${verb}</b>${failed ? `, <span class="text-danger">${failed} fehlgeschlagen</span>` : ""}\n        (von ${plan.length} geplant).\n      </p>\n      <ul style="max-height: 200px; overflow-y: auto;">${stationRows}</ul>\n      ${errorBlock}\n      <p class="text-muted" style="font-size: 12px;">Lade die Seite neu, um die neuen Namen im Spiel zu sehen.</p>\n      <div class="vn-sticky-footer">\n        ${retryButton}\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-main-menu" type="button" class="btn btn-primary">Hauptmenü</button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-main-menu").addEventListener("click", renderMainMenu);
    if (failedItems && failedItems.length) {
      document.getElementById("vn-btn-retry").addEventListener("click", () => {
        executeRenamePlan(failedItems, verb, goBack, renameFn, itemNoun);
      });
    }
  }
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }
  function inlineMarkdown(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  function renderMarkdownLite(markdown) {
    let html = "";
    let inList = false;
    let paragraphLines = [];
    const closeList = () => {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    };
    const flushParagraph = () => {
      if (paragraphLines.length) {
        html += `<p>${inlineMarkdown(paragraphLines.join(" "))}</p>`;
        paragraphLines = [];
      }
    };
    for (const rawLine of markdown.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        closeList();
        flushParagraph();
        continue;
      }
      if (line.startsWith("### ")) {
        closeList();
        flushParagraph();
        html += `<h5>${inlineMarkdown(line.slice(4))}</h5>`;
      } else if (line.startsWith("## ")) {
        closeList();
        flushParagraph();
        html += `<h4>${inlineMarkdown(line.slice(3))}</h4>`;
      } else if (line.startsWith("# ")) {
        closeList();
        flushParagraph();
        html += `<h3>${inlineMarkdown(line.slice(2))}</h3>`;
      } else if (/^-\s+/.test(line)) {
        flushParagraph();
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${inlineMarkdown(line.replace(/^-\s+/, ""))}</li>`;
      } else if (/^\s+\S/.test(rawLine) && inList) {
        html = html.replace(/<\/li>$/, ` ${inlineMarkdown(line.trim())}</li>`);
      } else {
        closeList();
        paragraphLines.push(line.trim());
      }
    }
    closeList();
    flushParagraph();
    return html;
  }
  function makeRowVisibilityFilter({container: container, searchInputId: searchInputId, typeFilterId: typeFilterId, leitstelleFilterId: leitstelleFilterId, rowSelector: rowSelector, searchField: searchField}) {
    return function applyRowVisibility() {
      const query = document.getElementById(searchInputId)?.value.trim().toLowerCase() || "";
      const typeFilter = document.getElementById(typeFilterId)?.value || "";
      const leitstelleFilter = leitstelleFilterId ? document.getElementById(leitstelleFilterId)?.value || "" : "";
      container.querySelectorAll(rowSelector).forEach(row => {
        const matchesQuery = !query || row.dataset[searchField].includes(query);
        const matchesType = !typeFilter || row.dataset.type === typeFilter;
        const matchesLeitstelle = !leitstelleFilter || row.dataset.leitstelle === leitstelleFilter;
        row.style.display = matchesQuery && matchesType && matchesLeitstelle ? "" : "none";
      });
    };
  }
  function addCustomStyles() {
    if (document.getElementById("fuxtools-custom-styles")) return;
    const style = document.createElement("style");
    style.id = "fuxtools-custom-styles";
    style.textContent = `\n      #vehicle-naming-modal-body .vn-menu-item {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n        padding: 8px 14px;\n        background-color: rgba(255, 255, 255, 0.06);\n        color: inherit;\n        border-color: rgba(255, 255, 255, 0.15);\n      }\n      #vehicle-naming-modal-body .vn-menu-item:hover,\n      #vehicle-naming-modal-body .vn-menu-item:focus {\n        background-color: rgba(255, 255, 255, 0.14);\n        color: inherit;\n      }\n      #vehicle-naming-modal-body .vn-menu-item .glyphicon {\n        font-size: 16px;\n        width: 18px;\n        text-align: center;\n      }\n      #vehicle-naming-modal-body .vn-settings-card {\n        padding: 12px 14px;\n        background-color: rgba(255, 255, 255, 0.04);\n        border: 1px solid rgba(255, 255, 255, 0.12);\n        border-radius: 4px;\n      }\n      #vehicle-naming-modal-body .vn-btn-max-level {\n        background-color: #7a2020;\n        border-color: #6b1c1c;\n        color: #fff;\n      }\n      #vehicle-naming-modal-body .vn-btn-max-level:hover,\n      #vehicle-naming-modal-body .vn-btn-max-level:focus {\n        background-color: #8f2626;\n        border-color: #7a2020;\n        color: #fff;\n      }\n      /* Bootstraps Standard-Rot fuer .text-danger (#a94442) ist auf dem dunklen Seiten-Theme\n         kaum lesbar (fuer helle Hintergruende gedacht) - hier durchgaengig auf ein helleres,\n         kontrastreicheres Rot angehoben. Betrifft alle Fehlermeldungen/Status-Texte im Script. */\n      #vehicle-naming-modal-body .text-danger {\n        color: #ff6b6b;\n      }\n      #vehicle-naming-modal-body .vn-changelog h3,\n      #vehicle-naming-modal-body .vn-how-it-works h3 {\n        margin-top: 0;\n      }\n      #vehicle-naming-modal-body .vn-changelog h4,\n      #vehicle-naming-modal-body .vn-how-it-works h4 {\n        margin: 18px 0 8px;\n      }\n      #vehicle-naming-modal-body .vn-changelog h5,\n      #vehicle-naming-modal-body .vn-how-it-works h5 {\n        margin: 14px 0 6px;\n      }\n      #vehicle-naming-modal-body .vn-changelog ul,\n      #vehicle-naming-modal-body .vn-how-it-works ul {\n        padding-left: 20px;\n      }\n      #vehicle-naming-modal-body .vn-changelog li,\n      #vehicle-naming-modal-body .vn-how-it-works li {\n        margin-bottom: 6px;\n      }\n      /* Aktions-/Zurueck-Buttons: wird von modalBody automatisch in #vehicle-naming-modal-\n         actions verschoben (siehe Object.defineProperty auf modalBody.innerHTML weiter\n         unten) - eine eigene, nicht scrollende Zeile, damit beim Scrollen durch lange\n         Listen (z.B. viele Fahrzeugtypen) nichts mehr sichtbar dahinter durchrutscht. */\n      .vn-sticky-footer {\n        margin-top: 10px;\n        padding: 10px 0 2px;\n        background: var(--vn-modal-bg, #333);\n        border-top: 1px solid rgba(255, 255, 255, 0.15);\n      }\n      #vehicle-naming-modal-actions {\n        flex-shrink: 0;\n        /* Liegt als Sibling AUSSERHALB von .modal-body (siehe Object.defineProperty auf\n           modalBody.innerHTML) und erbt dessen Bootstrap-Padding deshalb nicht - ohne das hier\n           saessen "Zurueck" & Co. buendig an der Fensterkante statt wie ueberall sonst mit\n           Abstand zum Rand. */\n        padding: 0 15px;\n      }\n      #vehicle-naming-modal-actions:empty {\n        display: none;\n      }\n      /* Feste Gesamthoehe fuer die Modal-Box statt variabler Hoehe: verhindert, dass bei\n         langen Screens ZWEI verschachtelte Scrollbereiche entstehen (das ganze Bootstrap-\n         Modal UND unser eigener Body-Bereich) - dadurch stand der .vn-sticky-footer bisher\n         manchmal nicht am echten unteren Rand des sichtbaren Fensters, sondern nur am\n         unteren Rand des inneren (mitgescrollten) Bereichs. Mit einer festen Modal-Hoehe\n         (Header/Footer fix, nur der Body dazwischen scrollt) bleibt das Verhalten auf\n         JEDEM Screen gleich.\n       */\n      #vehicle-naming-modal-dialog .modal-content {\n        display: flex;\n        flex-direction: column;\n        max-height: 90vh;\n      }\n      #vehicle-naming-modal-dialog .modal-header,\n      #vehicle-naming-modal-dialog .modal-footer {\n        flex-shrink: 0;\n      }\n      #vehicle-naming-modal-body {\n        flex: 1 1 auto;\n        overflow-y: auto;\n        /* min-height:0 ist noetig, damit ein Flex-Kind ueberhaupt kleiner als sein\n           Inhalt werden und selbst scrollen darf (sonst wuerde es sich einfach auf die\n           volle Inhaltshoehe aufblaehen und .modal-content wieder ueber max-height\n           hinaus wachsen lassen). */\n        min-height: 0;\n      }\n      .vn-task-spin {\n        display:inline-block;\n        animation: vn-task-spin 1s linear infinite;\n      }\n      @keyframes vn-task-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }\n      /* Einheitliches Design fuer alle auf-/zuklappbaren Kategorie-Ueberschriften (Feuerwehr-\n         Kategorien im Bauplan-Editor, Kategorie-Panels bei Fahrzeuge/Wachen umbenennen, ...) -\n         blauer Rand + dezenter Hintergrund macht auf den ersten Blick klar: hier klappt was auf. */\n      /* !important noetig, weil Bootstraps eigenes ".panel-default > .panel-heading" (bei\n         Fahrzeuge/Wachen umbenennen) dieselbe Spezifitaet hat und sonst je nach Ladereihenfolge\n         gewinnen kann. */\n      .vn-category-heading {\n        cursor:pointer !important; background:rgba(51,122,183,0.18) !important;\n        border-left:3px solid #337ab7 !important; border-radius:3px !important;\n        padding:6px 10px !important; margin-bottom:2px !important;\n      }\n      .vn-category-heading:hover { background:rgba(51,122,183,0.32) !important; }\n      .vn-category-heading .glyphicon-chevron-right,\n      .vn-category-heading .glyphicon-triangle-right { font-size:10px; transition:transform 0.15s; }\n      .vn-category-heading .glyphicon-triangle-right.vn-rotated { transform:rotate(90deg); }\n      /* <details>/<summary> (Feuerwehr-Kategorien): kein natives Dreieck, Pfeil rotiert per CSS */\n      summary.vn-category-heading { list-style:none; }\n      summary.vn-category-heading::-webkit-details-marker { display:none; }\n      details[open] > summary.vn-category-heading .glyphicon-chevron-right { transform:rotate(90deg); }\n      /* Grauer Kasten um zusammengehoerige Schalter (z.B. Fahrzeug-Besatzung: Minimum/Volle\n         Besatzung, Nur ergaenzen/Vollstaendig anwenden) - macht auf einen Blick klar, welche\n         Buttons ein Paar/eine Einheit bilden statt lose nebeneinander zu stehen. */\n      .vn-btn-group-box {\n        display:flex; align-items:center; gap:6px; flex-wrap:nowrap;\n        border:1px solid rgba(128,128,128,0.4); border-radius:4px;\n        padding:5px 8px; background:rgba(128,128,128,0.08);\n      }\n      .vn-btn-group-label { font-size:11px; opacity:0.8; white-space:nowrap; margin-right:2px; }\n      /* Task-Center-Bildschirm (siehe renderTaskCenterScreen): ein Kasten je laufender/\n         wartender Aufgabe. */\n      .vn-task-center-item {\n        border:1px solid rgba(128,128,128,0.3); border-radius:4px;\n        padding:8px 10px; margin-bottom:8px;\n      }\n      /* Bauplan-Editor: grauer Kasten um Fahrzeugname+Anzahl-Feld (siehe vehicleGridHtml) -\n         ohne sichtbare Trennung zwischen den Zeilen/Spalten des Grids war auf einen Blick\n         schwer erkennbar, welches Eingabefeld zu welchem Fahrzeugnamen gehoert. */\n      .vn-vehicle-qty-box {\n        border:1px solid rgba(128,128,128,0.3); border-radius:4px;\n        padding:5px 8px;\n      }\n    `;
    document.head.appendChild(style);
  }
  async function initModal() {
    if (document.getElementById(modalId)) return;
    addCustomStyles();
    const logoImg = document.createElement("img");
    logoImg.src = LOGO_URL;
    logoImg.alt = "";
    logoImg.style.cssText = "height:28px; width:28px; vertical-align:middle; margin-right:8px; border-radius:4px;";
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
    modalBody.innerHTML = `<p><em>Lade Wachen &amp; Fahrzeuge ...</em></p>`;
    const modalActions = document.createElement("div");
    modalActions.id = "vehicle-naming-modal-actions";
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
      }
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
    modal.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (btn) setTimeout(() => btn.blur(), 0);
    });
    modalContent.style.setProperty("--vn-modal-bg", getComputedStyle(modalContent).backgroundColor);
    const pageJQuery = unsafeWindow.jQuery || unsafeWindow.$;
    pageJQuery(modal).on("show.bs.modal", e => {
      if (pendingReloadAfterUpdate) {
        renderUpdateRequiredScreen();
        return;
      }
      if (e.relatedTarget?.closest?.("#vn-task-center-entry")) {
        renderTaskCenterScreen();
        return;
      }
      renderMainMenu();
    });
  }
  function closeModal() {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const pageJQuery = unsafeWindow.jQuery || unsafeWindow.$;
    pageJQuery(modal).modal("hide");
  }
  function getCurrentUsername() {
    if (typeof unsafeWindow.user_name === "string" && unsafeWindow.user_name) {
      return unsafeWindow.user_name;
    }
    const el = document.querySelector('a[href^="/profile"], .dropdown-toggle[href^="/profile"]');
    return el?.textContent?.trim() || null;
  }
  function getCurrentUserId() {
    return typeof unsafeWindow.user_id === "number" ? unsafeWindow.user_id : null;
  }
  let currentMode = "rename";
  function renderMainMenu() {
    checkForUpdateInBackground();
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("");
    const body = document.getElementById("vehicle-naming-modal-body");
    const username = getCurrentUsername();
    const greeting = username ? `Hey ${escapeHtml(username)}, was möchtest du tun?` : "Was möchtest du tun?";
    const sectionLabelStyle = "font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin:14px 0 4px; font-weight:bold;";
    body.innerHTML = `\n      <div style="max-width:420px; margin:0 auto;">\n        <p>${greeting}</p>\n\n        <p class="text-muted" style="${sectionLabelStyle} margin-top:0;">Wachenplanung</p>\n        <div class="list-group">\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-station-blueprints">\n            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span>\n            Wachen-Bauplaner\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-station-apply-check">\n            <span class="glyphicon glyphicon-ok-circle" aria-hidden="true"></span>\n            Wachen-Check\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-schooling">\n            <span class="glyphicon glyphicon-education" aria-hidden="true"></span>\n            Schulungen\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-statistics">\n            <span class="glyphicon glyphicon-stats" aria-hidden="true"></span>\n            Statistik\n          </button>\n        </div>\n\n        <p class="text-muted" style="${sectionLabelStyle}">Helfer</p>\n        <div class="list-group">\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-vehicle-crew">\n            <span class="glyphicon glyphicon-wrench" aria-hidden="true"></span>\n            Fahrzeug-Besatzung\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-station-check">\n            <span class="glyphicon glyphicon-tasks" aria-hidden="true"></span>\n            Wachenausbau\n          </button>\n        </div>\n\n        <p class="text-muted" style="${sectionLabelStyle}">Schnellumbenennung</p>\n        <div class="list-group">\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-vehicles">\n            <span class="glyphicon glyphicon-road" aria-hidden="true"></span>\n            Fahrzeuge umbenennen\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-reset">\n            <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>\n            Fahrzeugnamen zurücksetzen\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-stations">\n            <span class="glyphicon glyphicon-home" aria-hidden="true"></span>\n            Wachen umbenennen\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-leitstellen">\n            <span class="glyphicon glyphicon-map-marker" aria-hidden="true"></span>\n            Leitstellen umbenennen\n          </button>\n        </div>\n\n        <p class="text-muted" style="${sectionLabelStyle}">Sonstiges</p>\n        <div class="list-group">\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-how-it-works">\n            <span class="glyphicon glyphicon-question-sign" aria-hidden="true"></span>\n            So funktioniert's\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-history">\n            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span>\n            Verlauf\n          </button>\n          <button type="button" class="list-group-item vn-menu-item" id="vn-menu-settings">\n            <span class="glyphicon glyphicon-cog" aria-hidden="true"></span>\n            Einstellungen\n          </button>\n        </div>\n      </div>\n    `;
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
    document.getElementById("vn-menu-station-apply-check").addEventListener("click", () => renderStationCheckBlueprintSelection());
    document.getElementById("vn-menu-schooling").addEventListener("click", () => renderSchoolingBlueprintSelection());
    document.getElementById("vn-menu-statistics").addEventListener("click", () => renderStationStatisticsScreen());
    document.getElementById("vn-menu-vehicle-crew").addEventListener("click", () => renderVehicleCrewLeitstelleSelection());
    document.getElementById("vn-menu-station-blueprints").addEventListener("click", () => renderStationBlueprintsListScreen());
    document.getElementById("vn-menu-history").addEventListener("click", renderHistoryScreen);
    document.getElementById("vn-menu-settings").addEventListener("click", renderSettingsScreen);
    document.getElementById("vn-menu-how-it-works").addEventListener("click", () => renderHowItWorksScreen(renderMainMenu));
  }
  async function renderHowItWorksScreen(goBack) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("So funktioniert's");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <div class="vn-how-it-works"><p><em>Wird geladen ...</em></p></div>\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    try {
      const res = await fetchWithTimeout(`${HOW_IT_WORKS_URL}?_=${Date.now()}`, {
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();
      body.querySelector(".vn-how-it-works").innerHTML = renderMarkdownLite(markdown);
    } catch (e) {
      body.querySelector(".vn-how-it-works").innerHTML = `<p class="text-danger">Konnte nicht geladen werden: ${escapeHtml(e.message)}</p>`;
    }
  }
  function renderFooter() {
    if (!modalFooterEl) return;
    const channelSuffix = CHANNEL === "beta" ? " (Beta)" : "";
    const updateBadge = availableUpdateVersion ? `<button type="button" id="vn-footer-update-badge" class="btn btn-link"\n                 style="padding:0; border:0; color:#d9534f; font-weight:bold; font-size:inherit;">\n           Update verfügbar (v${escapeHtml(availableUpdateVersion)})\n         </button>` : "";
    modalFooterEl.innerHTML = `\n      ${updateBadge}\n      <span style="margin-left:auto;">FuxTools v${escapeHtml(SCRIPT_VERSION)}${channelSuffix} · © Fuxaro · CC BY-NC-SA 4.0</span>\n      <button type="button" id="vn-footer-close" class="btn btn-default btn-xs" style="margin-left:10px;">\n        <span class="glyphicon glyphicon-remove" aria-hidden="true"></span> Beenden\n      </button>\n    `;
    modalFooterEl.querySelector("#vn-footer-update-badge")?.addEventListener("click", renderSettingsScreen);
    modalFooterEl.querySelector("#vn-footer-close").addEventListener("click", closeModal);
  }
  async function fetchRemoteVersion() {
    const res = await fetchWithTimeout(`${UPDATE_CHECK_URL}?_=${Date.now()}`, {
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const match = text.match(/@version\s+([\d.]+)/);
    if (!match) throw new Error("Version im Remote-Script nicht gefunden.");
    return match[1];
  }
  function openUpdateTab() {
    pendingReloadAfterUpdate = true;
    window.open(`${UPDATE_CHECK_URL}?_=${Date.now()}`, "_blank", "noopener");
    renderUpdateRequiredScreen();
  }
  function renderUpdateRequiredScreen() {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p><span class="glyphicon glyphicon-cloud-download" aria-hidden="true"></span> <b>Update-Tab geöffnet</b></p>\n      <p class="text-muted" style="font-size:12px;">\n        Bitte im geöffneten Tab die neue Version in Tampermonkey bestätigen. FuxTools ist hier\n        erst nach einem Neuladen der Seite wieder bedienbar - so wird garantiert nicht\n        versehentlich mit der alten Version weitergearbeitet.\n      </p>\n      <button id="vn-btn-reload-now" type="button" class="btn btn-primary">\n        <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Seite neu laden\n      </button>\n    `;
    document.getElementById("vn-btn-reload-now").addEventListener("click", () => location.reload());
  }
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
    body.innerHTML = `\n      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">\n        <div class="vn-settings-card">\n          <p style="margin-top:0;">\n            Version <b>${escapeHtml(SCRIPT_VERSION)}</b>\n            <span class="label ${CHANNEL === "beta" ? "label-warning" : "label-success"}" style="margin-left:6px;">${channelLabel}</span>\n          </p>\n          <p class="text-muted" style="font-size:12px;">\n            ${CHANNEL === "beta" ? "Du nutzt den Beta-Kanal (eigener Branch, kann instabiler sein)." : "Du nutzt den Stable-Kanal (main-Branch)."}\n          </p>\n          <div class="form-group">\n            <button id="vn-btn-check-update" type="button" class="btn btn-primary">\n              <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Nach Updates suchen\n            </button>\n            <button id="vn-btn-force-reinstall" type="button" class="btn btn-default">\n              <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span> Neuinstallation erzwingen\n            </button>\n            <button id="vn-btn-show-changelog" type="button" class="btn btn-default">\n              <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Changelog anzeigen\n            </button>\n          </div>\n          <p class="text-muted" style="font-size:11px;">\n            Erzwingt den Installations-Dialog für den aktuellen Kanal (${channelLabel}), auch wenn sich\n            die Versionsnummer nicht geändert hat.\n          </p>\n          <div id="vn-update-status"></div>\n        </div>\n\n        <div class="vn-settings-card">\n          <p style="margin-top:0;"><b>Geforderte Ausbauten (Wachenausbau)</b></p>\n          <p class="text-muted" style="font-size:12px;">\n            Legt fest, welche Ausbauten im Wachenausbau je Gebäudetyp orange als "gefordert"\n            markiert werden. Standardmäßig eine feste Empfehlungs-Liste - hier anpassbar.\n          </p>\n          <button id="vn-btn-required-extensions" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Geforderte Ausbauten anpassen\n          </button>\n        </div>\n\n        <div class="vn-settings-card">\n          <p style="margin-top:0;"><b>Einstellungen sichern</b></p>\n          <p class="text-muted" style="font-size:12px;">\n            Lädt alle FuxTools-Einstellungen (Namens-Bausteine, Wachen-Bauplaner, geforderte\n            Ausbauten, Verlauf) als Datei herunter bzw. stellt sie aus so einer Datei wieder\n            her - praktisch vor einer Neuinstallation oder für einen anderen Rechner.\n          </p>\n          <button id="vn-btn-export-settings" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-download" aria-hidden="true"></span> Herunterladen\n          </button>\n          <button id="vn-btn-import-settings" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-upload" aria-hidden="true"></span> Hochladen\n          </button>\n          <input type="file" id="vn-import-settings-file" accept="application/json" style="display:none;">\n          <div id="vn-settings-transfer-status" style="margin-top:10px;"></div>\n        </div>\n\n        <div class="vn-settings-card">\n          <p style="margin-top:0;"><b>Fehlerprotokoll</b></p>\n          <p class="text-muted" style="font-size:12px;">\n            Speichert die letzten ${ERROR_LOG_MAX_ENTRIES} kritischen Fehler (mit Zeitstempel\n            und Version) - hilfreich für Bug-Reports während der Beta. Rein lokal, wird\n            nirgendwo automatisch hochgeladen.\n          </p>\n          <button id="vn-btn-show-errorlog" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Anzeigen\n          </button>\n          <button id="vn-btn-export-errorlog" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-download" aria-hidden="true"></span> Fehlerprotokoll exportieren\n          </button>\n          <div id="vn-errorlog-status" style="margin-top:10px;"></div>\n        </div>\n\n        <div class="vn-settings-card" style="border-color:#a94442;">\n          <p style="margin-top:0;"><b>Speicher löschen</b></p>\n          <p class="text-muted" style="font-size:12px;">\n            Setzt FuxTools auf den Zustand einer Neuinstallation zurück: alle gespeicherten\n            Fahrzeugtyp-Namen und Namens-Bausteine-Einstellungen werden gelöscht.\n          </p>\n          <button id="vn-btn-clear-storage" type="button" class="btn btn-danger">\n            <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Speicher löschen\n          </button>\n        </div>\n      </div>\n\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-btn-required-extensions").addEventListener("click", () => renderRequiredExtensionsSettingsScreen());
    document.getElementById("vn-btn-show-changelog").addEventListener("click", () => renderChangelogScreen(renderSettingsScreen));
    document.getElementById("vn-btn-export-settings").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-settings-transfer-status");
      statusEl.innerHTML = `<em>Einstellungen werden zusammengestellt ...</em>`;
      try {
        const bundle = await exportAllSettings();
        const blob = new Blob([ JSON.stringify(bundle, null, 2) ], {
          type: "application/json"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fuxtools-einstellungen-${(new Date).toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        statusEl.innerHTML = `<span class="text-success">Herunterladen gestartet.</span>`;
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
      }
    });
    document.getElementById("vn-btn-show-errorlog").addEventListener("click", () => renderErrorLogScreen(renderSettingsScreen));
    document.getElementById("vn-btn-export-errorlog").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-errorlog-status");
      const log = await getErrorLog();
      if (!log.length) {
        statusEl.innerHTML = `<span class="text-muted">Keine protokollierten Fehler vorhanden.</span>`;
        return;
      }
      const bundle = {
        fuxtools: true,
        version: SCRIPT_VERSION,
        exportedAt: Date.now(),
        errors: log
      };
      const blob = new Blob([ JSON.stringify(bundle, null, 2) ], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fuxtools-fehlerprotokoll-${(new Date).toISOString().slice(0, 10)}.json`;
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
      const confirmed = confirm("Achtung: Dadurch werden die aktuellen FuxTools-Einstellungen mit dem Inhalt der " + "Datei überschrieben. Fortfahren?");
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
    if (availableUpdateVersion) {
      renderUpdateAvailableStatus(document.getElementById("vn-update-status"), availableUpdateVersion);
    }
  }
  async function renderChangelogScreen(goBack) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Einstellungen › Changelog");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <div class="vn-changelog"><p><em>Changelog wird geladen ...</em></p></div>\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    try {
      const res = await fetchWithTimeout(`${CHANGELOG_URL}?_=${Date.now()}`, {
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const markdown = await res.text();
      body.querySelector(".vn-changelog").innerHTML = renderMarkdownLite(markdown);
    } catch (e) {
      body.querySelector(".vn-changelog").innerHTML = `<p class="text-danger">Changelog konnte nicht geladen werden: ${escapeHtml(e.message)}</p>`;
    }
  }
  function renderUpdateAvailableStatus(statusEl, version) {
    statusEl.innerHTML = `\n      <span class="text-success"><b>Update verfügbar: v${escapeHtml(version)}</b></span>\n      <div style="margin-top:6px;">\n        <button id="vn-btn-do-update" type="button" class="btn btn-success btn-sm">\n          <span class="glyphicon glyphicon-cloud-download" aria-hidden="true"></span> Jetzt aktualisieren\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-do-update").addEventListener("click", openUpdateTab);
  }
  function requiredExtensionsConfigurableTypes() {
    return PSEUDO_BUILDING_TYPES.map(t => {
      const buildingKey = getBuildingKey({
        building_type: t.buildingType,
        small_building: t.smallBuilding
      });
      return {
        pseudoId: t.id,
        buildingKey: buildingKey,
        typeName: BUILDING_TYPE_NAMES[buildingKey] || `Typ ${buildingKey}`,
        extensions: EXTENSION_CATALOG[buildingKey] || []
      };
    }).filter(t => t.extensions.length > 0);
  }
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
    const groupsHtml = types.map(t => `\n          <div style="margin-bottom:14px;">\n            <p style="font-weight:bold; margin:0 0 4px;">${escapeHtml(t.typeName)}</p>\n            <div>\n              ${t.extensions.map(ext => `\n                    <label style="display:inline-flex; align-items:center; gap:4px; margin:2px 10px 2px 0; font-weight:normal;">\n                      <input type="checkbox" class="vn-required-ext-checkbox" data-pseudo-id="${t.pseudoId}"\n                             data-extension-id="${ext.id}" ${isChecked(t.pseudoId, ext.id) ? "checked" : ""}>\n                      ${escapeHtml(ext.name)}\n                    </label>\n                  `).join("")}\n            </div>\n          </div>\n        `).join("");
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Angehakte Ausbauten werden im Wachenausbau orange als "gefordert" markiert.\n        Änderungen gelten erst nach "Speichern".\n        ${overrides ? "" : "Aktuell aktiv: die Standard-Empfehlungen."}\n      </p>\n      <div style="max-height:55vh; overflow:auto; padding-right:4px;">\n        ${groupsHtml}\n      </div>\n      <div id="vn-required-ext-status" style="margin-top:6px;"></div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-save-required" type="button" class="btn btn-success">\n          <span class="glyphicon glyphicon-ok" aria-hidden="true"></span> Speichern\n        </button>\n        <button id="vn-btn-reset-required" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span> Zurücksetzen auf Standard\n        </button>\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-save-required").addEventListener("click", async () => {
      const newOverrides = {};
      for (const t of types) newOverrides[t.pseudoId] = [];
      body.querySelectorAll(".vn-required-ext-checkbox:checked").forEach(cb => {
        newOverrides[cb.dataset.pseudoId].push(Number(cb.dataset.extensionId));
      });
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
        await logHistoryEntry({
          type: "required_extensions_config",
          label: changes.join(" · ")
        });
      }
      document.getElementById("vn-required-ext-status").innerHTML = '<span class="text-success">Gespeichert.</span>';
    });
    document.getElementById("vn-btn-reset-required").addEventListener("click", () => {
      renderSimpleConfirmScreen({
        title: "Einstellungen › Geforderte Ausbauten › Zurücksetzen",
        message: "Eigene Einstellung löschen und zu den Standard-Empfehlungen zurückkehren?",
        confirmLabel: "Zurücksetzen",
        confirmIcon: "glyphicon-repeat",
        goBack: () => renderRequiredExtensionsSettingsScreen(goBack),
        onConfirm: async () => {
          const hadOverrides = !!overrides;
          await GM.deleteValue(CUSTOM_REQUIRED_EXTENSIONS_KEY);
          if (hadOverrides) {
            await logHistoryEntry({
              type: "required_extensions_config",
              label: "Zurückgesetzt auf Standard-Empfehlungen"
            });
          }
          renderRequiredExtensionsSettingsScreen(goBack);
        }
      });
    });
  }
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
      searchField: "search"
    });
    const historySort = {
      column: "date",
      asc: false
    };
    const STATUS_RANK = {
      running: 0,
      error: 1,
      cancelled: 1
    };
    const STATUS_LABEL = {
      running: "läuft/unterbrochen ...",
      error: "Fehler",
      cancelled: "abgebrochen"
    };
    const STATUS_BADGE_CLASS = {
      running: "label-warning",
      error: "label-danger",
      cancelled: "label-default"
    };
    function historySortKey(column, entry) {
      switch (column) {
       case "status":
        return STATUS_RANK[entry.status] ?? 2;

       case "function":
        return `${HISTORY_TYPE_LABELS[entry.type] || entry.type || ""}: ${entry.label || ""}`.toLowerCase();

       case "cost":
        return entry.cost == null ? -1 : entry.cost;

       case "date":
       default:
        return entry.timestamp;
      }
    }
    function renderHistoryRows() {
      const dir = historySort.asc ? 1 : -1;
      const sorted = [ ...history ].sort((a, b) => {
        const ka = historySortKey(historySort.column, a);
        const kb = historySortKey(historySort.column, b);
        if (typeof ka === "number" && typeof kb === "number") return dir * (ka - kb);
        return dir * String(ka).localeCompare(String(kb), "de");
      });
      return sorted.map(entry => {
        const date = new Date(entry.timestamp);
        const typeLabel = HISTORY_TYPE_LABELS[entry.type] || entry.type || "-";
        const costLabel = entry.cost == null ? "-" : entry.currency === "coins" ? `${entry.cost.toLocaleString("de-DE")} Coins` : `${entry.cost.toLocaleString("de-DE")} Credits`;
        const searchText = `${entry.label || ""} ${entry.station || ""}`.toLowerCase();
        const statusBadge = STATUS_LABEL[entry.status] ? `<span class="label ${STATUS_BADGE_CLASS[entry.status] || "label-default"}">${STATUS_LABEL[entry.status]}</span>` : `<span class="label label-success">abgeschlossen</span>`;
        return `\n            <tr class="vn-history-row" data-type="${escapeHtml(entry.type || "")}" data-search="${escapeHtml(searchText)}">\n              <td>${escapeHtml(date.toLocaleDateString("de-DE"))}</td>\n              <td>${escapeHtml(date.toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit"
        }))}</td>\n              <td>${statusBadge}</td>\n              <td>\n                ${escapeHtml(typeLabel)}: ${escapeHtml(entry.label || "-")}\n                <br><small class="text-muted">${escapeHtml(entry.station || "-")} · v${escapeHtml(entry.version || "?")}</small>\n              </td>\n              <td>${escapeHtml(costLabel)}</td>\n            </tr>\n          `;
      }).join("");
    }
    function historyHeaderHtml() {
      const arrow = col => historySort.column === col ? `<span class="glyphicon glyphicon-triangle-${historySort.asc ? "bottom" : "top"}" aria-hidden="true" style="font-size:10px;"></span>` : "";
      const th = (col, label) => `<th class="vn-history-sort-th" data-sort="${col}" style="cursor:pointer; white-space:nowrap;">${label} ${arrow(col)}</th>`;
      return `${th("date", "Datum")}${th("date", "Uhrzeit")}${th("status", "Status")}${th("function", "Funktion")}${th("cost", "Kosten")}`;
    }
    function bindHistorySortHeaders() {
      body.querySelectorAll(".vn-history-sort-th").forEach(th => {
        th.addEventListener("click", () => {
          const col = th.dataset.sort;
          if (historySort.column === col) historySort.asc = !historySort.asc; else {
            historySort.column = col;
            historySort.asc = true;
          }
          updateHistoryTable();
        });
      });
    }
    function updateHistoryTable() {
      const headRow = document.getElementById("vn-history-head");
      if (headRow) headRow.innerHTML = historyHeaderHtml();
      document.getElementById("vn-history-body").innerHTML = renderHistoryRows() || '<tr><td colspan="5" class="text-muted">Noch keine Aktionen aufgezeichnet.</td></tr>';
      bindHistorySortHeaders();
      applyRowVisibility();
    }
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Zeigt Ausbauten, Lagerräume, Ausbaustufen sowie Umbenennen/Zurücksetzen von\n        Fahrzeugen, Wachen und Leitstellen, die über FuxTools durchgeführt wurden - nur\n        auf diesem Gerät gespeichert.\n      </p>\n      <div style="display:flex; gap:8px; margin-bottom:8px;">\n        <select id="vn-history-type-filter" class="form-control" style="max-width:220px;">\n          <option value="">Alle Aktionen</option>\n          <option value="extension">Ausbau</option>\n          <option value="storage">Lagerraum</option>\n          <option value="level">Ausbaustufe</option>\n          <option value="vehicle_rename">Fahrzeuge umbenennen</option>\n          <option value="vehicle_reset">Fahrzeuge zurücksetzen</option>\n          <option value="station_rename">Wachen umbenennen</option>\n          <option value="leitstelle_rename">Leitstellen umbenennen</option>\n          <option value="required_extensions_config">Geforderte Ausbauten</option>\n          <option value="personnel_requirements_config">Personal-Standard</option>\n          <option value="schooling_start">Schulung gestartet</option>\n          <option value="crew_assignment">Fahrzeug-Besatzung</option>\n          <option value="crew_unassign_all">Besatzung abgezogen</option>\n        </select>\n        <input type="text" id="vn-history-search" class="form-control" placeholder="Suchen ..." style="flex:1;">\n      </div>\n      <div style="max-height:55vh; overflow:auto;">\n        <table class="table table-condensed table-striped" style="font-size:12px; table-layout:fixed; width:100%;">\n          <colgroup>\n            <col style="width:12%;">\n            <col style="width:10%;">\n            <col style="width:14%;">\n            <col style="width:44%;">\n            <col style="width:20%;">\n          </colgroup>\n          <thead>\n            <tr id="vn-history-head">${historyHeaderHtml()}</tr>\n          </thead>\n          <tbody id="vn-history-body">\n            ${renderHistoryRows() || '<tr><td colspan="5" class="text-muted">Noch keine Aktionen aufgezeichnet.</td></tr>'}\n          </tbody>\n        </table>\n      </div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-history-search").addEventListener("input", applyRowVisibility);
    document.getElementById("vn-history-type-filter").addEventListener("change", applyRowVisibility);
    bindHistorySortHeaders();
  }
  async function renderErrorLogScreen(goBack = renderSettingsScreen) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Fehlerprotokoll");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Fehlerprotokoll ...</p>`;
    const log = await getErrorLog();
    const rows = log.map(entry => {
      const date = new Date(entry.timestamp);
      return `\n          <tr>\n            <td>${escapeHtml(date.toLocaleDateString("de-DE"))} ${escapeHtml(date.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit"
      }))}</td>\n            <td>${escapeHtml(entry.context || "-")}</td>\n            <td>${escapeHtml(entry.message || "-")}</td>\n            <td>v${escapeHtml(entry.version || "?")}</td>\n          </tr>\n        `;
    }).join("");
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Die letzten ${ERROR_LOG_MAX_ENTRIES} kritischen Fehler - nur auf diesem Gerät gespeichert.\n      </p>\n      <div style="max-height:55vh; overflow:auto;">\n        <table class="table table-condensed table-striped" style="font-size:12px; table-layout:fixed; width:100%;">\n          <colgroup>\n            <col style="width:18%;">\n            <col style="width:22%;">\n            <col style="width:50%;">\n            <col style="width:10%;">\n          </colgroup>\n          <thead>\n            <tr>\n              <th>Zeitpunkt</th>\n              <th>Kontext</th>\n              <th>Meldung</th>\n              <th>Version</th>\n            </tr>\n          </thead>\n          <tbody>\n            ${rows || '<tr><td colspan="4" class="text-muted">Keine protokollierten Fehler vorhanden.</td></tr>'}\n          </tbody>\n        </table>\n      </div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
  }
  function addMenuEntry() {
    addCustomStyles();
    const logoImg = document.createElement("img");
    logoImg.src = LOGO_URL;
    logoImg.alt = "";
    logoImg.style.cssText = "height:24px; width:24px; border-radius:3px; vertical-align:middle; margin-right:6px;";
    logoImg.addEventListener("error", () => {
      logoImg.replaceWith(Object.assign(document.createElement("span"), {
        className: "glyphicon glyphicon-wrench",
        style: "margin-right:6px;"
      }));
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
    const profileLi = document.querySelector("#menu_profile")?.closest("li");
    if (!profileLi) {
      reportError("Navbar-Eintrag konnte nicht eingefügt werden", new Error("#menu_profile nicht gefunden - FuxTools ist über das Menü nicht erreichbar."));
      return;
    }
    li.className = profileLi.className;
    profileLi.parentNode.insertBefore(li, profileLi);
    const taskCenterIconWrap = document.createElement("span");
    taskCenterIconWrap.style.cssText = "position:relative; display:inline-block; width:22px; height:22px;";
    const taskCenterLogo = document.createElement("img");
    taskCenterLogo.src = LOGO_URL;
    taskCenterLogo.alt = "";
    taskCenterLogo.style.cssText = "width:22px; height:22px; border-radius:3px;";
    taskCenterLogo.addEventListener("error", () => taskCenterLogo.remove());
    taskCenterIconWrap.appendChild(taskCenterLogo);
    backgroundTaskBadgeEl = document.createElement("span");
    backgroundTaskBadgeEl.style.cssText = "position:absolute; bottom:-4px; right:-6px; font-size:12px; line-height:1; color:#fff; " + "text-shadow:0 0 2px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9);";
    taskCenterIconWrap.appendChild(backgroundTaskBadgeEl);
    const taskCenterLink = document.createElement("a");
    taskCenterLink.href = "#";
    taskCenterLink.title = "FuxTools - laufende Aufgaben";
    taskCenterLink.style.cssText = "display:flex; align-items:center; height:100%; padding:15px 12px;";
    taskCenterLink.appendChild(taskCenterIconWrap);
    const taskCenterLi = document.createElement("li");
    taskCenterLi.id = "vn-task-center-entry";
    taskCenterLi.role = "presentation";
    taskCenterLi.className = profileLi.className;
    taskCenterLi.setAttribute("data-toggle", "modal");
    taskCenterLi.setAttribute("data-target", `#${modalId}`);
    taskCenterLi.appendChild(taskCenterLink);
    profileLi.parentNode.insertBefore(taskCenterLi, profileLi);
    taskCenterEntryEl = taskCenterLi;
    updateBackgroundTaskBadge();
  }
  let gameVehicles = [];
  let gameBuildingsById = new Map;
  let allStations = [];
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
    const byBuilding = new Map;
    for (const v of gameVehicles) {
      const bId = String(v.building_id ?? v.building);
      if (!byBuilding.has(bId)) byBuilding.set(bId, []);
      byBuilding.get(bId).push(v);
    }
    allStations = [ ...byBuilding.entries() ].map(([id, list]) => {
      const building = gameBuildingsById.get(id) || {};
      const leitstelleId = building.leitstelle_building_id != null ? String(building.leitstelle_building_id) : null;
      const leitstelleBuilding = leitstelleId ? gameBuildingsById.get(leitstelleId) : null;
      return {
        id: id,
        name: building.caption || `Wache ${id}`,
        category: categoryForBuilding(building),
        leitstelleId: leitstelleId || "none",
        leitstelleName: leitstelleId ? leitstelleBuilding?.caption || `Leitstelle ${leitstelleId}` : "Ohne Leitstelle",
        vehicles: list
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const byLeitstelle = new Map;
    for (const s of allStations) {
      if (!byLeitstelle.has(s.leitstelleId)) {
        byLeitstelle.set(s.leitstelleId, {
          name: s.leitstelleName,
          stations: []
        });
      }
      byLeitstelle.get(s.leitstelleId).stations.push(s);
    }
    const rows = [ ...byLeitstelle.entries() ].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, info]) => {
      const vehicleCount = info.stations.reduce((sum, s) => sum + s.vehicles.length, 0);
      return `\n        <div class="checkbox" style="margin: 2px 0; break-inside: avoid;">\n          <label>\n            <input type="checkbox" class="vn-leitstelle-check" value="${id}">\n            ${escapeHtml(info.name)} <span class="text-muted">(${info.stations.length} Wachen, ${vehicleCount} Fahrzeuge)</span>\n          </label>\n        </div>`;
    }).join("");
    body.innerHTML = `\n      <p>Wähle die Leitstelle(n) aus:</p>\n      <div style="max-height: 380px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 4px; column-count: 2; column-gap: 20px;">\n        ${rows || '<p class="text-muted"><em>Keine Leitstellen gefunden.</em></p>'}\n      </div>\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-next-leitstelle" type="button" class="btn btn-primary">\n          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-btn-next-leitstelle").addEventListener("click", () => {
      const ids = [ ...body.querySelectorAll(".vn-leitstelle-check:checked") ].map(el => el.value);
      if (!ids.length) {
        alert("Bitte mindestens eine Leitstelle auswählen.");
        return;
      }
      selectedLeitstelleIds = ids;
      renderStationSelection();
    });
  }
  function renderStationSelection() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const stations = allStations.filter(s => selectedLeitstelleIds.includes(s.leitstelleId));
    const byCategory = new Map;
    for (const s of stations) {
      if (!byCategory.has(s.category)) byCategory.set(s.category, []);
      byCategory.get(s.category).push(s);
    }
    const categoryBlocks = CATEGORY_ORDER.filter(cat => byCategory.has(cat)).map((cat, idx) => {
      const catStations = byCategory.get(cat);
      const collapseId = `vn-cat-collapse-${idx}`;
      const stationRows = catStations.map(s => `\n          <div class="checkbox" style="margin: 2px 0; break-inside: avoid;">\n            <label>\n              <input type="checkbox" class="vn-station-check" value="${s.id}">\n              ${escapeHtml(s.name)} <span class="text-muted">(${s.vehicles.length} Fahrzeuge)</span>\n            </label>\n          </div>`).join("");
      return `\n        <div class="panel panel-default" style="margin-bottom: 8px;">\n          <div class="panel-heading vn-category-heading" data-toggle="collapse" data-target="#${collapseId}">\n            <span class="glyphicon glyphicon-triangle-right" aria-hidden="true"></span>\n            <b>${escapeHtml(cat)}</b>\n            <span class="text-muted">(${catStations.length} Wachen)</span>\n            <label style="font-size:11px; float:right; font-weight:normal; margin:0; cursor:pointer;">\n              <input type="checkbox" class="vn-category-master" data-category="${escapeHtml(cat)}">\n              alle auswählen\n            </label>\n          </div>\n          <div id="${collapseId}" class="panel-collapse collapse">\n            <div class="panel-body" style="column-count: 2; column-gap: 20px;">\n              ${stationRows}\n            </div>\n          </div>\n        </div>`;
    }).join("");
    body.innerHTML = `\n      <p>Wähle die Wachen aus, deren Fahrzeuge du umbenennen möchtest (Kategorie anklicken zum Auf-/Zuklappen):</p>\n      <div style="max-height: 460px; overflow-y: auto; padding: 4px;">\n        ${categoryBlocks || '<p class="text-muted"><em>Keine Fahrzeuge gefunden.</em></p>'}\n      </div>\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-next" type="button" class="btn btn-primary">\n          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderLeitstelleSelection);
    body.querySelectorAll(".vn-category-heading .glyphicon-triangle-right").forEach(icon => {
      icon.closest(".vn-category-heading").addEventListener("click", () => icon.classList.toggle("vn-rotated"));
    });
    body.querySelectorAll(".vn-category-master").forEach(master => {
      master.addEventListener("click", e => e.stopPropagation());
      master.closest("label").addEventListener("click", e => e.stopPropagation());
      const cat = master.dataset.category;
      const childCheckboxes = byCategory.get(cat).map(s => body.querySelector(`.vn-station-check[value="${s.id}"]`));
      master.addEventListener("change", () => {
        childCheckboxes.forEach(cb => cb.checked = master.checked);
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
      const selectedIds = [ ...body.querySelectorAll(".vn-station-check:checked") ].map(el => el.value);
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
  const defaultTemplate = {
    useText1: false,
    text1: "DE",
    useType: true,
    useText2: false,
    text2: "-SH-",
    useNumber: true
  };
  function getTemplate() {
    return Object.assign({}, defaultTemplate, namesStore.__template || {});
  }
  function composeName(tpl, enteredName, caption, nr, padding) {
    const segments = [];
    if (tpl.useText1 && tpl.text1) segments.push(tpl.text1);
    if (tpl.useType) segments.push(enteredName || caption);
    if (tpl.useText2 && tpl.text2) segments.push(tpl.text2);
    if (tpl.useNumber) segments.push(padding ? String(nr).padStart(2, "0") : String(nr));
    return segments.join(" ") || enteredName || caption;
  }
  function readNamingTemplateFromForm() {
    return {
      useText1: document.getElementById("vn-use-text1").checked,
      text1: document.getElementById("vn-text1").value.trim(),
      useType: document.getElementById("vn-use-type").checked,
      useText2: document.getElementById("vn-use-text2").checked,
      text2: document.getElementById("vn-text2").value.trim(),
      useNumber: document.getElementById("vn-use-number").checked
    };
  }
  function renderNameForm(selectedStations) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const tpl = getTemplate();
    const byType = new Map;
    for (const station of selectedStations) {
      for (const v of station.vehicles) {
        const typeId = String(v.vehicle_type ?? v.type);
        if (!byType.has(typeId)) {
          const caption = vehicleTypeCaptions[typeId] || v.vehicle_type_caption || `Typ ${typeId}`;
          byType.set(typeId, {
            caption: caption,
            count: 0
          });
        }
        byType.get(typeId).count++;
      }
    }
    const typeRows = [ ...byType.entries() ].sort((a, b) => a[1].caption.localeCompare(b[1].caption)).map(([typeId, info]) => {
      const savedName = namesStore[typeId] || "";
      return `\n        <div class="form-group vn-type-row" data-type="${typeId}" data-caption="${escapeHtml(info.caption)}" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">\n          <label style="flex: 0 0 24px; margin: 0;">\n            <input type="checkbox" class="vn-type-include" checked>\n          </label>\n          <label style="flex: 0 0 196px; margin: 0;">${escapeHtml(info.caption)} <span class="text-muted">(${info.count}x insgesamt)</span></label>\n          <input type="text" class="form-control vn-name-input" placeholder="eigenes Kürzel (optional), sonst Fahrzeugtypname" value="${escapeHtml(savedName)}" style="flex:1;">\n        </div>`;
    }).join("");
    body.innerHTML = `\n      <p class="text-muted">${selectedStations.length} Wache(n) ausgewählt.</p>\n\n      <fieldset style="border:1px solid #ddd; border-radius:4px; padding:10px; margin-bottom:12px;">\n        <legend style="font-size:13px; font-weight:bold; width:auto; padding:0 6px; margin-bottom:8px; border:none;">Namens-Bausteine</legend>\n        <div style="display:grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap:4px 10px; align-items:end;">\n          <div>\n            <label style="display:flex; align-items:center; gap:4px; margin:0 0 4px;">\n              <input type="checkbox" id="vn-use-text1" ${tpl.useText1 ? "checked" : ""}> Text 1\n            </label>\n            <input type="text" id="vn-text1" class="form-control input-sm" style="width:100%;" placeholder="z.B. DE" value="${escapeHtml(tpl.text1)}">\n          </div>\n          <div style="color:#999; padding-bottom:6px;">&rarr;</div>\n          <div>\n            <label style="display:flex; align-items:center; gap:4px; margin:0 0 4px;">\n              <input type="checkbox" id="vn-use-type" ${tpl.useType ? "checked" : ""}> Fahrzeugtyp-Name\n            </label>\n          </div>\n          <div style="color:#999; padding-bottom:6px;">&rarr;</div>\n          <div>\n            <label style="display:flex; align-items:center; gap:4px; margin:0 0 4px;">\n              <input type="checkbox" id="vn-use-text2" ${tpl.useText2 ? "checked" : ""}> Text 2\n            </label>\n            <input type="text" id="vn-text2" class="form-control input-sm" style="width:100%;" placeholder="z.B. -SH-" value="${escapeHtml(tpl.text2)}">\n          </div>\n        </div>\n        <p class="text-muted" style="font-size:11px; margin:10px 0 0;">\n          Deaktivierte oder leere Bausteine werden übersprungen, die Nummer kommt immer ans Ende.\n          Text 1/Text 2 gelten global für alle ausgewählten Fahrzeugtypen.\n        </p>\n        <p class="text-muted" style="font-size:11px; margin:4px 0 0;">\n          Für einen komplett manuellen, freien Namen: Text 1 und Text 2 hier deaktivieren und den\n          gewünschten Namen direkt ins Kürzel-Feld pro Fahrzeugtyp unten eintragen.\n        </p>\n      </fieldset>\n\n      <div class="alert alert-info" style="padding:8px 12px; margin-bottom:12px;">\n        Vorschau: <b id="vn-preview-text">-</b>\n      </div>\n\n      <p class="text-muted" style="font-size:11px;">\n        Häkchen pro Zeile wählt aus, welche Fahrzeugtypen überhaupt umbenannt werden. Das\n        Kürzel-Textfeld ist nur relevant, wenn "Fahrzeugtyp-Name" oben aktiv ist (leer = offizieller\n        Fahrzeugtypname) - sonst ist es ausgegraut und wirkungslos.\n      </p>\n      <fieldset style="border:1px solid #ddd; border-radius:4px; padding:10px; margin-bottom:12px;">\n        ${typeRows}\n      </fieldset>\n      <div class="form-inline" style="margin: 10px 0;">\n        <label style="margin-right: 16px; display:inline-flex; align-items:center; gap:4px;" id="vn-number-toggle-wrap">\n          <input type="checkbox" id="vn-use-number" ${tpl.useNumber ? "checked" : ""}> Nummer anhängen\n        </label>\n        <label style="margin-right: 16px;">Start-Nummer\n          <input type="number" id="vn-start-nr" class="form-control input-sm" value="1" style="width:70px; margin-left:6px;">\n        </label>\n        <label>\n          <input type="checkbox" id="vn-padding" checked> Führende Nullen (01, 02, ...)\n        </label>\n      </div>\n      <p class="text-muted" style="font-size:11px;">Nummeriert wird <b>pro Wache separat</b> (jede Wache startet wieder bei der Start-Nummer).</p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-run" type="button" class="btn btn-success">\n          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Fahrzeuge umbenennen\n        </button>\n        <button id="vn-btn-reset-template" type="button" class="btn btn-default"\n                title="Setzt Text 1, Fahrzeugtyp-Name, Text 2 und Nummer auf die Standardeinstellung zurück">\n          <span class="glyphicon glyphicon-repeat" aria-hidden="true"></span> Bausteine zurücksetzen\n        </button>\n      </div>\n      <div id="vn-status" style="margin-top: 10px; font-weight: bold; white-space: pre-wrap;"></div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderStationSelection);
    document.getElementById("vn-btn-run").addEventListener("click", () => runRenaming(selectedStations));
    document.getElementById("vn-btn-reset-template").addEventListener("click", () => {
      renderSimpleConfirmScreen({
        title: "Fahrzeuge umbenennen › Bausteine zurücksetzen",
        message: "Die Namens-Bausteine-Vorlage (Text 1, Fahrzeugtyp-Name, Text 2, Nummer) wieder auf " + "die Standardeinstellung zurücksetzen?",
        confirmLabel: "Zurücksetzen",
        confirmIcon: "glyphicon-repeat",
        goBack: () => renderNameForm(selectedStations),
        onConfirm: async () => {
          delete namesStore.__template;
          await saveNamesStore();
          renderNameForm(selectedStations);
        }
      });
    });
    function persistTemplate() {
      namesStore.__template = readNamingTemplateFromForm();
      saveNamesStore();
    }
    [ "vn-use-text1", "vn-text1", "vn-use-type", "vn-use-text2", "vn-text2", "vn-use-number" ].forEach(id => {
      document.getElementById(id).addEventListener("change", persistTemplate);
    });
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
    const useTypeCheckbox = document.getElementById("vn-use-type");
    function syncTypeNameInputs() {
      const enabled = useTypeCheckbox.checked;
      body.querySelectorAll(".vn-name-input").forEach(input => {
        input.disabled = !enabled;
        input.style.backgroundColor = enabled ? "" : "#eee";
        input.style.color = enabled ? "" : "#999";
        input.style.cursor = enabled ? "" : "not-allowed";
        input.placeholder = enabled ? "eigenes Kürzel (optional), sonst Fahrzeugtypname" : "wird nicht verwendet (Fahrzeugtyp-Name oben deaktiviert)";
      });
    }
    useTypeCheckbox.addEventListener("change", syncTypeNameInputs);
    syncTypeNameInputs();
    const previewEl = document.getElementById("vn-preview-text");
    function updatePreview() {
      const previewTpl = readNamingTemplateFromForm();
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
    const tpl = readNamingTemplateFromForm();
    namesStore.__template = tpl;
    const plan = [];
    body.querySelectorAll(".vn-type-row").forEach(row => {
      const input = row.querySelector(".vn-name-input");
      const enteredName = input.value.trim();
      const typeId = row.dataset.type;
      const caption = row.dataset.caption || `Typ ${typeId}`;
      if (!row.querySelector(".vn-type-include").checked) return;
      if (enteredName) {
        namesStore[typeId] = enteredName;
      } else {
        delete namesStore[typeId];
      }
      for (const station of selectedStations) {
        const vList = station.vehicles.filter(v => String(v.vehicle_type ?? v.type) === typeId).sort((a, b) => a.id - b.id);
        vList.forEach((v, idx) => {
          const newName = composeName(tpl, enteredName, caption, startNr + idx, padding);
          plan.push({
            id: v.id,
            oldName: v.caption,
            newName: newName,
            station: station.name
          });
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
  function renderRenameConfirmation(selectedStations, plan) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const exampleName = plan.length ? plan[0].newName : "-";
    body.innerHTML = `\n      <p>Bereit zum Umbenennen von <b>${plan.length}</b> Fahrzeug(en) in <b>${selectedStations.length}</b> Wache(n).</p>\n      <div class="alert alert-info" style="padding:8px 12px; margin-bottom:12px;">\n        Vorschau: <b>${escapeHtml(exampleName)}</b>\n      </div>\n      <p class="text-muted" style="font-size:12px;">Wirklich umbenennen, oder nochmal zurück zu den Einstellungen?</p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-confirm-run" type="button" class="btn btn-success">\n          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Umbenennen\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", () => renderNameForm(selectedStations));
    document.getElementById("vn-btn-confirm-run").addEventListener("click", () => {
      executeRenamePlan(plan, "umbenannt", () => renderNameForm(selectedStations));
    });
  }
  function renderResetScreen(selectedStations) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const totalVehicles = selectedStations.reduce((sum, s) => sum + s.vehicles.length, 0);
    body.innerHTML = `\n      <p class="text-muted">${selectedStations.length} Wache(n) ausgewählt.</p>\n      <p>Alle <b>${totalVehicles}</b> Fahrzeuge in diesen Wachen werden auf ihren reinen Fahrzeugtyp-Namen zurückgesetzt (keine Nummer, kein Präfix).</p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-reset" type="button" class="btn btn-danger">\n          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Auf Standard zurücksetzen\n        </button>\n      </div>\n      <div id="vn-status" style="margin-top: 10px; font-weight: bold; white-space: pre-wrap;"></div>\n    `;
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
        plan.push({
          id: v.id,
          oldName: v.caption,
          newName: typeName,
          station: station.name
        });
      }
    }
    if (!plan.length) {
      statusEl.textContent = "Keine Fahrzeuge gefunden.";
      return;
    }
    executeRenamePlan(plan, "zurückgesetzt", () => renderResetScreen(selectedStations));
  }
  async function loadAllBuildings() {
    const {buildings: buildings, buildingsById: buildingsById} = await loadGameData();
    const leitstelleIds = new Set;
    for (const b of buildings) {
      if (b.leitstelle_building_id != null) leitstelleIds.add(String(b.leitstelle_building_id));
    }
    const leitstellen = buildings.filter(b => leitstelleIds.has(String(b.id))).map(b => ({
      id: String(b.id),
      name: b.caption || `Leitstelle ${b.id}`
    })).sort((a, b) => a.name.localeCompare(b.name));
    const stations = buildings.filter(b => !leitstelleIds.has(String(b.id)) && categoryForBuilding(b) !== "Unbekannt").map(b => {
      const leitstelleId = b.leitstelle_building_id != null ? String(b.leitstelle_building_id) : null;
      const leitstelleBuilding = leitstelleId ? buildingsById.get(leitstelleId) : null;
      return {
        id: String(b.id),
        name: b.caption || `Wache ${b.id}`,
        category: categoryForBuilding(b),
        leitstelleId: leitstelleId || "none",
        leitstelleName: leitstelleId ? leitstelleBuilding?.caption || `Leitstelle ${leitstelleId}` : "Ohne Leitstelle"
      };
    }).sort((a, b) => Number(a.id) - Number(b.id));
    return {
      leitstellen: leitstellen,
      stations: stations
    };
  }
  async function renderStationRenameLeitstelleSelection() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Wachen umbenennen › Leitstelle wählen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Leitstellen &amp; Wachen ...</em></p>`;
    let stations;
    try {
      ({stations: stations} = await loadAllBuildings());
    } catch (e) {
      body.innerHTML = `<p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>`;
      return;
    }
    const byLeitstelle = new Map;
    for (const s of stations) {
      if (!byLeitstelle.has(s.leitstelleId)) byLeitstelle.set(s.leitstelleId, {
        name: s.leitstelleName,
        stations: []
      });
      byLeitstelle.get(s.leitstelleId).stations.push(s);
    }
    const rows = [ ...byLeitstelle.entries() ].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, info]) => `\n        <div class="checkbox" style="margin: 2px 0; break-inside: avoid;">\n          <label>\n            <input type="checkbox" class="vn-leitstelle-check" value="${id}">\n            ${escapeHtml(info.name)} <span class="text-muted">(${info.stations.length} Wachen)</span>\n          </label>\n        </div>`).join("");
    body.innerHTML = `\n      <p>Wähle die Leitstelle(n) aus:</p>\n      <div style="max-height: 380px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 4px; column-count: 2; column-gap: 20px;">\n        ${rows || '<p class="text-muted"><em>Keine Leitstellen gefunden.</em></p>'}\n      </div>\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-next-leitstelle" type="button" class="btn btn-primary">\n          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-btn-next-leitstelle").addEventListener("click", () => {
      const ids = [ ...body.querySelectorAll(".vn-leitstelle-check:checked") ].map(el => el.value);
      if (!ids.length) {
        alert("Bitte mindestens eine Leitstelle auswählen.");
        return;
      }
      renderStationRenameScreen(ids);
    });
  }
  function renderBuildingRenameConfirm(plan, verb, goBack, itemNoun) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p>Bereit, <b>${plan.length} ${escapeHtml(itemNoun)}</b> umzubenennen.</p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-confirm-run" type="button" class="btn btn-success">\n          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Umbenennen\n        </button>\n      </div>\n    `;
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
      ({stations: stations} = await loadAllBuildings());
    } catch (e) {
      body.innerHTML = `<p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>`;
      return;
    }
    if (selectedLeitstelleIds) {
      stations = stations.filter(s => selectedLeitstelleIds.includes(s.leitstelleId));
    }
    let sortMode = "id";
    const openCategories = new Set;
    let searchQuery = "";
    function sortHeaderHtml() {
      const arrow = col => sortMode === col ? '<span class="glyphicon glyphicon-triangle-bottom" aria-hidden="true"></span>' : "";
      return `\n        <div style="display:flex; font-size:12px; font-weight:bold; padding:4px 10px; border-bottom:2px solid rgba(128,128,128,0.4);">\n          <div class="vn-wache-sort-th" data-sort="id" style="flex:0 0 18%; cursor:pointer;">Wachen-ID ${arrow("id")}</div>\n          <div class="vn-wache-sort-th" data-sort="name" style="flex:1; cursor:pointer;">Name ${arrow("name")}</div>\n          <div style="flex:1;">Neuer Name</div>\n        </div>\n      `;
    }
    function render() {
      const previousValues = new Map;
      body.querySelectorAll(".vn-building-row").forEach(row => {
        const val = row.querySelector(".vn-building-name-input")?.value;
        if (val) previousValues.set(row.dataset.id, val);
      });
      const byCategory = new Map;
      for (const s of stations) {
        if (!byCategory.has(s.category)) byCategory.set(s.category, []);
        byCategory.get(s.category).push(s);
      }
      const comparator = sortMode === "name" ? (a, b) => a.name.localeCompare(b.name, "de") : (a, b) => Number(a.id) - Number(b.id);
      const categoryBlocks = CATEGORY_ORDER.filter(cat => byCategory.has(cat)).map((cat, idx) => {
        const catStations = [ ...byCategory.get(cat) ].sort(comparator);
        const collapseId = `vn-wache-cat-collapse-${idx}`;
        const isOpen = openCategories.has(cat);
        const rows = catStations.map(s => `\n            <tr class="vn-building-row" data-id="${s.id}" data-category="${escapeHtml(cat)}" data-name="${escapeHtml(s.name)}"\n                data-search="${escapeHtml(`${s.name} ${s.id}`.toLowerCase())}">\n              <td class="text-muted">${escapeHtml(s.id)}</td>\n              <td><a href="/buildings/${s.id}" target="_blank">${escapeHtml(s.name)}</a></td>\n              <td>\n                <input type="text" class="form-control input-sm vn-building-name-input" placeholder="leer = keine Änderung"\n                       value="${escapeHtml(previousValues.get(s.id) || "")}">\n              </td>\n            </tr>`).join("");
        return `\n          <div class="panel panel-default vn-wache-category-panel" data-category="${escapeHtml(cat)}" style="margin-bottom: 8px;">\n            <div class="panel-heading vn-category-heading" data-toggle="collapse" data-target="#${collapseId}" data-category="${escapeHtml(cat)}">\n              <span class="glyphicon glyphicon-triangle-right ${isOpen ? "vn-rotated" : ""}" aria-hidden="true"></span>\n              <b>${escapeHtml(cat)}</b> <span class="text-muted">(${catStations.length} Wachen)</span>\n            </div>\n            <div id="${collapseId}" class="panel-collapse collapse${isOpen ? " in" : ""}">\n              <table class="table table-condensed" style="font-size:12px; margin-bottom:0;">\n                <colgroup><col style="width:18%;"><col><col></colgroup>\n                <tbody>${rows}</tbody>\n              </table>\n            </div>\n          </div>`;
      }).join("");
      body.innerHTML = `\n        <p class="text-muted">Aktueller Name → neuer Name. Leeres Feld = keine Änderung.</p>\n        <input type="text" id="vn-wache-search" class="form-control input-sm" style="max-width:280px; margin-bottom:8px;"\n               placeholder="Suche nach Name oder Wachen-ID ..." value="${escapeHtml(searchQuery)}">\n        ${categoryBlocks ? sortHeaderHtml() : ""}\n        ${categoryBlocks || '<p class="text-muted"><em>Keine Wachen gefunden.</em></p>'}\n        <p id="vn-wache-search-empty" class="text-muted" style="display:none;"><em>Keine Wache passt zur Suche.</em></p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n          <button id="vn-btn-save-buildings" type="button" class="btn btn-success">\n            <span class="glyphicon glyphicon-floppy-disk" aria-hidden="true"></span> Speichern\n          </button>\n        </div>\n      `;
      body.querySelectorAll(".vn-wache-sort-th").forEach(th => {
        th.addEventListener("click", () => {
          sortMode = th.dataset.sort;
          render();
        });
      });
      body.querySelectorAll(".vn-category-heading .glyphicon-triangle-right").forEach(icon => {
        const heading = icon.closest(".vn-category-heading");
        heading.addEventListener("click", () => {
          icon.classList.toggle("vn-rotated");
          const cat = heading.dataset.category;
          if (openCategories.has(cat)) openCategories.delete(cat); else openCategories.add(cat);
        });
      });
      function applyStationFilter() {
        const query = searchQuery.trim().toLowerCase();
        let anyVisible = false;
        body.querySelectorAll(".vn-wache-category-panel").forEach(panel => {
          const cat = panel.dataset.category;
          let categoryHasMatch = false;
          panel.querySelectorAll(".vn-building-row").forEach(row => {
            const matches = !query || row.dataset.search.includes(query);
            row.style.display = matches ? "" : "none";
            if (matches) categoryHasMatch = true;
          });
          panel.style.display = categoryHasMatch ? "" : "none";
          if (categoryHasMatch) anyVisible = true;
          if (query && categoryHasMatch) {
            const collapseEl = panel.querySelector(".panel-collapse");
            const icon = panel.querySelector(".vn-category-heading .glyphicon-triangle-right");
            collapseEl?.classList.add("in");
            icon?.classList.add("vn-rotated");
          } else if (!query) {
            const collapseEl = panel.querySelector(".panel-collapse");
            const icon = panel.querySelector(".vn-category-heading .glyphicon-triangle-right");
            const isOpen = openCategories.has(cat);
            collapseEl?.classList.toggle("in", isOpen);
            icon?.classList.toggle("vn-rotated", isOpen);
          }
        });
        const emptyNote = document.getElementById("vn-wache-search-empty");
        if (emptyNote) emptyNote.style.display = query && !anyVisible ? "" : "none";
      }
      document.getElementById("vn-wache-search").addEventListener("input", e => {
        searchQuery = e.target.value;
        applyStationFilter();
      });
      applyStationFilter();
      document.getElementById("vn-btn-back").addEventListener("click", renderStationRenameLeitstelleSelection);
      document.getElementById("vn-btn-save-buildings").addEventListener("click", () => {
        const plan = [];
        body.querySelectorAll(".vn-building-row").forEach(row => {
          const newName = row.querySelector(".vn-building-name-input").value.trim();
          if (!newName) return;
          plan.push({
            id: row.dataset.id,
            oldName: row.dataset.name,
            newName: newName,
            station: row.dataset.category
          });
        });
        if (!plan.length) {
          alert("Kein neuer Name eingetragen.");
          return;
        }
        renderBuildingRenameConfirm(plan, "umbenannt", () => renderStationRenameScreen(selectedLeitstelleIds), "Wache(n)");
      });
    }
    render();
  }
  async function renderLeitstelleRenameScreen() {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Leitstellen umbenennen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Leitstellen ...</em></p>`;
    let leitstellen;
    try {
      ({leitstellen: leitstellen} = await loadAllBuildings());
    } catch (e) {
      body.innerHTML = `<p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>`;
      return;
    }
    const rows = leitstellen.map(l => `\n      <div class="form-group vn-building-row" data-id="${l.id}" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">\n        <label style="flex: 0 0 45%; margin:0;">${escapeHtml(l.name)}</label>\n        <span class="glyphicon glyphicon-arrow-right" aria-hidden="true" style="color:#999;"></span>\n        <input type="text" class="form-control vn-building-name-input" placeholder="leer = keine Änderung" style="flex:1;">\n      </div>`).join("");
    body.innerHTML = `\n      <p class="text-muted">Aktueller Name → neuer Name. Leeres Feld = keine Änderung. Sortierung nach Art ist bei Leitstellen nicht nötig.</p>\n      ${rows || '<p class="text-muted"><em>Keine Leitstellen gefunden.</em></p>'}\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-save-buildings" type="button" class="btn btn-success">\n          <span class="glyphicon glyphicon-floppy-disk" aria-hidden="true"></span> Speichern\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    document.getElementById("vn-btn-save-buildings").addEventListener("click", () => {
      const plan = [];
      body.querySelectorAll(".vn-building-row").forEach(row => {
        const newName = row.querySelector(".vn-building-name-input").value.trim();
        if (!newName) return;
        plan.push({
          id: row.dataset.id,
          oldName: row.querySelector("label").textContent,
          newName: newName,
          station: "Leitstellen"
        });
      });
      if (!plan.length) {
        alert("Kein neuer Name eingetragen.");
        return;
      }
      renderBuildingRenameConfirm(plan, "umbenannt", renderLeitstelleRenameScreen, "Leitstelle(n)");
    });
  }
  function getCsrfTokenOrThrow(buildingId) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!csrfToken) throw new Error(`CSRF-Token nicht gefunden (Gebäude ${buildingId}).`);
    return csrfToken;
  }
  const PENDING_VEHICLE_CHANGE_TTL_MS = 90 * 1e3;
  const pendingVehicleChanges = new Map;
  function recordPendingVehicleChange(stationId, vehicleTypeId, delta) {
    const key = `${stationId}::${vehicleTypeId}`;
    const existing = pendingVehicleChanges.get(key);
    const stillFresh = existing && Date.now() - existing.since < PENDING_VEHICLE_CHANGE_TTL_MS;
    pendingVehicleChanges.set(key, {
      delta: (stillFresh ? existing.delta : 0) + delta,
      since: Date.now()
    });
  }
  function getPendingVehicleDelta(stationId, vehicleTypeId) {
    const key = `${stationId}::${vehicleTypeId}`;
    const entry = pendingVehicleChanges.get(key);
    if (!entry) return 0;
    if (Date.now() - entry.since >= PENDING_VEHICLE_CHANGE_TTL_MS) {
      pendingVehicleChanges.delete(key);
      return 0;
    }
    return entry.delta;
  }
  function hasFreshPendingVehicleChanges() {
    for (const entry of pendingVehicleChanges.values()) {
      if (Date.now() - entry.since < PENDING_VEHICLE_CHANGE_TTL_MS) return true;
    }
    return false;
  }
  let vehicleReconcileTimer = null;
  function scheduleVehicleReconcile(blueprintId, goBack, stationIdFilter) {
    if (vehicleReconcileTimer) clearTimeout(vehicleReconcileTimer);
    vehicleReconcileTimer = setTimeout(() => {
      vehicleReconcileTimer = null;
      const tbody = document.getElementById("vn-bp-apply-tbody");
      if (tbody?.dataset.blueprintId === blueprintId) {
        renderStationBlueprintApplyScreen(blueprintId, goBack, stationIdFilter);
      }
    }, PENDING_VEHICLE_CHANGE_TTL_MS + 2e3);
  }
  async function buildExtension(buildingId, extensionId, currency) {
    const csrfToken = getCsrfTokenOrThrow(buildingId);
    const res = await fetchWithTimeout(`/buildings/${buildingId}/extension/${currency}/${extensionId}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": csrfToken
      }
    });
    if (!res.ok) throw new Error(`Bauen fehlgeschlagen (${res.status})`);
  }
  async function buyVehicle(buildingId, vehicleTypeId, currency) {
    const res = await fetchWithTimeout(`/buildings/${buildingId}/vehicle/${buildingId}/${vehicleTypeId}/${currency}?building=${buildingId}`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Kauf fehlgeschlagen (${res.status})`);
  }
  async function sellVehicle(vehicleId) {
    const csrfToken = getCsrfTokenOrThrow(vehicleId);
    const res = await fetchWithTimeout(`/vehicles/${vehicleId}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        _method: "delete",
        authenticity_token: csrfToken
      })
    });
    if (!res.ok) throw new Error(`Verkaufen fehlgeschlagen (${res.status})`);
  }
  async function buildStorage(buildingId, storageId, currency) {
    const csrfToken = getCsrfTokenOrThrow(buildingId);
    const res = await fetchWithTimeout(`/buildings/${buildingId}/storage_upgrade/${currency}/${storageId}?redirect_building_id=${buildingId}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": csrfToken
      }
    });
    if (!res.ok) throw new Error(`Bauen fehlgeschlagen (${res.status})`);
  }
  async function fetchBuildingLevel(buildingId) {
    const res = await fetchWithTimeout(`/api/buildings/${buildingId}`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Fehler beim Pruefen des Ausbau-Stands: ${res.status}`);
    const data = await res.json();
    const building = data.result || data;
    return typeof building?.level === "number" ? building.level : null;
  }
  async function buildLevel(buildingId, currency, level) {
    const csrfToken = getCsrfTokenOrThrow(buildingId);
    const res = await fetchWithTimeout(`/buildings/${buildingId}/expand_do/${currency}?level=${level}`, {
      method: "GET",
      credentials: "same-origin",
      redirect: "manual",
      headers: {
        "X-CSRF-Token": csrfToken
      }
    });
    if (res.type !== "opaqueredirect" && !res.ok) {
      throw new Error(`Ausbauen fehlgeschlagen (${res.status})`);
    }
  }
  async function verifyLevelBuildResult(buildingId, expectedLevel) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) await sleep(700);
      const level = await fetchBuildingLevel(buildingId);
      if (level !== null && level >= expectedLevel) return level;
      if (attempt === 2) return level;
    }
    return null;
  }
  function executeBuildLevelsToMax(buildingId, levelsToBuild, currency, stationName, goBack) {
    const title = `Wache ausbauen (${stationName})`;
    const queued = runOrQueueBackgroundTask(title, viaQueue => runBuildLevelsToMax(buildingId, levelsToBuild, currency, stationName, goBack, title, viaQueue));
    if (queued === "queued") renderBackgroundTaskQueuedScreen(title, goBack);
  }
  async function runBuildLevelsToMax(buildingId, levelsToBuild, currency, stationName, goBack, title, viaQueue) {
    levelBuildCancelled = false;
    const historyId = await startHistoryEntry({
      type: "level",
      label: `0/${levelsToBuild.length} Stufen gebaut ...`,
      station: stationName
    });
    beginBackgroundTask(title, () => {
      levelBuildCancelled = true;
      updateHistoryEntry(historyId, {
        status: "cancelled",
        label: "Abbruch angefordert ..."
      });
    });
    if (!viaQueue) renderBackgroundTaskProgressScreen();
    let builtCount = 0;
    let spent = 0;
    let error = null;
    for (const level of levelsToBuild) {
      if (levelBuildCancelled) break;
      updateBackgroundTaskProgress(Math.round(builtCount / levelsToBuild.length * 100), `Baue Stufe ${level.id} (${builtCount + 1}/${levelsToBuild.length}) ...`);
      try {
        await buildLevel(buildingId, currency, level.id);
        builtCount++;
        spent += currency === "coins" ? level.coins : level.cost;
      } catch (e) {
        error = e;
        break;
      }
    }
    const cancelled = levelBuildCancelled && !error;
    const plannedLevel = levelsToBuild.length ? levelsToBuild[0].id - 1 + builtCount : null;
    let reachedLevel = plannedLevel;
    let verifyFailed = false;
    if (builtCount > 0 && plannedLevel !== null) {
      updateBackgroundTaskProgress(100, "Prüfe Ergebnis ...");
      const actualLevel = await verifyLevelBuildResult(buildingId, plannedLevel);
      verifyFailed = actualLevel === null || actualLevel < plannedLevel;
      if (actualLevel !== null) reachedLevel = actualLevel;
    }
    await updateHistoryEntry(historyId, {
      label: verifyFailed ? `Nur Stufe ${reachedLevel} statt ${plannedLevel} erreicht - vermutlich nicht genug ${currency === "coins" ? "Coins" : "Credits"}` : `${builtCount}/${levelsToBuild.length} Stufen gebaut (jetzt Stufe ${reachedLevel})` + (error ? ` - abgebrochen: ${error.message}` : ""),
      status: cancelled ? "cancelled" : verifyFailed || error ? "error" : "done",
      cost: spent,
      currency: currency
    });
    if (verifyFailed) {
      reportError(`Wachenausbau (${stationName})`, new Error(`Geplant war Stufe ${plannedLevel}, tatsächlich nur Stufe ${reachedLevel} erreicht.`));
    }
    const renderResult = () => renderBuildLevelsResultScreen({
      builtCount: builtCount,
      total: levelsToBuild.length,
      reachedLevel: reachedLevel,
      plannedLevel: plannedLevel,
      spent: spent,
      currency: currency,
      error: error,
      cancelled: cancelled,
      verifyFailed: verifyFailed,
      goBack: goBack
    });
    const stillOnOwnProgressScreen = !!document.getElementById("vn-exec-progress-bar");
    if (stillOnOwnProgressScreen) renderResult();
    finishBackgroundTask(title, renderResult, stillOnOwnProgressScreen);
  }
  function renderBuildLevelsResultScreen({builtCount: builtCount, total: total, reachedLevel: reachedLevel, plannedLevel: plannedLevel, spent: spent, currency: currency, error: error, cancelled: cancelled, verifyFailed: verifyFailed, goBack: goBack}) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const currencyLabel = currency === "coins" ? "Coins" : "Credits";
    const statusNote = cancelled ? `<p class="text-warning"><b>Abgebrochen</b> nach ${builtCount} von ${total} geplanten Stufen.</p>` : error ? `<p class="text-danger"><b>Abgebrochen</b> nach ${builtCount} von ${total} geplanten Stufen - Fehler: ${escapeHtml(error.message)}</p>` : verifyFailed ? `<p class="text-danger"><b>Nachprüfung fehlgeschlagen:</b> geplant war Stufe ${plannedLevel}, tatsächlich nur Stufe ${reachedLevel} erreicht - vermutlich nicht genug ${currencyLabel}.</p>` : "";
    const resultLine = verifyFailed ? `<b>Nur Stufe ${reachedLevel} statt ${plannedLevel} erreicht.</b>` : `<b>${builtCount} von ${total} Stufen gebaut</b>${reachedLevel !== null ? ` (jetzt Stufe ${reachedLevel})` : ""}.`;
    body.innerHTML = `\n      ${statusNote}\n      <p>\n        <span class="glyphicon ${verifyFailed ? "glyphicon-remove-sign text-danger" : "glyphicon-ok-sign text-success"}" aria-hidden="true"></span>\n        ${resultLine}\n      </p>\n      <p>Ausgegeben: <b>${spent.toLocaleString("de-DE")} ${currencyLabel}</b></p>\n      <p class="text-muted" style="font-size:12px;">Lade die Seite neu, um den neuen Ausbau-Stand im Spiel zu sehen.</p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-main-menu" type="button" class="btn btn-primary">Hauptmenü</button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-main-menu").addEventListener("click", renderMainMenu);
  }
  function renderBuildLevelsToMaxConfirmScreen({stationName: stationName, buildingId: buildingId, levelsToBuild: levelsToBuild, totalCost: totalCost, totalCoins: totalCoins, goBack: goBack}) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p>Bauen: <b>${levelsToBuild.length} Stufen (bis Stufe ${levelsToBuild[levelsToBuild.length - 1].id})</b></p>\n      <p class="text-muted" style="font-size:12px;">\n        Wird nacheinander Stufe für Stufe gebaut (das Spiel erlaubt keinen direkten Sprung) und\n        direkt danach der echte Ausbau-Stand geprüft - reichte das Guthaben nicht für alle\n        Stufen, zeigt das Ergebnis die tatsächlich erreichte Stufe. Womit soll bezahlt werden?\n      </p>\n      <div class="form-group">\n        <button id="vn-btn-pay-credits" type="button" class="btn btn-success">\n          Mit Credits bauen (${totalCost.toLocaleString("de-DE")})\n        </button>\n        <button id="vn-btn-pay-coins" type="button" class="btn btn-danger">\n          Mit Coins bauen (${totalCoins.toLocaleString("de-DE")})\n        </button>\n      </div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-pay-credits").addEventListener("click", () => {
      executeBuildLevelsToMax(buildingId, levelsToBuild, "credits", stationName, goBack);
    });
    document.getElementById("vn-btn-pay-coins").addEventListener("click", () => {
      executeBuildLevelsToMax(buildingId, levelsToBuild, "coins", stationName, goBack);
    });
  }
  async function loadBuildingsForCheck() {
    const {buildings: buildings, buildingsById: buildingsById} = await loadGameData();
    const requiredExtensionOverrides = await getRequiredExtensionsOverrides();
    const leitstelleIds = new Set;
    for (const b of buildings) {
      if (b.leitstelle_building_id != null) leitstelleIds.add(String(b.leitstelle_building_id));
    }
    return buildings.filter(b => !leitstelleIds.has(String(b.id)) && categoryForBuilding(b) !== "Unbekannt").map(b => {
      const pseudoId = getPseudoBuildingTypeId(b);
      const buildingKey = getBuildingKey(b);
      const recommendedExtensions = pseudoId ? requiredExtensionOverrides ? requiredExtensionOverrides[pseudoId] || [] : getDefaultRequiredExtensions(pseudoId) : [];
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
        leitstelleId: b.leitstelle_building_id != null ? String(b.leitstelle_building_id) : "none",
        leitstelleName: leitstelle ? leitstelle.caption : null,
        pseudoId: pseudoId,
        buildingKey: buildingKey,
        extensions: extensions,
        recommendedExtensions: recommendedExtensions,
        missingExtensions: missingExtensions,
        personnelCount: b.personal_count ?? null,
        automaticHiring: b.hiring_automatic === true,
        levelCatalog: levelCatalog,
        currentLevel: currentLevel,
        storageCatalog: storageCatalog,
        ownedStorageIds: ownedStorageIds
      };
    });
  }
  function renderPersonnelCell(station) {
    return `${station.personnelCount ?? "-"}`;
  }
  function renderExtensionBadges(station) {
    const catalogEntries = EXTENSION_CATALOG[station.buildingKey] || [];
    const entries = catalogEntries.length ? catalogEntries : station.recommendedExtensions.map(id => ({
      id: id,
      name: null,
      cost: null,
      coins: null
    }));
    if (!entries.length) return '<span class="text-muted">-</span>';
    const recommendedIds = new Set(station.recommendedExtensions);
    return entries.map(entry => {
      const owned = station.extensions.find(e => e.type_id === entry.id);
      const label = entry.name || `Ausbau ${entry.id}`;
      if (owned) {
        const cssClass = owned.available_at ? "label-primary" : "label-success";
        const title = owned.available_at ? `${label} (im Bau, verfügbar ab ${owned.available_at})` : label;
        return `<span class="label ${cssClass}" title="${escapeHtml(title)}" style="margin:1px;">${entry.id}</span>`;
      }
      const cssClass = recommendedIds.has(entry.id) ? "label-warning" : "label-default";
      const suffix = recommendedIds.has(entry.id) ? " (gefordert)" : "";
      const title = entry.cost != null ? `${label}${suffix} – ${entry.cost.toLocaleString("de-DE")} Credits oder ${entry.coins} Coins` : `${label}${suffix} (noch nicht gebaut)`;
      if (entry.cost == null) {
        return `<span class="label ${cssClass}" title="${escapeHtml(title)}" style="margin:1px;">${entry.id}</span>`;
      }
      return `<button type="button" class="label ${cssClass} vn-build-extension" title="${escapeHtml(title)}"\n                   style="margin:1px; border:none; cursor:pointer;"\n                   data-building-id="${station.id}" data-extension-id="${entry.id}"\n                   data-name="${escapeHtml(label)}" data-cost="${entry.cost}" data-coins="${entry.coins}"\n                   data-station-name="${escapeHtml(station.name)}">${entry.id}</button>`;
    }).join("");
  }
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
    return `\n      <div>${label}</div>\n      <button type="button" class="btn btn-xs btn-warning vn-build-level" style="margin-top:2px;"\n              data-building-id="${station.id}" data-level="${nextLevel.id}"\n              data-cost="${nextLevel.cost}" data-coins="${nextLevel.coins}"\n              data-station-name="${escapeHtml(station.name)}">\n        Nächste Stufe (${nextLevel.cost.toLocaleString("de-DE")} Credits / ${nextLevel.coins} Coins)\n      </button>\n      <button type="button" class="btn btn-xs vn-build-level-max vn-btn-max-level" style="margin-top:2px; margin-left:2px;"\n              data-building-id="${station.id}" data-level="${maxLevel}"\n              data-cost="${maxCost}" data-coins="${maxCoins}"\n              data-station-name="${escapeHtml(station.name)}"\n              title="Baut alle verbleibenden Stufen bis Stufe ${maxLevel} nacheinander (Fortschritt im Hintergrund-Task sichtbar)">\n        Max ausbauen (${maxCost.toLocaleString("de-DE")} Credits / ${maxCoins} Coins)\n      </button>\n    `;
  }
  function renderStorageCell(station) {
    if (!station.storageCatalog || !station.storageCatalog.length) return '<span class="text-muted">-</span>';
    return station.storageCatalog.map(room => {
      const owned = station.ownedStorageIds.has(room.id);
      if (owned) {
        return `<span class="label label-success" title="${escapeHtml(room.name)}" style="margin:1px;">✓</span>`;
      }
      const title = `${room.name} – ${room.cost.toLocaleString("de-DE")} Credits oder ${room.coins} Coins`;
      return `<button type="button" class="label label-warning vn-build-storage" title="${escapeHtml(title)}"\n                   style="margin:1px; border:none; cursor:pointer;"\n                   data-building-id="${station.id}" data-storage-id="${room.id}"\n                   data-name="${escapeHtml(room.name)}" data-cost="${room.cost}" data-coins="${room.coins}"\n                   data-station-name="${escapeHtml(station.name)}">+</button>`;
    }).join("");
  }
  function getBuiltExtensionsCount(station) {
    const catalogEntries = EXTENSION_CATALOG[station.buildingKey] || [];
    const entries = catalogEntries.length ? catalogEntries : station.recommendedExtensions.map(id => ({
      id: id
    }));
    return entries.filter(entry => {
      const owned = station.extensions.find(e => e.type_id === entry.id);
      return owned && !owned.available_at;
    }).length;
  }
  function renderBuildConfirmScreen({title: title, costCredits: costCredits, costCoins: costCoins, onConfirm: onConfirm, goBack: goBack, historyType: historyType, historyLabel: historyLabel, historyStation: historyStation, historyStationId: historyStationId}) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const back = goBack || renderStationCheckScreen;
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p>Bauen: <b>${escapeHtml(title)}</b></p>\n      <p class="text-muted" style="font-size:12px;">Womit soll bezahlt werden?</p>\n      <div class="form-group">\n        <button id="vn-btn-pay-credits" type="button" class="btn btn-success">\n          Mit Credits bauen (${costCredits.toLocaleString("de-DE")})\n        </button>\n        <button id="vn-btn-pay-coins" type="button" class="btn btn-danger">\n          Mit Coins bauen (${costCoins.toLocaleString("de-DE")})\n        </button>\n      </div>\n      <div id="vn-build-status" style="margin-top:10px;"></div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen\n        </button>\n      </div>\n    `;
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
          currency: currency
        });
        statusEl.innerHTML = `<span class="text-success">Erfolgreich gebaut. Lade neu ...</span>`;
        setTimeout(back, 600);
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
        const idSuffix = historyStationId ? ` (Wache ${historyStationId})` : "";
        logErrorToStorage(`Bauen fehlgeschlagen: ${title}${idSuffix}`, e.message).catch(() => {});
        creditsBtn.disabled = false;
        coinsBtn.disabled = false;
      }
    }
    creditsBtn.addEventListener("click", () => pay("credits"));
    coinsBtn.addEventListener("click", () => pay("coins"));
  }
  function renderVehicleBulkSellConfirmScreen({vehicleIds: vehicleIds, vehicleName: vehicleName, stationName: stationName, goBack: goBack, onSold: onSold}) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const idsListHtml = vehicleIds.map(id => `<li>${escapeHtml(id)}</li>`).join("");
    body.innerHTML = `\n      <p class="text-danger"><b>${vehicleIds.length}x "${escapeHtml(vehicleName)}" wirklich verkaufen?</b></p>\n      <p>\n        ${escapeHtml(stationName)} - diese Fahrzeug-IDs werden unwiderruflich zerstört/verkauft,\n        das kann NICHT rückgängig gemacht werden:\n      </p>\n      <ul style="max-height:140px; overflow-y:auto; font-size:12px;">${idsListHtml}</ul>\n      <div id="vn-sell-status" style="margin-top:10px;"></div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen\n        </button>\n        <button id="vn-btn-sell-confirm" type="button" class="btn btn-danger">\n          <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> ${vehicleIds.length}x verkaufen\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    const statusEl = document.getElementById("vn-sell-status");
    const confirmBtn = document.getElementById("vn-btn-sell-confirm");
    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      let ok = 0;
      let failed = 0;
      for (const vehicleId of vehicleIds) {
        statusEl.innerHTML = `<em>Verkaufe ${ok + failed + 1}/${vehicleIds.length} (Fahrzeug-ID ${escapeHtml(vehicleId)}) ...</em>`;
        try {
          await sellVehicle(vehicleId);
          await logHistoryEntry({
            type: "vehicle_sell",
            label: `${vehicleName} (${vehicleId})`,
            station: stationName
          });
          onSold?.(vehicleId);
          ok++;
        } catch (e) {
          failed++;
          logErrorToStorage(`Verkaufen fehlgeschlagen: ${vehicleName} (Fahrzeug-ID ${vehicleId})`, e.message).catch(() => {});
        }
        await new Promise(r => setTimeout(r, 150));
      }
      statusEl.innerHTML = failed ? `<span class="text-danger">${ok} verkauft, ${failed} fehlgeschlagen - Details im Fehlerprotokoll (Einstellungen).</span>` : `<span class="text-success">${ok} verkauft. Lade neu ...</span>`;
      setTimeout(goBack, failed ? 1500 : 700);
    });
  }
  const CLEAR_STORAGE_CONFIRM_WORD = "löschen";
  function renderClearStorageConfirmScreen(goBack) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("Einstellungen › Speicher löschen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p class="text-danger"><b>Speicher wirklich löschen?</b></p>\n      <p>\n        Dadurch werden ALLE von FuxTools gespeicherten Daten (Fahrzeugtyp-Namen,\n        Namens-Bausteine, Wachen-Bauplaner, Verlauf, ...) unwiderruflich\n        gelöscht - als wäre das Script gerade neu installiert worden.\n      </p>\n      <div class="form-group">\n        <label for="vn-clear-confirm-input">\n          Tippe zum Bestätigen <code>${escapeHtml(CLEAR_STORAGE_CONFIRM_WORD)}</code> ein:\n        </label>\n        <input type="text" id="vn-clear-confirm-input" class="form-control" autocomplete="off">\n      </div>\n      <div id="vn-clear-confirm-status" style="margin-top:10px;"></div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen\n        </button>\n        <button id="vn-btn-clear-confirm" type="button" class="btn btn-danger" disabled>\n          <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Speicher endgültig löschen\n        </button>\n      </div>\n    `;
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
      body.innerHTML = `\n        <p class="text-danger">Fehler beim Laden der Wachen: ${escapeHtml(e.message)}</p>\n        <button id="vn-btn-back" type="button" class="btn btn-default"><span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück</button>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
      return;
    }
    const lastLoadedAt = Date.now();
    const withMissingExtensionsCount = stations.filter(s => s.missingExtensions.length > 0).length;
    let sortColumn = preservedState?.sortColumn || "category";
    let sortAscending = preservedState?.sortAscending ?? true;
    const columnLabels = {
      category: "Wache",
      personnel: "Personal",
      hiring: "Automat. Werben",
      extensions: "Ausbauten",
      level: "Stufe"
    };
    function sortedStations() {
      return sortStationsByCategory(stations, {
        sortColumn: sortColumn,
        sortAscending: sortAscending,
        alwaysGroupByCategory: true,
        columnDiff: (a, b) => {
          if (sortColumn === "personnel") return (a.personnelCount ?? -1) - (b.personnelCount ?? -1);
          if (sortColumn === "hiring") return Number(a.automaticHiring) - Number(b.automaticHiring);
          if (sortColumn === "extensions") return getBuiltExtensionsCount(a) - getBuiltExtensionsCount(b);
          if (sortColumn === "level") return a.currentLevel - b.currentLevel;
          return 0;
        }
      });
    }
    function headerHtml(column) {
      const label = columnLabels[column];
      const icon = column !== sortColumn ? "glyphicon-sort text-muted" : sortAscending ? "glyphicon-sort-by-attributes" : "glyphicon-sort-by-attributes-alt";
      return `<span style="white-space:nowrap;">${label}&nbsp;<span class="glyphicon ${icon}" style="font-size:10px;"></span></span>`;
    }
    function currentState() {
      return {
        sortColumn: sortColumn,
        sortAscending: sortAscending,
        searchQuery: document.getElementById("vn-station-check-search")?.value || "",
        typeFilter: document.getElementById("vn-station-check-type-filter")?.value || "",
        leitstelleFilter: document.getElementById("vn-station-check-leitstelle-filter")?.value || ""
      };
    }
    const applyRowVisibility = makeRowVisibilityFilter({
      container: body,
      searchInputId: "vn-station-check-search",
      typeFilterId: "vn-station-check-type-filter",
      leitstelleFilterId: "vn-station-check-leitstelle-filter",
      rowSelector: ".vn-check-station-row",
      searchField: "name"
    });
    function renderTable() {
      const list = sortedStations();
      const rows = list.map(s => `\n            <tr class="vn-check-station-row" data-name="${escapeHtml(s.name.toLowerCase())}"\n                data-category="${escapeHtml(s.category)}" data-type="${escapeHtml(s.typeName || "")}"\n                data-leitstelle="${escapeHtml(s.leitstelleName || "")}">\n              <td>\n                <a href="/buildings/${s.id}" target="_blank">${escapeHtml(s.name)}</a>\n                <br><small class="text-muted">${escapeHtml(s.typeName || s.category)}${s.leitstelleName ? ` · ${escapeHtml(s.leitstelleName)}` : ""}</small>\n              </td>\n              <td>${renderPersonnelCell(s)}</td>\n              <td>\n                <span class="label ${s.automaticHiring ? "label-success" : "label-default"}">\n                  ${s.automaticHiring ? "Ja" : "Nein"}\n                </span>\n              </td>\n              <td>${renderExtensionBadges(s)}</td>\n              <td>${renderLevelCell(s)}</td>\n              <td>${renderStorageCell(s)}</td>\n            </tr>\n          `).join("");
      body.querySelector("thead").innerHTML = `\n        <tr>\n          <th class="vn-check-sort-header" data-column="category" style="cursor:pointer; white-space:nowrap;">${headerHtml("category")}</th>\n          <th class="vn-check-sort-header" data-column="personnel" style="cursor:pointer; white-space:nowrap;">${headerHtml("personnel")}</th>\n          <th class="vn-check-sort-header" data-column="hiring" style="cursor:pointer; white-space:nowrap;">${headerHtml("hiring")}</th>\n          <th class="vn-check-sort-header" data-column="extensions" style="cursor:pointer; white-space:nowrap;">${headerHtml("extensions")}</th>\n          <th class="vn-check-sort-header" data-column="level" style="cursor:pointer; white-space:nowrap;">${headerHtml("level")}</th>\n          <th>Lagerräume</th>\n        </tr>\n      `;
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
            historyStationId: buildingId
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
            historyStationId: buildingId
          });
        });
      });
      body.querySelectorAll(".vn-build-level").forEach(btn => {
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
            historyStationId: buildingId
          });
        });
      });
      body.querySelectorAll(".vn-build-level-max").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const buildingId = btn.dataset.buildingId;
          const maxLevel = Number(btn.dataset.level);
          const station = stations.find(s => String(s.id) === String(buildingId));
          const levelsToBuild = station ? station.levelCatalog.slice(station.currentLevel + 1, maxLevel + 1) : [];
          const savedState = currentState();
          renderBuildLevelsToMaxConfirmScreen({
            stationName: btn.dataset.stationName,
            buildingId: buildingId,
            levelsToBuild: levelsToBuild,
            totalCost: Number(btn.dataset.cost),
            totalCoins: Number(btn.dataset.coins),
            goBack: () => renderStationCheckScreen(savedState)
          });
        });
      });
      applyRowVisibility();
    }
    const typeOptions = [ ...new Set(stations.map(s => s.typeName).filter(Boolean)) ].sort((a, b) => a.localeCompare(b, "de"));
    const leitstelleOptions = [ ...new Set(stations.map(s => s.leitstelleName).filter(Boolean)) ].sort((a, b) => a.localeCompare(b, "de"));
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Grün = gebaut/aktiv, Blau = in Bau, Orange = gefordert, Grau = nicht gebaut.\n        ${withMissingExtensionsCount} von ${stations.length} Wachen fehlt noch ein Ausbau.\n      </p>\n      <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">\n        <select id="vn-station-check-type-filter" class="form-control" style="max-width:220px;">\n          <option value="">Alle Gebäudetypen</option>\n          ${typeOptions.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}\n        </select>\n        <select id="vn-station-check-leitstelle-filter" class="form-control" style="max-width:220px;">\n          <option value="">Alle Leitstellen</option>\n          ${leitstelleOptions.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("")}\n        </select>\n        <input type="text" id="vn-station-check-search" class="form-control" placeholder="Wache suchen ..."\n               value="${escapeHtml(preservedState?.searchQuery || "")}" style="max-width:200px;">\n        <button id="vn-btn-required-extensions-from-check" type="button" class="btn btn-default" style="margin-left:auto; white-space:nowrap;">\n          <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Geforderte Ausbauten anpassen\n        </button>\n      </div>\n      <div style="max-height:55vh; overflow:auto;">\n        <table class="table table-condensed table-striped" style="font-size:12px; table-layout:fixed; width:100%;">\n          <colgroup>\n            <col style="width:20%;">\n            <col style="width:8%;">\n            <col style="width:11%;">\n            <col style="width:33%;">\n            <col style="width:13%;">\n            <col style="width:15%;">\n          </colgroup>\n          <thead></thead>\n          <tbody></tbody>\n        </table>\n      </div>\n      <div class="vn-sticky-footer" style="display:flex; align-items:center; gap:10px;">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-station-check-refresh" type="button" class="btn btn-default btn-xs" title="Neu laden">\n          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>\n        </button>\n        <span class="label label-default" style="font-size:12px;">Stand: ${escapeHtml(new Date(lastLoadedAt).toLocaleString("de-DE"))}</span>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
    if (preservedState?.typeFilter) {
      document.getElementById("vn-station-check-type-filter").value = preservedState.typeFilter;
    }
    if (preservedState?.leitstelleFilter) {
      document.getElementById("vn-station-check-leitstelle-filter").value = preservedState.leitstelleFilter;
    }
    document.getElementById("vn-station-check-search").addEventListener("input", applyRowVisibility);
    document.getElementById("vn-station-check-type-filter").addEventListener("change", applyRowVisibility);
    document.getElementById("vn-station-check-leitstelle-filter").addEventListener("change", applyRowVisibility);
    document.getElementById("vn-btn-required-extensions-from-check").addEventListener("click", () => {
      const savedState = currentState();
      renderRequiredExtensionsSettingsScreen(() => renderStationCheckScreen(savedState));
    });
    document.getElementById("vn-station-check-refresh").addEventListener("click", () => {
      invalidateGameDataCache();
      renderStationCheckScreen(currentState());
    });
    renderTable();
  }
  const PERSONNEL_SCAN_CONCURRENCY = 5;
  async function loadPersonnelCheckStations() {
    const {buildings: buildings} = await loadGameData();
    const leitstelleIds = new Set;
    for (const b of buildings) {
      if (b.leitstelle_building_id != null) leitstelleIds.add(String(b.leitstelle_building_id));
    }
    return buildings.filter(b => !leitstelleIds.has(String(b.id)) && categoryForBuilding(b) !== "Unbekannt" && categoryForBuilding(b) !== "Krankenhäuser & Schulen" && categoryForBuilding(b) !== "Sonstiges").map(b => {
      const pseudoId = getPseudoBuildingTypeId(b);
      const buildingKey = getBuildingKey(b);
      return {
        id: String(b.id),
        name: b.caption || `Wache ${b.id}`,
        category: categoryForBuilding(b),
        typeName: BUILDING_TYPE_NAMES[buildingKey] || null,
        pseudoId: pseudoId
      };
    });
  }
  function parseFilterableBySlugs(row) {
    try {
      const slugs = JSON.parse(row.dataset.filterableBy || "[]");
      return Array.isArray(slugs) ? slugs : [];
    } catch {
      return [];
    }
  }
  function parsePersonalPageHtml(html) {
    const doc = (new DOMParser).parseFromString(html, "text/html");
    const rows = doc.querySelectorAll("#personal_table tbody tr");
    const entries = [];
    rows.forEach(row => {
      const slugs = parseFilterableBySlugs(row);
      const id = row.querySelector("input.personal-delete-checkbox")?.value || null;
      const name = row.children[1]?.textContent.trim() || "";
      const educationText = row.children[2]?.textContent.trim() || "";
      const statusCell = row.children[4];
      const statusText = statusCell?.textContent.trim() || "";
      const trainingSlug = statusCell?.querySelector("[data-education-key]")?.dataset.educationKey || null;
      entries.push({
        id: id,
        slugs: slugs,
        name: name,
        educationText: educationText,
        statusText: statusText,
        trainingSlug: trainingSlug
      });
    });
    return entries;
  }
  async function fetchPersonalPage(buildingId) {
    const res = await fetchWithTimeout(`/buildings/${buildingId}/personals`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Fehler beim Laden von Personal (Gebäude ${buildingId}): ${res.status}`);
    return await res.text();
  }
  const PERSONNEL_SCAN_STALE_MS = 15 * 60 * 1e3;
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
          const inTrainingCounts = {};
          const inTrainingNames = {};
          let withoutEducation = 0;
          let available = 0;
          let inTraining = 0;
          entries.forEach(({slugs: slugs, name: name, educationText: educationText, statusText: statusText, trainingSlug: trainingSlug}) => {
            if (!slugs.length) withoutEducation++;
            if (statusText.includes("Unterricht")) inTraining++; else if (statusText.includes("Verfügbar")) available++;
            slugs.forEach(slug => {
              counts[slug] = (counts[slug] || 0) + 1;
              if (name) (names[slug] || (names[slug] = [])).push(name);
              if (!qualifications[slug] && slugs.length === 1 && educationText) {
                qualifications[slug] = educationText;
              }
            });
            if (trainingSlug) {
              inTrainingCounts[trainingSlug] = (inTrainingCounts[trainingSlug] || 0) + 1;
              if (name) (inTrainingNames[trainingSlug] || (inTrainingNames[trainingSlug] = [])).push(name);
            }
          });
          scanData[station.id] = {
            counts: counts,
            names: names,
            inTrainingCounts: inTrainingCounts,
            inTrainingNames: inTrainingNames,
            total: entries.length,
            withoutEducation: withoutEducation,
            available: available,
            inTraining: inTraining
          };
        } catch (e) {
          console.warn("[FuxTools] Personal-Scan fehlgeschlagen für Wache", station.id, e);
        }
        finished++;
        onProgress?.(finished, stations.length);
      }
    }
    const workerCount = Math.min(PERSONNEL_SCAN_CONCURRENCY, stations.length);
    await Promise.all(Array.from({
      length: workerCount
    }, () => worker()));
    await storeData(scanData, PERSONNEL_SCAN_KEY);
    await storeData(qualifications, PERSONNEL_QUALIFICATIONS_KEY);
    await storeData({
      lastScanAt: Date.now()
    }, PERSONNEL_SCAN_META_KEY);
    return stations.length;
  }
  async function ensureFreshPersonnelScan(onProgress) {
    const meta = await getPersonnelScanMeta();
    if (meta.lastScanAt && Date.now() - meta.lastScanAt < PERSONNEL_SCAN_STALE_MS) {
      return false;
    }
    await scanAllPersonnel(onProgress);
    return true;
  }
  function renderPersonnelBadges(station, requirements, qualifications, scanData) {
    const scan = scanData[station.id];
    if (!scan) return '<span class="label label-default">Nicht gescannt</span>';
    const req = requirements[station.pseudoId] || {};
    const reqByRealSlug = {};
    for (const [slug, value] of Object.entries(req)) {
      const realSlug = realSlugFor(slug);
      reqByRealSlug[realSlug] = Math.max(reqByRealSlug[realSlug] || 0, value);
    }
    const slugs = new Set([ ...Object.keys(reqByRealSlug).filter(slug => reqByRealSlug[slug] > 0), ...Object.keys(scan.counts).filter(slug => scan.counts[slug] > 0) ]);
    const badges = [ ...slugs ].sort((a, b) => qualificationNameFor(qualifications, a).localeCompare(qualificationNameFor(qualifications, b), "de")).map(slug => {
      const required = reqByRealSlug[slug] || 0;
      const have = scan.counts[slug] || 0;
      const name = qualificationNameFor(qualifications, slug);
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
  function renderPersonnelOverview(station, scanData) {
    const scan = scanData[station.id];
    if (!scan) return '<span class="text-muted">-</span>';
    return `\n      <div>${scan.total} gesamt</div>\n      <div class="text-muted">${scan.withoutEducation} ohne Ausbildung</div>\n      <div class="text-muted">${scan.available} verfügbar · ${scan.inTraining} im Unterricht</div>\n    `;
  }
  const SCHOOL_BUILDING_TYPE_BY_CATEGORY = {
    Feuerwehr: 1,
    Rettungsdienst: 3,
    Polizei: 8,
    THW: 10,
    Seenotrettung: 27
  };
  const SCHOOLING_SEATS_PER_ROOM = 10;
  const SCHOOL_CLASSROOM_EXTENSION_IDS = [ 0, 1, 2 ];
  function countSchoolClassrooms(building) {
    const extensions = Array.isArray(building.extensions) ? building.extensions : [];
    const builtExtraRooms = extensions.filter(e => SCHOOL_CLASSROOM_EXTENSION_IDS.includes(e.type_id)).length;
    return 1 + builtExtraRooms;
  }
  async function loadOwnedSchoolsByCategory() {
    const {buildings: buildings} = await loadGameData();
    const byCategory = {};
    for (const b of buildings) {
      const category = Object.keys(SCHOOL_BUILDING_TYPE_BY_CATEGORY).find(cat => SCHOOL_BUILDING_TYPE_BY_CATEGORY[cat] === b.building_type);
      if (!category) continue;
      (byCategory[category] || (byCategory[category] = [])).push({
        id: String(b.id),
        name: b.caption || `Schule ${b.id}`,
        maxRooms: countSchoolClassrooms(b)
      });
    }
    return byCategory;
  }
  function pickSchoolForCategory(schoolsByCategory, category) {
    return (schoolsByCategory[category] || [])[0] || null;
  }
  function computeTrainingNeeds(stations, requirementRanges, scanData, minStaff) {
    const needs = new Map;
    for (const station of stations) {
      const scan = scanData[station.id];
      if (!scan) continue;
      if (scan.total < minStaff) continue;
      const schoolBuildingType = SCHOOL_BUILDING_TYPE_BY_CATEGORY[station.category];
      if (!schoolBuildingType) continue;
      const req = requirementRanges[station.pseudoId] || {};
      for (const [slug, range] of Object.entries(req)) {
        const realSlug = realSlugFor(slug);
        const have = scan.counts[realSlug] || 0;
        const inTraining = scan.inTrainingCounts?.[slug] || scan.inTrainingCounts?.[realSlug] || 0;
        const minDeficit = Math.max(0, range.min - have - inTraining);
        const maxDeficit = Math.max(0, range.max - have - inTraining);
        const key = `${station.category}::${slug}`;
        if (!needs.has(key)) {
          needs.set(key, {
            category: station.category,
            slug: slug,
            stations: [],
            totalMinDeficit: 0,
            totalMaxDeficit: 0,
            totalInTraining: 0,
            totalHave: 0,
            totalRangeMin: 0,
            totalRangeMax: 0
          });
        }
        const need = needs.get(key);
        need.stations.push({
          id: station.id,
          name: station.name,
          minDeficit: minDeficit,
          maxDeficit: maxDeficit,
          inTraining: inTraining,
          have: have,
          rangeMin: range.min,
          rangeMax: range.max,
          inTrainingNames: scan.inTrainingNames?.[slug] || scan.inTrainingNames?.[realSlug] || []
        });
        need.totalMinDeficit += minDeficit;
        need.totalMaxDeficit += maxDeficit;
        need.totalInTraining += inTraining;
        need.totalHave += have;
        need.totalRangeMin += range.min;
        need.totalRangeMax += range.max;
      }
    }
    return [ ...needs.values() ].filter(n => n.totalMinDeficit > 0 || n.totalMaxDeficit > 0);
  }
  async function fetchSchoolPageInfo(schoolId, occupied, slug = null) {
    const res = await fetchWithTimeout(`/buildings/${schoolId}`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Schule (Gebäude ${schoolId}) konnte nicht geladen werden (${res.status}).`);
    const doc = (new DOMParser).parseFromString(await res.text(), "text/html");
    const form = doc.querySelector(`form[action="/buildings/${schoolId}/education"]`);
    if (!form) {
      if (occupied > 0) return {
        maxRooms: occupied,
        freeRooms: 0
      };
      throw new Error("Ausbildungs-Formular an dieser Schule nicht gefunden.");
    }
    const roomOptions = [ ...form.querySelectorAll("#building_rooms_use option") ];
    const freeRooms = roomOptions.length ? Math.max(...roomOptions.map(o => Number(o.value) || 1)) : 0;
    const maxRooms = occupied + freeRooms;
    const result = {
      maxRooms: maxRooms,
      freeRooms: freeRooms
    };
    if (slug) {
      const authenticityToken = form.querySelector('input[name="authenticity_token"]')?.value;
      if (!authenticityToken) throw new Error("CSRF-Token im Ausbildungs-Formular nicht gefunden.");
      const educationOption = [ ...form.querySelectorAll("#education_select option") ].find(o => o.value.startsWith(`${slug}:`));
      if (!educationOption) throw new Error("Dieser Lehrgang wird an dieser Schule nicht angeboten.");
      result.authenticityToken = authenticityToken;
      result.educationValue = educationOption.value;
      result.educationLabel = educationOption.textContent.trim();
    }
    return result;
  }
  function parseEducationDurationDays(educationLabel) {
    const match = educationLabel?.match(/\((\d+)\s*Tage?\)/);
    return match ? Number(match[1]) : null;
  }
  async function fetchSchoolingRuns() {
    return await fetchJSON("/api/schoolings");
  }
  function countOccupiedRooms(schoolingRuns, schoolId) {
    const now = Date.now();
    return schoolingRuns.filter(run => String(run.building_id) === String(schoolId) && new Date(run.finish_time).getTime() > now).length;
  }
  const PENDING_SCHOOLING_TTL_MS = 90 * 1e3;
  const pendingSchoolingRooms = new Map;
  function recordPendingSchoolingRooms(schoolId, rooms) {
    const key = String(schoolId);
    const existing = pendingSchoolingRooms.get(key);
    const stillFresh = existing && Date.now() - existing.since < PENDING_SCHOOLING_TTL_MS;
    pendingSchoolingRooms.set(key, {
      rooms: (stillFresh ? existing.rooms : 0) + rooms,
      since: Date.now()
    });
  }
  function getPendingSchoolingRooms(schoolId) {
    const key = String(schoolId);
    const entry = pendingSchoolingRooms.get(key);
    if (!entry) return 0;
    if (Date.now() - entry.since >= PENDING_SCHOOLING_TTL_MS) {
      pendingSchoolingRooms.delete(key);
      return 0;
    }
    return entry.rooms;
  }
  function occupiedRoomsWithPending(schoolingRuns, schoolId) {
    return countOccupiedRooms(schoolingRuns, schoolId) + getPendingSchoolingRooms(schoolId);
  }
  async function recordPendingSchoolingAssignment(plan, need) {
    const scanData = await getPersonnelScanData();
    const realSlug = realSlugFor(need.slug);
    for (const {stationId: stationId, people: people} of plan.selectedByStation) {
      const scan = scanData[stationId];
      if (!scan) continue;
      scan.inTrainingCounts = scan.inTrainingCounts || {};
      scan.inTrainingNames = scan.inTrainingNames || {};
      scan.inTrainingCounts[realSlug] = (scan.inTrainingCounts[realSlug] || 0) + people.length;
      const names = scan.inTrainingNames[realSlug] || (scan.inTrainingNames[realSlug] = []);
      people.forEach(p => {
        if (p.name) names.push(p.name);
      });
      scan.available = Math.max(0, (scan.available || 0) - people.length);
      scan.inTraining = (scan.inTraining || 0) + people.length;
    }
    await storeData(scanData, PERSONNEL_SCAN_KEY);
  }
  function earliestSchoolingFinish(schoolingRuns, schoolId) {
    const now = Date.now();
    const finishTimes = schoolingRuns.filter(run => String(run.building_id) === String(schoolId)).map(run => new Date(run.finish_time).getTime()).filter(t => t > now);
    return finishTimes.length ? Math.min(...finishTimes) : null;
  }
  async function loadRunningSchoolingsOverview() {
    const [schoolingRuns, schoolsByCategory] = await Promise.all([ fetchSchoolingRuns(), loadOwnedSchoolsByCategory() ]);
    const schoolNameById = new Map;
    for (const schools of Object.values(schoolsByCategory)) {
      for (const school of schools) schoolNameById.set(school.id, school.name);
    }
    const now = Date.now();
    return schoolingRuns.filter(run => new Date(run.finish_time).getTime() > now).map(run => ({
      schoolName: schoolNameById.get(String(run.building_id)) || `Schule ${run.building_id}`,
      title: run.education_title || "Lehrgang",
      finishAt: new Date(run.finish_time).getTime()
    })).sort((a, b) => a.finishAt - b.finishAt);
  }
  const VEHICLE_CATALOG_SLUG_ALIASES = {
    dekon_p: "decontamination_personnel"
  };
  function realSlugFor(slug) {
    return VEHICLE_CATALOG_SLUG_ALIASES[slug] || slug;
  }
  const KNOWN_QUALIFICATION_NAMES = {
    decontamination_personnel: "Dekon-P"
  };
  function qualificationNameFor(qualifications, slug) {
    return qualifications[slug] || KNOWN_QUALIFICATION_NAMES[slug] || slug;
  }
  async function fetchAvailablePersonnelForEducation(stationId, slug) {
    const [selectRes, personalHtml] = await Promise.all([ fetchWithTimeout(`/buildings/${stationId}/schooling_personal_select`, {
      credentials: "same-origin"
    }), fetchPersonalPage(stationId) ]);
    if (!selectRes.ok) throw new Error(`Personal von Wache ${stationId} konnte nicht geladen werden (${selectRes.status}).`);
    const statusById = new Map(parsePersonalPageHtml(personalHtml).map(e => [ e.id, e ]));
    const doc = (new DOMParser).parseFromString(await selectRes.text(), "text/html");
    const attribute = realSlugFor(slug);
    return [ ...doc.querySelectorAll(`#personal_table_${stationId} input.schooling_checkbox`) ].filter(cb => cb.getAttribute(attribute) === "false").map(cb => ({
      id: cb.value,
      name: cb.closest("tr")?.children[1]?.textContent.trim() || cb.value
    })).filter(p => {
      const entry = statusById.get(p.id);
      return !!entry && entry.statusText.includes("Verfügbar");
    });
  }
  async function planTrainingRun(need, school, mode) {
    const schoolId = school.id;
    const totalDeficit = mode === "max" ? need.totalMaxDeficit : need.totalMinDeficit;
    const schoolingRuns = await fetchSchoolingRuns();
    const occupied = occupiedRoomsWithPending(schoolingRuns, schoolId);
    const freeRooms = Math.max(0, school.maxRooms - occupied);
    if (freeRooms <= 0) {
      throw new Error("Keine freien Klassenräume an dieser Schule - es läuft bereits ein Lehrgang in jedem Raum.");
    }
    const {authenticityToken: authenticityToken, educationValue: educationValue, educationLabel: educationLabel} = await fetchSchoolPageInfo(schoolId, occupied, need.slug);
    const roomsWanted = Math.min(freeRooms, Math.max(1, Math.ceil(totalDeficit / SCHOOLING_SEATS_PER_ROOM)));
    const capacity = roomsWanted * SCHOOLING_SEATS_PER_ROOM;
    const deficitOf = station => mode === "max" ? station.maxDeficit : station.minDeficit;
    const stationsByDeficit = [ ...need.stations ].sort((a, b) => deficitOf(b) - deficitOf(a));
    const selectedByStation = [];
    for (const station of stationsByDeficit) {
      const alreadySelected = selectedByStation.reduce((sum, s) => sum + s.people.length, 0);
      if (alreadySelected >= capacity) break;
      const takeCount = Math.min(deficitOf(station), capacity - alreadySelected);
      if (takeCount <= 0) continue;
      const available = await fetchAvailablePersonnelForEducation(station.id, need.slug);
      const people = available.slice(0, takeCount);
      if (people.length) selectedByStation.push({
        stationId: station.id,
        stationName: station.name,
        people: people
      });
    }
    const selected = selectedByStation.flatMap(s => s.people);
    if (!selected.length) {
      throw new Error('Kein verfügbares Personal gefunden (niemand ohne diese Ausbildung ist als "Verfügbar" markiert - evtl. schon in Ausbildung oder im Einsatz).');
    }
    const actualRooms = Math.min(freeRooms, Math.max(1, Math.ceil(selected.length / SCHOOLING_SEATS_PER_ROOM)));
    const durationDays = parseEducationDurationDays(educationLabel);
    const finishEstimate = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1e3) : null;
    return {
      schoolId: schoolId,
      authenticityToken: authenticityToken,
      educationValue: educationValue,
      educationLabel: educationLabel,
      durationDays: durationDays,
      finishEstimate: finishEstimate,
      actualRooms: actualRooms,
      selectedByStation: selectedByStation,
      selected: selected
    };
  }
  async function submitTrainingRun(plan) {
    const params = new URLSearchParams;
    params.append("utf8", "✓");
    params.append("authenticity_token", plan.authenticityToken);
    params.append("building_rooms_use", String(plan.actualRooms));
    params.append("education_select", plan.educationValue);
    params.append("alliance[duration]", "0");
    params.append("alliance[cost]", "0");
    plan.selected.forEach(p => params.append("personal_ids[]", p.id));
    const res = await fetchWithTimeout(`/buildings/${plan.schoolId}/education`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });
    if (!res.ok || !res.redirected) {
      throw new Error(`Ausbildung wurde nicht gestartet (Formular meldet einen Fehler, HTTP ${res.status}).`);
    }
  }
  function renderSchoolingConfirmScreen({need: need, school: school, qualificationName: qualificationName, plan: plan, goBack: goBack}) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    const body = document.getElementById("vehicle-naming-modal-body");
    const stationRows = plan.selectedByStation.map(s => `\n          <tr>\n            <td>${escapeHtml(s.stationName)}</td>\n            <td>${s.people.length}</td>\n          </tr>\n        `).join("");
    const finishLabel = plan.finishEstimate ? plan.finishEstimate.toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short"
    }) : "unbekannt (Lehrgangsdauer nicht erkannt)";
    body.innerHTML = `\n      <p>\n        <b>${escapeHtml(qualificationName)}</b> an <b>${escapeHtml(school.name)}</b>\n        ${plan.durationDays ? `<span class="text-muted">(${plan.durationDays} Tage)</span>` : ""}\n      </p>\n      <table class="table table-condensed table-striped" style="font-size:12px;">\n        <thead><tr><th>Wache</th><th>Personen</th></tr></thead>\n        <tbody>${stationRows}</tbody>\n      </table>\n      <p>\n        Insgesamt <b>${plan.selected.length}</b> Person(en) in <b>${plan.actualRooms}</b>\n        Klassenraum/-räumen. Voraussichtlich fertig: <b>${escapeHtml(finishLabel)}</b>.\n      </p>\n      <p class="text-muted" style="font-size:12px;">\n        Die Personen stehen währenddessen für Einsätze nicht zur Verfügung.\n      </p>\n      <div id="vn-schooling-confirm-status" style="margin-top:6px;"></div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen\n        </button>\n        <button id="vn-btn-confirm-schooling" type="button" class="btn btn-success">\n          <span class="glyphicon glyphicon-education" aria-hidden="true"></span> Bestätigen\n        </button>\n      </div>\n    `;
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
        recordPendingSchoolingRooms(plan.schoolId, plan.actualRooms);
        await recordPendingSchoolingAssignment(plan, need);
        await logHistoryEntry({
          type: "schooling_start",
          label: qualificationName,
          station: `${school.name} (${plan.selected.length} Person(en): ${plan.selected.map(p => p.id).join(", ")})`
        });
        statusEl.innerHTML = `<span class="text-success">Erfolgreich gestartet.</span>`;
        setTimeout(goBack, 600);
      } catch (e) {
        statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
        const personIds = plan.selected.map(p => p.id).join(", ");
        logErrorToStorage(`Schulung fehlgeschlagen: ${qualificationName} (${school.name}, Personal-IDs: ${personIds})`, e.message).catch(() => {});
        confirmBtn.disabled = false;
        backBtn.disabled = false;
      }
    });
  }
  async function renderSchoolingBlueprintSelection(goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Schulungen › Bauplan wählen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Baupläne ...</p>`;
    const blueprints = await getStationBlueprints();
    const entries = Object.values(blueprints).sort((a, b) => a.name.localeCompare(b.name, "de"));
    if (!entries.length) {
      body.innerHTML = `\n        <p class="text-muted">Noch keine Baupläne vorhanden - lege zuerst einen im Wachen-Bauplaner an.</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n          <button id="vn-schooling-goto-blueprints" type="button" class="btn btn-primary">\n            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Wachen-Bauplaner öffnen\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      document.getElementById("vn-schooling-goto-blueprints").addEventListener("click", () => {
        renderStationBlueprintsListScreen(() => renderSchoolingBlueprintSelection(goBack));
      });
      return;
    }
    const rows = entries.map(bp => `\n        <button type="button" class="list-group-item vn-menu-item vn-schooling-bp-pick" data-id="${escapeHtml(bp.id)}">\n          <span class="glyphicon glyphicon-education" aria-hidden="true"></span>\n          <span><b>${escapeHtml(bp.name)}</b> <span class="text-muted">- ${escapeHtml(typeNameForPseudoId(bp.pseudoId))}</span></span>\n        </button>\n      `).join("");
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Für welchen Bauplan sollen Schulungen geprüft werden? Danach folgen noch die Wachen.\n      </p>\n      <div class="list-group" style="max-height:55vh; overflow:auto;">${rows}</div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    body.querySelectorAll(".vn-schooling-bp-pick").forEach(btn => {
      btn.addEventListener("click", () => {
        renderSchoolingStationSelection(blueprints[btn.dataset.id], goBack);
      });
    });
  }
  async function renderSchoolingStationSelection(blueprint, goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle(`Schulungen › ${blueprint.name} › Wachen wählen`);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Wachen ...</p>`;
    let allStations, savedSelection;
    try {
      [allStations, savedSelection] = await Promise.all([ loadBuildingsForCheck(), getSchoolingStationSelection(blueprint.id) ]);
    } catch (e) {
      body.innerHTML = `\n        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }
    const stations = allStations.filter(s => s.pseudoId === blueprint.pseudoId && s.category !== "Krankenhäuser & Schulen" && s.category !== "Sonstiges");
    const preselected = new Set(savedSelection || []);
    const byLeitstelle = new Map;
    for (const s of stations) {
      if (!byLeitstelle.has(s.leitstelleId)) {
        byLeitstelle.set(s.leitstelleId, {
          name: s.leitstelleName || "Ohne Leitstelle",
          stations: []
        });
      }
      byLeitstelle.get(s.leitstelleId).stations.push(s);
    }
    const groupBlocks = [ ...byLeitstelle.entries() ].sort((a, b) => a[1].name.localeCompare(b[1].name, "de")).map(([id, info], idx) => {
      const collapseId = `vn-schooling-station-collapse-${idx}`;
      const initialSelectedCount = info.stations.filter(s => preselected.has(s.id)).length;
      const stationRows = [ ...info.stations ].sort((a, b) => a.name.localeCompare(b.name, "de")).map(s => {
        const checked = preselected.has(s.id);
        return `\n            <div class="checkbox vn-schooling-station-row" data-search="${escapeHtml(s.name.toLowerCase())}" style="margin: 2px 0; break-inside: avoid;">\n              <label>\n                <input type="checkbox" class="vn-schooling-station-check" data-leitstelle-id="${escapeHtml(id)}" value="${s.id}" ${checked ? "checked" : ""}>\n                ${escapeHtml(s.name)}\n              </label>\n            </div>`;
      }).join("");
      return `\n        <div class="panel panel-default vn-schooling-leitstelle-panel" data-leitstelle-id="${escapeHtml(id)}" style="margin-bottom: 8px;">\n          <div class="panel-heading vn-category-heading" data-toggle="collapse" data-target="#${collapseId}">\n            <span class="glyphicon glyphicon-triangle-right" aria-hidden="true"></span>\n            <b>${escapeHtml(info.name)}</b>\n            <span class="text-muted">\n              (${info.stations.length} Wachen,\n              <span class="vn-schooling-leitstelle-count" data-leitstelle-id="${escapeHtml(id)}">${initialSelectedCount}</span>\n              ausgewählt)\n            </span>\n            <label style="font-size:11px; float:right; font-weight:normal; margin:0; cursor:pointer;">\n              <input type="checkbox" class="vn-schooling-leitstelle-master" data-leitstelle-id="${escapeHtml(id)}">\n              alle auswählen\n            </label>\n          </div>\n          <div id="${collapseId}" class="panel-collapse collapse">\n            <div class="panel-body" style="column-count: 2; column-gap: 20px;">\n              ${stationRows}\n            </div>\n          </div>\n        </div>`;
    }).join("");
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Bauplan: <b>${escapeHtml(blueprint.name)}</b>. Wähle die Wachen aus, die für Schulungen\n        geprüft werden sollen (Leitstelle anklicken zum Auf-/Zuklappen).\n      </p>\n      <input type="text" id="vn-schooling-station-search" class="form-control input-sm" style="max-width:280px; margin-bottom:8px;"\n             placeholder="Wache suchen ...">\n      <div style="max-height: 50vh; overflow-y: auto; padding: 4px;">\n        ${groupBlocks || '<p class="text-muted"><em>Keine passenden Wachen gefunden.</em></p>'}\n      </div>\n      <p id="vn-schooling-station-search-empty" class="text-muted" style="display:none;"><em>Keine Wache passt zur Suche.</em></p>\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-schooling-go" type="button" class="btn btn-primary">\n          Los <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", () => renderSchoolingBlueprintSelection(goBack));
    body.querySelectorAll(".vn-category-heading .glyphicon-triangle-right").forEach(icon => {
      icon.closest(".vn-category-heading").addEventListener("click", () => icon.classList.toggle("vn-rotated"));
    });
    body.querySelectorAll(".vn-schooling-leitstelle-master").forEach(master => {
      master.addEventListener("click", e => e.stopPropagation());
      master.closest("label").addEventListener("click", e => e.stopPropagation());
      const id = master.dataset.leitstelleId;
      const childCheckboxes = [ ...body.querySelectorAll(`.vn-schooling-station-check[data-leitstelle-id="${id}"]`) ];
      function updateSelectedCount() {
        const countEl = body.querySelector(`.vn-schooling-leitstelle-count[data-leitstelle-id="${id}"]`);
        if (countEl) countEl.textContent = childCheckboxes.filter(cb => cb.checked).length;
      }
      master.addEventListener("change", () => {
        childCheckboxes.forEach(cb => {
          if (cb.closest(".vn-schooling-station-row").style.display !== "none") cb.checked = master.checked;
        });
        updateSelectedCount();
      });
      function updateMasterState() {
        const visible = childCheckboxes.filter(cb => cb.closest(".vn-schooling-station-row").style.display !== "none");
        const checkedCount = visible.filter(cb => cb.checked).length;
        master.checked = visible.length > 0 && checkedCount === visible.length;
        master.indeterminate = checkedCount > 0 && checkedCount < visible.length;
        updateSelectedCount();
      }
      childCheckboxes.forEach(cb => cb.addEventListener("change", updateMasterState));
      updateMasterState();
    });
    const searchInput = document.getElementById("vn-schooling-station-search");
    function applyStationFilter() {
      const query = searchInput.value.trim().toLowerCase();
      let anyVisible = false;
      body.querySelectorAll(".vn-schooling-leitstelle-panel").forEach(panel => {
        let groupHasMatch = false;
        panel.querySelectorAll(".vn-schooling-station-row").forEach(row => {
          const matches = !query || row.dataset.search.includes(query);
          row.style.display = matches ? "" : "none";
          if (matches) groupHasMatch = true;
        });
        panel.style.display = groupHasMatch ? "" : "none";
        if (groupHasMatch) anyVisible = true;
        const collapseEl = panel.querySelector(".panel-collapse");
        const icon = panel.querySelector(".vn-category-heading .glyphicon-triangle-right");
        if (query && groupHasMatch) {
          collapseEl?.classList.add("in");
          icon?.classList.add("vn-rotated");
        } else if (!query) {
          collapseEl?.classList.remove("in");
          icon?.classList.remove("vn-rotated");
        }
      });
      const emptyNote = document.getElementById("vn-schooling-station-search-empty");
      if (emptyNote) emptyNote.style.display = query && !anyVisible ? "" : "none";
      body.querySelectorAll(".vn-schooling-leitstelle-master").forEach(master => {
        const id = master.dataset.leitstelleId;
        const visible = [ ...body.querySelectorAll(`.vn-schooling-station-check[data-leitstelle-id="${id}"]`) ].filter(cb => cb.closest(".vn-schooling-station-row").style.display !== "none");
        const checkedCount = visible.filter(cb => cb.checked).length;
        master.checked = visible.length > 0 && checkedCount === visible.length;
        master.indeterminate = checkedCount > 0 && checkedCount < visible.length;
      });
    }
    searchInput.addEventListener("input", applyStationFilter);
    document.getElementById("vn-btn-schooling-go").addEventListener("click", async () => {
      const selectedIds = [ ...body.querySelectorAll(".vn-schooling-station-check:checked") ].map(el => el.value);
      if (!selectedIds.length) {
        alert("Bitte mindestens eine Wache auswählen.");
        return;
      }
      const selectedStations = stations.filter(s => selectedIds.includes(s.id));
      await saveSchoolingStationSelection(blueprint.id, selectedIds);
      renderSchoolingScreen(blueprint, selectedStations, () => renderSchoolingStationSelection(blueprint, goBack));
    });
  }
  async function renderSchoolingScreen(blueprint, stations, goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle(`Schulungen › ${blueprint.name}`);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Bedarf ...</p>`;
    let schoolsByCategory;
    try {
      schoolsByCategory = await loadOwnedSchoolsByCategory();
    } catch (e) {
      body.innerHTML = `\n        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }
    body.innerHTML = `<p>Prüfe letzten Scan ...</p>`;
    await ensureFreshPersonnelScan((done, of) => {
      body.innerHTML = `<p>Scanne Personal ... (${done}/${of})</p>`;
    });
    const blueprintRanges = computeBlueprintPersonnelRequirementRanges(blueprint);
    const rangesObj = {};
    for (const [slug, range] of blueprintRanges) rangesObj[slug] = range;
    const requirements = {
      [blueprint.pseudoId]: rangesObj
    };
    let scanData = await getPersonnelScanData();
    let scanMeta = await getPersonnelScanMeta();
    const qualifications = await getPersonnelQualifications();
    let minStaff = await getPersonnelSchoolingMinStaff();
    const schoolByCategory = {};
    for (const category of Object.keys(SCHOOL_BUILDING_TYPE_BY_CATEGORY)) {
      schoolByCategory[category] = pickSchoolForCategory(schoolsByCategory, category);
    }
    const capacityBySchoolId = {};
    let schoolingRuns = [];
    try {
      schoolingRuns = await fetchSchoolingRuns();
    } catch (e) {
      console.warn("[FuxTools] /api/schoolings konnte nicht geladen werden:", e);
    }
    for (const school of Object.values(schoolByCategory)) {
      if (!school) continue;
      const occupied = occupiedRoomsWithPending(schoolingRuns, school.id);
      const freeRooms = Math.max(0, school.maxRooms - occupied);
      const nextFreeAt = earliestSchoolingFinish(schoolingRuns, school.id);
      const pending = getPendingSchoolingRooms(school.id);
      capacityBySchoolId[school.id] = {
        maxRooms: school.maxRooms,
        freeRooms: freeRooms,
        nextFreeAt: nextFreeAt,
        pending: pending
      };
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
      const pendingHint = info.pending ? ` <span class="glyphicon glyphicon-time" aria-hidden="true" title="${info.pending} Klassenraum/-räume gerade erst gestartet - vorläufig mitgezählt, bis das Spiel es selbst anzeigt"></span>` : "";
      const statusBadge = info.freeRooms > 0 ? `<span class="label label-success">${info.freeRooms}/${info.maxRooms} Klassenräume frei (${freeSeats} Plätze)${pendingHint}</span>` : `<span class="label label-warning">alle ${info.maxRooms} Klassenräume belegt${escapeHtml(untilLabel)}${pendingHint}</span>`;
      return `${escapeHtml(school.name)} · ${statusBadge}`;
    }
    function renderSchoolOverview() {
      const categoriesWithSchool = CATEGORY_ORDER.filter(cat => schoolByCategory[cat]);
      if (!categoriesWithSchool.length) return "";
      const cards = categoriesWithSchool.map(category => `\n            <div class="vn-settings-card" style="flex:1; min-width:220px;">\n              <b>${escapeHtml(category)}</b><br>\n              <small>${capacityLabel(schoolByCategory[category])}</small>\n            </div>\n          `).join("");
      return `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px;">${cards}</div>`;
    }
    function renderGroups() {
      if (!needs.length) {
        return `<p class="text-muted">Kein fehlendes Personal gefunden (oder noch nicht gescannt).</p>`;
      }
      const byCategory = new Map;
      for (const need of needs) {
        if (!byCategory.has(need.category)) byCategory.set(need.category, []);
        byCategory.get(need.category).push(need);
      }
      return CATEGORY_ORDER.filter(cat => byCategory.has(cat)).map(category => {
        const school = schoolByCategory[category];
        const categoryNeeds = byCategory.get(category).sort((a, b) => qualificationNameFor(qualifications, realSlugFor(a.slug)).localeCompare(qualificationNameFor(qualifications, realSlugFor(b.slug)), "de"));
        const rows = categoryNeeds.map(need => {
          const qualificationName = qualificationNameFor(qualifications, realSlugFor(need.slug));
          const stationTitleFor = deficitField => need.stations.filter(s => s[deficitField] > 0).map(s => `${s.name} (${s[deficitField]} fehlen)`).join(", ");
          const inTrainingTitle = need.stations.filter(s => s.inTraining > 0).map(s => `${s.name}: ${s.inTrainingNames.join(", ") || s.inTraining}`).join(" · ");
          const stationsWithDeficit = need.stations.filter(s => s.minDeficit > 0 || s.maxDeficit > 0);
          const haveBreakdown = need.stations.map(s => `${escapeHtml(s.name)}: ${s.have} vorhanden, Ziel ${s.rangeMin}–${s.rangeMax}` + (s.minDeficit > 0 || s.maxDeficit > 0 ? "" : " ✓ voll")).join("<br>");
          const needKey = `${need.category}::${need.slug}`;
          const minCoveredByRunningSchooling = need.totalMinDeficit <= 0 && need.totalInTraining > 0;
          const minBtn = need.totalMinDeficit > 0 ? `<button type="button" class="btn btn-primary btn-sm vn-schooling-start" data-key="${escapeHtml(needKey)}" data-mode="min" ${school ? "" : "disabled"}>\n                       <span class="glyphicon glyphicon-education" aria-hidden="true"></span> Ausbilden Minimum\n                     </button>` : minCoveredByRunningSchooling ? `<button type="button" class="btn btn-default btn-sm" disabled\n                               title="Minimum ist bereits durch die laufende Schulung abgedeckt - keine weitere Aktion nötig, sobald diese fertig ist.">\n                         <span class="glyphicon glyphicon-ok" aria-hidden="true"></span> Minimum erreicht (Schulung läuft)\n                       </button>` : "";
          const maxBtn = need.totalMaxDeficit > 0 ? `<button type="button" class="btn btn-default btn-sm vn-schooling-start" data-key="${escapeHtml(needKey)}" data-mode="max" ${school ? "" : "disabled"}>\n                       <span class="glyphicon glyphicon-education" aria-hidden="true"></span> Ausbilden Maximum\n                     </button>` : "";
          return `\n                <tr>\n                  <td style="vertical-align:middle;">${escapeHtml(qualificationName)}</td>\n                  <td style="vertical-align:middle;">\n                    ${need.totalMinDeficit > 0 ? `<span title="${escapeHtml(stationTitleFor("minDeficit"))}">${need.totalMinDeficit} fehlen (Minimum)</span><br>` : ""}\n                    ${need.totalMaxDeficit > 0 ? `<span title="${escapeHtml(stationTitleFor("maxDeficit"))}">${need.totalMaxDeficit} fehlen (Maximum)</span><br>` : ""}\n                    ${need.totalInTraining > 0 ? `<span class="text-muted" title="${escapeHtml(inTrainingTitle)}"><span class="glyphicon glyphicon-education" aria-hidden="true"></span> ${need.totalInTraining} schon im Lehrgang</span><br>` : ""}\n                    <details style="font-size:11px;">\n                      <summary class="text-muted" style="cursor:pointer;">${need.totalHave} vorhanden / Ziel ${need.totalRangeMin}–${need.totalRangeMax}</summary>\n                      <div class="text-muted" style="padding-left:8px;">${haveBreakdown}</div>\n                    </details>\n                    <small class="text-muted">${stationsWithDeficit.length} von ${need.stations.length} Wache(n) betroffen</small>\n                  </td>\n                  <td style="vertical-align:middle;">\n                    ${minBtn} ${maxBtn}\n                    <div class="vn-schooling-status" data-key="${escapeHtml(needKey)}" style="margin-top:4px; font-size:11px;"></div>\n                  </td>\n                </tr>\n              `;
        }).join("");
        return `\n            <div style="margin-bottom:16px;">\n              <p style="margin-bottom:4px;"><b>${escapeHtml(category)}</b></p>\n              <table class="table table-condensed table-striped" style="font-size:12px;">\n                <thead>\n                  <tr><th>Ausbildung</th><th>Fehlend</th><th>Aktion</th></tr>\n                </thead>\n                <tbody>${rows}</tbody>\n              </table>\n            </div>\n          `;
      }).join("");
    }
    function render() {
      body.innerHTML = `\n        <p class="text-muted" style="font-size:12px;">\n          Zeigt fehlendes Ausbildungspersonal je Schultyp (Bedarf aus dem aktiven\n          Wachenbauplan) und startet echte Lehrgänge - Personal steht währenddessen nicht für\n          Einsätze zur Verfügung, Anzahl vorher prüfen.\n        </p>\n        <div id="vn-schooling-overview">${renderSchoolOverview()}</div>\n        <div class="form-inline" style="margin-bottom:10px;">\n          <label for="vn-schooling-min-staff" style="font-size:12px;">\n            Erst ab wie viel Personal pro Wache schulen (schützt neue/kleine Wachen)?\n          </label>\n          <input type="number" min="0" id="vn-schooling-min-staff" class="form-control input-sm"\n                 value="${minStaff}" style="width:70px; margin-left:8px;">\n        </div>\n        <div id="vn-schooling-groups" style="max-height:55vh; overflow:auto;">${renderGroups()}</div>\n        <div class="vn-sticky-footer" style="display:flex; align-items:center; gap:10px;">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n          <button type="button" id="vn-schooling-goto-blueprints" class="btn btn-default">\n            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Wachen-Bauplaner verwalten\n          </button>\n          <button type="button" id="vn-schooling-scan-btn" class="btn btn-default btn-xs" title="Neu scannen">\n            <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>\n          </button>\n          <span class="label label-default" id="vn-schooling-scan-status" style="font-size:12px;">\n            ${scanMeta.lastScanAt ? `Letzter Scan: ${escapeHtml(new Date(scanMeta.lastScanAt).toLocaleString("de-DE"))}` : "Noch nie gescannt"}\n          </span>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      document.getElementById("vn-schooling-goto-blueprints").addEventListener("click", () => renderStationBlueprintsListScreen(() => renderSchoolingBlueprintSelection(renderMainMenu)));
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
          const mode = btn.dataset.mode === "max" ? "max" : "min";
          const siblingButtons = body.querySelectorAll(`.vn-schooling-start[data-key="${btn.dataset.key}"]`);
          const statusEl = body.querySelector(`.vn-schooling-status[data-key="${btn.dataset.key}"]`);
          const qualificationName = qualificationNameFor(qualifications, realSlugFor(need.slug));
          siblingButtons.forEach(b => b.disabled = true);
          statusEl.textContent = "Lade Vorschau ...";
          try {
            const plan = await planTrainingRun(need, school, mode);
            renderSchoolingConfirmScreen({
              need: need,
              school: school,
              qualificationName: qualificationName,
              plan: plan,
              goBack: () => renderSchoolingScreen(blueprint, stations, goBack)
            });
          } catch (e) {
            statusEl.innerHTML = `<span class="text-danger">Fehler: ${escapeHtml(e.message)}</span>`;
            siblingButtons.forEach(b => b.disabled = false);
          }
        });
      });
    }
    render();
  }
  async function renderStationStatisticsScreen() {
    setModalWidth(MODAL_WIDTH_WIDE);
    setScreenTitle("Statistik");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Wachen-Daten ...</p>`;
    let allStations, vehicles;
    try {
      [allStations, vehicles] = await Promise.all([ loadBuildingsForCheck(), loadGameData().then(d => d.vehicles) ]);
    } catch (e) {
      body.innerHTML = `\n        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
      return;
    }
    body.innerHTML = `<p>Prüfe letzten Personal-Scan ...</p>`;
    await ensureFreshPersonnelScan((done, of) => {
      body.innerHTML = `<p>Scanne Personal ... (${done}/${of})</p>`;
    });
    const scanData = await getPersonnelScanData();
    const scanMeta = await getPersonnelScanMeta();
    const vehicleCountByStation = new Map;
    for (const v of vehicles) {
      const stationId = String(v.building_id ?? v.building);
      vehicleCountByStation.set(stationId, (vehicleCountByStation.get(stationId) || 0) + 1);
    }
    const byLeitstelle = new Map;
    for (const s of allStations) {
      const leitstelleKey = s.leitstelleName || "Ohne Leitstelle";
      if (!byLeitstelle.has(leitstelleKey)) byLeitstelle.set(leitstelleKey, new Map);
      const byType = byLeitstelle.get(leitstelleKey);
      const typeKey = s.typeName || "Unbekannter Gebäudetyp";
      if (!byType.has(typeKey)) byType.set(typeKey, {
        stations: 0,
        vehicles: 0,
        personnel: 0,
        hasScan: false
      });
      const entry = byType.get(typeKey);
      entry.stations++;
      entry.vehicles += vehicleCountByStation.get(s.id) || 0;
      const scan = scanData[s.id];
      if (scan) {
        entry.personnel += scan.total;
        entry.hasScan = true;
      }
    }
    let grandStations = 0;
    let grandVehicles = 0;
    let grandPersonnel = 0;
    const sections = [ ...byLeitstelle.entries() ].sort((a, b) => a[0].localeCompare(b[0], "de")).map(([leitstelleName, byType]) => {
      let sectionStations = 0;
      let sectionVehicles = 0;
      let sectionPersonnel = 0;
      const rows = [ ...byType.entries() ].sort((a, b) => a[0].localeCompare(b[0], "de")).map(([typeName, entry]) => {
        sectionStations += entry.stations;
        sectionVehicles += entry.vehicles;
        sectionPersonnel += entry.personnel;
        return `\n              <tr>\n                <td>${escapeHtml(typeName)}</td>\n                <td>${entry.stations}</td>\n                <td>${entry.vehicles}</td>\n                <td>${entry.hasScan ? entry.personnel : "-"}</td>\n              </tr>\n            `;
      }).join("");
      grandStations += sectionStations;
      grandVehicles += sectionVehicles;
      grandPersonnel += sectionPersonnel;
      return `\n          <div class="panel panel-default" style="margin-bottom:8px;">\n            <div class="panel-heading" style="padding:8px 12px;">\n              <b>${escapeHtml(leitstelleName)}</b>\n              <span class="text-muted">(${sectionStations} Wachen, ${sectionVehicles} Fahrzeuge, ${sectionPersonnel} Personal)</span>\n            </div>\n            <div class="panel-body" style="padding:0;">\n              <table class="table table-condensed table-striped" style="font-size:12px; margin-bottom:0;">\n                <thead><tr><th>Gebäudetyp</th><th>Wachen</th><th>Fahrzeuge</th><th>Personal</th></tr></thead>\n                <tbody>${rows}</tbody>\n              </table>\n            </div>\n          </div>\n        `;
    }).join("");
    const lastScanLabel = scanMeta.lastScanAt ? `Personal-Stand: ${new Date(scanMeta.lastScanAt).toLocaleString("de-DE")}` : "Personal noch nie gescannt";
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Wachen je Gebäudetyp, gruppiert nach Leitstelle. Personal nur für Gebäudetypen mit\n        Ausbildungs-Personal (Feuerwehr, Rettungsdienst, Polizei, THW &amp; Co.) - "-" bedeutet\n        kein Personal-Scan möglich/vorhanden.\n      </p>\n      <p class="text-muted" style="font-size:12px;">\n        <b>Gesamt:</b> ${grandStations} Wachen, ${grandVehicles} Fahrzeuge, ${grandPersonnel} Personal\n      </p>\n      <div style="max-height:55vh; overflow:auto;">\n        ${sections || '<p class="text-muted"><em>Keine Wachen gefunden.</em></p>'}\n      </div>\n      <div class="vn-sticky-footer" style="display:flex; align-items:center; gap:10px;">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <span class="text-muted" style="font-size:11px;">${escapeHtml(lastScanLabel)}</span>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", renderMainMenu);
  }
  function getVehicleTypeRequirement(vehicleTypeId) {
    const staff = vehicleTypeCatalog[vehicleTypeId]?.staff;
    if (!staff?.training || staff.trainingAtScene || !staff.max) return null;
    const requirements = [];
    for (const categoryTrainings of Object.values(staff.training)) {
      for (const [slug, spec] of Object.entries(categoryTrainings)) {
        const min = spec.all ? null : Number(spec.min) || 0;
        if (min === 0) continue;
        const existing = requirements.find(r => r.slug === slug);
        if (!existing) requirements.push({
          slug: slug,
          min: min
        }); else if (existing.min !== null && (min === null || min > existing.min)) existing.min = min;
      }
    }
    if (!requirements.length) return null;
    const fullReqs = requirements.filter(r => r.min === null);
    if (fullReqs.length > 1) {
      const base = Math.floor(staff.min / fullReqs.length);
      const remainder = staff.min % fullReqs.length;
      fullReqs.forEach((req, i) => {
        req.min = base + (i < remainder ? 1 : 0);
      });
    }
    return {
      requirements: requirements,
      staffMin: staff.min,
      staffMax: staff.max
    };
  }
  function getBlueprintTrainingRequirement(vehicleTypeId) {
    const staff = vehicleTypeCatalog[vehicleTypeId]?.staff;
    if (!staff?.training || !staff.max) return null;
    const requirements = [];
    const allSlugs = new Set;
    for (const categoryTrainings of Object.values(staff.training)) {
      for (const [slug, spec] of Object.entries(categoryTrainings)) {
        let min, max;
        if (spec.all) {
          min = staff.min;
          max = staff.max;
          allSlugs.add(slug);
        } else {
          const rawMin = Number(spec.min) || 0;
          min = rawMin || 1;
          max = rawMin || staff.max;
        }
        const existing = requirements.find(r => r.slug === slug);
        if (!existing) requirements.push({
          slug: slug,
          min: min,
          max: max
        }); else {
          existing.min = Math.max(existing.min, min);
          existing.max = Math.max(existing.max, max);
        }
      }
    }
    if (!requirements.length) return null;
    const fullReqs = requirements.filter(r => allSlugs.has(r.slug));
    if (fullReqs.length > 1) {
      const splitEvenly = total => {
        const base = Math.floor(total / fullReqs.length);
        const remainder = total % fullReqs.length;
        return fullReqs.map((_, i) => base + (i < remainder ? 1 : 0));
      };
      const minParts = splitEvenly(staff.min);
      const maxParts = splitEvenly(staff.max);
      fullReqs.forEach((req, i) => {
        req.min = minParts[i];
        req.max = maxParts[i];
      });
    }
    return {
      requirements: requirements
    };
  }
  const VEHICLE_FMS_AT_STATION = new Set([ 1, 2, 6 ]);
  const VEHICLE_FMS_NOT_STAFFED = 6;
  const VEHICLE_FMS_READY = 2;
  function getVehicleTypeCrewTarget(vehicleTypeId) {
    const staff = vehicleTypeCatalog[vehicleTypeId]?.staff;
    if (!staff?.max) return null;
    const requirement = getVehicleTypeRequirement(vehicleTypeId);
    if (requirement) return requirement;
    return {
      requirements: [],
      staffMin: staff.min,
      staffMax: staff.max
    };
  }
  function getSpecialTrainingSlugs() {
    const slugs = new Set;
    for (const typeId of Object.keys(vehicleTypeCatalog)) {
      const requirement = getVehicleTypeRequirement(Number(typeId));
      if (requirement) for (const req of requirement.requirements) slugs.add(req.slug);
    }
    return slugs;
  }
  async function loadCrewCheckVehicles() {
    const {vehicles: vehicles, buildingsById: buildingsById} = await loadGameData();
    return vehicles.map(v => {
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
        stationId: stationId,
        stationName: station?.caption || `Wache ${stationId}`,
        leitstelleId: leitstelleId,
        leitstelleName: leitstelleId !== "none" ? leitstelleBuilding?.caption || `Leitstelle ${leitstelleId}` : "Ohne Leitstelle"
      };
    }).filter(Boolean);
  }
  async function fetchVehicleFmsReal(vehicleId) {
    const res = await fetchWithTimeout(`/api/v2/vehicles/${vehicleId}`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`Fahrzeug ${vehicleId} konnte nicht geladen werden (${res.status}).`);
    const data = await res.json();
    const vehicle = data.result || data;
    return vehicle.fms_real ?? vehicle.fms ?? null;
  }
  async function fetchVehicleAssignmentPage(vehicleId) {
    const res = await fetchWithTimeout(`/vehicles/${vehicleId}/zuweisung`, {
      credentials: "same-origin"
    });
    if (!res.ok) {
      throw new Error(`Zuweisungs-Seite von Fahrzeug ${vehicleId} konnte nicht geladen werden (${res.status}).`);
    }
    const doc = (new DOMParser).parseFromString(await res.text(), "text/html");
    const people = [ ...doc.querySelectorAll("#personal_table tr[data-filterable-by]") ].map(row => {
      const assignBtn = row.querySelector("a.btn-success[personal_id], a.btn-warning[personal_id]");
      return {
        slugs: parseFilterableBySlugs(row),
        inTraining: row.textContent.includes("Im Unterricht"),
        assignedHere: !!row.querySelector("a.btn-assigned"),
        assignedElsewhere: !!row.querySelector("a.btn-warning[personal_id]"),
        assignHref: assignBtn?.getAttribute("href") || null,
        unassignHref: row.querySelector("a.btn-assigned[personal_id]")?.getAttribute("href") || null
      };
    });
    return {
      people: people
    };
  }
  async function assignQualifiedPersonnelToVehicleForSlug(vehicleId, slug, target, staffMax) {
    const {people: people} = await fetchVehicleAssignmentPage(vehicleId);
    const assignedCount = people.filter(p => p.assignedHere).length;
    const alreadyQualified = people.filter(p => p.assignedHere && p.slugs.includes(slug)).length;
    const csrfToken = getCsrfTokenOrThrow(vehicleId);
    let remaining = Math.min(Math.max(0, staffMax - assignedCount), Math.max(0, target - alreadyQualified));
    let assignedNow = 0;
    const eligible = people.filter(p => !p.assignedHere && !p.assignedElsewhere && !p.inTraining && p.assignHref && p.slugs.includes(slug));
    for (const person of eligible) {
      if (remaining <= 0) break;
      const res = await fetchWithTimeout(person.assignHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!res.ok) throw new Error(`Zuweisen fehlgeschlagen (${res.status}).`);
      assignedNow++;
      remaining--;
      await new Promise(r => setTimeout(r, 100));
    }
    return assignedNow;
  }
  async function assignAnyPersonnelToVehicle(vehicleId, target, staffMax, untrainedOnly = false) {
    const {people: people} = await fetchVehicleAssignmentPage(vehicleId);
    const assignedCount = people.filter(p => p.assignedHere).length;
    const csrfToken = getCsrfTokenOrThrow(vehicleId);
    let remaining = Math.min(Math.max(0, staffMax - assignedCount), Math.max(0, target - assignedCount));
    let assignedNow = 0;
    const specialSlugs = getSpecialTrainingSlugs();
    const eligible = people.filter(p => !p.assignedHere && !p.assignedElsewhere && !p.inTraining && p.assignHref).filter(p => !untrainedOnly || !p.slugs.some(s => specialSlugs.has(s))).sort((a, b) => Number(a.slugs.some(s => specialSlugs.has(s))) - Number(b.slugs.some(s => specialSlugs.has(s))));
    for (const person of eligible) {
      if (remaining <= 0) break;
      const res = await fetchWithTimeout(person.assignHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!res.ok) throw new Error(`Zuweisen fehlgeschlagen (${res.status}).`);
      assignedNow++;
      remaining--;
      await new Promise(r => setTimeout(r, 100));
    }
    return assignedNow;
  }
  async function setVehicleFms(vehicleId, fmsStatus) {
    const res = await fetchWithTimeout(`/vehicles/${vehicleId}/set_fms/${fmsStatus}`, {
      credentials: "same-origin"
    });
    if (!res.ok) throw new Error(`FMS-Status konnte nicht auf ${fmsStatus} gesetzt werden (${res.status}).`);
  }
  function isVehicleFullyStaffed(assignmentPage, vehicle) {
    const assignedPeople = assignmentPage.people.filter(p => p.assignedHere);
    if (assignedPeople.length < (Number(vehicle.staffMin) || 0)) return false;
    return vehicle.requirements.every(req => {
      if (req.min === null) return assignedPeople.length > 0 && assignedPeople.every(p => p.slugs.includes(req.slug));
      return assignedPeople.filter(p => p.slugs.includes(req.slug)).length >= req.min;
    });
  }
  async function trimVehicleCrewToStaffMin(vehicle) {
    const {people: people} = await fetchVehicleAssignmentPage(vehicle.id);
    const assigned = people.filter(p => p.assignedHere);
    let excess = assigned.length - (Number(vehicle.staffMin) || 0);
    if (excess <= 0) return 0;
    const slugCounts = new Map;
    for (const req of vehicle.requirements) {
      slugCounts.set(req.slug, assigned.filter(p => p.slugs.includes(req.slug)).length);
    }
    const specialSlugs = getSpecialTrainingSlugs();
    const candidates = [ ...assigned ].sort((a, b) => {
      const aSpecial = Number(a.slugs.some(s => specialSlugs.has(s)));
      const bSpecial = Number(b.slugs.some(s => specialSlugs.has(s)));
      return aSpecial - bSpecial;
    });
    const csrfToken = getCsrfTokenOrThrow(vehicle.id);
    let removed = 0;
    for (const person of candidates) {
      if (excess <= 0) break;
      if (!person.unassignHref) continue;
      const wouldViolate = vehicle.requirements.some(req => person.slugs.includes(req.slug) && slugCounts.get(req.slug) - 1 < req.min);
      if (wouldViolate) continue;
      const res = await fetchWithTimeout(person.unassignHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest"
        }
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
  async function assignRequiredAndUntrainedSeats(vehicle, staffingMode) {
    const fmsBefore = await fetchVehicleFmsReal(vehicle.id);
    if (fmsBefore == null) throw new Error("FMS-Status nicht ermittelbar - sicherheitshalber abgebrochen.");
    if (!VEHICLE_FMS_AT_STATION.has(fmsBefore)) {
      throw new Error("Fahrzeug ist gerade im Einsatz - übersprungen, um nicht einzugreifen.");
    }
    let assignedNow = 0;
    const targetByRequirement = new Map;
    const hasFullRequirement = vehicle.requirements.some(req => req.min === null);
    if (vehicle.requirements.length) {
      for (const req of vehicle.requirements) {
        const target = staffingMode === "full" ? vehicle.staffMax : req.min === null ? vehicle.staffMin : req.min;
        targetByRequirement.set(req.slug, target);
        assignedNow += await assignQualifiedPersonnelToVehicleForSlug(vehicle.id, req.slug, target, vehicle.staffMax);
      }
      if (!hasFullRequirement) {
        const overallTarget = staffingMode === "full" ? vehicle.staffMax : vehicle.staffMin;
        assignedNow += await assignAnyPersonnelToVehicle(vehicle.id, overallTarget, vehicle.staffMax, true);
      }
    } else {
      const target = staffingMode === "full" ? vehicle.staffMax : vehicle.staffMin;
      assignedNow += await assignAnyPersonnelToVehicle(vehicle.id, target, vehicle.staffMax, true);
    }
    return {
      assignedNow: assignedNow,
      targetByRequirement: targetByRequirement,
      hasFullRequirement: hasFullRequirement
    };
  }
  async function assignLeftoverSpecialistSeats(vehicle, staffingMode, untrainedOnly, hasFullRequirement) {
    if (hasFullRequirement) return 0;
    if (untrainedOnly && !vehicle.requirements.length) return 0;
    const overallTarget = staffingMode === "full" ? vehicle.staffMax : vehicle.staffMin;
    return await assignAnyPersonnelToVehicle(vehicle.id, overallTarget, vehicle.staffMax, false);
  }
  async function finalizeVehicleCrew(vehicle, staffingMode, trimEnabled, autoSetFms, phase1) {
    const {targetByRequirement: targetByRequirement, hasFullRequirement: hasFullRequirement} = phase1;
    const fmsBefore = await fetchVehicleFmsReal(vehicle.id);
    if (fmsBefore == null) throw new Error("FMS-Status nicht ermittelbar - sicherheitshalber abgebrochen.");
    if (!VEHICLE_FMS_AT_STATION.has(fmsBefore)) {
      throw new Error("Fahrzeug ist gerade im Einsatz - übersprungen, um nicht einzugreifen.");
    }
    if (staffingMode !== "full" && !hasFullRequirement && trimEnabled) {
      await trimVehicleCrewToStaffMin(vehicle);
    }
    const after = await fetchVehicleAssignmentPage(vehicle.id);
    const fullyStaffed = isVehicleFullyStaffed(after, vehicle);
    const assignedCount = after.people.filter(p => p.assignedHere).length;
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
    if (autoSetFms) {
      if (fullyStaffed) {
        if (fmsBefore === VEHICLE_FMS_NOT_STAFFED) await setVehicleFms(vehicle.id, VEHICLE_FMS_READY);
      } else if (fmsBefore !== VEHICLE_FMS_NOT_STAFFED) {
        await setVehicleFms(vehicle.id, VEHICLE_FMS_NOT_STAFFED);
      }
    }
    return {
      assignedCount: assignedCount,
      capacity: vehicle.staffMax,
      requiredPersonnel: requiredPersonnel,
      trainedPersonnel: trainedPersonnel,
      fullyStaffed: fullyStaffed
    };
  }
  async function unassignAllPersonnelFromVehicle(vehicleId) {
    const {people: people} = await fetchVehicleAssignmentPage(vehicleId);
    const csrfToken = getCsrfTokenOrThrow(vehicleId);
    let removed = 0;
    for (const person of people) {
      if (!person.assignedHere || !person.unassignHref) continue;
      const res = await fetchWithTimeout(person.unassignHref, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": csrfToken,
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!res.ok) throw new Error(`Abziehen fehlgeschlagen (${res.status}).`);
      removed++;
      await new Promise(r => setTimeout(r, 100));
    }
    return removed;
  }
  async function clearVehicleCrew(vehicle) {
    const fmsBefore = await fetchVehicleFmsReal(vehicle.id);
    if (fmsBefore == null) throw new Error("FMS-Status nicht ermittelbar - sicherheitshalber übersprungen.");
    if (!VEHICLE_FMS_AT_STATION.has(fmsBefore)) {
      throw new Error("Fahrzeug ist gerade im Einsatz - übersprungen, um nicht einzugreifen.");
    }
    const removed = await unassignAllPersonnelFromVehicle(vehicle.id);
    if (fmsBefore === VEHICLE_FMS_NOT_STAFFED) await setVehicleFms(vehicle.id, VEHICLE_FMS_READY);
    return removed;
  }
  const VEHICLE_CREW_CHECK_CONCURRENCY = 8;
  async function renderVehicleCrewLeitstelleSelection(goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("Fahrzeug-Besatzung › Leitstelle wählen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p><em>Lade Fahrzeuge ...</em></p>`;
    let allVehicles;
    try {
      allVehicles = await loadCrewCheckVehicles();
    } catch (e) {
      body.innerHTML = `\n        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }
    const byLeitstelle = new Map;
    for (const v of allVehicles) {
      if (!byLeitstelle.has(v.leitstelleId)) byLeitstelle.set(v.leitstelleId, {
        name: v.leitstelleName,
        vehicles: []
      });
      byLeitstelle.get(v.leitstelleId).vehicles.push(v);
    }
    const rows = [ ...byLeitstelle.entries() ].sort((a, b) => a[1].name.localeCompare(b[1].name, "de")).map(([id, info]) => {
      const stationCount = new Set(info.vehicles.map(v => v.stationId)).size;
      return `\n        <div class="checkbox" style="margin: 2px 0;">\n          <label>\n            <input type="checkbox" class="vn-crew-leitstelle-check" value="${escapeHtml(id)}" checked>\n            ${escapeHtml(info.name)} <span class="text-muted">(${stationCount} Wachen, ${info.vehicles.length} Fahrzeuge)</span>\n          </label>\n        </div>`;
    }).join("");
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Fahrzeug-Besatzung nur für ausgewählte Leitstelle(n) prüfen und zuweisen - praktisch,\n        um gezielt einen Teil des Accounts zu bearbeiten statt immer alle Fahrzeuge.\n      </p>\n      <div style="max-height: 380px; overflow-y: auto; border: 1px solid #eee; padding: 8px; border-radius: 4px;">\n        ${rows || '<p class="text-muted"><em>Keine passenden Fahrzeuge gefunden.</em></p>'}\n      </div>\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-next-crew-leitstelle" type="button" class="btn btn-primary">\n          Weiter <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-next-crew-leitstelle").addEventListener("click", () => {
      const ids = [ ...body.querySelectorAll(".vn-crew-leitstelle-check:checked") ].map(el => el.value);
      if (!ids.length) {
        alert("Bitte mindestens eine Leitstelle auswählen.");
        return;
      }
      renderVehicleCrewScreen(() => renderVehicleCrewLeitstelleSelection(goBack), allVehicles, ids);
    });
  }
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
        body.innerHTML = `\n          <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>\n          <div class="vn-sticky-footer">\n            <button id="vn-btn-back" type="button" class="btn btn-default">\n              <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n            </button>\n          </div>\n        `;
        document.getElementById("vn-btn-back").addEventListener("click", goBack);
        return;
      }
    }
    const scopeVehicles = selectedLeitstelleIds ? allVehicles.filter(v => selectedLeitstelleIds.includes(v.leitstelleId)) : allVehicles;
    let staffingMode = await getVehicleCrewStaffingMode();
    let includeNormal = await getVehicleCrewIncludeNormal();
    let untrainedOnly = await getVehicleCrewUntrainedOnly();
    let trimEnabled = await getVehicleCrewTrimEnabled();
    let autoFmsEnabled = await getVehicleCrewAutoFms();
    let vehicles;
    let byCategory;
    function recomputeVisibleVehicles() {
      vehicles = scopeVehicles.filter(v => v.special || includeNormal);
      byCategory = new Map;
      for (const v of vehicles) {
        if (!byCategory.has(v.category)) byCategory.set(v.category, []);
        byCategory.get(v.category).push(v);
      }
    }
    recomputeVisibleVehicles();
    const vehiclesById = new Map(allVehicles.map(v => [ v.id, v ]));
    const scopedIds = new Set(scopeVehicles.map(v => v.id));
    const persistedProblems = await getVehicleCrewProblems();
    const allProblemsById = new Map;
    for (const [id, {message: message, since: since}] of Object.entries(persistedProblems)) {
      const vehicle = vehiclesById.get(id);
      if (vehicle) allProblemsById.set(id, {
        vehicle: vehicle,
        message: message,
        since: since
      });
    }
    if (Object.keys(persistedProblems).length !== allProblemsById.size) {
      await saveVehicleCrewProblems(allProblemsById);
    }
    const problemsById = new Map([ ...allProblemsById ].filter(([id]) => scopedIds.has(id)));
    async function persistProblems() {
      for (const id of [ ...allProblemsById.keys() ]) {
        if (scopedIds.has(id) && !problemsById.has(id)) allProblemsById.delete(id);
      }
      for (const [id, entry] of problemsById) allProblemsById.set(id, entry);
      await saveVehicleCrewProblems(allProblemsById);
    }
    function formatSince(since) {
      if (!since) return "unbekannt";
      const d = new Date(since);
      return `${d.toLocaleDateString("de-DE")}, ${d.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit"
      })}`;
    }
    const problemsSort = {
      column: "category",
      asc: true
    };
    function problemsSortKey(column, {vehicle: vehicle, message: message, since: since}) {
      switch (column) {
       case "station":
        return vehicle.stationName;

       case "vehicle":
        return vehicle.caption;

       case "status":
        return message || "";

       case "since":
        return since || 0;

       case "category":
       default:
        return vehicle.category;
      }
    }
    function renderProblemsRows() {
      const dir = problemsSort.asc ? 1 : -1;
      const rows = [ ...problemsById.entries() ].sort(([, a], [, b]) => {
        const ka = problemsSortKey(problemsSort.column, a);
        const kb = problemsSortKey(problemsSort.column, b);
        if (typeof ka === "number" && typeof kb === "number") return dir * (ka - kb);
        return dir * String(ka).localeCompare(String(kb), "de");
      });
      if (!rows.length) {
        return `<tr><td colspan="6" class="text-muted">Noch keine Probleme gefunden (oder noch nicht geprüft).</td></tr>`;
      }
      return rows.map(([id, {vehicle: vehicle, message: message, since: since}]) => `\n            <tr>\n              <td>${escapeHtml(vehicle.category)}</td>\n              <td>${escapeHtml(vehicle.stationName)}</td>\n              <td><a href="/vehicles/${escapeHtml(vehicle.id)}" target="_blank">${escapeHtml(vehicle.caption)}</a></td>\n              <td class="text-danger">${escapeHtml(message || "")}</td>\n              <td class="text-muted" style="white-space:nowrap;">${escapeHtml(formatSince(since))}</td>\n              <td>\n                <button type="button" class="btn btn-default btn-xs vn-crew-problem-remove" data-id="${escapeHtml(id)}"\n                        title="Aus der Liste entfernen (macht keine Zuweisung rückgängig)">\n                  <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>\n                </button>\n              </td>\n            </tr>\n          `).join("");
    }
    function problemsHeaderHtml() {
      const arrow = col => problemsSort.column === col ? `<span class="glyphicon glyphicon-triangle-${problemsSort.asc ? "bottom" : "top"}" aria-hidden="true" style="font-size:10px;"></span>` : "";
      const th = (col, label) => `<th class="vn-problems-sort-th" data-sort="${col}" style="cursor:pointer; white-space:nowrap;">${label} ${arrow(col)}</th>`;
      return `${th("category", "Kategorie")}${th("station", "Wache")}${th("vehicle", "Fahrzeug")}${th("status", "Status")}${th("since", "Seit")}<th></th>`;
    }
    function bindProblemsSortHeaders() {
      body.querySelectorAll(".vn-problems-sort-th").forEach(th => {
        th.addEventListener("click", () => {
          const col = th.dataset.sort;
          if (problemsSort.column === col) problemsSort.asc = !problemsSort.asc; else {
            problemsSort.column = col;
            problemsSort.asc = true;
          }
          updateProblemsTable();
        });
      });
    }
    function updateProblemsTable() {
      const headRow = document.getElementById("vn-crew-problems-head");
      if (headRow) headRow.innerHTML = problemsHeaderHtml();
      document.getElementById("vn-crew-problems-body").innerHTML = renderProblemsRows();
      bindProblemsRowButtons();
      bindProblemsSortHeaders();
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
      return CATEGORY_ORDER.filter(cat => byCategory.has(cat)).map(category => {
        const running = runningCategoryRuns.get(category);
        const btnClass = running ? "btn-danger" : "btn-primary";
        const btnLabel = running ? `<span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen` : `<span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Alle ${escapeHtml(category)} prüfen &amp; zuweisen`;
        const percent = running && running.total > 0 ? Math.round(running.done / running.total * 100) : 0;
        return `\n            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">\n              <span style="display:inline-block; min-width:140px;">\n                <b>${escapeHtml(category)}</b>\n                <span class="text-muted" style="font-size:11px;">(${byCategory.get(category).length})</span>\n              </span>\n              <button type="button" class="btn ${btnClass} btn-sm vn-crew-check-category" style="min-width:220px;" data-category="${escapeHtml(category)}">\n                ${btnLabel}\n              </button>\n              <div class="vn-crew-category-progress-wrap" data-category="${escapeHtml(category)}"\n                   style="flex:1; min-width:160px; display:${running ? "block" : "none"};">\n                <div class="progress" style="margin:0; height:16px;">\n                  <div class="progress-bar vn-crew-category-progress-bar" data-category="${escapeHtml(category)}"\n                       style="width:${percent}%;"></div>\n                </div>\n              </div>\n              <small class="text-muted vn-crew-category-status" data-category="${escapeHtml(category)}">${escapeHtml(running?.statusText || "")}</small>\n            </div>\n          `;
      }).join("");
    }
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Weist passend ausgebildetes Personal zu (z.B. Notarzt), optional auch normale\n        Fahrzeuge. Setzt danach FMS 2 (besetzt) oder FMS 6 (nicht besetzt), sofern unten nicht\n        deaktiviert.\n      </p>\n      <div class="form-inline" style="margin-bottom:12px; display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap;">\n        <div class="vn-btn-group-box">\n          <span class="vn-btn-group-label">Bei Teil-Anforderungen (z.B. GRTW/NAW):</span>\n          <button type="button" class="btn btn-sm ${staffingMode === "min" ? "btn-primary" : "btn-default"} vn-crew-mode" data-mode="min"\n                  title="Spart Personal für andere Fahrzeuge - belegt bei Teil-Anforderungen nur so viele Plätze wie wirklich nötig.">\n            Nur Minimum\n          </button>\n          <button type="button" class="btn btn-sm ${staffingMode === "full" ? "btn-danger" : "btn-default"} vn-crew-mode" data-mode="full"\n                  title="Belegt bei Teil-Anforderungen gleich alle Plätze mit passender Ausbildung. Kann dazu führen, dass Personal knapp wird und andere Fahrzeuge leer bleiben.">\n            Volle Besatzung\n          </button>\n        </div>\n        <div class="vn-btn-group-box">\n          <button type="button" class="btn btn-sm ${includeNormal ? "btn-primary" : "btn-default"} vn-crew-toggle" id="vn-crew-include-normal"\n                  title="Weist auch normalen Fahrzeugen ohne Ausbildungsanforderung Personal zu (sonst nur Spezialfahrzeuge).">\n            Normale Fahrzeuge einbeziehen\n          </button>\n          <button type="button" class="btn btn-sm ${untrainedOnly ? "btn-primary" : "btn-default"} vn-crew-toggle" id="vn-crew-untrained-only"\n                  title="Bei Fahrzeugen ohne eigene Ausbildungsanforderung (z.B. GruKw bei BePol/THW/SEG) werden Spezialisten (Notarzt usw.) nie verbraucht - lieber ein Platz leer. Echte Ausbildungspflichten (z.B. Notarzt auf NAW) bleiben davon unberührt.">\n            Nur ungeschultes Personal zuweisen\n          </button>\n        </div>\n        <div class="vn-btn-group-box">\n          <span class="vn-btn-group-label">Bereits Zugewiesenes:</span>\n          <button type="button" class="btn btn-sm ${!trimEnabled ? "btn-primary" : "btn-default"} vn-crew-trim" data-trim="off"\n                  title="Ein Lauf fügt nur fehlendes Personal hinzu - bereits zugewiesenes Personal wird nie entfernt, egal mit welchen Einstellungen es früher zugewiesen wurde.">\n            Nur ergänzen\n          </button>\n          <button type="button" class="btn btn-sm ${trimEnabled ? "btn-danger" : "btn-default"} vn-crew-trim" data-trim="on"\n                  title="Gleicht die Besatzung komplett an die aktuellen Einstellungen an - entfernt auch überzähliges Personal (z.B. beim Wechsel von Voll- auf Minimum-Besatzung) oder gibt einen Spezialisten frei, der auf einem Fahrzeug ohne eigene Anforderung sitzt.">\n            Vollständig anwenden\n          </button>\n        </div>\n        <div class="vn-btn-group-box">\n          <span class="vn-btn-group-label">Automatisch FMS setzen:</span>\n          <button type="button" class="btn btn-sm ${autoFmsEnabled ? "btn-primary" : "btn-default"} vn-crew-auto-fms" data-auto-fms="on"\n                  title="Setzt nach dem Zuweisen automatisch FMS 2 (passend besetzt) bzw. FMS 6 (nicht besetzt) - bisheriges Verhalten.">\n            Ja\n          </button>\n          <button type="button" class="btn btn-sm ${!autoFmsEnabled ? "btn-danger" : "btn-default"} vn-crew-auto-fms" data-auto-fms="off"\n                  title="Fasst den FMS-Status gar nicht an, weder 2 noch 6 - für alle, die den Status selbst/anders verwalten oder die automatische Nachbesetzung durch FMS 6 im Spiel grundsätzlich vermeiden wollen.">\n            Nein\n          </button>\n        </div>\n      </div>\n      <div id="vn-crew-groups">${renderGroups()}</div>\n      <div style="display:flex; align-items:center; justify-content:space-between; margin-top:14px; margin-bottom:4px;">\n        <b>Nicht vollständig besetzte Fahrzeuge (FMS 6) / Fehler</b>\n        <button type="button" id="vn-btn-clear-problems" class="btn btn-default btn-xs">\n          <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Liste leeren\n        </button>\n      </div>\n      <div style="max-height:35vh; overflow:auto;">\n        <table class="table table-condensed table-striped" style="font-size:12px;">\n          <thead>\n            <tr id="vn-crew-problems-head">${problemsHeaderHtml()}</tr>\n          </thead>\n          <tbody id="vn-crew-problems-body">${renderProblemsRows()}</tbody>\n        </table>\n      </div>\n      <div class="vn-sticky-footer" style="display:flex; justify-content:space-between;">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-unassign-all" type="button" class="btn btn-danger">\n          <span class="glyphicon glyphicon-remove-circle" aria-hidden="true"></span> Alle Zuweisungen rückgängig machen\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-unassign-all").addEventListener("click", () => {
      renderVehicleCrewUnassignAllConfirmScreen(scopeVehicles, () => renderVehicleCrewScreen(goBack, allVehicles, selectedLeitstelleIds));
    });
    bindProblemsRowButtons();
    bindProblemsSortHeaders();
    document.getElementById("vn-btn-clear-problems").addEventListener("click", () => {
      if (!problemsById.size) return;
      renderSimpleConfirmScreen({
        title: "Fahrzeug-Besatzung › Liste leeren",
        message: `${problemsById.size} Einträge aus der Liste entfernen? Macht keine Zuweisung im Spiel rückgängig, nur unsere Anzeige.`,
        confirmLabel: "Leeren",
        confirmIcon: "glyphicon-trash",
        goBack: () => renderVehicleCrewScreen(goBack, allVehicles, selectedLeitstelleIds),
        onConfirm: async () => {
          problemsById.clear();
          await persistProblems();
          renderVehicleCrewScreen(goBack, allVehicles, selectedLeitstelleIds);
        }
      });
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
      });
    });
    body.querySelectorAll(".vn-crew-trim").forEach(btn => {
      btn.addEventListener("click", async () => {
        trimEnabled = btn.dataset.trim === "on";
        await storeData(trimEnabled, VEHICLE_CREW_TRIM_KEY);
        body.querySelectorAll(".vn-crew-trim").forEach(b => {
          const active = b.dataset.trim === (trimEnabled ? "on" : "off");
          b.classList.toggle("btn-primary", active && !trimEnabled);
          b.classList.toggle("btn-danger", active && trimEnabled);
          b.classList.toggle("btn-default", !active);
        });
      });
    });
    body.querySelectorAll(".vn-crew-auto-fms").forEach(btn => {
      btn.addEventListener("click", async () => {
        autoFmsEnabled = btn.dataset.autoFms === "on";
        await storeData(autoFmsEnabled, VEHICLE_CREW_AUTO_FMS_KEY);
        body.querySelectorAll(".vn-crew-auto-fms").forEach(b => {
          const active = b.dataset.autoFms === (autoFmsEnabled ? "on" : "off");
          b.classList.toggle("btn-primary", active && autoFmsEnabled);
          b.classList.toggle("btn-danger", active && !autoFmsEnabled);
          b.classList.toggle("btn-default", !active);
        });
      });
    });
    function setCategoryRunningUI(category, running) {
      const btn = body.querySelector(`.vn-crew-check-category[data-category="${category}"]`);
      if (!btn) return;
      btn.classList.toggle("btn-danger", running);
      btn.classList.toggle("btn-primary", !running);
      btn.innerHTML = running ? `<span class="glyphicon glyphicon-stop" aria-hidden="true"></span> Abbrechen` : `<span class="glyphicon glyphicon-refresh" aria-hidden="true"></span> Alle ${escapeHtml(category)} prüfen &amp; zuweisen`;
      const wrap = body.querySelector(`.vn-crew-category-progress-wrap[data-category="${category}"]`);
      if (wrap) wrap.style.display = running ? "block" : "none";
    }
    function setCategoryStatusText(category, text, done, total) {
      const el = body.querySelector(`.vn-crew-category-status[data-category="${category}"]`);
      if (el) el.textContent = text;
      const state = runningCategoryRuns.get(category);
      if (state) {
        state.statusText = text;
        if (total > 0) {
          state.done = done;
          state.total = total;
        }
      }
      const bar = body.querySelector(`.vn-crew-category-progress-bar[data-category="${category}"]`);
      if (bar && state && state.total > 0) {
        bar.style.width = `${Math.round(state.done / state.total * 100)}%`;
      }
      const tcText = document.querySelector(`.vn-tc-crew-text[data-category="${category}"]`);
      if (tcText) tcText.textContent = text;
      const tcBar = document.querySelector(`.vn-tc-crew-bar[data-category="${category}"]`);
      if (tcBar && state && state.total > 0) {
        tcBar.style.width = `${Math.round(state.done / state.total * 100)}%`;
      }
    }
    function bindCategoryButtons() {
      body.querySelectorAll(".vn-crew-check-category").forEach(btn => {
        const category = btn.dataset.category;
        btn.addEventListener("click", async () => {
          const running = runningCategoryRuns.get(category);
          if (running) {
            running.cancelled = true;
            updateHistoryEntry(running.historyId, {
              status: "cancelled",
              label: `${category}: Abbruch angefordert ...`
            });
            return;
          }
          if (activeBackgroundTask) {
            setCategoryStatusText(category, `Wartet: "${activeBackgroundTask.title}" läuft noch - bitte kurz warten und erneut klicken.`);
            return;
          }
          const categoryVehicles = byCategory.get(category) || [];
          const historyId = await startHistoryEntry({
            type: "crew_assignment",
            label: `${category}: 0/${categoryVehicles.length} gestartet ...`
          });
          const state = {
            cancelled: false,
            statusText: "",
            historyId: historyId
          };
          runningCategoryRuns.set(category, state);
          activeCrewCategoryRunCount++;
          updateBackgroundTaskBadge();
          setCategoryRunningUI(category, true);
          let done = 0;
          let ok = 0;
          let failed = 0;
          setCategoryStatusText(category, `0/${categoryVehicles.length} geprüft ...`, 0, categoryVehicles.length);
          const stationGroups = new Map;
          for (const v of categoryVehicles) {
            if (!stationGroups.has(v.stationId)) stationGroups.set(v.stationId, []);
            stationGroups.get(v.stationId).push(v);
          }
          const stationQueue = [ ...stationGroups.values() ];
          let nextStationIndex = 0;
          async function worker() {
            while (nextStationIndex < stationQueue.length) {
              if (state.cancelled) return;
              const stationVehicles = stationQueue[nextStationIndex++];
              const phase1ByVehicleId = new Map;
              for (const vehicle of stationVehicles) {
                if (state.cancelled) return;
                try {
                  phase1ByVehicleId.set(vehicle.id, await assignRequiredAndUntrainedSeats(vehicle, staffingMode));
                } catch (e) {
                  phase1ByVehicleId.set(vehicle.id, {
                    error: e
                  });
                }
              }
              for (const vehicle of stationVehicles) {
                if (state.cancelled) return;
                const phase1 = phase1ByVehicleId.get(vehicle.id);
                if (phase1.error) continue;
                try {
                  await assignLeftoverSpecialistSeats(vehicle, staffingMode, untrainedOnly, phase1.hasFullRequirement);
                } catch (e) {
                  phase1.error = e;
                }
              }
              for (const vehicle of stationVehicles) {
                if (state.cancelled) return;
                const phase1 = phase1ByVehicleId.get(vehicle.id);
                try {
                  if (phase1.error) throw phase1.error;
                  const result = await finalizeVehicleCrew(vehicle, staffingMode, trimEnabled, autoFmsEnabled, phase1);
                  if (result.fullyStaffed) {
                    ok++;
                    problemsById.delete(vehicle.id);
                  } else {
                    failed++;
                    const existing = problemsById.get(vehicle.id);
                    problemsById.set(vehicle.id, {
                      vehicle: vehicle,
                      message: `${result.trainedPersonnel}/${result.requiredPersonnel} erforderliches Personal zugewiesen`,
                      since: existing?.since || Date.now()
                    });
                  }
                } catch (e) {
                  failed++;
                  const existing = problemsById.get(vehicle.id);
                  problemsById.set(vehicle.id, {
                    vehicle: vehicle,
                    message: e.message,
                    since: existing?.since || Date.now()
                  });
                }
                done++;
                setCategoryStatusText(category, `${done}/${categoryVehicles.length} geprüft (${ok} passen, ${failed} nicht/Fehler)`, done, categoryVehicles.length);
                const problemsBody = document.getElementById("vn-crew-problems-body");
                if (problemsBody) {
                  problemsBody.innerHTML = renderProblemsRows();
                  bindProblemsRowButtons();
                }
                await persistProblems();
              }
            }
          }
          const workerCount = Math.min(VEHICLE_CREW_CHECK_CONCURRENCY, stationQueue.length);
          await Promise.all(Array.from({
            length: workerCount
          }, () => worker()));
          const summary = state.cancelled ? `Abgebrochen: ${done}/${categoryVehicles.length} geprüft (${ok} passen, ${failed} nicht/Fehler)` : `${done}/${categoryVehicles.length} geprüft (${ok} passen, ${failed} nicht/Fehler)`;
          setCategoryStatusText(category, summary);
          finishedCrewCategoryRuns.set(category, {
            summary: summary,
            finishedAt: Date.now()
          });
          await updateHistoryEntry(state.historyId, {
            label: `${category}: ${summary}`,
            status: state.cancelled ? "cancelled" : "done"
          });
          runningCategoryRuns.delete(category);
          activeCrewCategoryRunCount--;
          updateBackgroundTaskBadge();
          tryStartNextQueuedBackgroundTask();
          setCategoryRunningUI(category, false);
          refreshTaskCenterIfVisible();
        });
      });
    }
    bindCategoryButtons();
    document.getElementById("vn-crew-include-normal").addEventListener("click", async e => {
      includeNormal = !includeNormal;
      e.target.classList.toggle("btn-primary", includeNormal);
      e.target.classList.toggle("btn-default", !includeNormal);
      await storeData(includeNormal, VEHICLE_CREW_INCLUDE_NORMAL_KEY);
      recomputeVisibleVehicles();
      document.getElementById("vn-crew-groups").innerHTML = renderGroups();
      bindCategoryButtons();
    });
    document.getElementById("vn-crew-untrained-only").addEventListener("click", async e => {
      untrainedOnly = !untrainedOnly;
      e.target.classList.toggle("btn-primary", untrainedOnly);
      e.target.classList.toggle("btn-default", !untrainedOnly);
      await storeData(untrainedOnly, VEHICLE_CREW_UNTRAINED_ONLY_KEY);
    });
  }
  function renderVehicleCrewUnassignAllConfirmScreen(vehicles, goBack) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("Fahrzeug-Besatzung › Alle Zuweisungen rückgängig machen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p class="text-danger"><b>Wirklich bei ${vehicles.length} Fahrzeugen die komplette Besatzung abziehen?</b></p>\n      <p>\n        Betrifft alle Fahrzeuge der aktuellen Leitstellen-Auswahl. Sofort wirksam im Spiel,\n        nicht per Klick rückgängig zu machen. Fahrzeuge im Einsatz werden übersprungen.\n      </p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen\n        </button>\n        <button id="vn-btn-unassign-confirm" type="button" class="btn btn-danger">\n          <span class="glyphicon glyphicon-remove-circle" aria-hidden="true"></span> Besatzung abziehen\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-unassign-confirm").addEventListener("click", () => {
      executeUnassignAllPlan(vehicles, goBack);
    });
  }
  function executeUnassignAllPlan(vehicles, goBack) {
    const title = "Alle Zuweisungen rückgängig machen";
    const queued = runOrQueueBackgroundTask(title, viaQueue => runUnassignAllPlan(vehicles, goBack, title, viaQueue));
    if (queued === "queued") renderBackgroundTaskQueuedScreen(title, goBack);
  }
  async function runUnassignAllPlan(vehicles, goBack, title, viaQueue) {
    const historyId = await startHistoryEntry({
      type: "crew_unassign_all",
      label: `0/${vehicles.length} gestartet ...`
    });
    let cancelled = false;
    beginBackgroundTask(title, () => {
      cancelled = true;
      updateHistoryEntry(historyId, {
        status: "cancelled",
        label: "Abbruch angefordert ..."
      });
    });
    if (!viaQueue) renderBackgroundTaskProgressScreen();
    const stationGroups = new Map;
    for (const v of vehicles) {
      if (!stationGroups.has(v.stationId)) stationGroups.set(v.stationId, []);
      stationGroups.get(v.stationId).push(v);
    }
    const stationQueue = [ ...stationGroups.values() ];
    let done = 0;
    let removedTotal = 0;
    let failed = 0;
    let nextStationIndex = 0;
    async function worker() {
      while (nextStationIndex < stationQueue.length) {
        if (cancelled) return;
        const stationVehicles = stationQueue[nextStationIndex++];
        for (const vehicle of stationVehicles) {
          if (cancelled) return;
          try {
            removedTotal += await clearVehicleCrew(vehicle);
          } catch {
            failed++;
          }
          done++;
          updateBackgroundTaskProgress(Math.round(done / vehicles.length * 100), `${done}/${vehicles.length} Fahrzeuge bearbeitet (${removedTotal} Personen abgezogen${failed ? `, ${failed} übersprungen/Fehler` : ""}) ...`);
        }
      }
    }
    const workerCount = Math.min(VEHICLE_CREW_CHECK_CONCURRENCY, stationQueue.length);
    await Promise.all(Array.from({
      length: workerCount
    }, () => worker()));
    const summary = `${removedTotal} Personen von ${done}/${vehicles.length} Fahrzeugen abgezogen${failed ? ` (${failed} übersprungen/Fehler)` : ""}`;
    await updateHistoryEntry(historyId, {
      label: summary,
      status: cancelled ? "cancelled" : "done"
    });
    const renderResult = () => renderUnassignAllResultScreen({
      summary: summary,
      cancelled: cancelled,
      goBack: goBack
    });
    const stillOnOwnProgressScreen = !!document.getElementById("vn-exec-progress-bar");
    if (stillOnOwnProgressScreen) renderResult();
    finishBackgroundTask(title, renderResult, stillOnOwnProgressScreen);
  }
  function renderUnassignAllResultScreen({summary: summary, cancelled: cancelled, goBack: goBack}) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle("Fahrzeug-Besatzung › Alle Zuweisungen rückgängig machen");
    const body = document.getElementById("vehicle-naming-modal-body");
    const cancelledNote = cancelled ? `<p class="text-warning"><b>Abgebrochen.</b></p>` : "";
    body.innerHTML = `\n      ${cancelledNote}\n      <p>\n        <span class="glyphicon glyphicon-ok-sign text-success" aria-hidden="true"></span>\n        <b>${escapeHtml(summary)}</b>\n      </p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-main-menu" type="button" class="btn btn-primary">Hauptmenü</button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-btn-main-menu").addEventListener("click", renderMainMenu);
  }
  function generateBlueprintId() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({
      length: 8
    }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
  }
  function getVehicleTypesForPseudoId(pseudoId) {
    const pseudo = PSEUDO_BUILDING_TYPES.find(t => t.id === pseudoId);
    if (!pseudo) return [];
    return Object.entries(vehicleTypeCatalog).filter(([, v]) => Array.isArray(v.possibleBuildings) && v.possibleBuildings.includes(pseudo.buildingType)).map(([id, v]) => ({
      id: id,
      name: v.caption
    })).sort((a, b) => a.name.localeCompare(b.name, "de"));
  }
  function computeBlueprintPersonnelRequirements(blueprint) {
    const totals = new Map;
    for (const {vehicleTypeId: vehicleTypeId, quantity: quantity} of blueprint.vehicles) {
      if (!(quantity > 0)) continue;
      const requirement = getBlueprintTrainingRequirement(Number(vehicleTypeId));
      if (!requirement) continue;
      for (const req of requirement.requirements) {
        totals.set(req.slug, (totals.get(req.slug) || 0) + req.min * quantity);
      }
    }
    return totals;
  }
  function computeBlueprintPersonnelRequirementRanges(blueprint) {
    const totals = new Map;
    for (const {vehicleTypeId: vehicleTypeId, quantity: quantity} of blueprint.vehicles) {
      if (!(quantity > 0)) continue;
      const requirement = getBlueprintTrainingRequirement(Number(vehicleTypeId));
      if (!requirement) continue;
      for (const req of requirement.requirements) {
        const existing = totals.get(req.slug) || {
          min: 0,
          max: 0
        };
        existing.min += req.min * quantity;
        existing.max += req.max * quantity;
        totals.set(req.slug, existing);
      }
    }
    return totals;
  }
  function getBlueprintCrewBreakdownForVehicleType(vehicleTypeId) {
    const staff = vehicleTypeCatalog[vehicleTypeId]?.staff;
    if (!staff?.max) return null;
    const requirement = getBlueprintTrainingRequirement(vehicleTypeId);
    if (!requirement) {
      return {
        trainedMin: 0,
        trainedMax: 0,
        untrainedMin: staff.min,
        untrainedMax: staff.max
      };
    }
    const trainedMin = requirement.requirements.reduce((sum, req) => sum + req.min, 0);
    const trainedMax = requirement.requirements.reduce((sum, req) => sum + req.max, 0);
    return {
      trainedMin: trainedMin,
      trainedMax: trainedMax,
      untrainedMin: Math.max(0, staff.min - trainedMin),
      untrainedMax: Math.max(0, staff.max - trainedMax)
    };
  }
  function computeBlueprintPersonnelSummary(blueprint) {
    let trainedMin = 0;
    let trainedMax = 0;
    let untrainedMin = 0;
    let untrainedMax = 0;
    for (const {vehicleTypeId: vehicleTypeId, quantity: quantity} of blueprint.vehicles) {
      if (!(quantity > 0)) continue;
      const breakdown = getBlueprintCrewBreakdownForVehicleType(Number(vehicleTypeId));
      if (!breakdown) continue;
      trainedMin += breakdown.trainedMin * quantity;
      trainedMax += breakdown.trainedMax * quantity;
      untrainedMin += breakdown.untrainedMin * quantity;
      untrainedMax += breakdown.untrainedMax * quantity;
    }
    return {
      trained: {
        min: trainedMin,
        max: trainedMax
      },
      untrained: {
        min: untrainedMin,
        max: untrainedMax
      },
      total: {
        min: trainedMin + untrainedMin,
        max: trainedMax + untrainedMax
      }
    };
  }
  function typeNameForPseudoId(pseudoId) {
    const pseudo = PSEUDO_BUILDING_TYPES.find(t => t.id === pseudoId);
    if (!pseudo) return "Unbekannt";
    const key = getBuildingKey({
      building_type: pseudo.buildingType,
      small_building: pseudo.smallBuilding
    });
    return BUILDING_TYPE_NAMES[key] || `Typ ${key}`;
  }
  async function renderStationBlueprintsListScreen(goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Wachen-Bauplaner");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Baupläne ...</p>`;
    const blueprints = await getStationBlueprints();
    let allStations = [];
    try {
      allStations = await loadBuildingsForCheck();
    } catch {}
    const stationCounts = new Map;
    for (const s of allStations) {
      const label = s.typeName || "Unbekannter Gebäudetyp";
      stationCounts.set(label, (stationCounts.get(label) || 0) + 1);
    }
    const stationCountsSummary = [ ...stationCounts.entries() ].sort((a, b) => b[1] - a[1]).map(([label, count]) => `${count}x ${escapeHtml(label)}`).join(", ");
    function renderRows() {
      const entries = Object.values(blueprints);
      if (!entries.length) {
        return `<tr><td colspan="5" class="text-muted">Noch keine Baupläne vorhanden.</td></tr>`;
      }
      return entries.sort((a, b) => a.name.localeCompare(b.name, "de")).map(bp => {
        const vehicleCount = bp.vehicles.reduce((sum, v) => sum + v.quantity, 0);
        return `\n            <tr>\n              <td>${escapeHtml(bp.name)}</td>\n              <td>${escapeHtml(typeNameForPseudoId(bp.pseudoId))}</td>\n              <td>${bp.extensions.length}</td>\n              <td>${vehicleCount} (${bp.vehicles.length} Typen)</td>\n              <td>\n                <button type="button" class="btn btn-primary btn-xs vn-bp-apply" data-id="${escapeHtml(bp.id)}" title="Wachen-Check (Wachen-Auswahl)">\n                  <span class="glyphicon glyphicon-tasks" aria-hidden="true"></span>\n                </button>\n                <button type="button" class="btn btn-default btn-xs vn-bp-edit" data-id="${escapeHtml(bp.id)}" title="Bearbeiten">\n                  <span class="glyphicon glyphicon-pencil" aria-hidden="true"></span>\n                </button>\n                <button type="button" class="btn btn-danger btn-xs vn-bp-delete" data-id="${escapeHtml(bp.id)}" title="Löschen">\n                  <span class="glyphicon glyphicon-trash" aria-hidden="true"></span>\n                </button>\n                <button type="button" class="btn btn-default btn-xs vn-bp-export" data-id="${escapeHtml(bp.id)}" title="Exportieren">\n                  <span class="glyphicon glyphicon-export" aria-hidden="true"></span>\n                </button>\n              </td>\n            </tr>\n          `;
      }).join("");
    }
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Legt fest, welche Ausbauten und Fahrzeuge (mit Anzahl) eine Wache eines bestimmten Typs\n        haben soll - das benötigte Personal wird automatisch aus den Fahrzeugen berechnet.\n        Anwendbar über den Haken-Button je Bauplan, um zu sehen, welche passenden Wachen wovon\n        noch wie viel brauchen.\n      </p>\n      <p class="text-muted" style="font-size:12px;">\n        <b>Deine Wachen:</b> ${stationCountsSummary || "konnte nicht geladen werden"}\n      </p>\n      <div style="margin-bottom:12px;">\n        <button type="button" id="vn-bp-new" class="btn btn-primary btn-sm">\n          <span class="glyphicon glyphicon-plus" aria-hidden="true"></span> Neuer Bauplan\n        </button>\n        <button type="button" id="vn-bp-import" class="btn btn-default btn-sm">\n          <span class="glyphicon glyphicon-import" aria-hidden="true"></span> Bauplan importieren\n        </button>\n        <input type="file" id="vn-bp-import-file" accept="application/json" style="display:none;">\n      </div>\n      <div style="max-height:50vh; overflow:auto;">\n        <table class="table table-condensed table-striped" style="font-size:12px;">\n          <thead>\n            <tr><th>Name</th><th>Gebäudetyp</th><th>Ausbauten</th><th>Fahrzeuge</th><th>Aktionen</th></tr>\n          </thead>\n          <tbody id="vn-bp-results-body">${renderRows()}</tbody>\n        </table>\n      </div>\n      <div id="vn-bp-list-status" style="margin-top:6px;"></div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
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
        renderStationCheckStationSelection(blueprints[btn.dataset.id], () => renderStationBlueprintsListScreen(goBack));
      });
    });
    body.querySelectorAll(".vn-bp-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        renderStationBlueprintEditScreen(btn.dataset.id, () => renderStationBlueprintsListScreen(goBack));
      });
    });
    body.querySelectorAll(".vn-bp-delete").forEach(btn => {
      btn.addEventListener("click", () => {
        const blueprint = blueprints[btn.dataset.id];
        if (!blueprint) return;
        renderBlueprintDeleteConfirmScreen(blueprint, () => renderStationBlueprintsListScreen(goBack));
      });
    });
    body.querySelectorAll(".vn-bp-export").forEach(btn => {
      btn.addEventListener("click", () => {
        const blueprint = blueprints[btn.dataset.id];
        if (!blueprint) return;
        const blob = new Blob([ JSON.stringify(blueprint, null, 2) ], {
          type: "application/json"
        });
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
  function renderSimpleConfirmScreen({title: title, message: message, confirmLabel: confirmLabel, confirmClass: confirmClass = "btn-danger", confirmIcon: confirmIcon = "glyphicon-ok", onConfirm: onConfirm, goBack: goBack}) {
    setModalWidth(MODAL_WIDTH_COMPACT);
    setScreenTitle(title);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `\n      <p class="text-danger"><b>${message}</b></p>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen\n        </button>\n        <button id="vn-simple-confirm" type="button" class="btn ${confirmClass}">\n          <span class="glyphicon ${confirmIcon}" aria-hidden="true"></span> ${escapeHtml(confirmLabel)}\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    document.getElementById("vn-simple-confirm").addEventListener("click", async () => {
      await onConfirm();
    });
  }
  function renderBlueprintDeleteConfirmScreen(blueprint, goBack) {
    renderSimpleConfirmScreen({
      title: "Wachen-Bauplaner › Löschen",
      message: `Bauplan "${escapeHtml(blueprint.name)}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`,
      confirmLabel: "Löschen",
      confirmIcon: "glyphicon-trash",
      goBack: goBack,
      onConfirm: async () => {
        const current = await getStationBlueprints();
        delete current[blueprint.id];
        await saveStationBlueprints(current);
        goBack();
      }
    });
  }
  async function renderStationBlueprintEditScreen(blueprintId, goBack) {
    setModalWidth(MODAL_WIDTH_WIDE);
    setScreenTitle("Wachen-Bauplaner › Bearbeiten");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade ...</p>`;
    const blueprints = await getStationBlueprints();
    const existing = blueprintId ? blueprints[blueprintId] : null;
    const id = existing?.id || generateBlueprintId();
    const qualifications = await getPersonnelQualifications();
    const pseudoOptions = PSEUDO_BUILDING_TYPES.map(t => ({
      id: t.id,
      name: typeNameForPseudoId(t.id)
    })).sort((a, b) => a.name.localeCompare(b.name, "de"));
    function extensionCatalogForPseudoId(pseudoId) {
      if (!pseudoId) return [];
      const pseudo = PSEUDO_BUILDING_TYPES.find(t => t.id === pseudoId);
      const buildingKey = getBuildingKey({
        building_type: pseudo.buildingType,
        small_building: pseudo.smallBuilding
      });
      return EXTENSION_CATALOG[buildingKey] || [];
    }
    function sortSelectOptions(select) {
      const opts = [ ...select.options ].sort((a, b) => a.textContent.localeCompare(b.textContent, "de"));
      opts.forEach(o => select.appendChild(o));
    }
    function extensionListsHtml(pseudoId) {
      const catalog = [ ...extensionCatalogForPseudoId(pseudoId) ].sort((a, b) => a.name.localeCompare(b.name, "de"));
      if (!pseudoId) return {
        available: "",
        assigned: ""
      };
      if (!catalog.length) return {
        available: "",
        assigned: ""
      };
      const selectedIds = new Set(existing?.pseudoId === pseudoId ? existing.extensions : []);
      const option = ext => `<option value="${ext.id}">${escapeHtml(ext.name)}</option>`;
      return {
        available: catalog.filter(e => !selectedIds.has(e.id)).map(option).join(""),
        assigned: catalog.filter(e => selectedIds.has(e.id)).map(option).join("")
      };
    }
    function bindExtensionLists() {
      const availableSelect = document.getElementById("vn-bp-ext-available");
      const assignedSelect = document.getElementById("vn-bp-ext-assigned");
      const moveSelected = (from, to) => {
        [ ...from.selectedOptions ].forEach(opt => to.appendChild(opt));
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
    function vehicleGridHtml(types, quantities) {
      return `\n        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(230px,1fr)); gap:6px;">\n          ${types.map(t => `\n                <label class="vn-vehicle-qty-box" style="display:flex; align-items:center; gap:6px; font-weight:normal; margin:0;">\n                  <span style="flex:1;">${escapeHtml(t.name)}</span>\n                  <input type="number" min="0" class="form-control input-sm vn-bp-vehicle-qty" data-vehicle-type-id="${t.id}"\n                         value="${quantities.get(t.id) || 0}" style="width:70px;">\n                </label>\n              `).join("")}\n        </div>\n      `;
    }
    function vehicleInputsHtml(pseudoId) {
      if (!pseudoId) return `<p class="text-muted">Bitte zuerst Gebäudetyp wählen ...</p>`;
      const types = getVehicleTypesForPseudoId(pseudoId);
      if (!types.length) return `<p class="text-muted">Keine Fahrzeuge für diesen Gebäudetyp bekannt.</p>`;
      const quantities = new Map((existing?.pseudoId === pseudoId ? existing.vehicles : []).map(v => [ String(v.vehicleTypeId), v.quantity ]));
      const pseudo = PSEUDO_BUILDING_TYPES.find(t => t.id === pseudoId);
      if (pseudo?.buildingType !== 0) return vehicleGridHtml(types, quantities);
      const byCategory = new Map;
      for (const t of types) {
        const category = categorizeFireVehicleName(t.name);
        if (!byCategory.has(category)) byCategory.set(category, []);
        byCategory.get(category).push(t);
      }
      return FIRE_VEHICLE_CATEGORY_ORDER.filter(cat => byCategory.has(cat)).map(category => {
        const categoryTypes = byCategory.get(category);
        const selectedCount = categoryTypes.filter(t => (quantities.get(t.id) || 0) > 0).length;
        return `\n            <details style="margin-bottom:6px;">\n              <summary class="vn-category-heading" style="font-size:11px; font-weight:bold; text-transform:uppercase;">\n                <span class="glyphicon glyphicon-chevron-right" aria-hidden="true"></span>\n                ${escapeHtml(category)}${selectedCount ? ` <span class="badge">${selectedCount}</span>` : ""}\n              </summary>\n              <div style="padding:8px 4px 0;">${vehicleGridHtml(categoryTypes, quantities)}</div>\n            </details>\n          `;
      }).join("");
    }
    function bindVehicleQuantityInputs() {
      body.querySelectorAll(".vn-bp-vehicle-qty").forEach(input => {
        input.addEventListener("change", updatePersonnelRequirements);
      });
    }
    function updatePersonnelRequirements() {
      const vehicles = [ ...body.querySelectorAll(".vn-bp-vehicle-qty") ].map(input => ({
        vehicleTypeId: input.dataset.vehicleTypeId,
        quantity: parseInt(input.value, 10) || 0
      }));
      const ranges = computeBlueprintPersonnelRequirementRanges({
        vehicles: vehicles
      });
      const rows = [ ...ranges.entries() ].sort((a, b) => qualificationNameFor(qualifications, realSlugFor(a[0])).localeCompare(qualificationNameFor(qualifications, realSlugFor(b[0])), "de")).map(([slug, {min: min, max: max}]) => `<tr><td>${min}</td><td>${max}</td><td>${escapeHtml(qualificationNameFor(qualifications, realSlugFor(slug)))}</td></tr>`).join("");
      const summary = computeBlueprintPersonnelSummary({
        vehicles: vehicles
      });
      const summaryRows = `\n        <tr class="text-muted">\n          <td style="border-top:2px solid #888;">${summary.trained.min}</td>\n          <td style="border-top:2px solid #888;">${summary.trained.max}</td>\n          <td style="border-top:2px solid #888;">Geschult (gesamt)</td>\n        </tr>\n        <tr class="text-muted">\n          <td>${summary.untrained.min}</td><td>${summary.untrained.max}</td><td>Ungeschult</td>\n        </tr>\n        <tr><td><b>${summary.total.min}</b></td><td><b>${summary.total.max}</b></td><td><b>Insgesamt benötigt</b></td></tr>\n      `;
      document.getElementById("vn-bp-personnel-body").innerHTML = (rows || `<tr><td colspan="3" class="text-muted">Keine besondere Ausbildung erforderlich.</td></tr>`) + summaryRows;
    }
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Das benötigte Personal wird automatisch aus den ausgewählten Fahrzeugen berechnet\n        (gleiche Logik wie bei der Fahrzeug-Besatzung).\n      </p>\n      <div class="form-horizontal">\n        <div class="form-group">\n          <label class="col-sm-2 control-label">Name</label>\n          <div class="col-sm-10">\n            <input type="text" id="vn-bp-name" class="form-control" value="${escapeHtml(existing?.name || "")}" placeholder="leer = Gebäudetyp-Name (z.B. Rettungswache)">\n          </div>\n        </div>\n        <div class="form-group">\n          <label class="col-sm-2 control-label">Gebäudetyp</label>\n          <div class="col-sm-10">\n            <select id="vn-bp-pseudo-id" class="form-control">\n              <option value="">Bitte wählen ...</option>\n              ${pseudoOptions.map(o => `<option value="${o.id}" ${existing?.pseudoId === o.id ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}\n            </select>\n          </div>\n        </div>\n        <div class="form-group">\n          <label class="col-sm-2 control-label">Ausbauten</label>\n          <div class="col-sm-10" id="vn-bp-extensions">\n            ${(() => {
      const lists = extensionListsHtml(existing?.pseudoId || "");
      return `\n                <div style="display:flex; gap:10px; align-items:flex-start;">\n                  <div style="flex:1;">\n                    <label class="text-muted" style="font-size:11px; font-weight:normal;">Verfügbar (Doppelklick zum Hinzufügen)</label>\n                    <select id="vn-bp-ext-available" multiple size="8" class="form-control">${lists.available}</select>\n                  </div>\n                  <div style="display:flex; flex-direction:column; gap:6px; margin-top:20px;">\n                    <button type="button" id="vn-bp-ext-add" class="btn btn-default btn-sm" title="Hinzufügen">\n                      <span class="glyphicon glyphicon-chevron-right" aria-hidden="true"></span>\n                    </button>\n                    <button type="button" id="vn-bp-ext-remove" class="btn btn-default btn-sm" title="Entfernen">\n                      <span class="glyphicon glyphicon-chevron-left" aria-hidden="true"></span>\n                    </button>\n                  </div>\n                  <div style="flex:1;">\n                    <label class="text-muted" style="font-size:11px; font-weight:normal;">Zugewiesen (Doppelklick zum Entfernen)</label>\n                    <select id="vn-bp-ext-assigned" multiple size="8" class="form-control">${lists.assigned}</select>\n                  </div>\n                </div>\n              `;
    })()}\n          </div>\n        </div>\n        <div class="form-group">\n          <label class="col-sm-2 control-label">Fahrzeuge</label>\n          <div class="col-sm-10" id="vn-bp-vehicles">${vehicleInputsHtml(existing?.pseudoId || "")}</div>\n        </div>\n        <div class="form-group">\n          <label class="col-sm-2 control-label">Benötigtes Personal</label>\n          <div class="col-sm-10">\n            <table class="table table-condensed" style="font-size:12px; max-width:400px;">\n              <thead><tr><th>Min.</th><th>Max.</th><th>Ausbildung</th></tr></thead>\n              <tbody id="vn-bp-personnel-body"></tbody>\n            </table>\n          </div>\n        </div>\n      </div>\n      <div id="vn-bp-edit-status" style="margin-top:6px;"></div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Abbrechen\n        </button>\n        <button id="vn-bp-save" type="button" class="btn btn-success">\n          <span class="glyphicon glyphicon-floppy-disk" aria-hidden="true"></span> Speichern\n        </button>\n      </div>\n    `;
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
    document.getElementById("vn-bp-save").addEventListener("click", async () => {
      const statusEl = document.getElementById("vn-bp-edit-status");
      const pseudoId = document.getElementById("vn-bp-pseudo-id").value;
      if (!pseudoId) {
        statusEl.innerHTML = `<span class="text-danger">Bitte Gebäudetyp angeben.</span>`;
        return;
      }
      const typedName = document.getElementById("vn-bp-name").value.trim();
      const name = typedName || typeNameForPseudoId(pseudoId);
      const extensions = [ ...document.getElementById("vn-bp-ext-assigned").options ].map(opt => Number(opt.value));
      const vehicles = [ ...body.querySelectorAll(".vn-bp-vehicle-qty") ].map(input => ({
        vehicleTypeId: Number(input.dataset.vehicleTypeId),
        quantity: parseInt(input.value, 10) || 0
      })).filter(v => v.quantity > 0);
      const current = await getStationBlueprints();
      const duplicate = Object.values(current).find(bp => bp.id !== id && bp.name.trim().toLowerCase() === name.toLowerCase());
      if (duplicate) {
        const confirmed = confirm(`Ein Bauplan mit dem Namen "${name}" existiert bereits. Diesen überschreiben (ersetzen)?`);
        if (!confirmed) {
          statusEl.innerHTML = `<span class="text-danger">Abgebrochen - bitte einen anderen Namen wählen.</span>`;
          return;
        }
        delete current[duplicate.id];
      }
      current[id] = {
        id: id,
        pseudoId: pseudoId,
        name: name,
        extensions: extensions,
        vehicles: vehicles
      };
      await saveStationBlueprints(current);
      goBack();
    });
  }
  async function renderStationCheckBlueprintSelection(goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle("Wachen-Check › Bauplan wählen");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Baupläne ...</p>`;
    const blueprints = await getStationBlueprints();
    const entries = Object.values(blueprints).sort((a, b) => a.name.localeCompare(b.name, "de"));
    if (!entries.length) {
      body.innerHTML = `\n        <p class="text-muted">Noch keine Baupläne vorhanden - lege zuerst einen im Wachen-Bauplaner an.</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n          <button id="vn-station-check-goto-blueprints" type="button" class="btn btn-primary">\n            <span class="glyphicon glyphicon-list-alt" aria-hidden="true"></span> Wachen-Bauplaner öffnen\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      document.getElementById("vn-station-check-goto-blueprints").addEventListener("click", () => {
        renderStationBlueprintsListScreen(() => renderStationCheckBlueprintSelection(goBack));
      });
      return;
    }
    const rows = entries.map(bp => `\n        <button type="button" class="list-group-item vn-menu-item vn-station-check-bp-pick" data-id="${escapeHtml(bp.id)}">\n          <span class="glyphicon glyphicon-tasks" aria-hidden="true"></span>\n          <span><b>${escapeHtml(bp.name)}</b> <span class="text-muted">- ${escapeHtml(typeNameForPseudoId(bp.pseudoId))}</span></span>\n        </button>\n      `).join("");
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Für welchen Bauplan sollen Ausbauten, Fahrzeuge und Personal geprüft werden? Danach\n        folgen noch die Wachen.\n      </p>\n      <div class="list-group" style="max-height:55vh; overflow:auto;">${rows}</div>\n      <div class="vn-sticky-footer">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    body.querySelectorAll(".vn-station-check-bp-pick").forEach(btn => {
      btn.addEventListener("click", () => {
        renderStationCheckStationSelection(blueprints[btn.dataset.id], goBack);
      });
    });
  }
  async function renderStationCheckStationSelection(blueprint, goBack = renderMainMenu) {
    setModalWidth(MODAL_WIDTH_DEFAULT);
    setScreenTitle(`Wachen-Check › ${blueprint.name} › Wachen wählen`);
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade Wachen ...</p>`;
    let allStations, savedSelection;
    try {
      [allStations, savedSelection] = await Promise.all([ loadBuildingsForCheck(), getStationCheckSelection(blueprint.id) ]);
    } catch (e) {
      body.innerHTML = `\n        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }
    const stations = allStations.filter(s => s.pseudoId === blueprint.pseudoId);
    const preselected = new Set(savedSelection || []);
    const byLeitstelle = new Map;
    for (const s of stations) {
      if (!byLeitstelle.has(s.leitstelleId)) {
        byLeitstelle.set(s.leitstelleId, {
          name: s.leitstelleName || "Ohne Leitstelle",
          stations: []
        });
      }
      byLeitstelle.get(s.leitstelleId).stations.push(s);
    }
    const groupBlocks = [ ...byLeitstelle.entries() ].sort((a, b) => a[1].name.localeCompare(b[1].name, "de")).map(([id, info], idx) => {
      const collapseId = `vn-station-check-collapse-${idx}`;
      const initialSelectedCount = info.stations.filter(s => preselected.has(s.id)).length;
      const stationRows = [ ...info.stations ].sort((a, b) => a.name.localeCompare(b.name, "de")).map(s => {
        const checked = preselected.has(s.id);
        return `\n            <div class="checkbox vn-station-check-station-row" data-search="${escapeHtml(s.name.toLowerCase())}" style="margin: 2px 0; break-inside: avoid;">\n              <label>\n                <input type="checkbox" class="vn-station-check-station-check" data-leitstelle-id="${escapeHtml(id)}" value="${s.id}" ${checked ? "checked" : ""}>\n                ${escapeHtml(s.name)}\n              </label>\n            </div>`;
      }).join("");
      return `\n        <div class="panel panel-default vn-station-check-leitstelle-panel" data-leitstelle-id="${escapeHtml(id)}" style="margin-bottom: 8px;">\n          <div class="panel-heading vn-category-heading" data-toggle="collapse" data-target="#${collapseId}">\n            <span class="glyphicon glyphicon-triangle-right" aria-hidden="true"></span>\n            <b>${escapeHtml(info.name)}</b>\n            <span class="text-muted">\n              (${info.stations.length} Wachen,\n              <span class="vn-station-check-leitstelle-count" data-leitstelle-id="${escapeHtml(id)}">${initialSelectedCount}</span>\n              ausgewählt)\n            </span>\n            <label style="font-size:11px; float:right; font-weight:normal; margin:0; cursor:pointer;">\n              <input type="checkbox" class="vn-station-check-leitstelle-master" data-leitstelle-id="${escapeHtml(id)}">\n              alle auswählen\n            </label>\n          </div>\n          <div id="${collapseId}" class="panel-collapse collapse">\n            <div class="panel-body" style="column-count: 2; column-gap: 20px;">\n              ${stationRows}\n            </div>\n          </div>\n        </div>`;
    }).join("");
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Bauplan: <b>${escapeHtml(blueprint.name)}</b>. Wähle die Wachen aus, die geprüft werden\n        sollen (Leitstelle anklicken zum Auf-/Zuklappen).\n      </p>\n      <input type="text" id="vn-station-check-station-search" class="form-control input-sm" style="max-width:280px; margin-bottom:8px;"\n             placeholder="Wache suchen ...">\n      <div style="max-height: 50vh; overflow-y: auto; padding: 4px;">\n        ${groupBlocks || '<p class="text-muted"><em>Keine passenden Wachen gefunden.</em></p>'}\n      </div>\n      <p id="vn-station-check-station-search-empty" class="text-muted" style="display:none;"><em>Keine Wache passt zur Suche.</em></p>\n      <div class="vn-sticky-footer">\n        <button type="button" id="vn-btn-back" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-btn-station-check-go" type="button" class="btn btn-primary">\n          Los <span class="glyphicon glyphicon-arrow-right" aria-hidden="true"></span>\n        </button>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", () => renderStationCheckBlueprintSelection(goBack));
    body.querySelectorAll(".vn-category-heading .glyphicon-triangle-right").forEach(icon => {
      icon.closest(".vn-category-heading").addEventListener("click", () => icon.classList.toggle("vn-rotated"));
    });
    body.querySelectorAll(".vn-station-check-leitstelle-master").forEach(master => {
      master.addEventListener("click", e => e.stopPropagation());
      master.closest("label").addEventListener("click", e => e.stopPropagation());
      const id = master.dataset.leitstelleId;
      const childCheckboxes = [ ...body.querySelectorAll(`.vn-station-check-station-check[data-leitstelle-id="${id}"]`) ];
      function updateSelectedCount() {
        const countEl = body.querySelector(`.vn-station-check-leitstelle-count[data-leitstelle-id="${id}"]`);
        if (countEl) countEl.textContent = childCheckboxes.filter(cb => cb.checked).length;
      }
      master.addEventListener("change", () => {
        childCheckboxes.forEach(cb => {
          if (cb.closest(".vn-station-check-station-row").style.display !== "none") cb.checked = master.checked;
        });
        updateSelectedCount();
      });
      function updateMasterState() {
        const visible = childCheckboxes.filter(cb => cb.closest(".vn-station-check-station-row").style.display !== "none");
        const checkedCount = visible.filter(cb => cb.checked).length;
        master.checked = visible.length > 0 && checkedCount === visible.length;
        master.indeterminate = checkedCount > 0 && checkedCount < visible.length;
        updateSelectedCount();
      }
      childCheckboxes.forEach(cb => cb.addEventListener("change", updateMasterState));
      updateMasterState();
    });
    const searchInput = document.getElementById("vn-station-check-station-search");
    function applyStationFilter() {
      const query = searchInput.value.trim().toLowerCase();
      let anyVisible = false;
      body.querySelectorAll(".vn-station-check-leitstelle-panel").forEach(panel => {
        let groupHasMatch = false;
        panel.querySelectorAll(".vn-station-check-station-row").forEach(row => {
          const matches = !query || row.dataset.search.includes(query);
          row.style.display = matches ? "" : "none";
          if (matches) groupHasMatch = true;
        });
        panel.style.display = groupHasMatch ? "" : "none";
        if (groupHasMatch) anyVisible = true;
        const collapseEl = panel.querySelector(".panel-collapse");
        const icon = panel.querySelector(".vn-category-heading .glyphicon-triangle-right");
        if (query && groupHasMatch) {
          collapseEl?.classList.add("in");
          icon?.classList.add("vn-rotated");
        } else if (!query) {
          collapseEl?.classList.remove("in");
          icon?.classList.remove("vn-rotated");
        }
      });
      const emptyNote = document.getElementById("vn-station-check-station-search-empty");
      if (emptyNote) emptyNote.style.display = query && !anyVisible ? "" : "none";
      body.querySelectorAll(".vn-station-check-leitstelle-master").forEach(master => {
        const id = master.dataset.leitstelleId;
        const visible = [ ...body.querySelectorAll(`.vn-station-check-station-check[data-leitstelle-id="${id}"]`) ].filter(cb => cb.closest(".vn-station-check-station-row").style.display !== "none");
        const checkedCount = visible.filter(cb => cb.checked).length;
        master.checked = visible.length > 0 && checkedCount === visible.length;
        master.indeterminate = checkedCount > 0 && checkedCount < visible.length;
      });
    }
    searchInput.addEventListener("input", applyStationFilter);
    document.getElementById("vn-btn-station-check-go").addEventListener("click", async () => {
      const selectedIds = [ ...body.querySelectorAll(".vn-station-check-station-check:checked") ].map(el => el.value);
      if (!selectedIds.length) {
        alert("Bitte mindestens eine Wache auswählen.");
        return;
      }
      await saveStationCheckSelection(blueprint.id, selectedIds);
      renderStationBlueprintApplyScreen(blueprint.id, () => renderStationCheckStationSelection(blueprint, goBack), new Set(selectedIds));
    });
  }
  async function renderStationBlueprintApplyScreen(blueprintId, goBack, stationIdFilter) {
    setModalWidth(MODAL_WIDTH_WIDE);
    setScreenTitle("Wachen-Check");
    const body = document.getElementById("vehicle-naming-modal-body");
    body.innerHTML = `<p>Lade ...</p>`;
    const blueprints = await getStationBlueprints();
    const blueprint = blueprints[blueprintId];
    if (!blueprint) {
      body.innerHTML = `\n        <p class="text-danger">Bauplan nicht gefunden.</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }
    let allStations, vehicles, scanData, qualifications, scanMeta;
    try {
      [allStations, vehicles, scanData, qualifications, scanMeta] = await Promise.all([ loadBuildingsForCheck(), loadGameData().then(d => d.vehicles), getPersonnelScanData(), getPersonnelQualifications(), getPersonnelScanMeta() ]);
    } catch (e) {
      body.innerHTML = `\n        <p class="text-danger">Fehler beim Laden: ${escapeHtml(e.message)}</p>\n        <div class="vn-sticky-footer">\n          <button id="vn-btn-back" type="button" class="btn btn-default">\n            <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n          </button>\n        </div>\n      `;
      document.getElementById("vn-btn-back").addEventListener("click", goBack);
      return;
    }
    const matchingStations = allStations.filter(s => s.pseudoId === blueprint.pseudoId && stationIdFilter.has(s.id));
    const vehiclesByStationAndType = new Map;
    for (const v of vehicles) {
      const stationId = String(v.building_id ?? v.building);
      const typeId = String(v.vehicle_type ?? v.type);
      if (!vehiclesByStationAndType.has(stationId)) vehiclesByStationAndType.set(stationId, new Map);
      const byType = vehiclesByStationAndType.get(stationId);
      if (!byType.has(typeId)) byType.set(typeId, []);
      byType.get(typeId).push(String(v.id));
    }
    const requiredPersonnel = computeBlueprintPersonnelRequirements(blueprint);
    const requirementsForBadges = {
      [blueprint.pseudoId]: Object.fromEntries(requiredPersonnel)
    };
    function buildStationRow(station) {
      const missingExtensionIds = blueprint.extensions.filter(extId => !station.extensions.some(e => e.type_id === extId));
      const catalog = EXTENSION_CATALOG[station.buildingKey] || [];
      const extensionCell = missingExtensionIds.length ? missingExtensionIds.map(extId => {
        const ext = catalog.find(e => e.id === extId);
        if (!ext) return `<span class="label label-default">Ausbau ${extId}</span>`;
        return `\n                <button type="button" class="btn btn-xs btn-warning vn-bp-build-ext" style="margin:1px;"\n                        data-station-id="${station.id}" data-ext-id="${ext.id}" data-name="${escapeHtml(ext.name)}"\n                        data-cost="${ext.cost}" data-coins="${ext.coins}">\n                  ${escapeHtml(ext.name)}\n                </button>\n              `;
      }).join("") : `<span class="label label-success">alle gebaut</span>`;
      const byType = vehiclesByStationAndType.get(station.id) || new Map;
      let vehicleDeficit = 0;
      let vehicleSurplus = 0;
      const trackedTypeIds = new Set(blueprint.vehicles.map(bv => String(bv.vehicleTypeId)));
      const trackedCell = blueprint.vehicles.map(bv => {
        const ownIds = byType.get(String(bv.vehicleTypeId)) || [];
        const pendingDelta = getPendingVehicleDelta(station.id, bv.vehicleTypeId);
        const have = Math.max(0, ownIds.length + pendingDelta);
        const missing = Math.max(bv.quantity - have, 0);
        const surplus = Math.max(have - bv.quantity, 0);
        vehicleDeficit += missing;
        vehicleSurplus += surplus;
        const name = vehicleTypeCaptions[bv.vehicleTypeId] || `Typ ${bv.vehicleTypeId}`;
        const cssClass = surplus ? "label-danger" : missing ? "label-warning" : "label-success";
        const pendingHint = pendingDelta ? ` <span class="glyphicon glyphicon-time" aria-hidden="true" title="Vorläufig - gleicht sich automatisch mit dem Spiel ab, sobald die Änderung dort sichtbar ist"></span>` : "";
        const label = `<span class="label ${cssClass}" style="margin:1px;">${escapeHtml(name)} ${have}/${bv.quantity}${pendingHint}</span>`;
        if (surplus) {
          const excessVehicleIds = pendingDelta === 0 ? ownIds.slice(-surplus) : [];
          if (excessVehicleIds.length < surplus) return label;
          return `${label}\n              <button type="button" class="btn btn-xs btn-danger vn-bp-sell-vehicle" style="margin:1px;"\n                      data-vehicle-ids="${excessVehicleIds.join(",")}" data-name="${escapeHtml(name)}" data-station-id="${station.id}"\n                      data-vehicle-type-id="${bv.vehicleTypeId}" title="Verkauft alle überzähligen Fahrzeuge dieses Typs auf einmal">\n                <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> ${surplus}x zu viel\n              </button>`;
        }
        if (!missing) return label;
        const catalogEntry = vehicleTypeCatalog[bv.vehicleTypeId];
        if (!catalogEntry) return label;
        return `${label}\n            <button type="button" class="btn btn-xs btn-primary vn-bp-buy-vehicle" style="margin:1px;"\n                    data-station-id="${station.id}" data-vehicle-type-id="${bv.vehicleTypeId}" data-name="${escapeHtml(name)}"\n                    data-missing="${missing}" data-cost="${(catalogEntry.credits || 0) * missing}" data-coins="${(catalogEntry.coins || 0) * missing}">\n              <span class="glyphicon glyphicon-shopping-cart" aria-hidden="true"></span> ${missing}x kaufen\n            </button>`;
      }).join(" ");
      const untrackedCell = [ ...byType.entries() ].filter(([typeId]) => !trackedTypeIds.has(typeId)).map(([typeId, ownIds]) => {
        const pendingDelta = getPendingVehicleDelta(station.id, typeId);
        const have = Math.max(0, ownIds.length + pendingDelta);
        if (have <= 0) return "";
        vehicleSurplus += have;
        const name = vehicleTypeCaptions[typeId] || `Typ ${typeId}`;
        const label = `<span class="label label-danger" style="margin:1px;">${escapeHtml(name)} ${have}/0 (nicht im Bauplan)</span>`;
        const excessVehicleIds = pendingDelta === 0 ? ownIds.slice(-have) : [];
        if (excessVehicleIds.length < have) return label;
        return `${label}\n            <button type="button" class="btn btn-xs btn-danger vn-bp-sell-vehicle" style="margin:1px;"\n                    data-vehicle-ids="${excessVehicleIds.join(",")}" data-name="${escapeHtml(name)}" data-station-id="${station.id}"\n                    data-vehicle-type-id="${typeId}" title="Verkauft alle überzähligen Fahrzeuge dieses Typs auf einmal">\n              <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> ${have}x zu viel\n            </button>`;
      }).filter(Boolean).join(" ");
      const vehicleCell = [ trackedCell, untrackedCell ].filter(Boolean).join(" ");
      const scan = scanData[station.id];
      let personnelDeficit = scan ? 0 : -1;
      if (scan) {
        for (const [slug, required] of requiredPersonnel) {
          const have = scan.counts[realSlugFor(slug)] || 0;
          if (have < required) personnelDeficit += required - have;
        }
      }
      const personnelCell = `${renderPersonnelOverview(station, scanData)}<div style="margin-top:4px;">${renderPersonnelBadges(station, requirementsForBadges, qualifications, scanData)}</div>`;
      const html = `\n        <tr>\n          <td>\n            <a href="/buildings/${station.id}" target="_blank">${escapeHtml(station.name)}</a>\n          </td>\n          <td>${escapeHtml(station.leitstelleName || "-")}</td>\n          <td>${renderLevelCell(station)}</td>\n          <td>${extensionCell}</td>\n          <td>${vehicleCell}</td>\n          <td>${personnelCell}</td>\n        </tr>\n      `;
      return {
        html: html,
        sortValues: {
          station: station.name,
          leitstelle: station.leitstelleName || "",
          level: station.currentLevel,
          extensions: missingExtensionIds.length,
          vehicles: vehicleDeficit + vehicleSurplus,
          personnel: personnelDeficit
        }
      };
    }
    const rows = matchingStations.map(buildStationRow);
    const sortableColumns = [ {
      key: "station",
      label: "Wache"
    }, {
      key: "leitstelle",
      label: "Leitstelle"
    }, {
      key: "level",
      label: "Stufe"
    }, {
      key: "extensions",
      label: "Fehlende Ausbauten"
    }, {
      key: "vehicles",
      label: "Fahrzeuge"
    }, {
      key: "personnel",
      label: "Personal"
    } ];
    let sortState = {
      key: "station",
      dir: "asc"
    };
    function sortedRowsHtml() {
      const {key: key, dir: dir} = sortState;
      const sorted = [ ...rows ].sort((a, b) => {
        const av = a.sortValues[key];
        const bv = b.sortValues[key];
        const cmp = typeof av === "string" ? av.localeCompare(bv, "de") : av - bv;
        return dir === "asc" ? cmp : -cmp;
      });
      return sorted.map(r => r.html).join("") || `<tr><td colspan="6" class="text-muted">Keine passenden Wachen gefunden.</td></tr>`;
    }
    function theadHtml() {
      return `\n        <tr>\n          ${sortableColumns.map(col => {
        const arrow = sortState.key === col.key ? sortState.dir === "asc" ? " ▲" : " ▼" : "";
        return `<th class="vn-bp-sort-header" data-key="${col.key}" style="cursor:pointer; user-select:none;">${escapeHtml(col.label)}${arrow}</th>`;
      }).join("")}\n        </tr>\n      `;
    }
    function bindSortHeaders() {
      body.querySelectorAll(".vn-bp-sort-header").forEach(th => {
        th.addEventListener("click", () => {
          const key = th.dataset.key;
          sortState = {
            key: key,
            dir: sortState.key === key && sortState.dir === "asc" ? "desc" : "asc"
          };
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
            goBack: () => renderStationBlueprintApplyScreen(blueprintId, goBack, stationIdFilter),
            historyType: "extension",
            historyLabel: btn.dataset.name,
            historyStation: stationName,
            historyStationId: btn.dataset.stationId
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
              recordPendingVehicleChange(btn.dataset.stationId, Number(btn.dataset.vehicleTypeId), missing);
              scheduleVehicleReconcile(blueprintId, goBack, stationIdFilter);
            },
            goBack: () => renderStationBlueprintApplyScreen(blueprintId, goBack, stationIdFilter),
            historyType: "vehicle",
            historyLabel: `${missing}x ${btn.dataset.name}`,
            historyStation: stationName,
            historyStationId: btn.dataset.stationId
          });
        });
      });
      body.querySelectorAll(".vn-bp-sell-vehicle").forEach(btn => {
        btn.addEventListener("click", () => {
          const stationName = matchingStations.find(s => s.id === btn.dataset.stationId)?.name;
          renderVehicleBulkSellConfirmScreen({
            vehicleIds: btn.dataset.vehicleIds.split(","),
            vehicleName: btn.dataset.name,
            stationName: stationName,
            goBack: () => renderStationBlueprintApplyScreen(blueprintId, goBack, stationIdFilter),
            onSold: () => {
              recordPendingVehicleChange(btn.dataset.stationId, Number(btn.dataset.vehicleTypeId), -1);
              scheduleVehicleReconcile(blueprintId, goBack, stationIdFilter);
            }
          });
        });
      });
      body.querySelectorAll(".vn-build-level").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const buildingId = btn.dataset.buildingId;
          const level = Number(btn.dataset.level);
          renderBuildConfirmScreen({
            title: `Ausbaustufe ${level}`,
            costCredits: Number(btn.dataset.cost),
            costCoins: Number(btn.dataset.coins),
            onConfirm: currency => buildLevel(buildingId, currency, level),
            goBack: () => renderStationBlueprintApplyScreen(blueprintId, goBack, stationIdFilter),
            historyType: "level",
            historyLabel: `Ausbaustufe ${level}`,
            historyStation: btn.dataset.stationName,
            historyStationId: buildingId
          });
        });
      });
      body.querySelectorAll(".vn-build-level-max").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const buildingId = btn.dataset.buildingId;
          const maxLevel = Number(btn.dataset.level);
          const station = matchingStations.find(s => String(s.id) === String(buildingId));
          const levelsToBuild = station ? station.levelCatalog.slice(station.currentLevel + 1, maxLevel + 1) : [];
          renderBuildLevelsToMaxConfirmScreen({
            stationName: btn.dataset.stationName,
            buildingId: buildingId,
            levelsToBuild: levelsToBuild,
            totalCost: Number(btn.dataset.cost),
            totalCoins: Number(btn.dataset.coins),
            goBack: () => renderStationBlueprintApplyScreen(blueprintId, goBack, stationIdFilter)
          });
        });
      });
    }
    const lastScanLabel = scanMeta.lastScanAt ? `Personal-Stand: ${new Date(scanMeta.lastScanAt).toLocaleString("de-DE")}` : "Personal noch nie gescannt";
    const noMatchHint = matchingStations.length === 0 ? (() => {
      const counts = new Map;
      for (const s of allStations) {
        const label = s.typeName || "Unbekannter Gebäudetyp";
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      const breakdown = [ ...counts.entries() ].sort((a, b) => b[1] - a[1]).map(([label, count]) => `${count}x ${escapeHtml(label)}`).join(", ");
      return `\n              <p class="text-danger" style="font-size:12px;">\n                Keine Wache mit Gebäudetyp "${escapeHtml(typeNameForPseudoId(blueprint.pseudoId))}" gefunden.\n                Deine Wachen laut FuxTools: ${breakdown || "keine gefunden"}.\n              </p>`;
    })() : "";
    body.innerHTML = `\n      <p class="text-muted" style="font-size:12px;">\n        Bauplan "<b>${escapeHtml(blueprint.name)}</b>" auf ${matchingStations.length} Wache(n)\n        angewendet. Fehlende Ausbauten/Fahrzeuge direkt kaufen, überzählige (rot) verkaufen,\n        Personal über Schulungen/Fahrzeug-Besatzung nachrüsten.\n      </p>\n      ${noMatchHint}\n      <div style="max-height:60vh; overflow:auto;">\n        <table class="table table-condensed table-striped" style="font-size:12px;">\n          <thead id="vn-bp-apply-thead">${theadHtml()}</thead>\n          <tbody id="vn-bp-apply-tbody" data-blueprint-id="${escapeHtml(blueprintId)}">${sortedRowsHtml()}</tbody>\n        </table>\n      </div>\n      <div class="vn-sticky-footer" style="display:flex; align-items:center; gap:10px;">\n        <button id="vn-btn-back" type="button" class="btn btn-default">\n          <span class="glyphicon glyphicon-arrow-left" aria-hidden="true"></span> Zurück\n        </button>\n        <button id="vn-bp-apply-refresh" type="button" class="btn btn-default btn-xs" title="Neu laden">\n          <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>\n        </button>\n        <span class="label label-default" style="font-size:12px;">${escapeHtml(lastScanLabel)}</span>\n      </div>\n    `;
    document.getElementById("vn-btn-back").addEventListener("click", goBack);
    bindSortHeaders();
    bindRowActions();
    if (hasFreshPendingVehicleChanges()) scheduleVehicleReconcile(blueprintId, goBack, stationIdFilter);
    document.getElementById("vn-bp-apply-refresh").addEventListener("click", async () => {
      const btn = document.getElementById("vn-bp-apply-refresh");
      btn.disabled = true;
      invalidateGameDataCache();
      body.insertAdjacentHTML("beforeend", `<p id="vn-bp-apply-refresh-status"><em>Wachen, Fahrzeuge und Personal werden neu geladen ...</em></p>`);
      try {
        await scanAllPersonnel((done, of) => {
          const statusEl = document.getElementById("vn-bp-apply-refresh-status");
          if (statusEl) statusEl.innerHTML = `<em>Personal wird neu gescannt ... (${done}/${of})</em>`;
        });
      } catch (e) {
        console.warn("[FuxTools] Personal-Rescan im Wachenbauplan fehlgeschlagen:", e);
      }
      renderStationBlueprintApplyScreen(blueprintId, goBack, stationIdFilter);
    });
  }
  async function main() {
    console.log("%cFuxTools%c by Fuxaro - lizenziert unter CC BY-NC-SA 4.0 (Namensnennung, nicht-kommerziell, Weitergabe unter gleichen Bedingungen). https://creativecommons.org/licenses/by-nc-sa/4.0/", "color:#337ab7; font-weight:bold;", "color:inherit; font-weight:normal;");
    const initSteps = [ "Modal-Grundgerüst", "Fahrzeug-Katalog", "Namens-Speicher" ];
    const results = await Promise.allSettled([ initModal(), initVehicleTypeCaptions(), initNamesStore() ]);
    results.forEach((r, i) => {
      if (r.status === "rejected") reportError(`Initialisierung fehlgeschlagen (${initSteps[i]})`, r.reason);
    });
    addMenuEntry();
    checkForUpdateInBackground();
    cleanupOrphanedStorageKeys().catch(e => console.warn("[FuxTools] Aufraeumen alter Speicher-Eintraege fehlgeschlagen:", e));
  }
  main();
})();
