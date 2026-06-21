import { generateSignature, log } from "./utils.js";

// Helper to get a comparable date for matching logic
function getTxDate(tx) {
  if (tx.created_at) return tx.created_at;
  return new Date(0);
}

export function matchTransactions(sales, buys) {
  // 1. Organize Buys into Lookup Maps
  const buyFloatMap = {}; // name|float -> Array of Buys (for float_val > 0)
  const buyNameMap = {};  // name -> Array of Buys (for float_val === 0)
  const buyAssetMap = {}; // AssetID -> Array of Buys (for DMarket)

  buys.forEach((b) => {
    if (b.float_val > 0) {
      const floatSig = `${b.item_name}|${parseFloat(b.float_val).toFixed(12)}`;
      if (!buyFloatMap[floatSig]) buyFloatMap[floatSig] = [];
      buyFloatMap[floatSig].push(b);
    } else {
      if (!buyNameMap[b.item_name]) buyNameMap[b.item_name] = [];
      buyNameMap[b.item_name].push(b);
    }

    // Map by AssetID (Specific for DMarket re-match)
    if (b.source === "DMarket" && b.asset_id) {
      if (!buyAssetMap[b.asset_id]) buyAssetMap[b.asset_id] = [];
      buyAssetMap[b.asset_id].push(b);
    }
  });

  // 2. Sort Buys by Date (NEWEST first, for LIFO matching)
  for (let key in buyFloatMap) {
    buyFloatMap[key].sort((a, b) => getTxDate(b) - getTxDate(a));
  }
  for (let key in buyNameMap) {
    buyNameMap[key].sort((a, b) => getTxDate(b) - getTxDate(a));
  }
  for (let aid in buyAssetMap) {
    buyAssetMap[aid].sort((a, b) => getTxDate(b) - getTxDate(a));
  }

  const results = [];

  // 3. Process Sales sequentially (maintaining original LIFO order of sales array)
  for (const sale of sales) {
    let match = null;
    let matchIndex = -1;
    let matchType = "none";

    const saleDate = getTxDate(sale);

    // A: Try unique float matching (if float > 0)
    if (sale.float_val > 0) {
      const floatSig = `${sale.item_name}|${parseFloat(sale.float_val).toFixed(12)}`;
      const potentialBuys = buyFloatMap[floatSig] || [];
      if (potentialBuys.length > 0) {
        for (let i = 0; i < potentialBuys.length; i++) {
          if (getTxDate(potentialBuys[i]) <= saleDate) {
            matchIndex = i;
            match = potentialBuys[i];
            matchType = "float";
            break;
          }
        }
      }
    } else {
      // B: Try name-only matching for items with no float (like cases, stickers)
      const potentialBuys = buyNameMap[sale.item_name] || [];
      if (potentialBuys.length > 0) {
        for (let i = 0; i < potentialBuys.length; i++) {
          if (getTxDate(potentialBuys[i]) <= saleDate) {
            matchIndex = i;
            match = potentialBuys[i];
            matchType = "name";
            break;
          }
        }
      }
    }

    // C: DMarket AssetID Fallback (if still no match)
    if (!match && sale.source === "DMarket" && sale.asset_id) {
      const assetBuys = buyAssetMap[sale.asset_id];
      if (assetBuys && assetBuys.length > 0) {
        for (let i = 0; i < assetBuys.length; i++) {
          if (getTxDate(assetBuys[i]) <= saleDate) {
            match = assetBuys[i];
            matchType = "asset_id";
            break;
          }
        }
      }
    }

    // Processing Match & Cleanup
    if (match) {
      // Clean up from buyFloatMap
      if (match.float_val > 0) {
        const floatSig = `${match.item_name}|${parseFloat(match.float_val).toFixed(12)}`;
        const floatList = buyFloatMap[floatSig];
        if (floatList) {
          const idx = floatList.indexOf(match);
          if (idx !== -1) floatList.splice(idx, 1);
        }
      } else {
        // Clean up from buyNameMap
        const nameList = buyNameMap[match.item_name];
        if (nameList) {
          const idx = nameList.indexOf(match);
          if (idx !== -1) nameList.splice(idx, 1);
        }
      }

      // Clean up from buyAssetMap
      if (match.source === "DMarket" && match.asset_id) {
        const assetList = buyAssetMap[match.asset_id];
        if (assetList) {
          const idx = assetList.indexOf(match);
          if (idx !== -1) assetList.splice(idx, 1);
        }
      }
    }

    // Construct Result
    const buyPrice = match ? match.price : 0;
    const profit = sale.price - buyPrice;

    // Use merged pattern/phase/float from whichever transaction has it
    const mergedFloat = sale.float_val || (match ? match.float_val : 0);
    const mergedPattern = (sale.pattern !== -1 && sale.pattern !== undefined) ? sale.pattern : (match && match.pattern !== undefined ? match.pattern : -1);
    const mergedPhase = sale.phase || (match ? match.phase : "");

    // Generate signature to preserve interface contract
    const sig = generateSignature(sale.item_name, mergedFloat, mergedPattern);

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
      profit_percent: match && match.price > 0 ? ((profit / match.price) * 100).toFixed(2) : 0,

      // Meta
      float_val: mergedFloat,
      pattern: mergedPattern,
      phase: mergedPhase,
      match_type: matchType,
    });
  }

  return results;
}

export function matchInventory(inventoryItems, allBuys) {
  // 1. Indexing
  const buyFloatMap = {}; // FloatSignature -> [Buys]
  const buyNameMap = {};  // name -> [Buys]
  const buyAssetMap = {}; // AssetID -> [Buys] (for DMarket)

  allBuys.forEach((b) => {
    if (b.float_val > 0) {
      const floatSig = `${b.item_name}-${parseFloat(b.float_val).toFixed(12)}`;
      if (!buyFloatMap[floatSig]) buyFloatMap[floatSig] = [];
      buyFloatMap[floatSig].push(b);
    } else {
      if (!buyNameMap[b.item_name]) buyNameMap[b.item_name] = [];
      buyNameMap[b.item_name].push(b);
    }

    if (b.asset_id) {
      if (!buyAssetMap[b.asset_id]) buyAssetMap[b.asset_id] = [];
      buyAssetMap[b.asset_id].push(b);
    }
  });

  // Sort by newest
  const sortByDate = (list) =>
    list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  for (let k in buyFloatMap) sortByDate(buyFloatMap[k]);
  for (let k in buyNameMap) sortByDate(buyNameMap[k]);
  for (let k in buyAssetMap) sortByDate(buyAssetMap[k]);

  // 2. Inventory matching
  return inventoryItems.map((item) => {
    let match = null;

    // А: Asset ID matching (DMarket)
    if (item.asset_id && buyAssetMap[item.asset_id]) {
      match = buyAssetMap[item.asset_id][0]; // Newest
    }

    // B: Float-based matching (if float > 0)
    if (!match && item.float_val > 0) {
      const floatSig = `${item.item_name}-${parseFloat(item.float_val).toFixed(12)}`;
      if (buyFloatMap[floatSig]) {
        match = buyFloatMap[floatSig][0];
      }
    }

    // C: Name-based matching (if float === 0)
    if (!match && (!item.float_val || item.float_val === 0)) {
      if (buyNameMap[item.item_name]) {
        match = buyNameMap[item.item_name][0];
      }
    }

    return {
      item_name: item.item_name,
      float_val: item.float_val || (match ? match.float_val : 0),
      pattern: (item.pattern !== -1 && item.pattern !== undefined) ? item.pattern : (match && match.pattern !== undefined ? match.pattern : -1),
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
