import { BaseFetcher } from "./base.js";

export class SteamFetcher extends BaseFetcher {
  constructor() {
    super("Steam");
    this.steamID = null;
  }

  async checkSession() {
    try {
      const targetUrl = "https://steamcommunity.com/my/tradeoffers/";

      const resp = await fetch(targetUrl, {
        method: "GET",
        credentials: "include",
      });

      const finalUrl = resp.url;

      if (finalUrl.includes("/login") || finalUrl.includes("openid")) {
        return false;
      }

      if (finalUrl.includes("tradeoffers")) {
        const text = await resp.text();
        const match = text.match(/g_steamID\s*=\s*"(\d+)"/);
        if (match && match[1]) {
          this.steamID = match[1];
        }
        return true;
      }

      return false;
    } catch (e) {
      console.error("Steam check error:", e);
      return false;
    }
  }

  // Steam != Real
  async getBalance() {
    return { amount: 0, currency: "USD" };
  }

  async getInventory() {
    try {
      // Get SteamID
      if (!this.steamID) {
        const profileUrl = "https://steamcommunity.com/my/tradeoffers/";
        const resp = await fetch(profileUrl, { method: "GET" });
        const text = await resp.text();

        // g_steamID = "7656...";
        const match = text.match(/g_steamID\s*=\s*"(\d+)"/);
        if (match && match[1]) {
          this.steamID = match[1];
        } else {
          console.error("[Steam] Could not find g_steamID");
          return [];
        }
      }

      const [inv2, inv16] = await Promise.all([
        this._fetchContext(2),
        this._fetchContext(16),
      ]);

      const totalInventory = [...inv2, ...inv16];
      console.log(`[Steam] Loaded ${totalInventory.length} items.`);
      return totalInventory;
    } catch (e) {
      console.error("[Steam] Inventory error:", e);
      return [];
    }
  }

  async _fetchContext(contextId) {
    const url = `https://steamcommunity.com/inventory/${this.steamID}/730/${contextId}?l=english&count=2000&preserve_bbcode=1&raw_asset_properties=1&norender=1`;

    try {
      const resp = await fetch(url);
      const data = await resp.json();

      if (!data || !data.assets) return [];

      const descMap = {};
      if (data.descriptions) {
        data.descriptions.forEach((d) => {
          descMap[d.classid] = d;
        });
      }

      const propsMap = {};
      if (data.asset_properties) {
        data.asset_properties.forEach((p) => {
          propsMap[p.assetid] = p.asset_properties;
        });
      }

      const result = [];
      for (const asset of data.assets) {
        const desc = descMap[asset.classid];

        // Skip untradable (service medals, storage units)
        if (!desc || desc.sealed == desc.marketable) continue;

        const props = propsMap[asset.assetid];

        let name = desc.market_hash_name || "Unknown Item";
        let type = desc.type || "";
        let floatVal = 0;
        let pattern = -1;

        if (props && Array.isArray(props)) {
          const p1 = props.find((x) => x.propertyid === 1);
          if (p1) pattern = parseInt(p1.int_value || p1.value);

          const p2 = props.find((x) => x.propertyid === 2);
          if (p2) floatVal = parseFloat(p2.float_value || p2.value);
        }

        result.push({
          source: "Steam",
          asset_id: asset.assetid,
          item_name: name,
          type: type,
          float_val: floatVal,
          pattern: pattern,
          is_tradable: contextId === 2,
        });
      }

      return result;
    } catch (e) {
      console.warn(`[Steam] Error fetching context ${contextId}:`, e);
      return [];
    }
  }
}
