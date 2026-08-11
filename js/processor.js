import { generateSignature, log } from "./utils.js";

// Helper to get a comparable date for matching logic
function getTxDate(tx) {
  if (tx.created_at) return tx.created_at;
  return new Date(0);
}

// --- Steam/CS2 trade-hold release time ---------------------------------------
// A purchase is trade-locked for ~7 days after it's acquired. While locked it
// can't be the item that was sold, so name-based matches require the sale to
// happen at/after the purchase's computed unlock time.
//
// Steam changed how that release moment is rounded on 2026-06-23:
//   • Before: 7 full days, then aligned up to the next 07:00 UTC boundary — i.e.
//     "7 full days plus the hours left in the current 07:00-UTC trading day", so
//     the hold always expired at 07:00 UTC. e.g. buy 01 Jun 21:08 → 09 Jun 07:00.
//   • On/after: 7 full days, then rounded up to the next whole hour.
//     e.g. buy 03 Jul 21:08 → 10 Jul 22:00.
// The rule in force is picked by the purchase date (the hold is set at buy time).
const TRADE_HOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 full days
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// 2026-06-23 00:00:00 UTC — the day the rounding rule changed.
const TRADE_HOLD_RULE_CHANGE_MS = Date.UTC(2026, 5, 23, 0, 0, 0, 0);

// Unlock timestamp (ms since epoch) for an item purchased at `buyTime` (ms).
export function tradeHoldUnlockTime(buyTime) {
  if (buyTime >= TRADE_HOLD_RULE_CHANGE_MS) {
    // New rule: +7 days, then rounded up to the next whole hour.
    return Math.ceil(buyTime / HOUR_MS) * HOUR_MS + TRADE_HOLD_MS;
  }
  // Old rule: +7 days, aligned up to the next 07:00 UTC boundary.
  const d = new Date(buyTime);
  let boundary = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    7, 0, 0, 0,
  );
  if (boundary < buyTime) boundary += DAY_MS; // already past 07:00 → next day 07:00
  return boundary + TRADE_HOLD_MS;
}

// Skin markets that don't report float/pattern (their skin sales carry no
// fingerprint, so they can only be matched to a float-bearing purchase by name).
const FLOATLESS_SOURCES = new Set(["Aim", "Avan"]);

