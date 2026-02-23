import { log } from "./utils.js";

const ratesCache = {};

export async function getRatesMap(from, to, startDateStr, endDateStr) {
  if (from === to) return {};

  const cacheKey = `${from}_${to}_${startDateStr}_${endDateStr}`;
  if (ratesCache[cacheKey]) return ratesCache[cacheKey];

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 365) {
    log(
      `Period ${diffDays} days is too long for NBP/API. Splitting request...`,
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

    const results = await Promise.all(
      chunks.map((chunk) =>
        fetchRatesInternal(from, to, chunk.sStr, chunk.eStr),
      ),
    );

    results.forEach((map) => {
      Object.assign(mergedMap, map);
    });

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

    // NBP API (PLN)
    if (to === "PLN" && from !== "PLN") {
      url = `https://api.nbp.pl/api/exchangerates/rates/a/${from}/${startStr}/${endStr}/?format=json`;
    }
    // Frankfurter (Direct & Cross rates)
    else {
      url = `https://api.frankfurter.app/${startStr}..${endStr}?from=${from}&to=${to}`;
    }

    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      // NBP
      if (data.rates && Array.isArray(data.rates)) {
        data.rates.forEach((r) => {
          map[r.effectiveDate] = r.mid;
        });
      }
      // Frankfurter
      else if (data.rates && !Array.isArray(data.rates)) {
        for (const [date, rates] of Object.entries(data.rates)) {
          if (rates[to]) map[date] = rates[to];
        }
      }
    } else {
      if (resp.status !== 404) {
        console.warn(
          `[Currency] Failed to fetch ${from}->${to}: Status ${resp.status}`,
        );
      }
    }

    if (Object.keys(map).length === 0 && to === "BGN" && from !== "EUR") {
      log(
        `[Currency] Direct BGN missing for ${startStr}. Falling back to EUR...`,
      );
      const eurMap = await fetchRatesInternal(from, "EUR", startStr, endStr);
      for (const date in eurMap) {
        map[date] = eurMap[date] * 1.95583;
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

  // Find newest available rate
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
    const resp = await fetch("https://api.frankfurter.app/currencies");
    if (!resp.ok) throw new Error("Failed to fetch currencies list");

    const data = await resp.json();

    data["USD"] = "US Dollar";
    data["EUR"] = "Euro";
    data["PLN"] = "Polish Zloty";
    data["BGN"] = "Bulgarian Lev";

    return data;
  } catch (e) {
    console.error(
      "[Currency] Could not load dynamic currencies, using defaults.",
      e,
    );
    // Якщо API лежить, повертаємо наш "залізний" мінімум
    return {
      USD: "US Dollar",
      EUR: "Euro",
      PLN: "Polish Zloty",
      BGN: "Bulgarian Lev",
    };
  }
}
