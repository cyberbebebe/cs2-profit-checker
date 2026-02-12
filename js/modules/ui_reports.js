import { matchTransactions } from "../processor.js";
import { log, formatDate, fitColumns, downloadJSON } from "../utils.js";
import { getRatesMap, getRateFromMap } from "../currency.js";

export function initReports(state) {
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
      const [year, month] = document
        .getElementById("report-month")
        .value.split("-");

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const filtered = matches.filter((m) => {
        const dateToCheck = m.sell_verified_at || m.sell_created_at;
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

      const [cnyMap, eurMap] = await Promise.all([
        getRatesMap("CNY", "USD", startStr, endStr),
        getRatesMap("EUR", "USD", startStr, endStr),
      ]);

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

        const buyDate = m.buy_verified_at || m.buy_created_at || new Date();
        const sellDate = m.sell_verified_at || m.sell_created_at;

        const buyPriceUSD = convertToUSD(m.buy_price, m.buy_currency, buyDate);
        const sellPriceUSD = convertToUSD(
          m.sell_price,
          m.sell_currency,
          sellDate,
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
          "Buy Date": formatDate(buyDate),
          "Sell Source": m.sell_source,
          "Sell Income ($)": parseFloat(sellPriceUSD.toFixed(2)),
          "Sell Date": formatDate(sellDate),
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
      XLSX.writeFile(wb, `Profit_Report_${year}-${month}.xlsx`);
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
      const [yearStr, monthStr] = document
        .getElementById("report-month")
        .value.split("-");
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      const targetCurrency = document.getElementById("currency-select").value;

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      log(`Fetching rates for ${yearStr}-${monthStr}...`);

      // const startStr = startDate.toISOString().split("T")[0];
      const today = new Date();
      const effectiveEndDate = endDate > today ? today : endDate;
      const endStr = effectiveEndDate.toISOString().split("T")[0];

      const bufferDate = new Date(startDate);
      bufferDate.setDate(bufferDate.getDate() - 7);
      const bufferStr = bufferDate.toISOString().split("T")[0];

      // Download rates
      // 1. Target Currency Rate (USD -> PLN/EUR/etc)
      // 2. Source Currency Rates (CNY -> USD, EUR -> USD)

      const [usdToTargetMap, cnyToUsdMap, eurToUsdMap] = await Promise.all([
        getRatesMap("USD", targetCurrency, bufferStr, endStr),
        getRatesMap("CNY", "USD", bufferStr, endStr),
        getRatesMap("EUR", "USD", bufferStr, endStr),
      ]);

      const wb = XLSX.utils.book_new();

      // Helper: Universal Converter
      const getPrices = (item) => {
        let priceUSD = item.price;

        // 1. To USD
        if (item.currency === "CNY") {
          const r = getRateFromMap(item.created_at, cnyToUsdMap);
          if (r > 0) priceUSD = item.price * r;
        } else if (item.currency === "EUR") {
          const r = getRateFromMap(item.created_at, eurToUsdMap);
          if (r > 0) priceUSD = item.price * r;
        }

        // 2. Convert to Target
        let priceTarget = priceUSD;
        if (targetCurrency !== "USD") {
          const r = getRateFromMap(item.created_at, usdToTargetMap);
          if (r > 0) priceTarget = priceUSD * r;
        }

        return { usd: priceUSD, target: priceTarget };
      };

      // SHEET 1: BUYS
      const monthlyBuys = state.allBuys.filter(
        (b) => b.created_at >= startDate && b.created_at <= endDate,
      );

      const buysRows = monthlyBuys.map((b) => {
        const prices = getPrices(b);
        return {
          "Item Name": b.item_name,
          Float: b.float_val ? b.float_val.toFixed(8) : "-",
          Pattern: b.pattern,
          Phase: b.phase || "",
          "Buy Date": formatDate(b.created_at),
          "Buy Source": b.source,
          "Tx ID": b.tx_id,
          "Price (USD)": parseFloat(prices.usd.toFixed(2)),
          [`Price (${targetCurrency})`]: parseFloat(prices.target.toFixed(2)),
        };
      });

      const totalBuyLocal = buysRows.reduce(
        (sum, r) => sum + r[`Price (${targetCurrency})`],
        0,
      );
      buysRows.push({});
      buysRows.push({
        "Item Name": "TOTAL SPENT:",
        [`Price (${targetCurrency})`]: parseFloat(totalBuyLocal.toFixed(2)),
      });

      const wsBuys = XLSX.utils.json_to_sheet(buysRows);
      wsBuys["!autofilter"] = { ref: "A1:I1" };
      wsBuys["!cols"] = fitColumns(buysRows);
      XLSX.utils.book_append_sheet(wb, wsBuys, "Buys");

      // SHEET 2: SALES
      const monthlySales = state.allSales.filter(
        (s) => s.created_at >= startDate && s.created_at <= endDate,
      );

      const salesRows = monthlySales.map((s) => {
        const prices = getPrices(s);
        return {
          "Item Name": s.item_name,
          Float: s.float_val ? s.float_val.toFixed(8) : "-",
          Pattern: s.pattern,
          Phase: s.phase || "",
          "Sell Date": formatDate(s.created_at),
          "Sell Source": s.source,
          "Tx ID": s.tx_id,
          "Income (USD)": parseFloat(prices.usd.toFixed(2)),
          [`Income (${targetCurrency})`]: parseFloat(prices.target.toFixed(2)),
        };
      });

      const totalSellLocal = salesRows.reduce(
        (sum, r) => sum + r[`Income (${targetCurrency})`],
        0,
      );
      salesRows.push({});
      salesRows.push({
        "Item Name": "TOTAL INCOME:",
        [`Income (${targetCurrency})`]: parseFloat(totalSellLocal.toFixed(2)),
      });

      const wsSales = XLSX.utils.json_to_sheet(salesRows);
      wsSales["!autofilter"] = { ref: "A1:I1" };
      wsSales["!cols"] = fitColumns(salesRows);
      XLSX.utils.book_append_sheet(wb, wsSales, "Sales");

      const stockData = [["Stocktaking", "Feature Coming Soon"]];
      const wsStock = XLSX.utils.aoa_to_sheet(stockData);
      XLSX.utils.book_append_sheet(wb, wsStock, "Stocktaking");

      XLSX.writeFile(
        wb,
        `Tax_Report_${targetCurrency}_${yearStr}-${monthStr}.xlsx`,
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
