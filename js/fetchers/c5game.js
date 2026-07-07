import { BaseFetcher, Transaction } from "./base.js";

/**
 * C5Game is behind Cloudflare and its API requires signed headers (x-sign,
 * x-start-req-time, x-device-id, ...) that are produced by the site's own
 * front-end JavaScript. A fetch made from the extension page has an
 * `Origin: chrome-extension://…` / `Sec-Fetch-Site: cross-site` profile, which
 * Cloudflare rejects at the edge with a 403 — before auth is ever evaluated.
 *
 * So instead of calling the API from the extension, we execute the fetch INSIDE
 * an authenticated www.c5game.com tab (chrome.scripting.executeScript). That
 * request is same-origin (correct Referer / Sec-Fetch-Site, sends cf_clearance
 * and all cookies), and by running in the page's MAIN world it reuses the site's
 * own (patched) fetch, inheriting the request signing when present.
 */
export class C5GameFetcher extends BaseFetcher {
  constructor() {
    super("C5Game");
  }

  // Run `fn(tabId)` with a usable www.c5game.com tab.
  // Prefers an existing tab (left untouched); otherwise opens a temporary
  // background tab. Concurrent callers (e.g. getSales + getBuys during a Sync)
  // share a single temporary tab, which is closed once the last one finishes.
  async withTab(fn) {
    // Prefer an existing tab, but only if it is actually authenticated for our
    // same-origin API calls. A logged-in-looking tab can still be stale (an
    // expired in-page access token), which the API answers with errorCode 101
    // "Not login". In that case fall through to a freshly opened tab, which
    // re-establishes the session on load.
    const existing = await chrome.tabs.query({ url: "*://www.c5game.com/*" });
    for (const tab of existing) {
      if (await this._isAuthed(tab.id)) {
        return await fn(tab.id);
      }
    }

    if (!this._openPromise) this._openPromise = this._openTempTab();
    this._refs = (this._refs || 0) + 1;

    try {
      const tabId = await this._openPromise;
      return await fn(tabId);
    } finally {
      this._refs--;
      if (this._refs === 0) {
        const pending = this._openPromise;
        this._openPromise = null;
        try {
          await chrome.tabs.remove(await pending);
        } catch (e) {
          /* tab already gone */
        }
      }
    }
  }

  // Open a background tab and wait until it's ready to serve API calls.
  async _openTempTab() {
    const newTab = await chrome.tabs.create({
      url: "https://www.c5game.com/en/user/user/",
      active: false,
    });
    await this.waitForLoad(newTab.id);
    await this.sleep(7500); // let the SPA boot (auth + request layer)
    return newTab.id;
  }

  // Resolve once the tab finishes loading (hard-capped so we never hang).
  waitForLoad(tabId) {
    return new Promise((resolve) => {
      const listener = (id, info) => {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 12000);
    });
  }

  // Quick auth probe for a candidate tab — the same call the session check uses.
  // Returns true only if the API accepts the tab's session (errorCode 0).
  async _isAuthed(tabId) {
    try {
      const res = await this.pageFetch(
        tabId,
        "https://www.c5game.com/api/v1/account/v1/my/account",
        "GET",
      );
      return !!(res.json && res.json.errorCode === 0);
    } catch (e) {
      return false;
    }
  }