export function matchTransactions(sales, buys) {
  // 1. Organize Buys into Lookup Maps
  const buyFloatMap = {}; // name|float -> Array of Buys (for float_val > 0)
  const buyAssetMap = {}; // AssetID -> Array of Buys (for DMarket)
  const buyNameMap = {}; // name -> Array of Buys (for "unknown" no-float items)
  const buyFloatByName = {}; // name -> Array of float-bearing Buys (fallback index)

  buys.forEach((b) => {
    if (b.float_val > 0) {
      const floatSig = `${b.item_name}|${parseFloat(b.float_val).toFixed(8)}`;
      if (!buyFloatMap[floatSig]) buyFloatMap[floatSig] = [];
      buyFloatMap[floatSig].push(b);
      if (!buyFloatByName[b.item_name]) buyFloatByName[b.item_name] = [];
      buyFloatByName[b.item_name].push(b);
    } else {
      // No float — "unknown" fungible items (cases, agents, stickers, ...).
      // Trade-hold eligibility is enforced per sale/buy pair during matching.
      if (!buyNameMap[b.item_name]) buyNameMap[b.item_name] = [];
      buyNameMap[b.item_name].push(b);
    }

    // Map by AssetID (Specific for DMarket re-match)
    if (b.source === "DMarket" && b.asset_id) {
      if (!buyAssetMap[b.asset_id]) buyAssetMap[b.asset_id] = [];
      buyAssetMap[b.asset_id].push(b);
    }
  });

  // 2. Sort Buys by Date (OLDEST first) — FIFO: first bought is first sold.
  const byOldest = (a, b) => getTxDate(a) - getTxDate(b);
  for (let key in buyFloatMap) buyFloatMap[key].sort(byOldest);
  for (let aid in buyAssetMap) buyAssetMap[aid].sort(byOldest);
  for (let name in buyNameMap) buyNameMap[name].sort(byOldest);
  for (let name in buyFloatByName) buyFloatByName[name].sort(byOldest);

  // Track consumed purchases without mutating the shared buy objects (this
  // function is re-run on every render).
  const used = new Set();

  // Latest still-available buy in `list` that satisfies the date rule. Buys are
  // oldest-first, so scanning from the end backward matches the latest purchase (LIFO).
  const findFirst = (list, saleTime, requireHold) => {
    if (!list) return null;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (used.has(b)) continue;
      const bt = getTxDate(b).getTime();

      let ok = false;
      if (requireHold) {
        // Item is trade-locked until its computed release time (the rounding
        // rule depends on the purchase date — see tradeHoldUnlockTime).
        ok = saleTime >= tradeHoldUnlockTime(bt);
      } else {
        ok = bt <= saleTime;
      }
      if (ok) return b;
    }
    return null;
  };

  // 3. Process Sales NEWEST first so the LIFO queue resolves correctly.
  const byNewest = (a, b) => getTxDate(b) - getTxDate(a);
  const orderedSales = sales.slice().sort(byNewest);
  const decided = []; // { sale, match, matchType }
  const fallbackQueue = []; // float-less skin sales deferred to pass 2

  for (const sale of orderedSales) {
    let match = null;
    let matchType = "none";
    const saleTime = getTxDate(sale).getTime();

    // A: Unique float matching (exact fingerprint)
    if (sale.float_val > 0) {
      const floatSig = `${sale.item_name}|${parseFloat(sale.float_val).toFixed(8)}`;
      match = findFirst(buyFloatMap[floatSig], saleTime, false);
      if (match) matchType = "float";
    }

    // B: DMarket AssetID fallback
    if (!match && sale.source === "DMarket" && sale.asset_id) {
      match = findFirst(buyAssetMap[sale.asset_id], saleTime, false);
      if (match) matchType = "asset_id";
    }

    // C: Name-based matching against float-less purchases, with the per-pair
    // trade-hold: sale_date >= tradeHoldUnlockTime(buy_date).
    // DISABLED per user request for now
    /*
    if (!match) {
      match = findFirst(buyNameMap[sale.item_name], saleTime, true);
      if (match) matchType = "name";
    }
    */

    if (match) {
      used.add(match);
      decided.push({ sale, match, matchType });
    } else {
      /*
      if (!(sale.float_val > 0) && FLOATLESS_SOURCES.has(sale.source)) {
        // Defer to pass 2 so exact float matches claim their purchases first.
        fallbackQueue.push(sale);
      } else {
        decided.push({ sale, match: null, matchType: "none" });
      }
      */
      decided.push({ sale, match: null, matchType: "none" });
    }
  }

  // 4. Float-fallback for float-less skin markets (Aim/Avan): match a no-float
  //    skin sale to a float-bearing purchase of the same name.
  // DISABLED per user request for now
  /*
  for (const sale of fallbackQueue) {
    const saleTime = getTxDate(sale).getTime();
    const candidates = buyFloatByName[sale.item_name] || [];
    let best = null;
    for (const b of candidates) {
      if (used.has(b)) continue;

      const bt = getTxDate(b).getTime();
      if (saleTime < tradeHoldUnlockTime(bt)) continue; // still locked at sale time

      if (!best || getTxDate(b) > getTxDate(best)) best = b; // closest (latest) eligible purchase
    }
    if (best) {
      used.add(best);
      decided.push({ sale, match: best, matchType: "name_float" });
    } else {
      decided.push({ sale, match: null, matchType: "none" });
    }
  }
  */

  // 5. Build results (order is irrelevant downstream — the table re-sorts).
  return decided.map(({ sale, match, matchType }) => {
    const buyPrice = match ? match.price : 0;
    const profit = sale.price - buyPrice;

    // Use merged pattern/phase/float from whichever transaction has it
    const mergedFloat = sale.float_val || (match ? match.float_val : 0);
    const mergedPattern =
      sale.pattern !== -1 && sale.pattern !== undefined
        ? sale.pattern
        : match && match.pattern !== undefined
          ? match.pattern
          : -1;
    const mergedPhase = sale.phase || (match ? match.phase : "");

    return {
      item_name: sale.item_name,
      signature: generateSignature(sale.item_name, mergedFloat, mergedPattern),

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
    };
  });
}

export function matchInventory(inventoryItems, allBuys) {
  // 1. Indexing
  const buyFloatMap = {}; // FloatSignature -> [Buys]
  const buyNameMap = {};  // name -> [Buys]
  const buyAssetMap = {}; // AssetID -> [Buys] (for DMarket)

  allBuys.forEach((b) => {
    if (b.float_val > 0) {
      const floatSig = `${b.item_name}-${parseFloat(b.float_val).toFixed(8)}`;
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
      const floatSig = `${item.item_name}-${parseFloat(item.float_val).toFixed(8)}`;
      if (buyFloatMap[floatSig]) {
        match = buyFloatMap[floatSig][0];
      }
    }

    // C: Name-based matching (if float === 0)
    // DISABLED per user request for now
    /*
    if (!match && (!item.float_val || item.float_val === 0)) {
      if (buyNameMap[item.item_name]) {
        match = buyNameMap[item.item_name][0];
      }
    }
    */

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
