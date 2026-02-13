import { BaseFetcher } from "./base.js";
import { Transaction } from "./base.js";

export class BuffMarketFetcher extends BaseFetcher {
  constructor() {
    super("BuffMarket");
  }

  async checkSession() {
    try {
      const data = await this.fetchWithAuth(
        "https://api.buff.market/account/api/login/status",
      );
      if (data && data.code === "OK" && data.data && data.data.state === 2) {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
  async getBalance() {
    try {
      const url = "https://api.buff.market/api/asset/get_brief_asset/";
      const data = await this.fetchWithAuth(url);

      if (!data) return { amount: 0, currency: "USD" };

      const usd = parseFloat(data.data.total_amount || 0);
      const frozen = parseFloat(data.data.frozen_amount || 0);
      const pending = parseFloat(data.data.pending_divide_amount || 0);

      return { amount: usd + frozen + pending, currency: "USD" };
    } catch (e) {
      console.error("[BuffMarket] Balance error:", e);
      return { amount: 0, currency: "USD" };
    }
  }

  async getSales() {
    return this.getHistory("sell");
  }

  async getBuys() {
    return this.getHistory("buy");
  }

  async getHistory(type) {
    let allTxs = [];
    let page = 1;
    const limit = 200;
    const orderType = type === "sell" ? "sell_order" : "buy_order";

    while (true) {
      const url = `https://api.buff.market/api/market/${orderType}/history?game=csgo&page_num=${page}&page_size=${limit}&state=success`;

      let data;
      try {
        data = await this.fetchWithAuth(url);
      } catch (e) {
        console.error(`[BuffMarket] Error fetching page ${page}:`, e);
        break;
      }

      if (data.code !== "OK") {
        console.error(`[BuffMarket] API Error: ${data.msg}`);
        break;
      }

      const items = data.data.items || [];
      const goodsInfos = data.data.goods_infos || {};

      if (items.length === 0) break;

      for (const raw of items) {
        if (raw.state !== "SUCCESS") continue;

        const goodsId = raw.goods_id;
        const info = goodsInfos[goodsId];
        const itemName = info ? info.market_hash_name : "Unknown Item";

        // Conversion logic
        const priceVal = parseFloat(raw.price || 0);
        const feeVal = parseFloat(raw.fee || 0);

        // finalPrice := priceVal - feeVal
        const finalPrice = priceVal - feeVal;

        // Date: updated_at is Unix timestamp (seconds)
        const date = new Date(raw.updated_at * 1000);

        // Metadata
        const assetInfo = raw.asset_info || {};
        const paintwear = parseFloat(assetInfo.paintwear || 0);

        const infoObj = assetInfo.info || {};
        let finalPattern =
          infoObj.paintseed !== undefined ? infoObj.paintseed : -1;

        // Phase / Doppler
        const phase = infoObj.metaphysic?.data?.name || "";

        if (infoObj.keychains && infoObj.keychains.length > 0) {
          const charm = infoObj.keychains[0];
          if (charm && itemName.includes(charm.name)) {
            finalPattern = charm.pattern;
          }
        }
        const createdDate = raw.created_at
          ? new Date(raw.created_at * 1000)
          : new Date();
        const verifiedDate = raw.updated_at
          ? new Date(raw.updated_at * 1000)
          : null;
        allTxs.push(
          new Transaction({
            source: "BuffMarket",
            type: type === "sell" ? "SELL" : "BUY",
            tx_id: raw.id,
            asset_id: assetInfo.assetid,
            item_name: itemName,
            price: parseFloat(finalPrice.toFixed(2)),
            currency: "USD", // Buff Market uses USD
            created_at: createdDate,
            verified_at: verifiedDate,
            float_val: paintwear,
            pattern: finalPattern,
            phase: phase,
          }),
        );
      }

      // Pagination Check
      // Go: if page >= response.Data.TotalPages
      if (page >= data.data.total_page) {
        break;
      }

      page++;
      await this.sleep(500);
    }

    return allTxs;
  }
}
