import { BaseFetcher, Transaction } from "./base.js";

export class SkinSwapFetcher extends BaseFetcher {
  constructor() {
    super("SkinSwap");
    this._historyPromise = null;
  }

  async checkSession() {
    try {
      const data = await this.fetchWithAuth(
        "https://api.skinswap.com/api/user/transactions?limit=30&offset=0&types=youpin_buy&types=china"
      );
      if (data && data.message === "Unauthorized") return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  async getBalance() {
    return { amount: 0, currency: "USD" };
  }
  async fetchHistory() {
    let allTx = [];
    let limit = 30;
    let offset = 0;

    while (true) {
      const url = `https://api.skinswap.com/api/user/transactions?limit=${limit}&offset=${offset}&types=youpin_buy&types=china`;
      let data;
      try {
        const resp = await this.fetchWithAuth(url, {
            headers: {
                "Accept": "application/json"
            }
        });
        data = resp;
      } catch (e) {
        break;
      }

      if (!data || !data.data || data.data.length === 0) break;

      for (const tx of data.data) {
        if (tx.status !== "completed") continue;
        if (!tx.siteItems || tx.siteItems.length === 0) continue;

        const item = tx.siteItems[0];
        const rawPrice = item.price / 100.0;

        const type = tx.value < 0 ? "BUY" : "SELL";
        
        allTx.push(
          new Transaction({
            source: "SkinSwap",
            type: type,
            tx_id: tx.id,
            asset_id: item.assetid || "",
            item_name: item.market_hash_name || item.name,
            price: parseFloat(rawPrice.toFixed(2)),
            currency: "USD",
            created_at: new Date(tx.createdAt),
          })
        );
      }

      offset += limit;
      if (typeof data.total === "number" && offset >= data.total) break;
      if (data.data.length < limit) break;
      
      await this.sleep(800);
    }

    return allTx;
  }

  async getHistory() {
    // Cache the promise so concurrent calls reuse the same fetch
    if (this._historyPromise) {
      return this._historyPromise;
    }

    this._historyPromise = this.fetchHistory();
    try {
      const res = await this._historyPromise;
      // Re-allow fetch after a short delay so manual re-sync works
      setTimeout(() => {
        this._historyPromise = null;
      }, 5000);
      return res;
    } catch (e) {
      this._historyPromise = null;
      throw e;
    }
  }

  async getSales() {
    const all = await this.getHistory();
    return all.filter((t) => t.type === "SELL");
  }

  async getBuys() {
    const all = await this.getHistory();
    return all.filter((t) => t.type === "BUY");
  }
}
