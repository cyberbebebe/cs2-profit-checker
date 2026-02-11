export function initToggles(fetchers) {
  fetchers.forEach((f) => {
    const cardId = `card-${f.name.toLowerCase().replace(/\s+/g, "")}`;
    const toggleId = `toggle-${f.name.toLowerCase().replace(/\s+/g, "")}`;

    const checkbox = document.getElementById(toggleId);
    const card = document.getElementById(cardId);

    if (checkbox && card) {
      const savedState = localStorage.getItem(`enable_${f.name}`);
      const isEnabled = savedState === null ? true : savedState === "true";

      checkbox.checked = isEnabled;
      const statusDiv = card.querySelector(".card-status");

      if (!isEnabled) {
        card.classList.add("disabled-card");
        if (statusDiv) {
          statusDiv.textContent = "Disabled";
          statusDiv.className = "card-status status-unknown";
        }
      }

      checkbox.addEventListener("change", (e) => {
        const checked = e.target.checked;
        localStorage.setItem(`enable_${f.name}`, checked);

        if (checked) {
          card.classList.remove("disabled-card");
          if (statusDiv) {
            statusDiv.textContent = "Unknown";
            statusDiv.className = "card-status status-unknown";
          }
        } else {
          card.classList.add("disabled-card");
          if (statusDiv) {
            statusDiv.textContent = "Disabled";
            statusDiv.className = "card-status status-unknown";
          }
        }
      });
    }
  });
}
