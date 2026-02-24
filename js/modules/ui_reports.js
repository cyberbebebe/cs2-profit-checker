import { matchTransactions, matchInventory } from "../processor.js";
import { log, formatDate, fitColumns, downloadJSON } from "../utils.js";
import {
  getRateFromMap,
  getAvailableCurrencies,
  getBulkRatesMap,
} from "../currency.js";

async function initCurrencyDropdown() {
  const select = document.getElementById("currency-select");
  if (!select) return;

  const currencies = await getAvailableCurrencies();

  const topCurrencies = ["USD", "EUR", "BGN"];

  select.innerHTML = "";

  topCurrencies.forEach((code) => {
    if (currencies[code]) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = `${code} - ${currencies[code]}`;
      select.appendChild(opt);
      delete currencies[code];
    }
  });

  const sortedKeys = Object.keys(currencies).sort();
  sortedKeys.forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} - ${currencies[code]}`;
    select.appendChild(opt);
  });
}

export function initReports(state) {
  initCurrencyDropdown();

  const ui = {
    btnProfitXlsx: document.getElementById("btn-profit-xlsx"),
    btnProfitJson: document.getElementById("btn-profit-json"),
    btnTaxXlsx: document.getElementById("btn-tax-xlsx"),
    btnTaxJson: document.getElementById("btn-tax-json"),
  };

  // 1. PROFIT REPORT (XLSX)
  ui.btnProfitXlsx.addEventListener("click", async () => {
    if (!state.dataFetched) {
      alert("Please fetch data first!");
      return;
    }

    const btn = ui.btnProfitXlsx;
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳ Calculating...";

    try {
      const matches = matchTransactions(state.allSales, state.allBuys);

      const startVal = document.getElementById("report-start-month").value;
      const endVal = document.getElementById("report-end-month").value;

      if (!startVal || !endVal) {
        alert("Please select both Start and End months.");
        btn.disabled = false;
        btn.textContent = oldText;
        return;
      }

      const [startYear, startMonth] = startVal.split("-");
      const startDate = new Date(
        parseInt(startYear),
        parseInt(startMonth) - 1,
        1,
      );

      const [endYear, endMonth] = endVal.split("-");
      const endDate = new Date(
        parseInt(endYear),
        parseInt(endMonth),
        0,
        23,
        59,
        59,
      );

      if (startDate > endDate) {
        alert("Start month cannot be later than End month.");
        btn.disabled = false;
        btn.textContent = oldText;
        return;
      }

      const filtered = matches.filter((m) => {
        const dateToCheck = m.sell_created_at;
        if (!dateToCheck) return false;
        return dateToCheck >= startDate && dateToCheck <= endDate;
      });

      if (filtered.length === 0) {
        alert("No sales found for this month!");
        btn.disabled = false;
        btn.textContent = oldText;
        return;
      }

      const startStr = "2014-01-01";
      const endStr = endDate.toISOString().split("T")[0];

      const bulkMaps = await getBulkRatesMap(
        ["CNY", "EUR"],
        "USD",
        startStr,
        endStr,
      );
      const cnyMap = bulkMaps["CNY"] || {};
      const eurMap = bulkMaps["EUR"] || {};

      const ws_data = filtered.map((m) => {
        const convertToUSD = (price, currency, date) => {
          if (!currency || currency === "USD") return price;

          let rateMap = null;
          if (currency === "CNY") rateMap = cnyMap;
          else if (currency === "EUR") rateMap = eurMap;
          if (!rateMap) {
            console.warn(`No rate map for currency: ${currency}`);
            return 0;
          }

          const rate = getRateFromMap(date, rateMap);
          if (rate === 0) return 0;

          return price * rate;
        };

        const displayBuyDate = m.buy_created_at;
        const conversionBuyDate = displayBuyDate || new Date();

        const displaySellDate = m.sell_created_at;
        const conversionSellDate = displaySellDate || new Date();

        const buyPriceUSD = convertToUSD(
          m.buy_price,
          m.buy_currency,
          conversionBuyDate,
        );

        const sellPriceUSD = convertToUSD(
          m.sell_price,
          m.sell_currency,
          conversionSellDate,
        );

        let profitUSD = 0;
        if (buyPriceUSD > 0) {
          profitUSD = sellPriceUSD - buyPriceUSD;
        }

        let profitPerc = 0;
        if (buyPriceUSD > 0) profitPerc = profitUSD / buyPriceUSD;

        return {
          Item: m.item_name,
          Float: m.float_val ? m.float_val.toFixed(8) : "-",
          Pattern: m.pattern,
          Phase: m.phase,
          "Buy Source": m.buy_source,
          "Buy Price ($)": parseFloat(buyPriceUSD.toFixed(2)),
          "Buy Date": formatDate(displayBuyDate),

          "Sell Source": m.sell_source,
          "Sell Income ($)": parseFloat(sellPriceUSD.toFixed(2)),
          "Sell Date": formatDate(displaySellDate),
          "Profit ($)": parseFloat(profitUSD.toFixed(2)),
          "Profit %": profitPerc,
        };
      });

      // Calculate Total JS
      const totalProfitJS = ws_data.reduce(
        (sum, row) => sum + row["Profit ($)"],
        0,
      );

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(ws_data);

      const range = XLSX.utils.decode_range(ws["!ref"]);

      if (range.e.c < 13) {
        range.e.c = 13;
        ws["!ref"] = XLSX.utils.encode_range(range);
      }

      const totalHeaderRef = XLSX.utils.encode_cell({ r: 0, c: 13 });
      ws[totalHeaderRef] = { t: "s", v: "TOTAL PROFIT" };

      const totalValueRef = XLSX.utils.encode_cell({ r: 2, c: 13 });
      const lastRow = ws_data.length + 1; // Header + Data rows

      ws[totalValueRef] = {
        t: "n",
        v: totalProfitJS,
        f: `SUM(K2:K${lastRow})`, // Formula
      };

      for (let i = 0; i < ws_data.length; i++) {
        const R = i + 2;

        // Profit ($) [Col K = 10]
        const cellK = XLSX.utils.encode_cell({ r: i + 1, c: 10 });
        if (!ws[cellK]) ws[cellK] = { t: "n", v: 0 };
        ws[cellK].f = `IF(F${R}=0, 0, I${R}-F${R})`;
        ws[cellK].v = ws_data[i]["Profit ($)"];

        // Profit % [Col L = 11]
        const cellL = XLSX.utils.encode_cell({ r: i + 1, c: 11 });
        if (!ws[cellL]) ws[cellL] = { t: "n", v: 0 };
        ws[cellL].f = `IFERROR(K${R}/F${R}, 0)`;
        ws[cellL].v = ws_data[i]["Profit %"];
        ws[cellL].z = "0.00%";
      }

      // AUTO FILTER
      ws["!autofilter"] = { ref: "A1:L1" };

      // Widths
      let cols = fitColumns(ws_data);
      if (cols[5]) cols[5].wch = Math.max(5, cols[5].wch / 2);
      if (cols[8]) cols[8].wch = Math.max(5, cols[8].wch / 2);
      if (cols[10]) cols[10].wch = Math.max(4, cols[10].wch / 2);
      if (cols[11]) cols[11].wch = Math.max(4, cols[11].wch / 3);

      if (!cols[13]) cols[13] = { wch: 15 };
      else cols[13].wch = 15;

      ws["!cols"] = cols;

      XLSX.utils.book_append_sheet(wb, ws, "Profit Report");
      XLSX.writeFile(wb, `Profit_Report_${startVal}_to_${endVal}.xlsx`);
    } catch (e) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });

  ui.btnProfitJson.addEventListener("click", () => {
    if (!state.dataFetched) return;
    const matches = matchTransactions(state.allSales, state.allBuys);
    downloadJSON(matches, "profit_dump.json");
  });

  // 3. TAX REPORT (XLSX)
  ui.btnTaxXlsx.addEventListener("click", async () => {
    if (!state.dataFetched) return;
    const btn = ui.btnTaxXlsx;
    const oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳ Generating...";

    try {
      const startVal = document.getElementById("report-start-month").value;
      const endVal = document.getElementById("report-end-month").value;
      const targetCurrency = document.getElementById("currency-select").value;

      if (!startVal || !endVal) {
        alert("Please select both Start and End months.");
        btn.disabled = false;
        btn.textContent = oldText;
        return;
      }

      const [startYearStr, startMonthStr] = startVal.split("-");
      const reportStartDate = new Date(
        parseInt(startYearStr),
        parseInt(startMonthStr) - 1,
        1,
      );

      const [endYearStr, endMonthStr] = endVal.split("-");
      const reportEndDate = new Date(
        parseInt(endYearStr),
        parseInt(endMonthStr),
        0,
        23,
        59,
        59,
      );

      if (reportStartDate > reportEndDate) {
        alert("Start month cannot be later than End month.");
        btn.disabled = false;
        btn.textContent = oldText;
        return;
      }

      let ratesStart = new Date(reportStartDate);

      if (state.allBuys.length > 0) {
        const oldestBuyDate = state.allBuys.reduce((min, b) => {
          const d = b.created_at || new Date();
          return d < min ? d : min;
        }, new Date());

        if (oldestBuyDate < ratesStart) ratesStart = oldestBuyDate;
      }

      ratesStart.setDate(ratesStart.getDate() - 7);

      const ratesEnd = new Date();

      const startStr = ratesStart.toISOString().split("T")[0];
      const endStr = ratesEnd.toISOString().split("T")[0];

      log(`Fetching direct rates from ${startStr} to ${endStr}...`);

      const usedCurrencies = new Set();
      state.allBuys.forEach((b) => usedCurrencies.add(b.currency || "USD"));
      state.allSales.forEach((s) => usedCurrencies.add(s.currency || "USD"));

      const cursArray = Array.from(usedCurrencies);
      const targetMaps = await getBulkRatesMap(
        cursArray,
        targetCurrency,
        startStr,
        endStr,
      );

      const wb = XLSX.utils.book_new();

      const getPrices = (item) => {
        const cur = item.currency || "USD";
        const dateToCheck = item.created_at || new Date();

        // Zloty fix, previous day for currency rates
        if (targetCurrency === "PLN") {
          dateToCheck.setDate(dateToCheck.getDate() - 1);
        }

        let priceTarget = item.price;
        let appliedRate = 1;

        if (cur !== targetCurrency) {
          appliedRate = getRateFromMap(dateToCheck, targetMaps[cur]);
          if (appliedRate > 0) {
            priceTarget = item.price * appliedRate;
          }
        }

        return {
          orig: item.price,
          cur: cur,
          target: priceTarget,
          rate: appliedRate,
        };
      };

      // === SHEET 1: BUYS ===
      const monthlyBuys = state.allBuys.filter(
        (b) => b.created_at >= reportStartDate && b.created_at <= reportEndDate,
      );
      const buysRows = monthlyBuys.map((b) => {
        const prices = getPrices(b);
        return {
          "Item Name": b.item_name,
          Float: b.float_val ? b.float_val.toFixed(8) : "-",
          Pattern: b.pattern !== -1 && b.pattern !== null ? b.pattern : "-",
          Phase: b.phase || "",
          "Buy Date": formatDate(b.created_at),
          "Buy Source": b.source,
          "Tx ID": b.tx_id,
          "Price (Orig)": `${prices.orig} ${prices.cur}`,
          "Exch. Rate":
            prices.rate > 0 && prices.cur !== targetCurrency
              ? prices.rate.toFixed(4)
              : "-",
          [`Price (${targetCurrency})`]: parseFloat(prices.target.toFixed(2)),
        };
      });

      const totalBuyTarget = buysRows.reduce(
        (sum, r) => sum + (r[`Price (${targetCurrency})`] || 0),
        0,
      );
      buysRows.push({});
      buysRows.push({
        "Item Name": "TOTAL SPENT:",
        [`Price (${targetCurrency})`]: parseFloat(totalBuyTarget.toFixed(2)),
      });

      const wsBuys = XLSX.utils.json_to_sheet(buysRows);
      wsBuys["!autofilter"] = { ref: "A1:J1" };
      wsBuys["!cols"] = fitColumns(buysRows);
      XLSX.utils.book_append_sheet(wb, wsBuys, "Buys");

      // === SHEET 2: SALES ===
      const monthlySales = state.allSales.filter(
        (s) => s.created_at >= reportStartDate && s.created_at <= reportEndDate,
      );
      const salesRows = monthlySales.map((s) => {
        const prices = getPrices(s);
        return {
          "Item Name": s.item_name,
          Float: s.float_val ? s.float_val.toFixed(8) : "-",
          Pattern: s.pattern !== -1 && s.pattern !== null ? s.pattern : "-",
          Phase: s.phase || "",
          "Sell Date": formatDate(s.created_at),
          "Sell Source": s.source,
          "Tx ID": s.tx_id,
          "Income (Orig)": `${prices.orig} ${prices.cur}`,
          "Exch. Rate":
            prices.rate > 0 && prices.cur !== targetCurrency
              ? prices.rate.toFixed(4)
              : "-",
          [`Income (${targetCurrency})`]: parseFloat(prices.target.toFixed(2)),
        };
      });

      const totalSellTarget = salesRows.reduce(
        (sum, r) => sum + (r[`Income (${targetCurrency})`] || 0),
        0,
      );
      salesRows.push({});
      salesRows.push({
        "Item Name": "TOTAL INCOME:",
        [`Income (${targetCurrency})`]: parseFloat(totalSellTarget.toFixed(2)),
      });

      const wsSales = XLSX.utils.json_to_sheet(salesRows);
      wsSales["!autofilter"] = { ref: "A1:J1" };
      wsSales["!cols"] = fitColumns(salesRows);
      XLSX.utils.book_append_sheet(wb, wsSales, "Sales");

      // === SHEET 3: STOCKTAKING ===
      let wsStock;

      if (state.inventory && state.inventory.length > 0) {
        const matchedInventory = matchInventory(state.inventory, state.allBuys);

        const stockRows = matchedInventory.map((item) => {
          const tempItem = {
            price: item.buy_price || 0,
            currency: item.buy_currency || "USD",
            created_at: item.buy_date || new Date(),
          };
          const prices = getPrices(tempItem);

          return {
            "Item Name": item.item_name,
            Float: item.float_val ? parseFloat(item.float_val).toFixed(9) : "-",
            Pattern:
              item.pattern !== -1 && item.pattern !== null ? item.pattern : "-",
            "Current Location": item.source,

            "Buy Source": item.buy_source,
            "Buy Date": formatDate(item.buy_date),

            "Cost Basis (Orig)": `${prices.orig} ${prices.cur}`,
            "Exch. Rate":
              prices.rate > 0 && prices.cur !== targetCurrency
                ? prices.rate.toFixed(4)
                : "-",
            [`Valuation (${targetCurrency})`]: parseFloat(
              prices.target.toFixed(2),
            ),
          };
        });

        const totalInventoryValue = stockRows.reduce(
          (sum, r) => sum + (r[`Valuation (${targetCurrency})`] || 0),
          0,
        );

        wsStock = XLSX.utils.json_to_sheet(stockRows);
        wsStock["!autofilter"] = { ref: "A1:I1" };
        wsStock["!cols"] = fitColumns(stockRows);

        // IMMUTABLE TOTAL (Top Right)
        const totalColIdx = 8;

        // Header
        const totalHeaderRef = XLSX.utils.encode_cell({
          r: 0,
          c: totalColIdx + 2,
        }); // K1
        wsStock[totalHeaderRef] = { t: "s", v: "TOTAL INVENTORY VALUE" };

        // Value -> SUM(I2:I...)
        const totalValueRef = XLSX.utils.encode_cell({
          r: 1,
          c: totalColIdx + 2,
        }); // K2
        const lastRow = stockRows.length + 1;

        wsStock[totalValueRef] = {
          t: "n",
          v: totalInventoryValue,
          f: `SUM(I2:I${lastRow})`,
        };

        const range = XLSX.utils.decode_range(wsStock["!ref"]);
        if (range.e.c < totalColIdx + 2) {
          range.e.c = totalColIdx + 2;
          wsStock["!ref"] = XLSX.utils.encode_range(range);
        }
        if (!wsStock["!cols"][totalColIdx + 2]) {
          wsStock["!cols"][totalColIdx + 2] = { wch: 25 };
        }
      } else {
        const stockData = [["Stocktaking"], ["No inventory data found."]];
        wsStock = XLSX.utils.aoa_to_sheet(stockData);
      }

      XLSX.utils.book_append_sheet(wb, wsStock, "Stocktaking");

      XLSX.writeFile(
        wb,
        `Tax_Report_${targetCurrency}_${startVal}_to_${endVal}.xlsx`,
      );
      log("Tax Report Generated.");
    } catch (e) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      btn.textContent = oldText;
      btn.disabled = false;
    }
  });

  ui.btnTaxJson.addEventListener("click", () => {
    if (!state.dataFetched) return;
    const dump = {
      meta: { date: new Date() },
      sales: state.allSales,
      buys: state.allBuys,
    };
    downloadJSON(dump, "tax_data_dump.json");
  });
}
