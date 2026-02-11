import { log } from "./utils.js";

const CACHE = {};

export async function getRatesMap(fromCcy, toCcy, startDateStr, endDateStr) {
  if (fromCcy === toCcy) return new Map();

  const cacheKey = `${fromCcy}_${toCcy}_${startDateStr}_${endDateStr}`;
  if (CACHE[cacheKey]) return CACHE[cacheKey];

  let map = new Map();

  if (toCcy === "PLN") {
    // NBP
    map = await getNBPRatesMap(fromCcy, startDateStr, endDateStr);
  } else {
    // Frankfurter
    map = await getFrankfurterRatesMap(
      fromCcy,
      toCcy,
      startDateStr,
      endDateStr,
    );
  }

  CACHE[cacheKey] = map;
  return map;
}

// NBP Logic (PLN)
async function getNBPRatesMap(currency, startDateStr, endDateStr) {
  const rateMap = new Map();
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${currency}/${startDateStr}/${endDateStr}/?format=json`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return rateMap;
    const data = await resp.json();
    if (data.rates) {
      data.rates.forEach((r) => rateMap.set(r.effectiveDate, r.mid));
    }
  } catch (e) {
    log(`NBP Fetch Error: ${e.message}`);
  }
  return rateMap;
}

// Frankfurter Logic (EUR, GBP, etc.)
async function getFrankfurterRatesMap(from, to, start, end) {
  const rateMap = new Map();
  const url = `https://api.frankfurter.dev/v1/${start}..${end}?from=${from}&to=${to}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return rateMap;
    const data = await resp.json();

    // Response format: { rates: { "2024-01-02": { "EUR": 0.95 }, ... } }
    if (data.rates) {
      for (const [date, ratesObj] of Object.entries(data.rates)) {
        if (ratesObj[to]) {
          rateMap.set(date, ratesObj[to]);
        }
      }
    }
  } catch (e) {
    log(`Frankfurter Fetch Error: ${e.message}`);
  }
  return rateMap;
}

/**
 * Helper to get rate from any Map (NBP or Frankfurter).
 */
export function getRateFromMap(dateObj, rateMap) {
  if (!rateMap || rateMap.size === 0) return 0; // Return 0 if no data

  let d = new Date(dateObj);
  for (let i = 0; i < 7; i++) {
    const dateStr = d.toISOString().split("T")[0];
    if (rateMap.has(dateStr)) {
      return rateMap.get(dateStr);
    }
    d.setDate(d.getDate() - 1);
  }
  return 0;
}
