import { getFilteredTransactions } from "./ui_reports.js";
import { formatDate } from "../utils.js";
import { getBulkRatesMap, getRateFromMap } from "../currency.js";

let currentSortCol = "Sell Date";
let sortAsc = false;
window.priceOverrides = window.priceOverrides || { buy: {}, sell: {} };

let currentPage = 1;
let pageSize = 500;

// Cached data — avoids re-computing currency conversion on sort/page changes
let cachedRowsData = null;
let cachedTotalProfit = 0;

// DOM pool — cached TR elements for instant sort reordering
let cachedTRs = new Map();

export function initTable(state) {
  document.getElementById("report-start-month")?.addEventListener("change", () => { cachedRowsData = null; cachedTRs.clear(); renderTable(state); });
  document.getElementById("report-end-month")?.addEventListener("change", () => { cachedRowsData = null; cachedTRs.clear(); renderTable(state); });
  document.getElementById("include-buys-checkbox")?.addEventListener("change", () => { cachedRowsData = null; cachedTRs.clear(); renderTable(state); });

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
    cachedRowsData = null;
    cachedTRs.clear();
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

  // Event Delegation — unified click-to-edit + profit updates
  const tbody = document.getElementById("table-body");
  const profitBadge = document.getElementById("ui-total-profit");
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      const container = e.target.closest(".editable-price, .editable-source, .editable-date");
      if (!container || container.querySelector("input")) return;

      const parentCell = container.closest(".table-input-buy, .table-input-sell");
      if (!parentCell) return;
      const key = parentCell.dataset.key;
      const type = parentCell.classList.contains("table-input-buy") ? "buy" : "sell";

      if (container.classList.contains("editable-price")) {
        const valSpan = container.querySelector(".price-val");
        const currentVal = valSpan ? valSpan.textContent.trim() : "0.00";
        const input = document.createElement("input");
        input.type = "number";
        input.step = "0.01";
        input.className = "active-edit";
        input.value = currentVal;
        valSpan.style.display = "none";
        container.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
          const parsedVal = parseFloat(input.value) || 0;
          if (!window.txOverrides[type][key]) window.txOverrides[type][key] = {};
          window.txOverrides[type][key].price = parsedVal;
          try { chrome.storage.local.set({ txOverrides: window.txOverrides }); } catch (e) {}

          cachedRowsData = null;
          cachedTRs.clear();
          renderTable(state);
        };
        input.addEventListener("blur", save, { once: true });
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
          if (ev.key === "Escape") { valSpan.textContent = currentVal; valSpan.style.display = ""; if (input.parentNode) input.remove(); }
        });
      }

      else if (container.classList.contains("editable-source")) {
        const currentVal = container.textContent.trim();
        const isUnsold = currentVal === "—" || currentVal === "Unsold" || currentVal === "N/A";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "active-edit source-edit";
        input.placeholder = "N/A";
        input.value = isUnsold ? "" : currentVal;

        const oldText = container.textContent;
        container.textContent = "";
        container.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
          let newVal = input.value.trim();
          if (!newVal) newVal = "N/A";
          if (!window.txOverrides[type][key]) window.txOverrides[type][key] = {};
          window.txOverrides[type][key].source = newVal;
          try { chrome.storage.local.set({ txOverrides: window.txOverrides }); } catch (e) {}
          
          cachedRowsData = null;
          cachedTRs.clear();
          renderTable(state);
        };
        input.addEventListener("blur", save, { once: true });
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
          if (ev.key === "Escape") { container.textContent = oldText; }
        });
      }

      else if (container.classList.contains("editable-date")) {
        const input = document.createElement("input");
        input.type = "datetime-local";
        input.className = "active-edit date-edit";

        const rawDateStr = container.dataset.raw;
        if (rawDateStr && rawDateStr !== "null" && rawDateStr !== "undefined") {
          try {
            const d = new Date(rawDateStr);
            if (!isNaN(d.getTime())) {
              const localISOTime = (new Date(d.getTime() - d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
              input.value = localISOTime;
            }
          } catch (e) {}
        }

        const oldText = container.textContent;
        container.textContent = "";
        container.appendChild(input);
        input.focus();
        if (input.showPicker) {
           try { input.showPicker(); } catch(e){} // Catch errors if showPicker fails
        }

        const save = () => {
          const newVal = input.value;
          if (!newVal) {
            container.textContent = "N/A Date";
            if (window.txOverrides[type][key]) {
               delete window.txOverrides[type][key].date;
            }
          } else {
            const newDateObj = new Date(newVal);
            if (!window.txOverrides[type][key]) window.txOverrides[type][key] = {};
            window.txOverrides[type][key].date = newDateObj.toISOString();
            container.textContent = fmtD(window.txOverrides[type][key].date);
          }
          try { chrome.storage.local.set({ txOverrides: window.txOverrides }); } catch (e) {}
          
          cachedRowsData = null;
          cachedTRs.clear();
          renderTable(state);
        };
        input.addEventListener("blur", save, { once: true });
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
          if (ev.key === "Escape") { container.textContent = oldText; }
        });
      }
    });
  }
}

