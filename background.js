chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "dashboard.html" });
});
