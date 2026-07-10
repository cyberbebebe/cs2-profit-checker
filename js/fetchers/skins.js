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
    this._tokenPromise = null;
  }

  async getSessionToken() {
    try {
      if (typeof chrome === "undefined") {
        console.error("[Skins.com] Chrome Extension APIs are missing! Check context.");
        return null;
      }

      // Fast path: the token is often a JS-readable cookie we can grab without a
      // tab. Only use it if it actually authenticates — a stale cookie token
      // must not shadow the (working) tab fallback below.
      const cookieToken = await this._readTokenFromCookies();
      if (cookieToken && (await this._isTokenValid(cookieToken))) {
        console.log("[Skins.com] Using valid token from cookies (no tab).");
        return cookieToken;
      }
      if (cookieToken) {
        console.log("[Skins.com] Cookie token present but invalid — falling back to tab.");
      }

      // Fallback: skins.com's SPA keeps the session token in localStorage (it is
      // replayed as an `Authorization: Bearer` header, so the front-end has to be
      // able to read it). chrome.cookies can't see localStorage, so read it from
      // an authenticated skins.com tab, opening a hidden one if none is present.
      const pageToken = await this._readTokenFromPage();
      if (pageToken && (await this._isTokenValid(pageToken))) {
        console.log("[Skins.com] Using valid token from page/tab.");
        return pageToken;
      }

      console.warn("[Skins.com] No valid session token via cookie or tab — open skins.com and log in.");
      return null;
    } catch (e) {
      console.error("[Skins.com] Error retrieving session token:", e);
      return null;
    }
  }

  // Read the session token straight from cookies (no tab needed). Returns the
  // value or null. Covers both a cookie scoped to skins.com and any subdomain.
  async _readTokenFromCookies() {
    if (!chrome.cookies) return null;
    const possibleNames = ["session-token", "session_token"];

    for (const name of possibleNames) {
      const cookie = await chrome.cookies.get({ url: "https://skins.com", name });
      if (cookie && cookie.value) return cookie.value;
    }

    // Fallback: scan every cookie with these names across skins.com subdomains.
    for (const name of possibleNames) {
      const allCookies = await chrome.cookies.getAll({ name });
      const match = allCookies.find(
        (c) => c.domain && c.domain.includes("skins.com"),
      );
      if (match && match.value) return match.value;
    }

    return null;
  }

  // Read the token from a skins.com tab's localStorage / document.cookie via
  // chrome.scripting. Reuses an open tab; otherwise opens a hidden one, waits
  // for the SPA to boot, then closes it afterwards.
  async _readTokenFromPage() {
    if (!chrome.tabs || !chrome.scripting) {
      console.error("[Skins.com] chrome.tabs / chrome.scripting APIs are missing! Check context.");
      return null;
    }

    const tabs = await chrome.tabs.query({ url: "*://*.skins.com/*" });
    let tabId;
    let shouldCloseTab = false;

    if (tabs.length === 0) {
      console.log("[Skins.com] No skins.com tab found. Opening a background tab...");
      const newTab = await chrome.tabs.create({ url: "https://skins.com/", active: false });
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
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 8000);
      });
      await this.sleep(2000); // let the SPA populate localStorage
    } else {
      tabId = tabs[0].id;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const getCookie = (name) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(";").shift();
            return null;
          };
          return (
            getCookie("session-token") ||
            getCookie("session_token") ||
            localStorage.getItem("session-token") ||
            localStorage.getItem("session_token") ||
            localStorage.getItem("token") ||
            null
          );
        },
      });
      return results?.[0]?.result || null;
    } finally {
      if (shouldCloseTab) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e) {
          /* tab already gone */
        }
      }
    }
  }

  // Verify a candidate token actually authenticates (the wallet endpoint
  // returns { success: true }). Lets us decide whether the cheap cookie token is
  // good enough or we must fall back to reading the page.
  async _isTokenValid(token) {
    if (!token) return false;
    try {
      const resp = await fetch("https://api.skins.com/secure/user/wallet", {
        method: "GET",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return false;
      const data = await resp.json().catch(() => null);
      return !!(data && data.success);
    } catch (e) {
      return false;
    }
  }

  // Resolve a working token once and cache it for the rest of this run:
  // cached → cookie (validated, no tab) → tab fallback. Concurrent callers share
  // a single in-flight resolution so we never open two background tabs at once.
  async ensureSessionToken() {
    if (this.sessionToken) return this.sessionToken;
    if (this._tokenPromise) return this._tokenPromise;

    this._tokenPromise = this.getSessionToken();
    try {
      this.sessionToken = await this._tokenPromise;
      return this.sessionToken;
    } finally {
      this._tokenPromise = null;
    }
  }

  async checkSession() {
    try {
      console.log("[Skins.com] Starting session check...");
      // ensureSessionToken already validates the token against the wallet
      // endpoint, so a resolved token means the session is good.
      const token = await this.ensureSessionToken();
      if (!token) {
        console.warn("[Skins.com] checkSession failed: no valid token found");
        return false;
      }
      return true;
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
      const token = await this.ensureSessionToken();
      if (!token) return { amount: 0, currency: "USD" };

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
    const token = await this.ensureSessionToken();
    if (!token) {
      console.warn("[Skins.com] fetchHistory: no valid session token — skipping.");
      return [];
    }

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