// Update profit cells for a single row after price edit
function updateRowProfit(tr, profitBadge) {
  const buySpan = tr.querySelector(".table-input-buy .price-val");
  const sellSpan = tr.querySelector(".table-input-sell .price-val");
  if (!buySpan || !sellSpan) return;

  const bVal = parseFloat(buySpan.textContent.trim()) || 0;
  const sVal = parseFloat(sellSpan.textContent.trim()) || 0;
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

    // Update the row in cache and recalculate stats
    const bKey = tr.querySelector(".table-input-buy").dataset.key;
    if (cachedRowsData) {
      const rowObj = cachedRowsData.find(r => r.buyKey === bKey);
      if (rowObj) {
        rowObj.bPriceUsd = bVal;
        rowObj.sPriceUsd = sVal;
        rowObj.profitUsd = pUSD;
        rowObj.profitPerc = pPerc;
        updateStatsBar(cachedRowsData);
      }
    }
  }
}

// Inline Statistics Bar update
function updateStatsBar(rowsData) {
  const statsBar = document.getElementById("stats-bar");
  if (!statsBar) return;
  
  if (!rowsData || rowsData.length === 0) {
    statsBar.style.display = "none";
    return;
  }
  
  const statDeals = document.getElementById("stat-deals");
  const statBest = document.getElementById("stat-best");
  const statBestPerc = document.getElementById("stat-best-perc");
  const statWorst = document.getElementById("stat-worst");
  const statWorstPerc = document.getElementById("stat-worst-perc");
  const statAvg = document.getElementById("stat-avg");
  const statAvgTime = document.getElementById("stat-avg-time");
  const statAvgDay = document.getElementById("stat-avg-day");
  const statAvgWeek = document.getElementById("stat-avg-week");
  const statAvgMonth = document.getElementById("stat-avg-month");

  let maxProfit = -Infinity, minProfit = Infinity;
  let maxPerc = -Infinity, minPerc = Infinity;
  let totalRealizedProfit = 0;
  let realizedDeals = 0;
  let earliestDate = Infinity, latestDate = -Infinity;
  let totalDealTimeMs = 0;

  for (const row of rowsData) {
    if (row.bPriceUsd > 0 && row.sPriceUsd > 0) {
       realizedDeals++;
       totalRealizedProfit += row.profitUsd;
       
       if (row.profitUsd > maxProfit) maxProfit = row.profitUsd;
       if (row.profitUsd < minProfit) minProfit = row.profitUsd;
       if (row.profitPerc > maxPerc) maxPerc = row.profitPerc;
       if (row.profitPerc < minPerc) minPerc = row.profitPerc;
       if (row.sDate) {
         const t = new Date(row.sDate).getTime();
         if (!isNaN(t)) {
            if (t < earliestDate) earliestDate = t;
            if (t > latestDate) latestDate = t;
         }
       }
       if (row.bDate && row.sDate) {
         const bT = new Date(row.bDate).getTime();
         const sT = new Date(row.sDate).getTime();
         if (!isNaN(bT) && !isNaN(sT) && sT >= bT) {
           totalDealTimeMs += (sT - bT);
         }
       }
    }
  }

  const statRealized = document.getElementById("stat-realized-deals");

  statsBar.style.display = "flex";
  statDeals.textContent = rowsData.length;
  if (statRealized) statRealized.textContent = realizedDeals + " matched";
  
  if (realizedDeals > 0) {
    statBest.textContent = (maxProfit >= 0 ? "+$" : "-$") + Math.abs(maxProfit).toFixed(2);
    statBest.className = "stat-value " + (maxProfit > 0 ? "pos-profit" : (maxProfit < 0 ? "neg-profit" : "zero-profit"));
    statBestPerc.textContent = (maxPerc >= 0 ? "+" : "") + maxPerc.toFixed(2) + "%";
    statBestPerc.className = "stat-sub " + (maxPerc > 0 ? "pos-profit" : (maxPerc < 0 ? "neg-profit" : "zero-profit"));
    
    statWorst.textContent = (minProfit >= 0 ? "+$" : "-$") + Math.abs(minProfit).toFixed(2);
    statWorst.className = "stat-value " + (minProfit > 0 ? "pos-profit" : (minProfit < 0 ? "neg-profit" : "zero-profit"));
    statWorstPerc.textContent = (minPerc >= 0 ? "+" : "") + minPerc.toFixed(2) + "%";
    statWorstPerc.className = "stat-sub " + (minPerc > 0 ? "pos-profit" : (minPerc < 0 ? "neg-profit" : "zero-profit"));
    
    const avgProfit = totalRealizedProfit / realizedDeals;
    statAvg.textContent = (avgProfit >= 0 ? "+$" : "-$") + Math.abs(avgProfit).toFixed(2);
    statAvg.className = "stat-value " + (avgProfit > 0 ? "pos-profit" : (avgProfit < 0 ? "neg-profit" : "zero-profit"));

    if (statAvgTime) {
      if (totalDealTimeMs > 0 && realizedDeals > 0) {
        statAvgTime.textContent = formatDealTime(totalDealTimeMs / realizedDeals);
        statAvgTime.className = "stat-sub text-muted";
        statAvgTime.style.visibility = "visible";
      } else {
        statAvgTime.style.visibility = "hidden";
      }
    }

    let daysDiff = 1;
    let monthsDiff = 1;
    const startStr = document.getElementById("report-start-month")?.value;
    const endStr = document.getElementById("report-end-month")?.value;
    
    if (startStr && endStr) {
       const [sy, sm] = startStr.split("-").map(Number);
       const [ey, em] = endStr.split("-").map(Number);
       monthsDiff = (ey - sy) * 12 + (em - sm) + 1;
       if (monthsDiff < 1) monthsDiff = 1;

       const startDate = new Date(sy, sm - 1, 1);
       const endDate = new Date(ey, em, 0); // last day
       const today = new Date();
       const effectiveEnd = (endDate > today) ? today : endDate;
       daysDiff = (effectiveEnd - startDate) / (1000 * 60 * 60 * 24);
       if (daysDiff < 1) daysDiff = 1;
    } else if (earliestDate !== Infinity && latestDate !== -Infinity) {
       daysDiff = (latestDate - earliestDate) / (1000 * 60 * 60 * 24);
       if (daysDiff < 1) daysDiff = 1;
       monthsDiff = daysDiff / 30.44;
       if (monthsDiff < 1) monthsDiff = 1;
    }
    
    const avgDay = totalRealizedProfit / daysDiff;
    const avgWeek = avgDay * 7;
    const avgMonth = totalRealizedProfit / monthsDiff;

    statAvgDay.textContent = (avgDay >= 0 ? "+$" : "-$") + Math.abs(avgDay).toFixed(0) + "/24h";
    statAvgDay.className = "stat-value " + (avgDay > 0 ? "pos-profit" : (avgDay < 0 ? "neg-profit" : "zero-profit"));
    
    statAvgWeek.textContent = (avgWeek >= 0 ? "+$" : "-$") + Math.abs(avgWeek).toFixed(0) + "/7d";
    statAvgWeek.className = "stat-value " + (avgWeek > 0 ? "pos-profit" : (avgWeek < 0 ? "neg-profit" : "zero-profit"));
    
    statAvgMonth.textContent = (avgMonth >= 0 ? "+$" : "-$") + Math.abs(avgMonth).toFixed(0) + "/30d";
    statAvgMonth.className = "stat-value " + (avgMonth > 0 ? "pos-profit" : (avgMonth < 0 ? "neg-profit" : "zero-profit"));
  } else {
    const empty = () => { return "—"; };
    statBest.textContent = empty(); statBest.className = "stat-value";
    statBestPerc.textContent = empty(); statBestPerc.className = "stat-sub";
    statWorst.textContent = empty(); statWorst.className = "stat-value";
    statWorstPerc.textContent = empty(); statWorstPerc.className = "stat-sub";
    statAvg.textContent = empty(); statAvg.className = "stat-value";
    if (statAvgTime) statAvgTime.style.visibility = "hidden";
    statAvgDay.textContent = "+$0/24h"; statAvgDay.className = "stat-value";
    statAvgWeek.textContent = "+$0/7d"; statAvgWeek.className = "stat-value";
    statAvgMonth.textContent = "+$0/30d"; statAvgMonth.className = "stat-value";
  }
}

