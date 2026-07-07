import { BaseFetcher, Transaction } from "./base.js";

/**
 * avan.market — session-cookie (connect.sid) API behind DataDome anti-bot.
 *
 * Requests run INSIDE an authenticated avan.market tab (same-origin, MAIN world)
 * so they carry the session cookie + DataDome clearance, like C5Game/Aim.
 *
 * Flow (two-step):
 *   1) GET /v1/api/users/my-profile/trades?type=trade&page=N  -> { items: [...] }
 *   2) GET /v1/api/users/my-profile-trade-items?tradeId=<id>  -> { tradeItems: [...] }
 *
 * Only SALES are imported for now (the "trades" list is completed sales; each
 * item's USD price = amount * courseToUsd). Buys are not exposed yet.
 */
export class AvanMarketFetcher extends BaseFetcher {
  constructor() {
    super("Avan");
  }

  async withTab(fn) {
    const existing = await chrome.tabs.query({ url: "*://avan.market/*" });
    if (existing.length > 0) return await fn(existing[0].id);

    const newTab = await chrome.tabs.create({
      url: "https://avan.market/en/profile/trades",
      active: false,
    });
    const tabId = newTab.id;
    try {
      await this.waitForLoad(tabId);
      await this.sleep(2500);
      return await fn(tabId);
    } finally {
      try {
        await chrome.tabs.remove(tabId);
      } catch (e) {}
    }
  }

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

  async pageFetch(tabId, url) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        args: [url],
        func: async (url) => {
          try {
            const resp = await fetch(url, {
              method: "GET",
              headers: { accept: "application/json" },
              credentials: "include",
            });
            const text = await resp.text();
            let json = null;
            try {
              json = JSON.parse(text);
            } catch (e) {}
            return { ok: resp.ok, status: resp.status, json };
          } catch (e) {
            return { ok: false, status: 0, error: String(e) };
          }
        },
      });
      return results?.[0]?.result || { ok: false, status: 0 };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  }

  async checkSession() {
    try {
      return await this.withTab(async (tabId) => {
        const res = await this.pageFetch(
          tabId,
          "https://avan.market/v1/api/users/my-profile/trades?type=trade&page=1",
        );
        return !!(res.json && Array.isArray(res.json.items));
      });
    } catch (e) {
      console.error("[Avan] Session check error:", e);
      return false;
    }
  }

  async getSales() {
    try {
      return await this.withTab(async (tabId) => {
        const all = [];
        let page = 1;

        while (true) {
          const res = await this.pageFetch(
            tabId,
            `https://avan.market/v1/api/users/my-profile/trades?type=trade&page=${page}`,
          );
          if (!res.ok || !res.json) break;

          const trades = res.json.items || [];
          if (trades.length === 0) break;
          const pageSize = res.json.pageSize || trades.length;

          for (const trade of trades) {
            const tradeId = trade.id;
            if (tradeId === undefined || tradeId === null) continue;

            const txDate = trade.createdAt ? new Date(trade.createdAt) : new Date();

            const itemsRes = await this.pageFetch(
              tabId,
              `https://avan.market/v1/api/users/my-profile-trade-items?tradeId=${tradeId}`,
            );
            const items = itemsRes.json?.tradeItems || [];

            for (const it of items) {
              const name = it.Item?.fullName || it.item?.fullName || it.fullName;
              if (!name) continue;

              // amount is in the trade currency; courseToUsd converts it to USD
              const amount = parseFloat(it.amount || 0);
              const course = parseFloat(it.courseToUsd || 1) || 1;
              const priceUSD = amount * course;

              all.push(
                new Transaction({
                  source: "Avan",
                  type: "SELL",
                  tx_id: String(it.id),
                  asset_id: "",
                  item_name: name,
                  price: parseFloat(priceUSD.toFixed(2)),
                  currency: "USD",
                  created_at: txDate,
                  verified_at: txDate,
                  float_val: 0,
                  pattern: -1,
                  phase: "",
                }),
              );
            }

            await this.sleep(250);
          }

          if (trades.length < pageSize) break;
          page++;
          if (page > 200) break; // safety cap
          await this.sleep(400);
        }

        return all;
      });
    } catch (e) {
      console.error("[Avan] getSales error:", e);
      return [];
    }
  }

  // Buys are not exposed by avan.market yet.
  async getBuys() {
    return [];
  }

  async getBalance() {
    return { amount: 0, currency: "USD" };
  }
}
