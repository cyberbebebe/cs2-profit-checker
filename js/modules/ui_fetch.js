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
    const totalSteps = enabledFetchers.length * 2; // Sales + Buys для кожного
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
}
