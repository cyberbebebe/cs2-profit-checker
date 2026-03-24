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
    this.cachedHistory = null;
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
      const balanceMatch = text.match(/"userInfo"[\s\S]*?"balance"\s*:\s*([\d.]+)/);
      const balance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

      return { amount: balance, currency: "USD" };
    } catch (e) {
      console.error("[CSMoneyBot] Balance error:", e);
      return { amount: 0, currency: "USD" };
    }
  }

  async getSales() {
    const history = await this.loadHistoryIfNeeded();
    return history.filter((tx) => tx.type === "SELL");
  }

  async getBuys() {
    const history = await this.loadHistoryIfNeeded();
    return history.filter((tx) => tx.type === "BUY");
  }

  async loadHistoryIfNeeded() {
    if (this.cachedHistory) return this.cachedHistory;

    let allTxs = [];
    let offset = 0;
    let limit = 60;

    while (true) {
      const url = `https://cs.money/2.0/get_transactions?limit=${limit}&offset=${offset}&type=0&status=1&appId=730`;

      try {
        const data = await this.fetchWithAuth(url);

        if (!Array.isArray(data)) {
          if (data.error) throw new Error(data.error);
          break;
        }

        if (data.length === 0) break;

        for (const raw of data) {
          allTxs.push(...this.convertCSMoneyBotTx(raw));
        }

        if (data.length < limit) break;
        offset += limit;

        await this.sleep(1500);
      } catch (e) {
        console.error(`[CSMoneyBot] Error fetching:`, e);
        break;
      }
    }

    this.cachedHistory = allTxs;
    return allTxs;
  }

  convertCSMoneyBotTx(raw) {
    const transactions = [];

    // timestamp is in ms
    let createdDate = new Date(raw.timestamp);

    // Bot items -> User bought them (BUY)
    const botItems = raw.items && raw.items.bot ? raw.items.bot : [];
    for (const item of botItems) {
      transactions.push(this.createTransactionItem(item, "BUY", raw.id, createdDate));
    }

    // User items -> User sold them (SELL)
    const userItems = raw.items && raw.items.user ? raw.items.user : [];
    for (const item of userItems) {
      transactions.push(this.createTransactionItem(item, "SELL", raw.id, createdDate));
    }

    return transactions;
  }

  createTransactionItem(item, type, rawId, createdDate) {
    const meta = item.meta || {};
    const { name: cleanName, phase } = extractPhase(meta.fullName || item.name || "");

    let finalPattern = -1;
    if (meta.pattern !== undefined && meta.pattern !== null) {
      finalPattern = meta.pattern;
    }

    const floatVal = parseFloat(item.float || meta.float || 0);
    const price = parseFloat(item.price || 0);

    return new Transaction({
      source: "CSMoneyBot",
      type: type,
      tx_id: String(rawId) + "-" + String(item.id),
      asset_id: String(item.assetId || item.id),
      item_name: cleanName,
      price: price,
      currency: "USD",
      created_at: createdDate,
      verified_at: createdDate,
      float_val: floatVal,
      pattern: finalPattern,
      phase: phase,
    });
  }
}
