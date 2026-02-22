import { generateSignature, log } from "./utils.js";

// Helper to get a comparable date for matching logic
// CreatedAt > Date.now()
function getTxDate(tx) {
  if (tx.created_at) return tx.created_at;
  return new Date(0); // Critical moment with no buy time, should not happen
}

export function matchTransactions(sales, buys) {
  // 1. Organize Buys into a Lookup Map (Signature -> Array of Buys)
  const buyMap = {};
  const buyAssetMap = {};

  buys.forEach((b) => {
    const sig = generateSignature(b.item_name, b.float_val, b.pattern);
    if (!buyMap[sig]) buyMap[sig] = [];
    buyMap[sig].push(b);

    // Map by AssetID (Specific for DMarket re-match)
    if (b.source === "DMarket" && b.asset_id) {
      if (!buyAssetMap[b.asset_id]) buyAssetMap[b.asset_id] = [];
      buyAssetMap[b.asset_id].push(b);
    }
  });

  // 2. Sort Buys by Date (NEWEST first)
  for (let sig in buyMap) {
    buyMap[sig].sort((a, b) => getTxDate(b) - getTxDate(a));
  }
  for (let aid in buyAssetMap) {
    buyAssetMap[aid].sort((a, b) => getTxDate(b) - getTxDate(a));
  }

  const results = [];

  // 3. Iterate Sales
  for (const sale of sales) {
    const sig = generateSignature(sale.item_name, sale.float_val, sale.pattern);
    let potentialBuys = buyMap[sig] || [];

    let match = null;
    let matchIndex = -1;
    let matchType = "none";

    // Get sale date once
    const saleDate = getTxDate(sale);

    // A: Metadata Match
    const hasMeta =
      sale.float_val > 0 || (sale.pattern !== -1 && sale.pattern !== undefined);

    if (hasMeta && potentialBuys.length > 0) {
      for (let i = 0; i < potentialBuys.length; i++) {
        if (getTxDate(potentialBuys[i]) <= saleDate) {
          matchIndex = i;
          match = potentialBuys[i];
          matchType = "meta";
          break;
        }
      }
    }

    // B: DMarket AssetID Fallback
    if (!match && sale.source === "DMarket" && sale.asset_id) {
      const assetBuys = buyAssetMap[sale.asset_id];
      if (assetBuys && assetBuys.length > 0) {
        for (let i = 0; i < assetBuys.length; i++) {
          if (getTxDate(assetBuys[i]) <= saleDate) {
            match = assetBuys[i];
            matchType = "asset_id";

            // Clean up from main map to avoid double usage
            const matchSig = generateSignature(
              match.item_name,
              match.float_val,
              match.pattern,
            );
            const mainList = buyMap[matchSig];
            if (mainList) {
              const idx = mainList.indexOf(match);
              if (idx !== -1) {
                mainList.splice(idx, 1);
              }
            }
            break;
          }
        }
      }
    }

    // Processing Match
    if (match) {
      if (matchType === "meta") {
        potentialBuys.splice(matchIndex, 1);
      }
    }

    // Construct Result
    const buyPrice = match ? match.price : 0;
    const profit = sale.price - buyPrice;

    results.push({
      item_name: sale.item_name,
      signature: sig,

      // Buy Info
      buy_source: match ? match.source : "N/A",
      buy_price: buyPrice,
      buy_created_at: match ? match.created_at : null,
      buy_verified_at: match ? match.verified_at : null,
      buy_tx_id: match ? match.tx_id : "",
      buy_currency: match ? match.currency : "USD",

      // Sell Info
      sell_source: sale.source,
      sell_price: sale.price,
      sell_created_at: sale.created_at,
      sell_verified_at: sale.verified_at,
      sell_tx_id: sale.tx_id,
      sell_currency: sale.currency,

      // Stats
      profit: parseFloat(profit.toFixed(2)),
      profit_percent:
        match && match.price > 0
          ? ((profit / match.price) * 100).toFixed(2)
          : 0,

      // Meta
      float_val: sale.float_val,
      pattern: sale.pattern,
      phase: sale.phase,
      match_type: matchType,
    });
  }

  return results;
}

export function matchInventory(inventoryItems, allBuys) {
  // 1. Indexing
  const buyMap = {}; // Signature -> [Buys]
  const buyAssetMap = {}; // AssetID -> [Buys] (for DMarket)

  // (Signature)
  const generateSignature = (name, floatVal, pattern) => {
    if (!floatVal || floatVal === 0) return name;
    // Round float
    const shortFloat = parseFloat(floatVal).toFixed(10);
    const pat = pattern !== undefined && pattern !== -1 ? `-${pattern}` : "";
    return `${name}-${shortFloat}${pat}`;
  };

  allBuys.forEach((b) => {
    const sig = generateSignature(b.item_name, b.float_val, b.pattern);
    if (!buyMap[sig]) buyMap[sig] = [];
    buyMap[sig].push(b);

    if (b.asset_id) {
      if (!buyAssetMap[b.asset_id]) buyAssetMap[b.asset_id] = [];
      buyAssetMap[b.asset_id].push(b);
    }
  });

  // Sort by newest
  const sortByDate = (list) =>
    list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  for (let k in buyMap) sortByDate(buyMap[k]);
  for (let k in buyAssetMap) sortByDate(buyAssetMap[k]);

  // 2. Матчимо інвентар
  return inventoryItems.map((item) => {
    let match = null;

    // А: Asset ID matching (DMarket)
    if (item.asset_id && buyAssetMap[item.asset_id]) {
      match = buyAssetMap[item.asset_id][0]; // Беремо найсвіжішу
    }

    // B: Signatures (Float + Pattern)
    if (!match) {
      const sig = generateSignature(
        item.item_name,
        item.float_val,
        item.pattern,
      );
      if (buyMap[sig]) {
        match = buyMap[sig][0];
      }
    }

    return {
      item_name: item.item_name,
      float_val: item.float_val,
      pattern: item.pattern,
      source: item.source,

      // Buy info
      buy_source: match ? match.source : "Unknown",
      buy_date: match ? match.created_at : null,
      buy_price: match ? match.price : 0,
      buy_currency: match ? match.currency : "USD",

      is_matched: !!match,
    };
  });
}
