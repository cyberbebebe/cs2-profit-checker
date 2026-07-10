import { DMarketFetcher } from "./fetchers/dmarket.js";
import { CSFloatFetcher } from "./fetchers/csfloat.js";
import { BuffMarketFetcher } from "./fetchers/buffmarket.js";
import { CSMoneyFetcher } from "./fetchers/csmoney.js";
import { CSMoneyBotFetcher } from "./fetchers/csmoneybot.js";
import { YoupinFetcher } from "./fetchers/youpin.js";
import { SkinportFetcher } from "./fetchers/skinport.js";
import { Buff163Fetcher } from "./fetchers/buff163.js";
import { C5GameFetcher } from "./fetchers/c5game.js";
import { SteamFetcher } from "./fetchers/steam.js";
import { SkinSwapFetcher } from "./fetchers/skinswap.js";
import { SkinsFetcher } from "./fetchers/skins.js";
import { SkinPlaceFetcher } from "./fetchers/skinplace.js";
import { AvanMarketFetcher } from "./fetchers/avan.js";
import { AimMarketFetcher } from "./fetchers/aim.js";
import { Transaction } from "./fetchers/base.js";
import { downloadJSON, serializeTransaction } from "./utils.js";

import { initToggles } from "./modules/ui_toggles.js";
import { initSessionCheck } from "./modules/ui_sessions.js";
import { initFetch } from "./modules/ui_fetch.js";
import { initReports } from "./modules/ui_reports.js";
import { initTable, updateColumnVisibility } from "./modules/ui_table.js";

const state = {
  allSales: [],
  allBuys: [],
  dataFetched: false,
  fetchers: [
    new DMarketFetcher(),
    new CSFloatFetcher(),
    new BuffMarketFetcher(),
    new CSMoneyFetcher(),
    new CSMoneyBotFetcher(),
    new SkinportFetcher(),
    new Buff163Fetcher(),
    new SteamFetcher(),
    new YoupinFetcher(),
    new C5GameFetcher(),
    new SkinSwapFetcher(),
    new SkinsFetcher(),
    new SkinPlaceFetcher(),
    new AvanMarketFetcher(),
    new AimMarketFetcher(),
  ],
};

// Get current month as YYYY-MM string
function getCurrentMonth() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

// The table filters by the selected month range. If the restored dataset has
// nothing in the active period (e.g. the default current month vs. historical
// data), widen the view to span all loaded transactions so it's actually shown.
// Returns true if the period was adjusted.
function ensureDataVisible(state, startInput, endInput) {
  const dates = [];
  for (const t of [...state.allSales, ...state.allBuys]) {
    const d = t.created_at;
    if (d && !isNaN(d)) dates.push(d);
  }
  if (dates.length === 0) return false;

  const [sy, sm] = (startInput.value || "").split("-").map(Number);
  const [ey, em] = (endInput.value || "").split("-").map(Number);
  const periodStart = sy ? new Date(sy, sm - 1, 1) : null;
  const periodEnd = ey ? new Date(ey, em, 0, 23, 59, 59) : null;

  const alreadyVisible =
    periodStart && periodEnd
      ? dates.some((d) => d >= periodStart && d <= periodEnd)
      : false;
  if (alreadyVisible) return false;

  let min = dates[0];
  let max = dates[0];
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const ym = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  startInput.value = ym(min);
  endInput.value = ym(max);
  return true;
}

// Reflect a loaded dataset (from the cache or an imported session file) in the
// UI: widen the period if needed, enable the report panel, and render the table.
function reflectDataset(state, startInput, endInput, label = "Loaded saved data") {
  const widened = ensureDataVisible(state, startInput, endInput);

  document.getElementById("panel-reports")?.classList.remove("disabled");
  const fetchBtn = document.getElementById("btn-fetch-all");
  if (fetchBtn) fetchBtn.innerHTML = "<span>🔄 Sync Data Again</span>";
  const pt = document.getElementById("progress-text");
  if (pt) {
    const when = state.savedAt
      ? ` (${new Date(state.savedAt).toLocaleString()})`
      : "";
    pt.textContent =
      `${label}${when} — Sales: ${state.allSales.length}, Buys: ${state.allBuys.length}` +
      (widened ? " · view expanded to show all" : "");
  }
  fetchBtn?.dispatchEvent(new Event("fetchComplete"));
}

