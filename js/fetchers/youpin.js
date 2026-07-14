import { BaseFetcher, Transaction } from "./base.js";

export class YoupinFetcher extends BaseFetcher {
  constructor() {
    super("Youpin");
    this.headers = null;
    this._sessionPromise = null; // dedupes concurrent tab-opening callers
  }

  // Verify a candidate header set still authenticates (GetUserInfo → Code 0).
  async _isSessionValid(headers) {
    if (!headers) return false;
    try {
      const resp = await fetch(
        "https://api.youpin898.com/api/user/Account/GetUserInfo",
        { method: "GET", headers },
      );
      if (!resp.ok) return false;
      const json = await resp.json().catch(() => null);
      return !!(json && json.Code === 0);
    } catch (e) {
      return false;
    }
  }

  // Read uu_token (cookie) + WEB_UK (localStorage) from a youpin tab and build
  // the header set. Reuses an open tab; opens a hidden one only if none exists.
  async _readSessionFromPage() {
    const tabs = await chrome.tabs.query({ url: "*://youpin898.com/*" });
    let tabId = null;
    let shouldCloseTab = false;

    if (tabs.length === 0) {
      const newTab = await chrome.tabs.create({
        url: "https://youpin898.com/market",
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
          return {
            uu_token: getCookie("uu_token"),
            web_uk: localStorage.getItem("WEB_UK"),
          };
        },
      });

      const data = results?.[0]?.result;
      if (data?.uu_token && data?.web_uk) {
        const auth = decodeURIComponent(data.uu_token);
        return {
          "Accept-Encoding": "gzip",
          "App-Version": "5.26.0",
          "App-Type": "1",
          Authorization: auth,
          "Content-Type": "application/json; charset=utf-8",
          platform: "pc",
          uk: data.web_uk,
        };
      }
      return null;
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

  // Reuse the cached session if it's still active (no tab); otherwise read it
  // from the page. Concurrent callers share one in-flight resolution so a Sync's
  // getSales + getBuys never open two background tabs.
  async ensureSession() {
    if (this.headers && (await this._isSessionValid(this.headers))) {
      return this.headers;
    }
    if (this._sessionPromise) return this._sessionPromise;

    this._sessionPromise = this._readSessionFromPage();
    try {
      this.headers = await this._sessionPromise;
      return this.headers;
    } finally {
      this._sessionPromise = null;
    }
  }

  async checkSession() {
    try {
      const headers = await this.ensureSession();
      return !!headers;
    } catch (e) {
      console.error("[Youpin] Session check failed:", e);
      return false;
    }
  }

  async getBalance() {
    try {
      const headers = await this.ensureSession();
      if (!headers) return { amount: 0, currency: "USD" };
      const resp = await fetch(
        "https://api.youpin898.com/api/user/Account/GetUserInfo",
        {
          method: "GET",
          headers,
        },
      );

      const json = await resp.json();
      if (!json || json.Code !== 0) {
        console.warn("[Youpin] Balance check failed, Code:", json?.Code);
        return { amount: 0, currency: "USD" };
      }

      let cny = parseFloat(json.Data.TotalMoney || 0);

      let purchaseBalance = 0;
      try {
        const purchaseResp = await fetch(
          "https://api.youpin898.com/api/youpin/bff/new/commodity/v3/purchase/user/info",
          {
            method: "GET",
            headers,
          },
        );
        const purchaseJson = await purchaseResp.json();
        if (purchaseJson && purchaseJson.code === 0 && purchaseJson.data && purchaseJson.data.balance !== undefined) {
          purchaseBalance = parseFloat(purchaseJson.data.balance || 0) / 100.0;
        }
      } catch (e) {
        console.warn("[Youpin] Purchase balance check failed:", e);
        purchaseBalance = 0;
      }

      cny += purchaseBalance;

      return { amount: cny, currency: "CNY" };
    } catch (e) {
      console.error("[Youpin] Balance error:", e);
      return { amount: 0, currency: "USD" };
    }
  }

  async getSales() {
    return this.fetchHistory("Sell");
  }
  async getBuys() {
    return this.fetchHistory("Buy");
  }

  async fetchHistory(mode) {
    const headers = await this.ensureSession();
    if (!headers) {
      console.warn("[Youpin] No valid session — check session first.");
      return [];
    }

    let allTxs = [];
    let page = 1;
    const pageSize = 20;

    const url =
      mode === "Buy"
        ? "https://api.youpin898.com/api/youpin/bff/trade/sale/v1/buy/list"
        : "https://api.youpin898.com/api/youpin/bff/trade/sale/v1/sell/list";

    while (true) {
      const payload = {
        keys: "",
        orderStatus: 340,
        pageIndex: page,
        pageSize: pageSize,
      };

      try {
        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          console.error(`[Youpin] HTTP ${resp.status}`);
          break;
        }

        const json = await resp.json();

        // Go: if response.Data.OrderList ...
        const orderList = json.data?.orderList || []; // json.data (lowercase usually in JS responses)

        if (orderList.length === 0) break;

        const before = allTxs.length;
        for (const order of orderList) {
          let rawTime = order.finishOrderTime || 0;
          if (
            order.revocableOfferDeadline &&
            order.revocableOfferDeadline > 0
          ) {
            rawTime = order.revocableOfferDeadline;
          }
          const txDate = new Date(rawTime);

          const products = order.productDetailList || [];
          if (products.length === 0) continue;

          // `commodityNum` is the true number of units in the order. For batch
          // sales/buys of identical fungible items (e.g. 78 cases) the API only
          // returns a few sample products in productDetailList, so we expand the
          // order into `commodityNum` individual unit transactions.
          const qty = parseInt(order.commodityNum) || products.length || 1;

          if (qty > products.length) {
            const first = products[0];
            const name = first.commodityHashName || first.CommodityHashName;

            const totalCNY =
              (order.totalAmount ||
                order.commodityAmount ||
                order.payAmount ||
                0) / 100.0;
            // Per-unit price from the order total, with the item price as fallback
            let unitCNY =
              totalCNY > 0 ? totalCNY / qty : (first.price || 0) / 100.0;
            if (mode === "Sell") unitCNY = unitCNY * 0.99;
            unitCNY = parseFloat(unitCNY.toFixed(2));

            const floatVal = parseFloat(first.abrade || 0);
            const phase = first.dopplerTitle || "";
            const pattern = first.paintSeed || -1;

            for (let i = 0; i < qty; i++) {
              allTxs.push(
                new Transaction({
                  source: "Youpin",
                  type: mode === "Buy" ? "BUY" : "SELL",
                  tx_id: `${order.orderNo}#${i + 1}`,
                  asset_id: "",
                  item_name: name,
                  price: unitCNY,
                  currency: "CNY",
                  created_at: txDate,
                  verified_at: txDate,
                  float_val: floatVal,
                  pattern: pattern,
                  phase: phase,
                }),
              );
            }

            continue;
          }

          for (const item of products) {
            let priceCNY = item.price / 100.0;

            if (products.length === 1 && mode === "Buy") {
              const totalOrder =
                (order.totalAmount || order.payAmount || 0) / 100.0;
              if (totalOrder > 0) priceCNY = totalOrder;
            }

            if (mode === "Sell") priceCNY = priceCNY * 0.99;

            const assetId = item.assertId || item.assetId;
            const floatVal = parseFloat(item.abrade || 0);
            const phase = item.dopplerTitle || "";
            let pattern = item.paintSeed || -1;
            const name = item.commodityHashName;

            allTxs.push(
              new Transaction({
                source: "Youpin",
                type: mode === "Buy" ? "BUY" : "SELL",
                tx_id: item.orderDetailNo,
                asset_id: String(assetId),
                item_name: name,
                price: parseFloat(priceCNY.toFixed(2)),
                currency: "CNY",
                created_at: txDate,
                verified_at: txDate,
                float_val: floatVal,
                pattern: pattern,
                phase: phase,
              }),
            );
          }
        }

        if (this.reachedCutoff(allTxs.slice(before))) break;
        if (orderList.length < pageSize) break;
        page++;
        await this.sleep(500);
      } catch (e) {
        console.error("[Youpin] Error:", e);
        break;
      }
    }

    return allTxs;
  }
}
