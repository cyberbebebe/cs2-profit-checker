import { BaseFetcher } from "./base.js";
import { Transaction } from "./base.js";

export class CSFloatFetcher extends BaseFetcher {
  constructor() {
    super("CSFloat");
  }

  async checkSession() {
    try {
      await this.fetchWithAuth("https://csfloat.com/api/v1/me");
      return true;
    } catch (e) {
      return false;
    }
  }

  async getHistory(role) {
    let items = [];
    let page = 0;
    const limit = 1000;

    while (true) {
      const url = `https://csfloat.com/api/v1/me/trades?role=${role}&state=pending,verified&limit=${limit}&page=${page}`;

      let data;
      try {
        data = await this.fetchWithAuth(url);
      } catch (e) {
        break;
      }

      if (!data || !data.trades || data.trades.length === 0) break;

      for (const trade of data.trades) {
        const item = trade.contract.item;
        const rawPrice = trade.contract.price / 100.0;
        let finalPrice = rawPrice;
        const verifiedDate = trade.verified_at
          ? new Date(trade.verified_at)
          : null;
        const createdDate = trade.created_at
          ? new Date(trade.created_at)
          : verifiedDate || new Date();
        if (role === "seller") {
          finalPrice = rawPrice * 0.98;
        }

        items.push(
          new Transaction({
            source: "CSFloat",
            type: role === "seller" ? "SELL" : "BUY",
            tx_id: trade.id,
            asset_id: item.asset_id,
            item_name: item.market_hash_name,
            price: parseFloat(finalPrice.toFixed(2)),
            currency: "USD",
            created_at: createdDate,
            verified_at: verifiedDate,
            float_val: item.float_value,
            pattern: item.paint_seed,
            phase: item.phase,
          }),
        );
      }

      if (data.trades.length < limit) break;
      page++;
      await this.sleep(1000);
    }
    return items;
  }

  async getSales() {
    return this.getHistory("seller");
  }
  async getBuys() {
    return this.getHistory("buyer");
  }
}
