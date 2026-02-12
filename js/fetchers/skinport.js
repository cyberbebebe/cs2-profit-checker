import { BaseFetcher, Transaction } from "./base.js";

export class SkinportFetcher extends BaseFetcher {
  constructor() {
    super("Skinport");
    this.cachedHistory = null;
  }

  async checkSession() {
    try {
      const url = "https://skinport.com/api/user/profile";
      const data = await this.fetchWithAuth(url);
      return data && (data.success === true || data.message === null);
    } catch (e) {
      return false;
    }
  }

  // No balance увы
  async getBalance() {
    return { amount: 0, currency: "USD" };
  }

  // PUBLIC API
  async getSales() {
    const history = await this.loadHistoryIfNeeded();
    return history.filter((tx) => tx.type === "SELL");
  }

  async getBuys() {
    const history = await this.loadHistoryIfNeeded();
    return history.filter((tx) => tx.type === "BUY");
  }

  // INTERNAL
  async loadHistoryIfNeeded() {
    if (this.cachedHistory) return this.cachedHistory;

    let allTransactions = [];
    let page = 1;
    const limit = 100;

    while (true) {
      const url = `https://skinport.com/api/transactions?page=${page}&limit=${limit}&ignore_statuses%5B%5D=canceled`;

      try {
        const resp = await this.fetchWithAuth(url);

        let txList = [];
        if (resp.data && Array.isArray(resp.data)) txList = resp.data;
        else if (resp.result && resp.result.data) txList = resp.result.data;

        if (!txList || txList.length === 0) break;

        for (const tx of txList) {
          if (tx.status !== "complete") continue;

          const date = new Date(tx.timestamp || tx.created_at);

          // Determine Type
          let txType = "";
          if (tx.type === "purchase") txType = "BUY";
          else if (tx.type === "credit" || tx.type === "sale") txType = "SELL";
          else continue;

          for (const item of tx.items) {
            const marketName =
              item.marketName || item.marketHashName || item.name;
            const floatVal = item.wear || 0;
            const pattern = item.pattern !== undefined ? item.pattern : -1;
            const phase = "";

            let finalPrice = item.salePrice / 100.0;

            if (txType === "SELL") {
              const fee = (item.saleFee || 0) / 100.0;
              finalPrice = finalPrice - fee;
            }

            allTransactions.push(
              new Transaction({
                source: "Skinport",
                type: txType,
                tx_id: String(tx.id),
                asset_id: String(item.assetId || item.assetid || item.saleId),
                item_name: marketName,
                price: parseFloat(finalPrice.toFixed(2)),
                currency: "EUR",
                created_at: date,
                verified_at: date,
                float_val: floatVal,
                pattern: pattern,
                phase: phase,
              }),
            );
          }
        }

        // Pagination
        let meta = resp.pagination || (resp.result ? resp.result : null);
        if (meta && page >= meta.pages) break;
        if (txList.length < limit) break;

        page++;
        await this.sleep(1500);
      } catch (e) {
        console.error("[Skinport] Error:", e);
        break;
      }
    }

    this.cachedHistory = allTransactions;
    return allTransactions;
  }
}
