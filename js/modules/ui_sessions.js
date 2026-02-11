export function initSessionCheck(state) {
  const btn = document.getElementById("btn-check-sessions");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "...";

    for (const f of state.fetchers) {
      let cardId = `card-${f.name.toLowerCase().replace(/\s+/g, "")}`;
      let toggleId = `toggle-${f.name.toLowerCase().replace(/\s+/g, "")}`;

      const card = document.getElementById(cardId);
      const checkbox = document.getElementById(toggleId);

      if (checkbox && !checkbox.checked) continue;

      const statusDiv = card ? card.querySelector(".card-status") : null;
      if (!statusDiv) continue;

      statusDiv.textContent = "Checking...";
      statusDiv.className = "card-status status-unknown";

      const isConnected = await f.checkSession();

      if (isConnected) {
        statusDiv.textContent = "Connected";
        statusDiv.className = "card-status status-connected";
      } else {
        statusDiv.textContent = "Disconnected";
        statusDiv.className = "card-status status-disconnected";
      }
    }

    btn.disabled = false;
    btn.textContent = "↻ Check";
  });
}
