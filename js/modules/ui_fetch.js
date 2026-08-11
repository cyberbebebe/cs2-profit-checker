import { log, serializeTransaction } from "../utils.js";

// ---------------------------------------------------------------------------
// Incremental sync helpers
//
// The strategy: on a normal sync we don't re-download a source's whole history.
// Every marketplace API here returns transactions newest-first, so each source
// is only re-fetched from 00:00 UTC of the day of its newest CACHED transaction
// forward (the "cutoff"). Older rows are already stored locally and are merged
// back in untouched. A source is fetched in FULL instead when it has no cached
// data (new market / first run), when it failed the previous sync, or when the
// user asks for a Full Resync. The cutoff rides the stored data itself, so no
// separate "last sync" timestamp needs to be persisted.
// ---------------------------------------------------------------------------

// Effective time of a transaction: the newest of created/verified (ms).
function txTime(t) {
  const c = t.created_at instanceof Date ? t.created_at.getTime() : 0;
  const v = t.verified_at instanceof Date ? t.verified_at.getTime() : 0;
  return Math.max(c, v);
}

// 00:00:00.000 UTC of the day containing `ms`.
function startOfUtcDay(ms) {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// "Re-check last 8 days" widens the incremental cutoff to catch trades that get
// reversed/cancelled after settling, behind the normal cutoff.
const REVERSAL_LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000;

// Newest cached-transaction time for one source (across sales + buys), or null
// when the source has nothing stored yet.
function newestCachedTime(state, source) {
  let max = null;
  for (const arr of [state.allSales, state.allBuys]) {
    for (const t of arr) {
      if (t.source !== source) continue;
      const ms = txTime(t);
      if (ms && (max === null || ms > max)) max = ms;
    }
  }
  return max;
}

// Group a transaction array into { source: [txns] }, restricted to `names`.
function groupBySource(arr, names) {
  const out = {};
  for (const t of arr) {
    if (!names.has(t.source)) continue;
    (out[t.source] ||= []).push(t);
  }
  return out;
}

// Merge a fresh incremental pull over the cached rows for one source. The fresh
// pull re-covers everything from the cutoff forward, so: keep cached rows that
// are strictly older than the cutoff AND weren't re-returned by the fresh pull
// (a page can spill just past the cutoff), then append all fresh rows. Result:
// fresh data wins for anything in the window (status/price updates apply), rows
// that vanished from the window drop out, and the deep history is preserved.
function mergeIncremental(cached, fresh, cutoffMs) {
  // Nothing came back. Some fetchers swallow transient errors and return [] (no
  // throw), so an empty pull is not proof the window is empty — keep the cached
  // rows intact rather than dropping the recent window. The next sync re-covers
  // it (and a real cancellation is cleaned up by Full Resync).
  if (fresh.length === 0) return cached;
  const freshIds = new Set(fresh.map((t) => t.tx_id));
  const kept = cached.filter(
    (t) => txTime(t) < cutoffMs && !freshIds.has(t.tx_id),
  );
  return [...kept, ...fresh];
}

export function initFetch(state) {
  const btn = document.getElementById("btn-fetch-all");
  const btnFullResync = document.getElementById("btn-full-resync");
  const progressFill = document.getElementById("progress-fill");
  const progressText = document.getElementById("progress-text");
  const panelReports = document.getElementById("panel-reports");

  // Paint a marketplace pill's status dot (same styling as "Check Sessions"):
  // "connected" = green success, "disconnected" = red failure, "unknown" = gray.
  const setDot = (name, status) => {
    const cardId = `card-${name.toLowerCase().replace(/\s+/g, "")}`;
    const dot = document.getElementById(cardId)?.querySelector(".status-dot");
    if (dot) dot.className = `status-dot status-${status}`;
  };

  const isEnabled = (f) => {
    const toggleId = `toggle-${f.name.toLowerCase().replace(/\s+/g, "")}`;
    const checkbox = document.getElementById(toggleId);
    return checkbox && checkbox.checked;
  };

  const runSync = async () => {
    btn.disabled = true;
    if (btnFullResync) btnFullResync.disabled = true;

    // 1. Selected (checked) marketplaces. Unselected (gray) pills are ignored.
    const enabledFetchers = state.fetchers.filter(isEnabled);

    if (enabledFetchers.length === 0) {
      alert("No marketplaces selected!");
      btn.disabled = false;
      if (btnFullResync) btnFullResync.disabled = false;
      return;
    }

    // 2. Scope: if the previous sync left failed sources, retry ONLY those that
    //    are still selected (partial sync). Otherwise sync everything again.
    const prevFailed =
      state.failedSources instanceof Set ? state.failedSources : new Set();
    const retryOnly = enabledFetchers.filter((f) => prevFailed.has(f.name));
    const isPartial = retryOnly.length > 0;
    const targetFetchers = isPartial ? retryOnly : enabledFetchers;

    // Full Resync (one-shot): re-download complete history for every target,
    // ignoring the incremental cutoff. Used for a clean rebuild / recovery.
    const forceFull = state.forceFullResync === true;
    state.forceFullResync = false;

    const recheckRecent =
      document.getElementById("recheck-recent-checkbox")?.checked === true;
    const lookbackCutoffMs = startOfUtcDay(
      Date.now() - REVERSAL_LOOKBACK_MS,
    ).getTime();

    // 3. Decide per source whether this is an incremental or a full fetch, and
    //    (for incremental) the cutoff = 00:00 UTC of its newest cached txn.
    //    Computed BEFORE we touch the arrays, since it reads the cached data.
    const plan = {};
    for (const f of targetFetchers) {
      const newest = newestCachedTime(state, f.name);
      const incremental =
        !forceFull &&
        f.supportsIncremental !== false &&
        !prevFailed.has(f.name) &&
        newest !== null;
      let cutoff = incremental ? startOfUtcDay(newest) : null;
      if (cutoff && recheckRecent && lookbackCutoffMs < cutoff.getTime()) {
        cutoff = new Date(lookbackCutoffMs);
      }
      plan[f.name] = {
        mode: incremental ? "incremental" : "full",
        cutoff,
      };
    }

    // 4. Snapshot the cached rows for the sources we're about to sync (the
    //    incremental base), then remove those sources from the live arrays.
    //    Sources NOT being synced are kept on a partial run and dropped on a
    //    full run (mirrors the previous "clear all, refetch enabled" behavior).
    const targetNames = new Set(targetFetchers.map((f) => f.name));
    const cachedSales = groupBySource(state.allSales, targetNames);
    const cachedBuys = groupBySource(state.allBuys, targetNames);

    if (!isPartial) {
      state.allSales = [];
      state.allBuys = [];
      state.inventory = [];
    } else {
      state.allSales = state.allSales.filter((t) => !targetNames.has(t.source));
      state.allBuys = state.allBuys.filter((t) => !targetNames.has(t.source));
      state.inventory = (state.inventory || []).filter(
        (t) => !targetNames.has(t.source),
      );
    }

    // Progress setup
    const totalSteps = targetFetchers.length * 2; // Sales + Buys
    let completedSteps = 0;
    const updateProgress = (actionName) => {
      completedSteps++;
      const pct = Math.round((completedSteps / totalSteps) * 100);
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `${pct}% - ${actionName} Done`;
    };

    progressText.textContent = forceFull
      ? "Full resync — re-downloading all history..."
      : isPartial
        ? "Retrying failed sources..."
        : recheckRecent
          ? "Syncing + re-checking last 8 days..."
          : "Starting...";
    progressFill.style.width = "5%";
    targetFetchers.forEach((f) => setDot(f.name, "unknown")); // reset to idle

    // 5. Fetch each target. A source "fails" if its session check fails or a
    //    data request throws — it gets a red dot and is queued for next retry.
    const newFailed = new Set();

    const promises = targetFetchers.map(async (f) => {
      const { mode, cutoff } = plan[f.name];
      f.sinceCutoff = cutoff; // Date (incremental) or null (full)
      if (typeof f.resetCache === "function") f.resetCache();
      log(`${f.name}: Fetching (${mode})...`);

      let connected = false;
      try {
        connected = await f.checkSession();
      } catch (e) {
        connected = false;
      }

      if (!connected) {
        setDot(f.name, "disconnected");
        newFailed.add(f.name);
        // Keep this source's cached data (nothing was refetched).
        state.allSales.push(...(cachedSales[f.name] || []));
        state.allBuys.push(...(cachedBuys[f.name] || []));
        updateProgress(`${f.name} Sales`);
        updateProgress(`${f.name} Buys`);
        return;
      }

      let sawError = false;
      const freshSales = [];
      const freshBuys = [];
      const fetchTask = async (taskName, fetchFn, targetArray) => {
        try {
          const data = await fetchFn();
          if (data) targetArray.push(...data);
        } catch (e) {
          sawError = true;
          log(`${f.name} ${taskName} Error: ${e.message}`);
        } finally {
          updateProgress(`${f.name} ${taskName}`);
        }
      };

      await Promise.all([
        fetchTask("Sales", () => f.getSales(), freshSales),
        fetchTask("Buys", () => f.getBuys(), freshBuys),
      ]);

      if (f.name === "Steam" || f.name === "DMarket") {
        try {
          const items = await f.getInventory();
          if (items && items.length > 0) state.inventory.push(...items);
        } catch (e) {
          log(`${f.name} Inv Error: ${e.message}`);
        }
      }

      // 6. Fold the fresh rows into state. On an incremental sync we merge them
      //    over the cached history; on a full sync they replace it. If an
      //    incremental fetch errored mid-way the fresh window may be incomplete,
      //    so we keep the cache intact and let the next sync retry in full.
      if (mode === "incremental" && sawError) {
        state.allSales.push(...(cachedSales[f.name] || []));
        state.allBuys.push(...(cachedBuys[f.name] || []));
      } else if (mode === "incremental") {
        const cMs = cutoff.getTime();
        state.allSales.push(
          ...mergeIncremental(cachedSales[f.name] || [], freshSales, cMs),
        );
        state.allBuys.push(
          ...mergeIncremental(cachedBuys[f.name] || [], freshBuys, cMs),
        );
      } else {
        state.allSales.push(...freshSales);
        state.allBuys.push(...freshBuys);
      }

      if (sawError) {
        setDot(f.name, "disconnected");
        newFailed.add(f.name);
      } else {
        setDot(f.name, "connected");
      }
    });

    await Promise.all(promises);
    state.failedSources = newFailed;

    // 7. Finish
    progressFill.style.width = "100%";
    const failedCount = newFailed.size;
    const incrementalCount = targetFetchers.filter(
      (f) => plan[f.name].mode === "incremental" && !newFailed.has(f.name),
    ).length;
    progressText.textContent =
      `${forceFull ? "Full resync" : isPartial ? "Retried failed" : "Done"}! ` +
      `Sales: ${state.allSales.length}, Buys: ${state.allBuys.length}` +
      (incrementalCount ? ` · ${incrementalCount} incremental` : "") +
      (failedCount
        ? ` · ${failedCount} failed — next sync retries only these`
        : "");

    state.dataFetched = state.allSales.length > 0 || state.allBuys.length > 0;
    if (state.dataFetched) panelReports.classList.remove("disabled");
    btn.innerHTML = failedCount
      ? "<span>🔁 Retry Failed Sources</span>"
      : "<span>🔄 Sync New Data</span>";
    btn.disabled = false;
    if (btnFullResync) btnFullResync.disabled = false;

    // Persist locally so the data survives closing/reopening the dashboard.
    // Skipped if nothing came back (so a transient failure doesn't wipe cache).
    if (state.allSales.length || state.allBuys.length || state.inventory.length) {
      try {
        await chrome.storage.local.set({
          fetchedData: {
            sales: state.allSales.map(serializeTransaction),
            buys: state.allBuys.map(serializeTransaction),
            inventory: state.inventory,
            savedAt: Date.now(),
          },
        });
      } catch (e) {
        console.warn("[Fetch] Failed to persist data:", e);
      }
    }

    // Table auto-updates after every sync (full or partial).
    btn.dispatchEvent(new Event("fetchComplete"));
  };

  btn.addEventListener("click", runSync);

  // FULL RESYNC — ignore the incremental cutoff and re-download the complete
  // history for every selected market (clean rebuild / recovery). Clears any
  // pending failed-source retry so it targets all enabled sources, not just the
  // failed subset.
  if (btnFullResync) {
    btnFullResync.addEventListener("click", () => {
      if (btn.disabled) return;
      if (
        state.dataFetched &&
        !confirm(
          "Full Resync re-downloads the ENTIRE history for every selected market. " +
            "This is slower than a normal sync. Continue?",
        )
      ) {
        return;
      }
      state.forceFullResync = true;
      state.failedSources = new Set();
      runSync();
    });
  }

  // BALANCE CHECKER
  const btnBalance = document.getElementById("btn-get-balance");
  const balanceDisplay = document.getElementById("total-balance-display");

  // Helper: currency rate
  const getConversionRate = async (from, to) => {
    if (from === to) return 1;
    try {
      const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`,
      );
      const data = await res.json();
      return data.rates[to] || 0;
    } catch (e) {
      console.error(`Rate fetch error (${from}->${to}):`, e);
      return 0;
    }
  };

  btnBalance.addEventListener("click", async () => {
    const oldText = btnBalance.textContent;
    btnBalance.disabled = true;
    btnBalance.textContent = "⏳...";
    balanceDisplay.textContent = "";

    try {
      const enabledFetchers = state.fetchers.filter(isEnabled);

      if (enabledFetchers.length === 0) {
        alert("Select marketplaces first!");
        return;
      }

      const promises = enabledFetchers.map(async (f) => {
        setDot(f.name, "unknown");
        let connected = false;
        try {
          connected = await f.checkSession();
        } catch (e) {
          connected = false;
        }
        if (!connected) {
          setDot(f.name, "disconnected"); // red: couldn't authenticate
          return { amount: 0, currency: "USD", source: f.name };
        }
        try {
          const result = await f.getBalance();
          setDot(f.name, "connected"); // green: wallet retrieved
          return { ...result, source: f.name };
        } catch (e) {
          console.error(e);
          setDot(f.name, "disconnected");
          return { amount: 0, currency: "USD", source: f.name };
        }
      });

      const balances = await Promise.all(promises);

      let totalSumUSD = 0;

      const conversionPromises = balances.map(async (b) => {
        if (b.amount <= 0) return 0;

        if (b.currency === "USD") {
          console.log(`[Balance] ${b.source}: $${b.amount.toFixed(2)}`);
          return b.amount;
        } else {
          const rate = await getConversionRate(b.currency, "USD");
          const converted = b.amount * rate;
          console.log(
            `[Balance] ${b.source}: ${b.amount} ${b.currency} -> $${converted.toFixed(2)} (Rate: ${rate})`,
          );
          return converted;
        }
      });

      const convertedAmounts = await Promise.all(conversionPromises);
      totalSumUSD = convertedAmounts.reduce((sum, val) => sum + val, 0);

      // Result Output
      balanceDisplay.textContent = `$ ${totalSumUSD.toFixed(2)}`;
    } catch (e) {
      console.error("Balance Check Error:", e);
      balanceDisplay.textContent = "Error";
    } finally {
      btnBalance.disabled = false;
      btnBalance.textContent = oldText;
    }
  });
}