// Format average block deal time
function formatDealTime(ms) {
  if (ms <= 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  if (hrs < 24) return `${hrs}h ${m}m`;
  const days = Math.floor(hrs / 24);
  const h = hrs % 24;
  return `${days}d ${h}h`;
}

// Format date helper
function fmtD(d) {
  if (!d) return "—";
  const o = new Date(d);
  if (isNaN(o.getTime())) return "—";
  return o.getFullYear() + "-" + 
         String(o.getMonth()+1).padStart(2,'0') + "-" + 
         String(o.getDate()).padStart(2,'0') + ", " + 
         String(o.getHours()).padStart(2,'0') + ":" + 
         String(o.getMinutes()).padStart(2,'0');
}

// Sort in-place
function sortRows(rowsData) {
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
}

// Row key for DOM pool
function rowKey(row) {
  return row.domKey;
}

// Build HTML for a single row
function buildRowHtml(row) {
  const bDateDisplay = (!row.bDate || (row.bSource === "N/A" && !row.bDate)) ? "N/A Date" : fmtD(row.bDate);
  const sDateDisplay = (!row.sDate || ((row.sSource === "N/A" || row.sSource === "Unsold") && !row.sDate)) ? "N/A Date" : fmtD(row.sDate);
  const sellDisplay = row.sSource === "Unsold" ? "Unsold" : row.sSource;

  let metaStr = '';
  if(row.float) metaStr += `Float: <span class='meta-tag'>${row.float.toFixed(8)}</span>`;
  if(row.pattern !== -1 && row.pattern !== undefined && row.pattern !== null) {
    if (metaStr) metaStr += ' &nbsp; ';
    metaStr += `Pattern: <span class='meta-tag'>${row.pattern}</span>`;
  }
  
  const specialBadge = row.raw.phase ? ` <span class='meta-tag meta-special'>${row.raw.phase}</span>` : "";
  const profitClass = row.profitUsd > 0 ? "pos-profit" : (row.profitUsd < 0 ? "neg-profit" : "zero-profit");
  const roiClass = row.profitPerc > 0 ? "pos-profit" : (row.profitPerc < 0 ? "neg-profit" : "zero-profit");

  const buyRawDateStr = row.bDate ? new Date(row.bDate).toISOString() : "";
  const sellRawDateStr = row.sDate ? new Date(row.sDate).toISOString() : "";

  return `<tr>
    <td><div class="item-main"><span class="item-name">${row.item}${specialBadge}</span><span class="item-meta">${metaStr}</span></div></td>
    <td><div class="item-main table-input-buy" data-key="${row.buyKey}">
        <span class="editable-date text-muted" data-raw="${buyRawDateStr}" title="Click to edit">${bDateDisplay}</span>
        <span class="item-meta editable-source" title="Click to edit">${row.bSource}</span>
    </div></td>
    <td class="num-col"><span class="editable-price table-input-buy" data-key="${row.buyKey}"><span class="price-sign">$</span><span class="price-val">${row.bPriceUsd.toFixed(2)}</span></span></td>
    <td><div class="item-main table-input-sell" data-key="${row.sellKey}">
        <span class="editable-date text-muted" data-raw="${sellRawDateStr}" title="Click to edit">${sDateDisplay}</span>
        <span class="item-meta editable-source" title="Click to edit">${sellDisplay}</span>
    </div></td>
    <td class="num-col"><span class="editable-price table-input-sell" data-key="${row.sellKey}"><span class="price-sign">$</span><span class="price-val">${row.sPriceUsd.toFixed(2)}</span></span></td>
    <td class="num-col td-profit ${profitClass}">$${row.profitUsd.toFixed(2)}</td>
    <td class="num-col td-profit ${roiClass}">${row.profitPerc.toFixed(2)}%</td>
  </tr>`;
}

// Render rows with DOM pooling — reuses TR elements on sort/page instead of innerHTML
function renderRows(rowsData, tbody) {
  const totalItems = rowsData.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedRows = rowsData.slice(startIndex, endIndex);

  // Check if all needed TRs are in cache
  const canReuse = paginatedRows.length > 0 && paginatedRows.every(row => cachedTRs.has(rowKey(row)));

  // Detach tbody from live document to prevent layout during mutations
  const table = tbody.parentNode;
  const tbodyNext = tbody.nextSibling;
  table.removeChild(tbody);

  if (canReuse) {
    // FAST PATH: reorder existing TR nodes (no HTML parsing, no layout)
    tbody.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const row of paginatedRows) {
      fragment.appendChild(cachedTRs.get(rowKey(row)));
    }
    tbody.appendChild(fragment);
  } else {
    // FULL PATH: build via innerHTML + cache all TRs
    let html = '';
    for (const row of paginatedRows) {
      html += buildRowHtml(row);
    }
    tbody.innerHTML = html;

    // Cache newly created TRs
    const trs = tbody.querySelectorAll('tr');
    for (let i = 0; i < paginatedRows.length; i++) {
      cachedTRs.set(rowKey(paginatedRows[i]), trs[i]);
    }
  }

  // Re-attach tbody
  table.insertBefore(tbody, tbodyNext);

  // Pagination controls
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

  // FAST PATH: cached data (sort/page change only)
  if (cachedRowsData) {
    sortRows(cachedRowsData);
    renderRows(cachedRowsData, tbody);

    const scrollContainer = document.querySelector('.table-scroll-container');
    if (scrollContainer) scrollContainer.scrollTop = 0;

    profitBadge.textContent = (cachedTotalProfit >= 0 ? "+$" : "-$") + Math.abs(cachedTotalProfit).toFixed(2);
    profitBadge.className = "profit-badge " + (cachedTotalProfit >= 0 ? "pos" : "neg");
    return;
  }

  // FULL PATH: filter + currency conversion (only on fetch/filter change)
  const filterData = getFilteredTransactions(state);
  if (!filterData || filterData.filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No synced data for this period. Click Sync Data to begin.</td></tr>`;
    profitBadge.textContent = "$0.00";
    profitBadge.className = "profit-badge";
    const statsBar = document.getElementById("stats-bar");
    if (statsBar) statsBar.style.display = "none";
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

    let buyDateStr = m.buy_created_at || null;
    let sellDateStr = m.sell_created_at || null;
    let bSourceStr = m.buy_source || "N/A";
    let sSourceStr = m.sell_source || "N/A";
    const buyKey = m.buy_tx_id || ("b-" + encodeURIComponent(m.item_name) + "-" + idx);
    const sellKey = m.sell_tx_id || ("s-" + encodeURIComponent(m.item_name) + "-" + idx);
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
      bDate: buyDateStr,
      sDate: sellDateStr,
      bPriceUsd: buyPriceUSD,
      sPriceUsd: sellPriceUSD,
      profitUsd: profitUSD,
      profitPerc: profitPerc,
      bSource: bSourceStr,
      sSource: sSourceStr,
      buyKey: buyKey,
      sellKey: sellKey,
      domKey: buyKey + '|' + sellKey + '|' + idx
    };
  });

  cachedRowsData = rowsData;
  cachedTotalProfit = 0;
  for (const row of rowsData) cachedTotalProfit += row.profitUsd;

  sortRows(rowsData);
  renderRows(rowsData, tbody);

  const scrollContainer = document.querySelector('.table-scroll-container');
  if (scrollContainer) scrollContainer.scrollTop = 0;

  profitBadge.textContent = (cachedTotalProfit >= 0 ? "+$" : "-$") + Math.abs(cachedTotalProfit).toFixed(2);
  profitBadge.className = "profit-badge " + (cachedTotalProfit >= 0 ? "pos" : "neg");
  
  updateStatsBar(cachedRowsData);
}
