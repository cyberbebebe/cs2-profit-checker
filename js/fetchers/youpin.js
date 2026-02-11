import { BaseFetcher, Transaction } from "./base.js";

export class YoupinFetcher extends BaseFetcher {
  constructor() {
    super("Youpin");
    this.headers = null; // Зберігаємо готовий набір хедерів
  }

  // 1. Отримання токенів (це єдиний момент, де потрібна вкладка)
  async checkSession() {
    try {
      let tabs = await chrome.tabs.query({ url: "*://youpin898.com/*" });
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
          setTimeout(() => resolve(), 8000);
        });
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        tabId = tabs[0].id;
      }

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
            uu_token: getCookie("uu_token"),
            web_uk: localStorage.getItem("WEB_UK"),
          };
        },
      });

      const data = results?.[0]?.result;

      if (shouldCloseTab) await chrome.tabs.remove(tabId);

      if (data?.uu_token && data?.web_uk) {
        let auth = decodeURIComponent(data.uu_token);
        this.headers = {
          "Accept-Encoding": "gzip",
          "App-Version": "5.26.0",
          "App-Type": "1",
          Authorization: auth,
          "Content-Type": "application/json; charset=utf-8",
          platform: "pc",
          uk: data.web_uk,
        };

        return true;
      }
      return false;
    } catch (e) {
      console.error("[Youpin] Session check failed:", e);
      return false;
    }
  }

  async getSales() {
    return this.fetchHistory("Sell");
  }
  async getBuys() {
    return this.fetchHistory("Buy");
  }

  async fetchHistory(mode) {
    if (!this.headers) {
      console.warn("[Youpin] No headers. Check session first.");
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
          headers: this.headers,
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

          // BULK LOGIC START
          if (products.length > 3) {
            const firstItem = products[0];
            const count = products.commodityNum;
            const name =
              firstItem.commodityHashName || firstItem.CommodityHashName;

            const bulkName = `${name} x${count}`;

            let totalCNY =
              (order.totalAmount ||
                order.commodityAmount ||
                order.payAmount ||
                0) / 100.0;

            if (mode === "Sell") totalCNY = totalCNY * 0.99;

            allTxs.push(
              new Transaction({
                source: "Youpin",
                type: mode === "Buy" ? "BUY" : "SELL",
                tx_id: order.orderNo,
                asset_id: "BATCH",
                item_name: bulkName,
                price: parseFloat(totalCNY.toFixed(2)),
                currency: "CNY",
                created_at: txDate,
                verified_at: txDate,
                float_val: 0,
                pattern: -1,
                phase: "",
              }),
            );

            continue;
          }
          // BULK LOGIC END

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

        if (orderList.length < pageSize) break;
        page++;
        await this.sleep(1500);
      } catch (e) {
        console.error("[Youpin] Error:", e);
        break;
      }
    }

    return allTxs;
  }
}
