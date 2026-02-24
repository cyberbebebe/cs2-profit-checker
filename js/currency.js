import { log } from "./utils.js";

const ratesCache = {};

export async function getBulkRatesMap(
  usedCurrenciesArray,
  targetCurrency,
  startStr,
  endStr,
) {
  const targetMaps = {};
  const curs = usedCurrenciesArray.filter((c) => c !== targetCurrency);

  if (curs.length === 0) return targetMaps;

  // 1. NBP
  if (targetCurrency === "PLN") {
    for (const cur of curs) {
      targetMaps[cur] = await getRatesMap(cur, "PLN", startStr, endStr);
    }
    return targetMaps;
  }

  // 2. FRANKFURTER API (BULK)
  let baseCur = targetCurrency;
  let bgnMultiplier = 1;

  if (targetCurrency === "BGN") {
    baseCur = "EUR";
    bgnMultiplier = 1.95583;
  }

  const symbols = curs.filter((c) => c !== baseCur);

  try {
    if (symbols.length > 0) {
      log(
        `[Currency] Fetching BULK from ${baseCur} for symbols: ${symbols.join(",")}`,
      );
      const url = `https://api.frankfurter.dev/v1/${startStr}..${endStr}?base=${baseCur}&symbols=${symbols.join(",")}`;
      const resp = await fetch(url);

      if (resp.ok) {
        const data = await resp.json();
        symbols.forEach((c) => (targetMaps[c] = {}));

        if (data.rates) {
          for (const [date, rates] of Object.entries(data.rates)) {
            symbols.forEach((c) => {
              if (rates[c]) {
                targetMaps[c][date] = (1 / rates[c]) * bgnMultiplier;
              }
            });
          }
        }
      } else {
        console.warn(`[Currency Bulk] Failed to fetch. Status: ${resp.status}`);
      }
    }

    if (targetCurrency === "BGN" && curs.includes("EUR")) {
      targetMaps["EUR"] = {};
      let tempDate = new Date(startStr);
      const endObj = new Date(endStr);
      while (tempDate <= endObj) {
        const dStr = tempDate.toISOString().split("T")[0];
        targetMaps["EUR"][dStr] = 1.95583;
        tempDate.setDate(tempDate.getDate() + 1);
      }
    }
  } catch (e) {
    console.error("[Currency Bulk] Error:", e);
  }

  return targetMaps;
}

export async function getRatesMap(from, to, startDateStr, endDateStr) {
  if (from === to) return {};

  const cacheKey = `${from}_${to}_${startDateStr}_${endDateStr}`;
  if (ratesCache[cacheKey]) return ratesCache[cacheKey];

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isNBP = to === "PLN" && from !== "PLN";

  if (diffDays > 365 && isNBP) {
    log(
      `Period ${diffDays} days is too long for NBP API. Splitting request...`,
    );
    let mergedMap = {};
    let currentStart = new Date(start);
    const chunks = [];

    while (currentStart < end) {
      let currentEnd = new Date(currentStart);
      currentEnd.setFullYear(currentStart.getFullYear() + 1);
      if (currentEnd > end) currentEnd = new Date(end);

      const sStr = currentStart.toISOString().split("T")[0];
      const eStr = currentEnd.toISOString().split("T")[0];
      chunks.push({ sStr, eStr });

      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);
    }

    for (const chunk of chunks) {
      const map = await fetchRatesInternal(from, to, chunk.sStr, chunk.eStr);
      Object.assign(mergedMap, map);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    ratesCache[cacheKey] = mergedMap;
    return mergedMap;
  }

  const result = await fetchRatesInternal(from, to, startDateStr, endDateStr);
  ratesCache[cacheKey] = result;
  return result;
}

async function fetchRatesInternal(from, to, startStr, endStr) {
  const map = {};
  try {
    let url = "";
    if (to === "PLN" && from !== "PLN") {
      url = `https://api.nbp.pl/api/exchangerates/rates/a/${from}/${startStr}/${endStr}/?format=json`;
    } else {
      let queryTo = to;
      let isBGN = false;
      if (to === "BGN" && from !== "EUR") {
        queryTo = "EUR";
        isBGN = true;
      }
      url = `https://api.frankfurter.dev/v1/${startStr}..${endStr}?base=${from}&symbols=${queryTo}`;

      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.rates && Array.isArray(data.rates)) {
          data.rates.forEach((r) => (map[r.effectiveDate] = r.mid));
        } else if (data.rates && !Array.isArray(data.rates)) {
          for (const [date, rates] of Object.entries(data.rates)) {
            if (rates[queryTo]) map[date] = rates[queryTo];
          }
        }
      }

      if (isBGN) {
        for (const date in map) {
          map[date] = map[date] * 1.95583;
        }
      }
      return map;
    }

    // NBP Fetching
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.rates && Array.isArray(data.rates)) {
        data.rates.forEach((r) => (map[r.effectiveDate] = r.mid));
      }
    }
  } catch (e) {
    console.error(`[Currency] Error fetching ${from}->${to}:`, e);
  }
  return map;
}

export function getRateFromMap(dateObj, map) {
  if (!dateObj || !map) return 0;
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const key = `${yyyy}-${mm}-${dd}`;

  if (map[key]) return map[key];

  const tempDate = new Date(dateObj);
  for (let i = 0; i < 7; i++) {
    tempDate.setDate(tempDate.getDate() - 1);
    const k = tempDate.toISOString().split("T")[0];
    if (map[k]) return map[k];
  }
  return 0;
}

export async function getAvailableCurrencies() {
  try {
    const resp = await fetch("https://api.frankfurter.dev/v1/currencies");
    if (!resp.ok) throw new Error("Failed to fetch currencies list");

    const data = await resp.json();
    data["USD"] = "US Dollar";
    data["EUR"] = "Euro";
    data["PLN"] = "Polish Zloty";
    data["BGN"] = "Bulgarian Lev";

    return data;
  } catch (e) {
    console.error("[Currency] Could not load dynamic currencies", e);
    return {
      USD: "US Dollar",
      EUR: "Euro",
      PLN: "Polish Zloty",
      BGN: "Bulgarian Lev",
    };
  }
}
