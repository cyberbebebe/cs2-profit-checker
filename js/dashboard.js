import { DMarketFetcher } from "./fetchers/dmarket.js";
import { CSFloatFetcher } from "./fetchers/csfloat.js";
import { BuffMarketFetcher } from "./fetchers/buffmarket.js";
import { CSMoneyFetcher } from "./fetchers/csmoney.js";
import { YoupinFetcher } from "./fetchers/youpin.js";
import { SkinportFetcher } from "./fetchers/skinport.js";
import { Buff163Fetcher } from "./fetchers/buff163.js";
import { SteamFetcher } from "./fetchers/steam.js";

import { initToggles } from "./modules/ui_toggles.js";
import { initSessionCheck } from "./modules/ui_sessions.js";
import { initFetch } from "./modules/ui_fetch.js";
import { initReports } from "./modules/ui_reports.js";

const state = {
  allSales: [],
  allBuys: [],
  dataFetched: false,
  fetchers: [
    new DMarketFetcher(),
    new CSFloatFetcher(),
    new BuffMarketFetcher(),
    new CSMoneyFetcher(),
    new SkinportFetcher(),
    new Buff163Fetcher(),
    new SteamFetcher(),
    new YoupinFetcher(),
  ],
};

document.addEventListener("DOMContentLoaded", () => {
  // Init Modules
  initToggles(state.fetchers);
  initSessionCheck(state);
  initFetch(state);
  initReports(state);
});
