import { getFilteredTransactions } from "./ui_reports.js";
import { formatDate } from "../utils.js";
import { getBulkRatesMap, getRateFromMap } from "../currency.js";

let currentSortCol = "Sell Date";
let sortAsc = false;
window.priceOverrides = window.priceOverrides || { buy: {}, sell: {} };

let currentPage = 1;
let pageSize = 50;

export function initTable(state) {
  document.getElementById("report-start-month")?.addEventListener("change", () => renderTable(state));
  document.getElementById("report-end-month")?.addEventListener("change", () => renderTable(state));
  document.getElementById("include-buys-checkbox")?.addEventListener("change", () => renderTable(state));

  // GPU: disable hover/transition during scroll
  const scrollContainer = document.querySelector('.table-scroll-container');
  if (scrollContainer) {
    let scrollTimer;
    scrollContainer.addEventListener('scroll', () => {
      scrollContainer.classList.add('is-scrolling');
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => scrollContainer.classList.remove('is-scrolling'), 150);
    }, { passive: true });
  }
  
  document.getElementById("btn-fetch-all")?.addEventListener("fetchComplete", () => {
    currentPage = 1;
    renderTable(state);
  });

  const headers = document.querySelectorAll("#transactions-table th");
  headers.forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-sort");
      if (col === currentSortCol) {
        sortAsc = !sortAsc;
      } else {
        currentSortCol = col;
        sortAsc = false;
      }
      currentPage = 1;
      renderTable(state);
    });
  });

  document.getElementById("btn-prev-page")?.addEventListener("click", () => {
     if (currentPage > 1) { currentPage--; renderTable(state); }
  });
  document.getElementById("btn-next-page")?.addEventListener("click", () => {
     currentPage++; renderTable(state);
  });
  document.getElementById("page-size-select")?.addEventListener("change", (e) => {
     pageSize = parseInt(e.target.value) || 50;
     currentPage = 1;
     renderTable(state);
  });

  // Event Delegation for price edits (bind once)
  const tbody = document.getElementById("table-body");
  const profitBadge = document.getElementById("ui-total-profit");
  if (tbody) {
    tbody.addEventListener("change", (e) => {
       const isBuy = e.target.classList.contains("table-input-buy");
       const isSell = e.target.classList.contains("table-input-sell");

       if (isBuy || isSell) {
           const key = e.target.getAttribute("data-key");
           const parsedVal = parseFloat(e.target.value) || 0;
           if (isBuy) window.priceOverrides.buy[key] = parsedVal;
           else window.priceOverrides.sell[key] = parsedVal;
           
           const tr = e.target.closest("tr");
           if (tr) {
               const buyInput = tr.querySelector(".table-input-buy");
               const sellInput = tr.querySelector(".table-input-sell");
               if (buyInput && sellInput) {
                   const bVal = parseFloat(buyInput.value) || 0;
                   const sVal = parseFloat(sellInput.value) || 0;
                   const cells = tr.querySelectorAll(".td-profit");
                   
                   if (cells.length >= 2) {
                       const oldText = cells[0].textContent.replace("$", "").trim();
                       const oldPUSD = parseFloat(oldText) || 0;

                       let pUSD = 0, pPerc = 0;
                       if (bVal > 0 && sVal > 0) {
                          pUSD = sVal - bVal; pPerc = (pUSD / bVal) * 100;
                       }

                       const diff = pUSD - oldPUSD;

                       const pClass = pUSD > 0 ? "pos-profit" : (pUSD < 0 ? "neg-profit" : "zero-profit");
                       const rClass = pPerc > 0 ? "pos-profit" : (pPerc < 0 ? "neg-profit" : "zero-profit");
                       cells[0].textContent = "$" + pUSD.toFixed(2);
                       cells[1].textContent = pPerc.toFixed(2) + "%";
                       cells[0].className = "num-col td-profit " + pClass;
                       cells[1].className = "num-col td-profit " + rClass;

                       if (profitBadge) {
                           let currentTotal = parseFloat(profitBadge.textContent.replace("$", "").replace("+", "").replace("-", "").trim()) || 0;
                           if (profitBadge.textContent.includes("-")) currentTotal = -Math.abs(currentTotal);
                           else currentTotal = Math.abs(currentTotal);
                           
                           currentTotal += diff;
                           profitBadge.textContent = (currentTotal >= 0 ? "+$" : "-$") + Math.abs(currentTotal).toFixed(2);
                           profitBadge.className = "profit-badge " + (currentTotal >= 0 ? "pos" : "neg");
                       }
                   }
               }
           }
       }
    });
  }
}

