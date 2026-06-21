import { BaseFetcher, Transaction } from "./base.js";

function cleanItemName(name) {
  if (!name) return "";
  if ((name.includes("★") || name.includes("\u2605")) && name.includes("Doppler")) {
    const idx = name.indexOf(" - ");
    if (idx !== -1) {
      return name.substring(0, idx).trim();
    }
    const idxSimple = name.indexOf("-");
    if (idxSimple !== -1) {
      return name.substring(0, idxSimple).trim();
    }
  }
  return name;
}

export class SkinsFetcher extends BaseFetcher {
  constructor() {
    super("Skins");
    this.sessionToken = null;
    this._historyPromise = null;
  }

  async getSessionToken() {
    try {
      if (typeof chrome === "undefined" || !chrome.tabs || !chrome.scripting) {
        console.error("[Skins.com] Chrome Extension APIs are missing! Check context.");
        return null;
      }

      let tabs = await chrome.tabs.query({ url: "*://*.skins.com/*" });
      let tabId = null;
      let shouldCloseTab = false;

      if (tabs.length === 0) {
        console.log("[Skins.com] No skins.com tab found. Creating background tab...");
        const newTab = await chrome.tabs.create({
          url: "https://skins.com/",
          active: false,
        });
        tabId = newTab.id;
        shouldCloseTab = true;

        await new Promise((resolve) => {
          const listener = (id, info) => {
            if (id === tabId && info.status === "complete") {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          // Safety timeout
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 8000);
        });
        // Extra delay to ensure cookies/scripts are loaded
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        tabId = tabs[0].id;
        console.log("[Skins.com] Found existing skins.com tab, ID:", tabId);
      }

      console.log("[Skins.com] Executing script in tab to read cookies/localStorage...");
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const getCookie = (name) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(";").shift();
            return null;
          };
          return {
            cookieToken: getCookie("session-token") || getCookie("session_token"),
            localStorageToken: localStorage.getItem("session-token") || localStorage.getItem("session_token") || localStorage.getItem("token")
          };
        },
      });

      const scriptData = results?.[0]?.result;
      console.log("[Skins.com] Script results:", scriptData);

      if (shouldCloseTab) {
        console.log("[Skins.com] Closing background tab...");
        await chrome.tabs.remove(tabId);
      }

      let token = scriptData?.cookieToken || scriptData?.localStorageToken;

      // Fallback: if not found via script execution, try chrome.cookies
      if (!token && chrome.cookies) {
        console.log("[Skins.com] Script did not find token. Trying chrome.cookies...");
        const possibleNames = ["session-token", "session_token"];
        for (const name of possibleNames) {
          let cookie = await chrome.cookies.get({
            url: "https://skins.com",
            name: name
          });
          if (cookie && cookie.value) {
            token = cookie.value;
            break;
          }
        }
        if (!token) {
          for (const name of possibleNames) {
            const allCookies = await chrome.cookies.getAll({ name: name });
            if (allCookies && allCookies.length > 0) {
              const match = allCookies.find(c => c.domain && (c.domain === "skins.com" || c.domain.endsWith(".skins.com") || c.domain.includes("skins.com")));
              if (match && match.value) {
                token = match.value;
                break;
              }
            }
          }
        }
      }

      if (token) {
        console.log("[Skins.com] Successfully retrieved token:", token.substring(0, 10) + "...");
      } else {
        console.warn("[Skins.com] No token found in cookies, localStorage, or chrome.cookies.");
      }

      return token;
    } catch (e) {
      console.error("[Skins.com] Error retrieving session token:", e);
      return null;
    }
  }

  async checkSession() {
    try {
      console.log("[Skins.com] Starting session check...");
      const token = await this.getSessionToken();
      if (!token) {
        console.warn("[Skins.com] checkSession failed: no token found");
        return false;
      }
      this.sessionToken = token;

      console.log("[Skins.com] checkSession: fetching wallet with token...");
      const data = await this.fetchWithAuth("https://api.skins.com/secure/user/wallet");
      console.log("[Skins.com] checkSession wallet response:", data);
      return !!(data && data.success);
    } catch (e) {
      console.error("[Skins.com] checkSession error:", e);
      return false;
    }
  }

  async fetchWithAuth(url, options = {}) {
    const headers = {
      ...options.headers,
    };
    if (this.sessionToken) {
      headers["Authorization"] = `Bearer ${this.sessionToken}`;
    }
    return super.fetchWithAuth(url, { ...options, headers });
  }

  async getBalance() {
    try {
      if (!this.sessionToken) {
        const hasSession = await this.checkSession();
        if (!hasSession) return { amount: 0, currency: "USD" };
      }

      const walletUrl = "https://api.skins.com/secure/user/wallet";
      const walletData = await this.fetchWithAuth(walletUrl);
      const walletBalance = walletData?.wallet?.balance ? parseFloat(walletData.wallet.balance) : 0;

      const recentUrl = "https://api.skins.com/secure/market/transactions?page=1&limit=1&section=recent";
      const recentData = await this.fetchWithAuth(recentUrl);
      const pendingBalance = recentData?.totalValue ? parseFloat(recentData.totalValue) : 0;

      const total = walletBalance + pendingBalance;
      return { amount: total, currency: "USD" };
    } catch (e) {
      console.error("[Skins.com] Balance error:", e);
      return { amount: 0, currency: "USD" };
    }
  }

  async fetchHistory() {
    const sections = ["recent", "history"];
    let allSkinsTxs = [];

    for (const section of sections) {
      let page = 1;
      const limit = 50;

      while (true) {
        const url = `https://api.skins.com/secure/market/transactions?page=${page}&limit=${limit}&section=${section}`;
        let data;
        try {
          data = await this.fetchWithAuth(url);
        } catch (e) {
          console.error(`[Skins.com] Error fetching page ${page} of ${section}:`, e);
          break;
        }

        if (!data || !data.success || !data.data || data.data.length === 0) {
          break;
        }

        for (const tx of data.data) {
          const status = tx.status ? tx.status.toUpperCase() : "";
          if (status !== "COMPLETED" && status !== "HOLD") {
            continue;
          }

          const type = tx.type ? tx.type.toUpperCase() : "";
          if (type !== "SELL" && type !== "BUY") {
            continue;
          }

          const item = tx.item || {};
          const rawName = item.marketHashName || item.name || "Unknown Item";
          const itemName = cleanItemName(rawName);

          const floatVal = item.metadata?.wear !== undefined ? parseFloat(item.metadata.wear) : (item.metadata?.float !== undefined ? parseFloat(item.metadata.float) : 0);
          const phase = item.metadata?.phase || "";
          const pattern = item.metadata?.paintSeed !== undefined ? parseInt(item.metadata.paintSeed) : (item.metadata?.paintseed !== undefined ? parseInt(item.metadata.paintseed) : (item.metadata?.pattern !== undefined ? parseInt(item.metadata.pattern) : -1));

          const price = parseFloat(tx.price || item.price || 0);

          const createdDate = tx.createdAt ? new Date(tx.createdAt) : new Date();
          const verifiedDate = tx.updatedAt ? new Date(tx.updatedAt) : null;

          allSkinsTxs.push(
            new Transaction({
              source: "Skins",
              type: type,
              tx_id: tx.id,
              asset_id: item.id || "",
              item_name: itemName,
              price: price,
              currency: "USD",
              created_at: createdDate,
              verified_at: verifiedDate,
              float_val: floatVal,
              pattern: pattern,
              phase: phase,
            })
          );
        }

        if (data.pagination) {
          const { page: currPage, totalPages } = data.pagination;
          if (currPage >= totalPages) {
            break;
          }
        } else {
          if (data.data.length < limit) break;
        }

        page++;
        await this.sleep(300);
      }
    }

    return allSkinsTxs;
  }

  async getHistory() {
    if (this._historyPromise) {
      return this._historyPromise;
    }

    this._historyPromise = this.fetchHistory();
    try {
      const res = await this._historyPromise;
      setTimeout(() => {
        this._historyPromise = null;
      }, 5000);
      return res;
    } catch (e) {
      this._historyPromise = null;
      throw e;
    }
  }

  async getSales() {
    const all = await this.getHistory();
    return all.filter((t) => t.type === "SELL");
  }

  async getBuys() {
    const all = await this.getHistory();
    return all.filter((t) => t.type === "BUY");
  }
}
