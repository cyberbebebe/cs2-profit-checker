import { BaseFetcher, Transaction } from "./base.js";

/**
 * avan.market — session-cookie (connect.sid) API.
 *
 * The session cookie is sent automatically with credentials:"include", so the
 * dashboard calls the API directly — the same flow as every other marketplace,
 * no background tab required.
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

  // GET a same-site API endpoint. Returns { ok, status, json } so the callers
  // below don't have to care whether the body was valid JSON.
  async apiGet(url) {
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
  }

  async checkSession() {
    try {
      const res = await this.apiGet(
        "https://avan.market/v1/api/users/my-profile/trades?type=trade&page=1",
      );
      return !!(res.json && Array.isArray(res.json.items));
    } catch (e) {
      console.error("[Avan] Session check error:", e);
      return false;
    }
  }

  async getSales() {
    try {
      const all = [];
      let page = 1;
      let reachedCutoff = false;

      while (true) {
        const res = await this.apiGet(
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

          // Incremental: trades come newest-first, so the first one older than
          // the cutoff means we've covered the fresh window. Stop here — before
          // the per-trade item fetch below — so we don't re-pull known history.
          if (this.sinceCutoff && txDate.getTime() < this.sinceCutoff.getTime()) {
            reachedCutoff = true;
            break;
          }

          const itemsRes = await this.apiGet(
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

        if (reachedCutoff) break;
        if (trades.length < pageSize) break;
        page++;
        if (page > 200) break; // safety cap
        await this.sleep(400);
      }

      return all;
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
