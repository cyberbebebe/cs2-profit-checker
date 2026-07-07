import { log, serializeTransaction } from "../utils.js";

export function initFetch(state) {
  const btn = document.getElementById("btn-fetch-all");
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

  btn.addEventListener("click", async () => {
    btn.disabled = true;

    // 1. Selected (checked) marketplaces. Unselected (gray) pills are ignored.
    const enabledFetchers = state.fetchers.filter(isEnabled);

    if (enabledFetchers.length === 0) {
      alert("No marketplaces selected!");
      btn.disabled = false;
      return;
    }

    // 2. Scope: if the previous sync left failed sources, retry ONLY those that
    //    are still selected (partial sync). Otherwise sync everything again.
    const prevFailed =
      state.failedSources instanceof Set ? state.failedSources : new Set();
    const retryOnly = enabledFetchers.filter((f) => prevFailed.has(f.name));
    const isPartial = retryOnly.length > 0;
    const targetFetchers = isPartial ? retryOnly : enabledFetchers;

    // 3. Full sync starts clean; partial sync keeps the data from sources that
    //    already succeeded and only replaces the ones being retried.
    if (!isPartial) {
      state.allSales = [];
      state.allBuys = [];
      state.inventory = [];
    } else {
      const retryNames = new Set(targetFetchers.map((f) => f.name));
      state.allSales = state.allSales.filter((t) => !retryNames.has(t.source));
      state.allBuys = state.allBuys.filter((t) => !retryNames.has(t.source));
      state.inventory = (state.inventory || []).filter(
        (t) => !retryNames.has(t.source),
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

    progressText.textContent = isPartial
      ? "Retrying failed sources..."
      : "Starting...";
    progressFill.style.width = "5%";
    targetFetchers.forEach((f) => setDot(f.name, "unknown")); // reset to idle

    // 4. Fetch each target. A source "fails" if its session check fails or a
    //    data request throws — it gets a red dot and is queued for next retry.
    const newFailed = new Set();

    const promises = targetFetchers.map(async (f) => {
      log(`${f.name}: Fetching Sales and Buys concurrently...`);

      let connected = false;
      try {
        connected = await f.checkSession();
      } catch (e) {
        connected = false;
      }

      if (!connected) {
        setDot(f.name, "disconnected");
        newFailed.add(f.name);
        updateProgress(`${f.name} Sales`);
        updateProgress(`${f.name} Buys`);
        return;
      }

      let sawError = false;
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
        fetchTask("Sales", () => f.getSales(), state.allSales),
        fetchTask("Buys", () => f.getBuys(), state.allBuys),
      ]);

      if (f.name === "Steam" || f.name === "DMarket") {
        try {
          const items = await f.getInventory();
          if (items && items.length > 0) state.inventory.push(...items);
        } catch (e) {
          log(`${f.name} Inv Error: ${e.message}`);
        }
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

    // 5. Finish
    progressFill.style.width = "100%";
    const failedCount = newFailed.size;
    progressText.textContent =
      `${isPartial ? "Retried failed" : "Done"}! ` +
      `Sales: ${state.allSales.length}, Buys: ${state.allBuys.length}` +
      (failedCount
        ? ` · ${failedCount} failed — next sync retries only these`
        : "");

    state.dataFetched = state.allSales.length > 0 || state.allBuys.length > 0;
    if (state.dataFetched) panelReports.classList.remove("disabled");
    btn.innerHTML = failedCount
      ? "<span>🔁 Retry Failed Sources</span>"
      : "<span>🔄 Sync Data Again</span>";
    btn.disabled = false;

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
  });

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
