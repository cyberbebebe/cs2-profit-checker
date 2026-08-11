import { BaseFetcher, Transaction } from "./base.js";

// Helper for extracting Doppler Phases from item name
function extractPhase(name) {
  if (!name.includes("Doppler")) return { name, phase: "" };

  let phase = "";
  if (name.includes("Phase 1")) phase = "Phase 1";
  else if (name.includes("Phase 2")) phase = "Phase 2";
  else if (name.includes("Phase 3")) phase = "Phase 3";
  else if (name.includes("Phase 4")) phase = "Phase 4";
  else if (name.includes("Ruby")) phase = "Ruby";
  else if (name.includes("Sapphire")) phase = "Sapphire";
  else if (name.includes("Black Pearl")) phase = "Black Pearl";
  else if (name.includes("Emerald")) phase = "Emerald";

  if (phase) {
    const cleanName = name.replace(phase, "").replace(/\s+/g, " ").trim();
    return { name: cleanName, phase };
  }
  return { name, phase: "" };
}

export class CSMoneyBotFetcher extends BaseFetcher {
  constructor() {
    super("CSMoneyBot");
    this._historyPromise = null;
  }

  resetCache() {
    this._historyPromise = null;
  }

  async checkSession() {
    try {
      const resp = await fetch("https://cs.money/get_user_data", {
        method: "POST",
      });
      return resp.status === 200;
    } catch (e) {
      return false;
    }
  }

  async getBalance() {
    try {
      const resp = await fetch("https://cs.money/csgo/trade/", {
        method: "GET",
      });
      const text = await resp.text();

      // Look for the userInfo block and extract the balance
      const balanceMatch = text.match(/"userInfo"[\s\S]*?"tradeBalance"\s*:\s*([\d.]+)/);
      const balance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

      return { amount: balance, currency: "USD" };
    } catch (e) {
      console.error("[CSMoneyBot] Balance error:", e);
      return { amount: 0, currency: "USD" };
    }
  }

  async fetchHistory() {
    const history = [];
    let cursor = null;
    const limit = 1000;

    while (true) {
      let url = `https://cs.money/api/public/v3/trade/transactions?app_id=730&limit=${limit}&type=trade&status=completed`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

      try {
        const data = await this.fetchWithAuth(url);

        if (!data || !Array.isArray(data.items)) {
          console.warn("[CSMoneyBot] Unexpected response structure:", data);
          break;
        }

        if (data.items.length === 0) break;

        const before = history.length;
        for (const raw of data.items) {
          history.push(...this.convertCSMoneyBotTx(raw));
        }

        if (this.reachedCutoff(history.slice(before))) break;
        
        if (!data.cursor) break;
        cursor = data.cursor;

        await this.sleep(1500);
      } catch (e) {
        console.error(`[CSMoneyBot] Error fetching:`, e);
        break;
      }
    }

    return history;
  }

  async getHistory() {
    if (this._historyPromise) {
      return this._historyPromise;
    }

    this._historyPromise = this.fetchHistory();
    try {
      const res = await this._historyPromise;
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
    return all.filter((tx) => tx.type === "SELL");
  }

  async getBuys() {
    const all = await this.getHistory();
    return all.filter((tx) => tx.type === "BUY");
  }

  convertCSMoneyBotTx(raw) {
    const transactions = [];

    if (raw.type !== "trade" || raw.status !== "completed") return [];
    if (!Array.isArray(raw.offer_skins)) return [];

    let createdDate = new Date(raw.time);

    for (const skin of raw.offer_skins) {
      const isBuy = skin.type === "bot";
      const isSell = skin.type === "partner";
      
      if (isBuy) {
        transactions.push(this.createTransactionItem(skin, "BUY", raw.transaction_id, createdDate));
      } else if (isSell) {
        transactions.push(this.createTransactionItem(skin, "SELL", raw.transaction_id, createdDate));
      }
    }

    return transactions;
  }

  createTransactionItem(item, type, rawId, createdDate) {
    const { name: cleanName, phase } = extractPhase(item.name || "");

    const floatVal = item.float_value !== undefined ? parseFloat(item.float_value) : 0;
    const price = parseFloat(item.price || 0);

    return new Transaction({
      source: "CSMoneyBot",
      type: type,
      tx_id: String(rawId) + "-" + String(item.asset_id || item.id || Date.now()),
      asset_id: String(item.asset_id || ""),
      item_name: cleanName,
      price: price,
      currency: "USD",
      created_at: createdDate,
      verified_at: createdDate,
      float_val: floatVal,
      pattern: -1,
      phase: phase,
    });
  }
}