export async function renderTable(state) {
  const headers = document.querySelectorAll("#transactions-table th");
  headers.forEach(th => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.getAttribute("data-sort") === currentSortCol) {
      th.classList.add(sortAsc ? "sort-asc" : "sort-desc");
    }
  });

  const tbody = document.getElementById("table-body");
  const profitBadge = document.getElementById("ui-total-profit");

  const filterData = getFilteredTransactions(state);
  if (!filterData || filterData.filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No synced data for this period. Click Sync Data to begin.</td></tr>`;
    profitBadge.textContent = "$0.00";
    profitBadge.className = "profit-badge";
    return;
  }

  const { filtered, endDate } = filterData;

  const startStr = "2014-01-01";
  const endStr = endDate.toISOString().split("T")[0];
  const bulkMaps = await getBulkRatesMap(["CNY", "EUR"], "USD", startStr, endStr);
  const cnyMap = bulkMaps["CNY"] || {};
  const eurMap = bulkMaps["EUR"] || {};

  const rowsData = filtered.map((m, idx) => {
    const convertToUSD = (price, currency, date) => {
      if (!currency || currency === "USD") return price;
      let rateMap = (currency === "CNY") ? cnyMap : (currency === "EUR" ? eurMap : null);
      if (!rateMap) return 0;
      const rate = getRateFromMap(date, rateMap);
      return rate > 0 ? price * rate : 0;
    };

    const dBuy = m.buy_created_at || new Date(0);
    const dSell = m.sell_created_at || new Date(0);

    let buyPriceUSD = convertToUSD(m.buy_price, m.buy_currency, dBuy);
    let sellPriceUSD = convertToUSD(m.sell_price, m.sell_currency, dSell);

    const buyKey = m.buy_tx_id || ("b-" + encodeURIComponent(m.item_name) + "-" + idx);
    const sellKey = m.sell_tx_id || ("s-" + encodeURIComponent(m.item_name) + "-" + idx);

    if (window.priceOverrides.buy[buyKey] !== undefined) buyPriceUSD = window.priceOverrides.buy[buyKey];
    if (window.priceOverrides.sell[sellKey] !== undefined) sellPriceUSD = window.priceOverrides.sell[sellKey];

    let profitUSD = 0;
    let profitPerc = 0;
    if (buyPriceUSD > 0 && sellPriceUSD > 0) {
       profitUSD = sellPriceUSD - buyPriceUSD;
       profitPerc = (profitUSD / buyPriceUSD) * 100;
    }

    return {
      raw: m,
      item: m.item_name,
      float: m.float_val,
      pattern: m.pattern,
      bDate: m.buy_created_at,
      sDate: m.sell_created_at,
      bPriceUsd: buyPriceUSD,
      sPriceUsd: sellPriceUSD,
      profitUsd: profitUSD,
      profitPerc: profitPerc,
      bSource: m.buy_source,
      sSource: m.sell_source,
      buyKey: buyKey,
      sellKey: sellKey
    };
  });

  // Sort
  rowsData.sort((a, b) => {
    let valA = 0, valB = 0;
    switch(currentSortCol) {
      case "Item": valA = a.item; valB = b.item; break;
      case "Buy Date": valA = (a.bDate || new Date(0)).getTime(); valB = (b.bDate || new Date(0)).getTime(); break;
      case "Buy Price ($)": valA = a.bPriceUsd; valB = b.bPriceUsd; break;
      case "Sell Date": valA = (a.sDate || new Date(0)).getTime(); valB = (b.sDate || new Date(0)).getTime(); break;
      case "Sell Income ($)": valA = a.sPriceUsd; valB = b.sPriceUsd; break;
      case "Profit ($)": valA = a.profitUsd; valB = b.profitUsd; break;
      case "Profit %": valA = a.profitPerc; valB = b.profitPerc; break;
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  let totalProfit = 0;
  for (const row of rowsData) totalProfit += row.profitUsd;

  // Pagination
  const totalItems = rowsData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedRows = rowsData.slice(startIndex, endIndex);

  // Build all rows at once — CSS content-visibility handles off-screen optimization
  let htmlArray = [];
  for (const row of paginatedRows) {
     const fmtD = (d) => {
        if (!d) return "—";
        const o = new Date(d);
        if (isNaN(o.getTime())) return "—";
        return o.getFullYear() + "-" + 
               String(o.getMonth()+1).padStart(2,'0') + "-" + 
               String(o.getDate()).padStart(2,'0') + ", " + 
               String(o.getHours()).padStart(2,'0') + ":" + 
               String(o.getMinutes()).padStart(2,'0');
     };
     const bStr = fmtD(row.bDate);
     const sStr = fmtD(row.sDate);

     let metaStr = [];
     if(row.float) metaStr.push(`Float: <span class='meta-tag'>${row.float.toFixed(8)}</span>`);
     if(row.pattern !== -1 && row.pattern !== undefined && row.pattern !== null) metaStr.push(`Pattern: <span class='meta-tag'>${row.pattern}</span>`);
     
     const finalMetaStr = metaStr.join(" &nbsp; ");
     const specialBadge = row.raw.phase ? `<span class='meta-tag meta-special'>${row.raw.phase}</span>` : "";

     const profitClass = row.profitUsd > 0 ? "pos-profit" : (row.profitUsd < 0 ? "neg-profit" : "zero-profit");
     const roiClass = row.profitPerc > 0 ? "pos-profit" : (row.profitPerc < 0 ? "neg-profit" : "zero-profit");

     htmlArray.push(`<tr>
       <td>
         <div class="item-main">
           <span class="item-name">${row.item} ${specialBadge}</span>
           <span class="item-meta">${finalMetaStr}</span>
         </div>
       </td>
       <td>
         <div class="item-main">
           ${row.bSource === "N/A" ? `<input type="text" class="inline-edit" style="text-align: left; padding: 2px;" placeholder="YYYY-MM-DD" value="" />` : `<span style="white-space: nowrap;">${bStr}</span>`}
           ${row.bSource === "N/A" ? `<input type="text" class="inline-edit meta-edit" style="text-align: left; padding: 2px; color: var(--text-muted); font-size: 13px;" placeholder="N/A" value="" />` : `<span class="item-meta">${row.bSource}</span>`}
         </div>
       </td>
       <td class="num-col">
         <input type="number" step="0.01" class="inline-edit table-input-buy" data-key="${row.buyKey}" value="${row.bPriceUsd.toFixed(2)}" />
       </td>
       <td>
         <div class="item-main">
           ${row.sSource === "N/A" ? `<input type="text" class="inline-edit" style="text-align: left; padding: 2px;" placeholder="YYYY-MM-DD" value="" />` : `<span style="white-space: nowrap;">${sStr}</span>`}
           ${row.sSource === "N/A" ? `<input type="text" class="inline-edit meta-edit" style="text-align: left; padding: 2px; color: var(--text-muted); font-size: 13px;" placeholder="N/A" value="" />` : `<span class="item-meta">${row.sSource}</span>`}
         </div>
       </td>
       <td class="num-col">
         <input type="number" step="0.01" class="inline-edit table-input-sell" data-key="${row.sellKey}" value="${row.sPriceUsd.toFixed(2)}" />
       </td>
       <td class="num-col td-profit ${profitClass}">$${row.profitUsd.toFixed(2)}</td>
       <td class="num-col td-profit ${roiClass}">${row.profitPerc.toFixed(2)}%</td>
     </tr>`);
  }

  tbody.innerHTML = htmlArray.join("");

  // Reset scroll to top on sort/page change
  const scrollContainer = document.querySelector('.table-scroll-container');
  if (scrollContainer) scrollContainer.scrollTop = 0;

  profitBadge.textContent = (totalProfit >= 0 ? "+$" : "-$") + Math.abs(totalProfit).toFixed(2);
  profitBadge.className = "profit-badge " + (totalProfit >= 0 ? "pos" : "neg");

  const paginationControls = document.getElementById("table-pagination-controls");
  if (paginationControls) {
      if (totalItems > 0) {
          paginationControls.style.display = "flex";
          document.getElementById("page-info").textContent = `Showing ${startIndex + 1} - ${endIndex} of ${totalItems}`;
          document.getElementById("btn-prev-page").disabled = currentPage === 1;
          document.getElementById("btn-next-page").disabled = currentPage === totalPages;
      } else {
          paginationControls.style.display = "none";
      }
  }
}