  // Perform a same-origin API GET from within the page (MAIN world).
  // Returns { ok, status, json }.
  async pageFetch(tabId, url, method = "GET") {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        args: [url, method],
        func: async (url, method) => {
          // Auth token: the API wants it as x-access-token; fall back to cookie.
          let token =
            localStorage.getItem("token") ||
            localStorage.getItem("access_token") ||
            "";
          if (!token) {
            const m = document.cookie.match(
              /(?:^|;\s*)NC5_accessToken=([^;]+)/,
            );
            if (m) token = decodeURIComponent(m[1]);
          }

          const headers = { Accept: "application/json, text/plain, */*" };
          if (token) headers["x-access-token"] = token;

          try {
            const resp = await fetch(url, {
              method,
              headers,
              credentials: "include",
            });
            const text = await resp.text();
            let json = null;
            try {
              json = JSON.parse(text);
            } catch (e) {
              /* non-JSON (e.g. Cloudflare HTML challenge) */
            }
            return { ok: resp.ok, status: resp.status, json };
          } catch (e) {
            return { ok: false, status: 0, error: String(e) };
          }
        },
      });
      return results?.[0]?.result || { ok: false, status: 0, error: "no result" };
    } catch (e) {
      // executeScript itself failed (tab closed, missing permission, etc.)
      return { ok: false, status: 0, error: String(e) };
    }
  }

  // 1. Session check
  async checkSession() {
    try {
      return await this.withTab(async (tabId) => {
        const res = await this.pageFetch(
          tabId,
          "https://www.c5game.com/api/v1/account/v1/my/account",
          "GET",
        );
        const ok = !!(res.json && res.json.errorCode === 0);
        if (!ok) {
          if (res.json) {
            // Reached the API but not authenticated / rejected (e.g. sign error)
            console.warn(
              `[C5Game] Session check rejected (errorCode=${res.json.errorCode}, msg=${res.json.errorMsg || ""}).`,
            );
          } else {
            // No JSON body -> Cloudflare block / challenge page (typically HTTP ${res.status})
            console.warn(
              `[C5Game] Session check blocked (HTTP ${res.status}, non-JSON). Open www.c5game.com, pass any Cloudflare check, make sure you're logged in, then retry.`,
            );
          }
        }
        return ok;
      });
    } catch (e) {
      console.error("[C5Game] Session check error:", e);
      return false;
    }
  }

  // 2. Wallet balance
  async getBalance() {
    try {
      return await this.withTab(async (tabId) => {
        const res = await this.pageFetch(
          tabId,
          "https://www.c5game.com/api/v1/balance/user/account/v2/money",
          "GET",
        );
        const data = res.json;
        if (!data || data.success !== true) return { amount: 0, currency: "CNY" };

        const cny = parseFloat(data.data.moneyAmount || 0);
        const frozen = parseFloat(data.data.tradeSettleAmount || 0);
        return { amount: cny + frozen, currency: "CNY" };
      });
    } catch (e) {
      console.error("[C5Game] Balance error:", e);
      return { amount: 0, currency: "CNY" };
    }
  }

  async getSales() {
    return this.getHistory("sell");
  }

  async getBuys() {
    return this.getHistory("buy");
  }

  // 3. Transaction history (paginated, all pages share one tab)
  async getHistory(mode) {
    const baseUrl =
      mode === "sell"
        ? "https://www.c5game.com/api/v1/search/v3/merchant/orders/list"
        : "https://www.c5game.com/api/v1/search/v2/purchase/orders/list";

    try {
      return await this.withTab(async (tabId) => {
        const allTxs = [];
        let page = 1;
        const limit = 70;

        while (true) {
          const url = `${baseUrl}?page=${page}&limit=${limit}`;
          const res = await this.pageFetch(tabId, url, "GET");

          if (!res.ok) {
            console.error(`[C5Game] HTTP ${res.status} on ${mode} page ${page}`);
            break;
          }

          const data = res.json;
          if (!data || data.errorCode !== 0 || !data.data) {
            console.error(
              `[C5Game] API Error (${mode}): ${data?.errorMsg || "Unknown"}`,
            );
            break;
          }

          const items = data.data.list || [];
          if (items.length === 0) break;

          for (const order of items) {
            // Skip failed orders entirely
            if (order.statusName === "FAILED") continue;

            const txDate = new Date((order.orderCreateTime || 0) * 1000);
            const assetList = order.orderAssetList || [];

            for (const item of assetList) {
              // Status 11 indicates a specific failed asset in an otherwise active batch
              if (item.orderAssetStatus === 11) continue;

              const assetInfo = item.assetInfo || {};

              // Clean and parse item variables
              let wear = parseFloat(assetInfo.wear);
              if (isNaN(wear) || wear < 0) wear = 0;

              let seed = parseInt(assetInfo.paintSeed);
              if (isNaN(seed) || seed < 0) seed = -1;

              // Pure transaction cost/income, ignoring any fee calculations
              const price = parseFloat(item.orderAssetPrice || 0);

              allTxs.push(
                new Transaction({
                  source: "C5Game",
                  type: mode === "sell" ? "SELL" : "BUY",
                  tx_id: String(order.orderId),
                  asset_id: String(assetInfo.assetId || item.itemId || ""),
                  item_name: item.marketHashName || item.name,
                  price: parseFloat(price.toFixed(2)),
                  currency: "CNY",
                  created_at: txDate,
                  verified_at: txDate,
                  float_val: wear,
                  pattern: seed,
                  phase: assetInfo.levelName || "", // Maps "P1", "P3", etc.
                }),
              );
            }
          }

          if (page >= data.data.pages || items.length < limit) break;

          page++;
          await this.sleep(500);
        }

        return allTxs;
      });
    } catch (e) {
      console.error(`[C5Game] History error (${mode}):`, e);
      return [];
    }
  }
}
