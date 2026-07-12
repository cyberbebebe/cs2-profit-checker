import { BaseFetcher, Transaction } from "./base.js";

function extractDoppler(name) {
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
    let cleanName = name.replace(phase, "").replace(/\s+/g, " ").trim();
    return { name: cleanName, phase };
  }
  return { name, phase: "" };
}

// SkinPlace stores the exterior separately (`shorten_exterior`) and omits it
// from `steam_market_hash_name` (e.g. "★ Broken Fang Gloves | Yellow-banded"
// instead of "… (Field-Tested)"). Rebuild the full Steam market hash name so
// items line up with float-bearing marketplaces (CSFloat, DMarket, …) when the
// matcher compares by name.
function buildFullName(item) {
  let name = item.steam_market_hash_name || "Unknown Item";
  const ext = item.shorten_exterior;
  if (ext && !name.includes(`(${ext})`)) {
    name = `${name} (${ext})`;
  }
  return name;
}

export class SkinPlaceFetcher extends BaseFetcher {
  constructor() {
    super("SkinPlace");
  }

  async checkSession() {
    try {
      const data = await this.fetchWithAuth(
        "https://api.skin.place/api/market/profile/stats"
      );
      return data && data.status === "success";
    } catch (e) {
      return false;
    }
  }

  async getBalance() {
    try {
      const data = await this.fetchWithAuth(
        "https://api.skin.place/api/market/user_data"
      );
      if (!data) return { amount: 0, currency: "USD" };

      const balance = parseFloat(data.wallet_balance || 0);
      const frozen = parseFloat(data.wallet_balance_frozen || 0);

      return { amount: balance + frozen, currency: "USD" };
    } catch (e) {
      console.error("[SkinPlace] Balance error:", e);
      return { amount: 0, currency: "USD" };
    }
  }

  async getSales() {
    let allTxs = [];
    let page = 1;
    const limit = 50;

    while (true) {
      const url = `https://api.skin.place/api/market/profile/history/sell?page=${page}&limit=${limit}&sort_column=time_created&sort_dir=desc`;
      let data;
      try {
        data = await this.fetchWithAuth(url);
      } catch (e) {
        console.error(`[SkinPlace] Error fetching page ${page}:`, e);
        break;
      }

      if (!data || data.status !== "success" || !data.data || data.data.length === 0) {
        break;
      }

      const before = allTxs.length;
      for (const tx of data.data) {
        if (tx.state !== "finished") continue;
        if (!tx.items) continue;

        for (const item of tx.items) {
          const rawName = buildFullName(item);
          const { name: cleanName, phase } = extractDoppler(rawName);

          const price = parseFloat(item.price || tx.price || 0);

          const createdDate = item.time_created ? new Date(item.time_created) : new Date();
          const verifiedDate = item.time_finished ? new Date(item.time_finished) : null;

          allTxs.push(
            new Transaction({
              source: "SkinPlace",
              type: "SELL",
              tx_id: String(item.id || tx.id),
              asset_id: String(item.id || ""),
              item_name: cleanName,
              price: price,
              currency: "USD",
              created_at: createdDate,
              verified_at: verifiedDate,
              float_val: 0,
              pattern: -1,
              phase: phase,
            })
          );
        }
      }

      if (this.reachedCutoff(allTxs.slice(before))) break;
      if (data.data.length < limit) {
        break;
      }
      page++;
      await this.sleep(300);
    }

    return allTxs;
  }

  async getBuys() {
    let allTxs = [];
    let page = 1;
    const limit = 50;

    while (true) {
      // Note: the purchase endpoint uses order_by/order_dir (the sell endpoint
      // uses sort_column/sort_dir) and returns one `item` object per record,
      // with price/time at the transaction level (sells nest an `items` array).
      const url = `https://api.skin.place/api/market/profile/history/purchase?page=${page}&limit=${limit}&order_by=time_created&order_dir=desc`;
      let data;
      try {
        data = await this.fetchWithAuth(url);
      } catch (e) {
        console.error(`[SkinPlace] Error fetching buys page ${page}:`, e);
        break;
      }

      if (!data || data.status !== "success" || !data.data || data.data.length === 0) {
        break;
      }

      const before = allTxs.length;
      for (const tx of data.data) {
        if (tx.state !== "finished") continue;
        const item = tx.item;
        if (!item) continue;

        const rawName = buildFullName(item);
        const { name: cleanName, phase } = extractDoppler(rawName);

        const price = parseFloat(tx.price || 0);
        const createdDate = tx.time_created ? new Date(tx.time_created) : new Date();

        allTxs.push(
          new Transaction({
            source: "SkinPlace",
            type: "BUY",
            tx_id: String(item.id || tx.id),
            asset_id: String(item.id || ""),
            item_name: cleanName,
            price: price,
            currency: "USD",
            created_at: createdDate,
            verified_at: null,
            float_val: 0,
            pattern: -1,
            phase: phase || item.phase || "",
          })
        );
      }

      if (this.reachedCutoff(allTxs.slice(before))) break;
      if (data.data.length < limit) {
        break;
      }
      page++;
      await this.sleep(300);
    }

    return allTxs;
  }
}
