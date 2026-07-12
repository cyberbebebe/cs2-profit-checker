import { BaseFetcher, Transaction } from "./base.js";

/**
 * aim.market — Hasura GraphQL API behind a Bearer token.
 *
 * Auth is a Bearer token + userId held in the `__user-store` cookie (a plain,
 * JS-readable cookie — not HttpOnly). We read it directly with chrome.cookies
 * and call the GraphQL API from the dashboard with credentials:"include", the
 * same flow as every other marketplace — no background tab required.
 */

// Hasura data API (offer_steam_item queries).
const AIM_HASURA = "https://aim.market/v1/graphql";

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

export class AimMarketFetcher extends BaseFetcher {
  constructor() {
    super("Aim");
  }

  // Read Bearer token + userId from the aim.market `__user-store` cookie.
  // The value is a (usually URL-encoded) JSON blob; chrome.cookies returns it
  // as stored, so decode before parsing and fall back to a raw parse.
  async readAuth() {
    try {
      const cookie = await chrome.cookies.get({
        url: "https://aim.market",
        name: "__user-store",
      });
      if (!cookie || !cookie.value) return {};

      let store;
      try {
        store = JSON.parse(decodeURIComponent(cookie.value));
      } catch (e) {
        store = JSON.parse(cookie.value);
      }
      return {
        token: store.accessToken || null,
        userId: (store.user && store.user.id) || null,
      };
    } catch (e) {
      return {};
    }
  }

  // POST a GraphQL operation directly (session cookie + Bearer header).
  async gql(endpoint, token, operationName, query, variables) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          authorization: "Bearer " + token,
        },
        credentials: "include",
        body: JSON.stringify({ operationName, query, variables }),
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
  }

  async checkSession() {
    try {
      const { token, userId } = await this.readAuth();
      if (!token || !userId) return false;
      const res = await this.gql(AIM_HASURA, token, "OfferSteamItems", OFFER_ITEMS_QUERY, {
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
      const { token, userId } = await this.readAuth();
      if (!token || !userId) {
        console.warn("[Aim] No token/userId — open aim.market and log in.");
        return [];
      }

      const all = [];
      const limit = 50;
      let offset = 0;

      while (true) {
        const res = await this.gql(AIM_HASURA, token, "OfferSteamItems", OFFER_ITEMS_QUERY, {
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

        const before = all.length;
        for (const it of items) {
          // Use price_USD directly (base currency). Defaults to 0 if not present.
          const usd = it.price_USD ? parseFloat(it.price_USD) : 0;

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

        if (this.reachedCutoff(all.slice(before))) break;
        if (items.length < limit) break;
        offset += limit;
        await this.sleep(400);
      }

      return all;
    } catch (e) {
      console.error(`[Aim] fetch ${txType} error:`, e);
      return [];
    }
  }
}
