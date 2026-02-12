import { BaseFetcher } from "./base.js";
import { Transaction } from "./base.js";
export class DMarketFetcher extends BaseFetcher {
  constructor() {
    super("DMarket");
  }

  async checkSession() {
    try {
      await this.fetchWithAuth("https://api.dmarket.com/account/v1/balance");
      return true;
    } catch (e) {
      return false;
    }
  }

  async getBalance() {
    try {
      const url = "https://api.dmarket.com/account/v1/balance";
      const data = await this.fetchWithAuth(url);

      if (!data) return { amount: 0, currency: "USD" };

      // cents
      const usd = parseFloat(data.usd || 0);
      const locked = parseFloat(data.usdTradeProtected || 0);

      const total = (usd + locked) / 100.0;
      return { amount: total, currency: "USD" };
    } catch (e) {
      console.error("[DMarket] Balance error:", e);
      return { amount: 0, currency: "USD" };
    }
  }

  async getHistory(activity) {
    let items = [];
    let offset = 0;
    const limit = 10000;
    const actParam = activity === "sell" ? "sell" : "purchase,target_closed";

    while (true) {
      const url = `https://api.dmarket.com/exchange/v1/history?activities=${actParam}&statuses=success,trade_protected&sortBy=updatedAt&limit=${limit}&offset=${offset}`;

      let data;
      try {
        data = await this.fetchWithAuth(url);
      } catch (e) {
        break;
      }

      if (!data || !data.objects || data.objects.length === 0) break;

      for (const obj of data.objects) {
        const isSell = obj.type === "sell";
        const price = parseFloat(obj.changes?.[0]?.money?.amount || 0);
        const createdDate = new Date(obj.createdAt * 1000);
        let verifiedDate = null;
        if (obj.status === "success") {
          verifiedDate = obj.updatedAt
            ? new Date(obj.updatedAt * 1000)
            : createdDate;
        }
        items.push(
          new Transaction({
            source: "DMarket",
            type: isSell ? "SELL" : "BUY",
            tx_id: obj.id,
            asset_id: obj.details?.itemId,
            item_name: obj.subject,
            price: price,
            currency: "USD",
            created_at: createdDate, // <--- TAX
            verified_at: verifiedDate, // <--- PROFIT
            float_val: obj.details?.extra?.floatValue,
            pattern: obj.details?.extra?.paintSeed,
            phase: obj.details?.extra?.phaseTitle,
          }),
        );
      }

      offset += data.objects.length;
      if (data.objects.length < limit) break;
      await this.sleep(200);
    }
    return items;
  }

  async getSales() {
    return this.getHistory("sell");
  }
  async getBuys() {
    return this.getHistory("buy");
  }
}
