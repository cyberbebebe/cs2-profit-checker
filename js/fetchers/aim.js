import { BaseFetcher, Transaction } from "./base.js";

/**
 * aim.market — Hasura GraphQL API behind a Bearer token + DataDome anti-bot.
 *
 * Like C5Game, requests are executed INSIDE an authenticated aim.market tab
 * (chrome.scripting.executeScript, MAIN world) so they are same-origin and pass
 * DataDome. The Bearer token + userId are read from the `__user-store` cookie.
 *
 * Amounts are handled in UAH and converted to USD via the site's own
 * `ApiActualCurrencyRate` query (USD -> UAH), per the marketplace's balance
 * currency.
 */

// aim.market exposes two GraphQL endpoints with different schemas:
//  - /v1/graphql      → Hasura data API (offer_steam_item queries)
//  - /v1/api/graphql  → app API gateway (actual_currency_rate)
const AIM_HASURA = "https://aim.market/v1/graphql";
const AIM_API = "https://aim.market/v1/api/graphql";

const OFFER_ITEMS_QUERY = `query OfferSteamItems($where: offer_steam_item_bool_exp, $order_by: [offer_steam_item_order_by!], $limit: Int, $offset: Int) {
  offer_steam_item(where: $where, order_by: $order_by, limit: $limit, offset: $offset) {
    id
    marketHashName
    name
    price
    currency
    price_USD
    phase
    createdAt
    offerSteamItemType
    offer { state protectedUntil }
  }
}`;

const RATE_QUERY = `query ApiActualCurrencyRate($input: CurrencyRateInput!) {
  actual_currency_rate(input: $input)
}`;

export class AimMarketFetcher extends BaseFetcher {
  constructor() {
    super("Aim");
    this.uahPerUsd = null; // cached USD -> UAH rate
  }

  // --- Same-origin execution helpers (mirrors the C5Game approach) ---
  async withTab(fn) {
    const existing = await chrome.tabs.query({ url: "*://aim.market/*" });
    if (existing.length > 0) return await fn(existing[0].id);

    const newTab = await chrome.tabs.create({
      url: "https://aim.market/en/profile/exchanges/sales",
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

  // Read Bearer token + userId from the aim.market `__user-store` cookie.
  async readAuth(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => {
          const get = (n) => {
            const m = document.cookie.match(
              new RegExp("(?:^|;\\s*)" + n + "=([^;]+)"),
            );
            return m ? decodeURIComponent(m[1]) : null;
          };
          let token = null;
          let userId = null;
          try {
            const store = JSON.parse(get("__user-store") || "{}");
            token = store.accessToken || null;
            userId = (store.user && store.user.id) || null;
          } catch (e) {}
          return { token, userId };
        },
      });
      return results?.[0]?.result || {};
    } catch (e) {
      return {};
    }
  }

  // POST a GraphQL operation from within the page.
  async gql(tabId, endpoint, token, operationName, query, variables) {
    const body = JSON.stringify({ operationName, query, variables });
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        args: [endpoint, token, body],
        func: async (url, token, body) => {
          try {
            const resp = await fetch(url, {
              method: "POST",
              headers: {
                accept: "*/*",
                "content-type": "application/json",
                authorization: "Bearer " + token,
              },
              credentials: "include",
              body,
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

  // UAH per 1 USD (cached for the session)
  async getRate(tabId, token) {
    if (this.uahPerUsd) return this.uahPerUsd;
    const res = await this.gql(tabId, AIM_API, token, "ApiActualCurrencyRate", RATE_QUERY, {
      input: { from: "USD", to: "UAH" },
    });
    const rate = parseFloat(res.json?.data?.actual_currency_rate || 0);
    this.uahPerUsd = rate > 0 ? rate : null;
    return this.uahPerUsd;
  }

  async checkSession() {
    try {
      return await this.withTab(async (tabId) => {
        const { token, userId } = await this.readAuth(tabId);
        if (!token || !userId) return false;
        const res = await this.gql(tabId, AIM_HASURA, token, "OfferSteamItems", OFFER_ITEMS_QUERY, {
          limit: 1,
          offset: 0,
          order_by: [{ createdAt: "desc" }, { id: "desc" }],
          where: {
            userId: { _eq: userId },
            offerSteamItemType: { _eq: "RECEIVE" },
            offer: { state: { _in: [3, 11] } },
          },
        });
        return !!(res.json && res.json.data && Array.isArray(res.json.data.offer_steam_item));
      });
    } catch (e) {
      console.error("[Aim] Session check error:", e);
      return false;
    }
  }

  async getBalance() {
    // Wallet balance is kept in UAH and not needed for profit reports.
    return { amount: 0, currency: "USD" };
  }

  async getSales() {
    return this.fetchItems("RECEIVE", "SELL");
  }

  // Buys are not imported for now.
  async getBuys() {
    return [];
  }

  async fetchItems(offerType, txType) {
    try {
      return await this.withTab(async (tabId) => {
        const { token, userId } = await this.readAuth(tabId);
        if (!token || !userId) {
          console.warn("[Aim] No token/userId — open aim.market and log in.");
          return [];
        }

        const rate = await this.getRate(tabId, token); // UAH per 1 USD
        const all = [];
        const limit = 50;
        let offset = 0;

        while (true) {
          const res = await this.gql(tabId, AIM_HASURA, token, "OfferSteamItems", OFFER_ITEMS_QUERY, {
            limit,
            offset,
            order_by: [{ createdAt: "desc" }, { id: "desc" }],
            where: {
              userId: { _eq: userId },
              offerSteamItemType: { _eq: offerType },
              offer: { state: { _in: [3, 11] } },
            },
          });

          const items = res.json?.data?.offer_steam_item || [];
          if (!Array.isArray(items) || items.length === 0) break;

          for (const it of items) {
            // Amounts are UAH -> convert to USD (fall back to price_USD if given)
            const uah = parseFloat(it.price || 0);
            let usd = 0;
            if (rate && rate > 0) usd = uah / rate;
            else if (it.price_USD) usd = parseFloat(it.price_USD);

            const txDate = it.createdAt ? new Date(it.createdAt) : new Date();

            all.push(
              new Transaction({
                source: "Aim",
                type: txType,
                tx_id: String(it.id),
                asset_id: "",
                item_name: it.marketHashName || it.name,
                price: parseFloat((usd || 0).toFixed(2)),
                currency: "USD",
                created_at: txDate,
                verified_at: txDate,
                float_val: 0,
                pattern: -1,
                phase: it.phase || "",
              }),
            );
          }

          if (items.length < limit) break;
          offset += limit;
          await this.sleep(400);
        }

        return all;
      });
    } catch (e) {
      console.error(`[Aim] fetch ${txType} error:`, e);
      return [];
    }
  }
}
