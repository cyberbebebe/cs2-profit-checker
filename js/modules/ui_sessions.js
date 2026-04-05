export function initSessionCheck(state) {
  const btn = document.getElementById("btn-check-sessions");
  const btnBalance = document.getElementById("btn-get-balance");

  btn.addEventListener("click", async () => {
    const icon = btn.querySelector('.refresh-icon') || btn;
    icon.classList.add("rotating");

    if (btnBalance) btnBalance.disabled = true;

    const checks = state.fetchers.map(async (f) => {
      const cardId = `card-${f.name.toLowerCase().replace(/\s+/g, "")}`;
      const toggleId = `toggle-${f.name.toLowerCase().replace(/\s+/g, "")}`;
      const card = document.getElementById(cardId);
      const checkbox = document.getElementById(toggleId);

      if (checkbox && !checkbox.checked) return;

      const statusDot = card ? card.querySelector(".status-dot") : null;
      if (!statusDot) return;

      // Reset visually before validating
      statusDot.className = "status-dot status-unknown";

      const isConnected = await f.checkSession();
      statusDot.className = isConnected ? "status-dot status-connected" : "status-dot status-disconnected";
    });

    await Promise.all(checks);

    btn.disabled = false;
    if (btnBalance) btnBalance.disabled = false;
  });
}