document.addEventListener("DOMContentLoaded", async () => {
  const startInput = document.getElementById("report-start-month");
  const endInput = document.getElementById("report-end-month");

  // Load saved dates from chrome.storage.local, default to current month
  const currentMonth = getCurrentMonth();
  let startVal = currentMonth;
  let endVal = currentMonth;

  window.txOverrides = { buy: {}, sell: {}, match: {} };

  try {
    const stored = await chrome.storage.local.get([
      "dateStart",
      "dateEnd",
      "txOverrides",
      "fetchedData",
      "showDaysHeld",
      "showRoiDay",
      "showUnsold",
    ]);
    if (stored.dateStart) startVal = stored.dateStart;
    if (stored.dateEnd) endVal = stored.dateEnd;
    if (stored.txOverrides) window.txOverrides = stored.txOverrides;

    // Restore column checkboxes
    const showDaysHeld = stored.showDaysHeld !== false; // default true
    const showRoiDay = stored.showRoiDay !== false; // default true
    const showUnsold = stored.showUnsold === true; // default false
    const daysHeldChkBx = document.getElementById("show-days-held-checkbox");
    const roiDayChkBx = document.getElementById("show-roi-day-checkbox");
    const unsoldChkBx = document.getElementById("include-buys-checkbox");
    if (daysHeldChkBx) daysHeldChkBx.checked = showDaysHeld;
    if (roiDayChkBx) roiDayChkBx.checked = showRoiDay;
    if (unsoldChkBx) unsoldChkBx.checked = showUnsold;
    updateColumnVisibility();

    // Restore the last fetched dataset (Transactions are rebuilt so their
    // date fields become real Date objects again).
    if (stored.fetchedData) {
      state.allSales = (stored.fetchedData.sales || []).map((o) => new Transaction(o));
      state.allBuys = (stored.fetchedData.buys || []).map((o) => new Transaction(o));
      state.inventory = stored.fetchedData.inventory || [];
      state.savedAt = stored.fetchedData.savedAt || null;
      state.dataFetched = state.allSales.length > 0 || state.allBuys.length > 0;
    }
  } catch (e) {
    console.warn("chrome.storage not available, using defaults:", e);
  }

  // Ensure all override buckets exist (older stored data may predate `match`)
  window.txOverrides.buy = window.txOverrides.buy || {};
  window.txOverrides.sell = window.txOverrides.sell || {};
  window.txOverrides.match = window.txOverrides.match || {};

  startInput.value = startVal;
  endInput.value = endVal;

  // Save dates on change
  startInput.addEventListener("change", () => {
    try { chrome.storage.local.set({ dateStart: startInput.value }); } catch (e) {}
  });
  endInput.addEventListener("change", () => {
    try { chrome.storage.local.set({ dateEnd: endInput.value }); } catch (e) {}
  });

  // Export Dropdown Toggle
  const exportDropdown = document.getElementById("export-dropdown");
  const exportTrigger = document.getElementById("btn-export-trigger");
  if (exportTrigger && exportDropdown) {
    exportTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      exportDropdown.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!exportDropdown.contains(e.target)) {
        exportDropdown.classList.remove("open");
      }
    });
  }

  // Init Modules (after dates are set)
  initToggles(state.fetchers);
  initSessionCheck(state);
  initFetch(state);
  initReports(state);
  initTable(state);

  // SAVE SESSION (JSON) — portable backup that sidesteps chrome.storage's
  // date-serialization quirks. Dates are written as ISO strings.
  const btnSaveSession = document.getElementById("btn-save-session");
  if (btnSaveSession) {
    btnSaveSession.addEventListener("click", () => {
      if (!state.dataFetched) {
        alert("No data to save yet — Sync Market Data first.");
        return;
      }
      const session = {
        app: "CS2ProfitChecker",
        version: 1,
        savedAt: state.savedAt || Date.now(),
        sales: state.allSales.map(serializeTransaction),
        buys: state.allBuys.map(serializeTransaction),
        inventory: state.inventory || [],
        txOverrides: window.txOverrides || {},
      };
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadJSON(session, `cs2profit_session_${stamp}.json`);
      exportDropdown?.classList.remove("open");
    });
  }

  // LOAD SESSION (JSON) — reconstruct Transactions (which reparses the ISO
  // dates into real Date objects) and render.
  const btnLoadSession = document.getElementById("btn-load-session");
  const inputLoadSession = document.getElementById("input-load-session");
  if (btnLoadSession && inputLoadSession) {
    btnLoadSession.addEventListener("click", () => inputLoadSession.click());
    inputLoadSession.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const sales = Array.isArray(data.sales) ? data.sales : [];
        const buys = Array.isArray(data.buys) ? data.buys : [];
        if (!sales.length && !buys.length) {
          alert("This file has no sales or buys — is it a session export?");
          return;
        }

        state.allSales = sales.map((o) => new Transaction(o));
        state.allBuys = buys.map((o) => new Transaction(o));
        state.inventory = Array.isArray(data.inventory) ? data.inventory : [];
        state.savedAt = data.savedAt || Date.now();
        state.dataFetched =
          state.allSales.length > 0 || state.allBuys.length > 0;

        if (data.txOverrides) {
          window.txOverrides = data.txOverrides;
          window.txOverrides.buy = window.txOverrides.buy || {};
          window.txOverrides.sell = window.txOverrides.sell || {};
          window.txOverrides.match = window.txOverrides.match || {};
        }

        // Cache the imported session so it survives reopening the dashboard.
        try {
          await chrome.storage.local.set({
            fetchedData: {
              sales: state.allSales.map(serializeTransaction),
              buys: state.allBuys.map(serializeTransaction),
              inventory: state.inventory,
              savedAt: state.savedAt,
            },
            txOverrides: window.txOverrides,
          });
        } catch (err) {
          console.warn("[Session] Failed to cache imported data:", err);
        }

        exportDropdown?.classList.remove("open");
        reflectDataset(state, startInput, endInput, "Loaded session file");
      } catch (err) {
        console.error("[Session] Load failed:", err);
        alert("Could not read this session file: " + err.message);
      } finally {
        e.target.value = ""; // let the same file be re-selected later
      }
    });
  }

  // If we restored a cached dataset, reflect it in the UI and render the table.
  if (state.dataFetched) {
    reflectDataset(state, startInput, endInput);
  }
});
