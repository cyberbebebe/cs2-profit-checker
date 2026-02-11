import { BaseFetcher } from "./base.js";

export class SteamFetcher extends BaseFetcher {
  constructor() {
    super("Steam");
  }

  async checkSession() {
    try {
      const targetUrl = "https://steamcommunity.com/my/tradeoffers/";

      const resp = await fetch(targetUrl, {
        method: "GET",
        credentials: "include",
      });

      const finalUrl = resp.url;

      if (finalUrl.includes("/login") || finalUrl.includes("openid")) {
        return false;
      }

      if (finalUrl.includes("tradeoffers")) {
        return true;
      }

      return false;
    } catch (e) {
      console.error("Steam check error:", e);
      return false;
    }
  }
}
