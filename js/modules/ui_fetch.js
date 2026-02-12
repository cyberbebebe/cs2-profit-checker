import { log } from "../utils.js";

export function initFetch(state) {
  const btn = document.getElementById("btn-fetch-all");
  const progressFill = document.getElementById("progress-fill");
  const progressText = document.getElementById("progress-text");
  const panelReports = document.getElementById("panel-reports");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    state.allSales = [];
    state.allBuys = [];
    state.inventory = [];

    // 1. Active fetchers
    const enabledFetchers = state.fetchers.filter((f) => {
      const toggleId = `toggle-${f.name.toLowerCase().replace(/\s+/g, "")}`;
      const checkbox = document.getElementById(toggleId);
      return checkbox && checkbox.checked;
    });

    if (enabledFetchers.length === 0) {
      alert("No marketplaces selected!");
      btn.disabled = false;
      return;
    }

    // 2. Progress setup
    const totalSteps = enabledFetchers.length * 2; // Sales + Buys
    let completedSteps = 0;

    const updateProgress = (actionName) => {
      completedSteps++;
      const pct = Math.round((completedSteps / totalSteps) * 100);
      progressFill.style.width = `${pct}%`;
      progressText.textContent = `${pct}% - ${actionName} Done`;
    };

    progressText.textContent = "Starting...";
    progressFill.style.width = "5%";

    // 3. Promises
    const promises = enabledFetchers.map(async (f) => {
      try {
        // SALES
        progressText.textContent = `Fetching ${f.name} Sales...`;
        log(`${f.name}: Fetching Sales...`);
        const s = await f.getSales();
        if (s) state.allSales.push(...s);
        updateProgress(`${f.name} Sales`);

        // BUYS
        await new Promise((r) => setTimeout(r, 500));

        progressText.textContent = `Fetching ${f.name} Buys...`;
        log(`${f.name}: Fetching Buys...`);
        const b = await f.getBuys();
        if (b) state.allBuys.push(...b);
        updateProgress(`${f.name} Buys`);
      } catch (e) {
        log(`${f.name}: Error - ${e.message}`);
        completedSteps += 2 - (completedSteps % 2); // Hack to complete this fetcher's steps
        const pct = Math.round((completedSteps / totalSteps) * 100);
        progressFill.style.width = `${pct}%`;
      }

      if (f.name === "Steam") {
        progressText.textContent = `Fetching Steam Inventory...`;
        const items = await f.getInventory();
        if (items && items.length > 0) {
          state.inventory.push(...items);
        }
      }
      if (f.name === "DMarket") {
        progressText.textContent = `Fetching DMarket Inventory...`;
        const items = await f.getInventory();
        if (items && items.length > 0) {
          state.inventory.push(...items);
        }
      }
    });

    await Promise.all(promises);

    progressFill.style.width = "100%";
    progressText.textContent = `Done! Sales: ${state.allSales.length}, Buys: ${state.allBuys.length}`;

    // Final state
    state.dataFetched = true;
    panelReports.classList.remove("disabled");
    btn.textContent = "Refreshed";
    btn.disabled = false;

    setTimeout(() => {
      if (btn.textContent === "Refreshed")
        btn.innerHTML = "<span>⬇ Fetch Data</span>";
    }, 3000);
  });

  // BALANCE CHECKER
  const btnBalance = document.getElementById("btn-get-balance");
  const balanceDisplay = document.getElementById("total-balance-display");

  // Helper: currency rate
  const getConversionRate = async (from, to) => {
    if (from === to) return 1;
    try {
      const res = await fetch(
        `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
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
      const enabledFetchers = state.fetchers.filter((f) => {
        const toggleId = `toggle-${f.name.toLowerCase().replace(/\s+/g, "")}`;
        const checkbox = document.getElementById(toggleId);
        return checkbox && checkbox.checked;
      });

      if (enabledFetchers.length === 0) {
        alert("Select marketplaces first!");
        return;
      }

      const promises = enabledFetchers.map(async (f) => {
        try {
          const result = await f.getBalance();
          return { ...result, source: f.name };
        } catch (e) {
          console.error(e);
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
