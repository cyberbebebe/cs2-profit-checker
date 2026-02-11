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
    // Remove phase from name (e.g. "Karambit | Doppler (Factory New) Phase 1" -> "Karambit | Doppler (Factory New)")
    // Usually phase is at the end or in brackets, simple replace might leave double spaces
    const cleanName = name.replace(phase, "").trim();
    return { name: cleanName, phase };
  }
  return { name, phase: "" };
}

export class CSMoneyFetcher extends BaseFetcher {
  constructor() {
    super("CSMoney");
  }

  async checkSession() {
    try {
      await this.fetchWithAuth("https://cs.money/1.0/market/user-store");
      return true;
    } catch (e) {
      return false;
    }
  }

  async getSales() {
    const sold = await this.fetchHistory("sold", "sell");
    const protectedSales = await this.fetchHistory("trade_protected", "sell");
    return [...sold, ...protectedSales];
  }

  async getBuys() {
    const buy = await this.fetchHistory("accepted", "buy");
    const protectedBuys = await this.fetchHistory("trade_protected", "buy");
    return [...buy, ...protectedBuys];
  }

  async fetchHistory(status, type) {
    let allTxs = [];
    let offsetParam = "";

    let typeParam = "";
    if (type === "buy") typeParam = "&type=buy";
    if (type === "sell") typeParam = "&type=sell"; // API might default to sell, but explicit is better

    while (true) {
      const url = `https://cs.money/2.0/market/history?limit=100&noCache=true${offsetParam}&status=${status}${typeParam}`;

      try {
        const data = await this.fetchWithAuth(url);

        if (!Array.isArray(data)) {
          if (data.error) throw new Error(data.error);
          break;
        }

        if (data.length === 0) break;

        for (const raw of data) {
          const parsedTxs = this.convertCSMoneyTx(raw);
          allTxs.push(...parsedTxs);
        }

        // Pagination
        if (data.length < 100) break;

        const lastItem = data[data.length - 1];
        if (lastItem && lastItem.offset) {
          offsetParam = `&offset=${lastItem.offset-1}`;
        } else {
          break;
        }

        await this.sleep(1500);
      } catch (e) {
        console.error(`[CSMoney] Error fetching ${status}/${type}:`, e);
        break;
      }
    }

    return allTxs;
  }

  convertCSMoneyTx(raw) {
    const transactions = [];

    // Dates
    // UpdateTime is ms
    let createdDate = new Date(raw.updateTime);
    let verifiedDate = null;

    if (raw.timeSettlement) {
      verifiedDate = new Date(raw.timeSettlement * 1000);
    }

    // 1. SELL Logic
    if (raw.type === "sell" && raw.details && raw.details.sellOrder) {
      const skins = raw.details.sellOrder.skins;
      const asset = skins.asset;

      let finalPattern = -1;
      if (asset.paintseed !== undefined && asset.paintseed !== null) {
        finalPattern = asset.paintseed;
      }
      if (
        asset.keychainPattern !== undefined &&
        asset.keychainPattern !== null
      ) {
        finalPattern = asset.keychainPattern;
      }

      const floatVal = parseFloat(asset.float || 0);
      const { name: cleanName, phase } = extractPhase(asset.names.full);

      // Price on wallet (income)
      const price = raw.details.onWallet;

      transactions.push(
        new Transaction({
          source: "CSMoney",
          type: "SELL",
          tx_id: raw.sourceId, // Using sourceId as TxID
          asset_id: asset.id,
          item_name: cleanName,
          price: price,
          currency: "USD",
          created_at: createdDate,
          verified_at: verifiedDate, // Might be null if trade_protected
          float_val: floatVal,
          pattern: finalPattern,
          phase: phase,
        }),
      );
    }

    // 2. BUY Logic
    else if (raw.type === "buy" && raw.details && raw.details.offer) {
      const offerSkins = raw.details.offer.skins || [];

      for (const skin of offerSkins) {
        const asset = skin.asset;
        const { name: cleanName, phase } = extractPhase(asset.names.full);

        let finalPattern = -1;
        if (asset.pattern !== undefined && asset.pattern !== null) {
          finalPattern = asset.pattern;
        }
        if (
          asset.keychainPattern !== undefined &&
          asset.keychainPattern !== null
        ) {
          finalPattern = asset.keychainPattern;
        }

        const price = skin.pricing ? skin.pricing.computed : 0;

        transactions.push(
          new Transaction({
            source: "CSMoney",
            type: "BUY",
            tx_id: skin.id.toString(), // Individual Skin ID as TxID
            asset_id: asset.id.toString(),
            item_name: cleanName,
            price: price,
            currency: "USD",
            created_at: createdDate,
            verified_at: verifiedDate || createdDate,
            float_val: asset.float,
            pattern: finalPattern,
            phase: phase,
          }),
        );
      }
    }

    return transactions;
  }
}
