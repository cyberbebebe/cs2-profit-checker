export function initSessionCheck(state) {
  const btn = document.getElementById("btn-check-sessions");
  const btnBalance = document.getElementById("btn-get-balance");

  btn.addEventListener("click", async () => {
    const icon = btn.querySelector('.refresh-icon') || btn;
    icon.classList.add("rotating");

    if (btnBalance) btnBalance.disabled = true;

    for (const f of state.fetchers) {
      const cardId = `card-${f.name.toLowerCase().replace(/\s+/g, "")}`;
      const toggleId = `toggle-${f.name.toLowerCase().replace(/\s+/g, "")}`;
      const card = document.getElementById(cardId);
      const checkbox = document.getElementById(toggleId);

      if (checkbox && !checkbox.checked) continue;

      const statusDot = card ? card.querySelector(".status-dot") : null;
      if (!statusDot) continue;

      // Reset visually before validating
      statusDot.className = "status-dot status-unknown";

      const isConnected = await f.checkSession();

      if (isConnected) {
        statusDot.className = "status-dot status-connected";
      } else {
        statusDot.className = "status-dot status-disconnected";
      }
    }

    btn.disabled = false;
    if (btnBalance) btnBalance.disabled = false;
  });
}
