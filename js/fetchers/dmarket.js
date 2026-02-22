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
    const limit = 5000;
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
        if (obj.details && obj.details.settlementTime) {
          verifiedDate = new Date(obj.details.settlementTime * 1000);
        } else if (obj.status === "success" && obj.updatedAt) {
          verifiedDate = new Date(obj.updatedAt * 1000);
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
            created_at: createdDate,
            verified_at: verifiedDate, 
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

  async getInventory() {
    try {
      const limit = 100;
      const gameId = "a8db"; // CS2 (CS:GO)
      const allItems = [];

      const fetchAllPages = async (baseUrl) => {
        let cursor = "";
        let pageItems = [];

        while (true) {
          const url = `${baseUrl}&limit=${limit}&cursor=${cursor}`;

          const data = await this.fetchWithAuth(url);

          if (!data || !data.objects) break;

          const mapped = data.objects.map((item) => {
            const extra = item.extra || {};

            // Float
            let floatVal = 0;
            if (extra.floatValue !== undefined) {
              floatVal = parseFloat(extra.floatValue);
            }

            // Pattern
            let pattern = -1;
            if (extra.paintSeed !== undefined) {
              pattern = parseInt(extra.paintSeed);
            }

            return {
              source: "DMarket",
              asset_id: item.itemId, // DMarket's ID
              item_name: item.title,
              type: item.gameType || item.type || "CS2 Item",
              float_val: floatVal,
              pattern: pattern,
              is_tradable:
                typeof item.tradable === "boolean" ? item.tradable : true,
            };
          });

          pageItems.push(...mapped);

          if (!data.cursor) break;
          cursor = data.cursor;

          // anti-429
          await new Promise((r) => setTimeout(r, 200));
        }
        return pageItems;
      };

      // 1. Items on Sale (Offers)
      const offersUrl = `https://api.dmarket.com/exchange/v1/user/offers?side=user&orderBy=price&orderDir=desc&title=&gameId=${gameId}&currency=USD`;

      // 2. Items in Inventory (Not listed)
      const itemsUrl = `https://api.dmarket.com/exchange/v1/user/items?side=user&orderBy=items.price&orderDir=desc&title=&treeFilters=itemLocation%5B%5D=true&gameId=${gameId}&currency=USD`;

      // Start
      const [offers, items] = await Promise.all([
        fetchAllPages(offersUrl),
        fetchAllPages(itemsUrl),
      ]);

      console.log(
        `[DMarket] Inventory loaded. Offers: ${offers.length}, Items: ${items.length}`,
      );

      return [...offers, ...items];
    } catch (e) {
      console.error("[DMarket] Inventory error:", e);
      return [];
    }
  }
}
