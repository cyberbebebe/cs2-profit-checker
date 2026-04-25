import { DMarketFetcher } from "./fetchers/dmarket.js";
import { CSFloatFetcher } from "./fetchers/csfloat.js";
import { BuffMarketFetcher } from "./fetchers/buffmarket.js";
import { CSMoneyFetcher } from "./fetchers/csmoney.js";
import { CSMoneyBotFetcher } from "./fetchers/csmoneybot.js";
import { YoupinFetcher } from "./fetchers/youpin.js";
import { SkinportFetcher } from "./fetchers/skinport.js";
import { Buff163Fetcher } from "./fetchers/buff163.js";
import { SteamFetcher } from "./fetchers/steam.js";
import { SkinSwapFetcher } from "./fetchers/skinswap.js";

import { initToggles } from "./modules/ui_toggles.js";
import { initSessionCheck } from "./modules/ui_sessions.js";
import { initFetch } from "./modules/ui_fetch.js";
import { initReports } from "./modules/ui_reports.js";
import { initTable } from "./modules/ui_table.js";

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
    new SkinSwapFetcher(),
  ],
};

// Get current month as YYYY-MM string
function getCurrentMonth() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

document.addEventListener("DOMContentLoaded", async () => {
  const startInput = document.getElementById("report-start-month");
  const endInput = document.getElementById("report-end-month");

  // Load saved dates from chrome.storage.local, default to current month
  const currentMonth = getCurrentMonth();
  let startVal = currentMonth;
  let endVal = currentMonth;

  window.txOverrides = { buy: {}, sell: {} };

  try {
    const stored = await chrome.storage.local.get(["dateStart", "dateEnd", "txOverrides"]);
    if (stored.dateStart) startVal = stored.dateStart;
    if (stored.dateEnd) endVal = stored.dateEnd;
    if (stored.txOverrides) window.txOverrides = stored.txOverrides;
  } catch (e) {
    console.warn("chrome.storage not available, using defaults:", e);
  }

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
});
