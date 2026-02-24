# Automated Profit & Tax Manager for CS2 Traders

## Supported marketplaces: **CSFloat, DMarket, Skinport, Buff163, BuffMarket, CSMoney Market & Youpin**

## 🔍 Features & what it does

This extension operates entirely locally on your PC. **It does not send any of your data to 3rd-party servers.**

- 🔄 **Cross-Marketplace Matching:** Automatically checks your login status and fetches your FULL transaction history across all enabled marketplaces. It matches purchases and sales across different platforms using crafted item signatures (based on Float, Pattern, and Item name).
- 💰 **Smart Balance & Fee Calculations:** Automatically accounts for the specific selling fees of each marketplace to calculate your **true** net profit. It also calculates your total wallet balance across all connected platforms, including usable, pending, and frozen funds (e.g., in active bargains).
- 📈 **Profit Reports (Standard):** Generates a clean, formatted `.xlsx` file detailing your trades. Includes a "Profit" column, calculated percentages, and auto-filters for easy sorting by Profit ($), Profit (%), Sell Income, or Date. (Note: Profit reports support USD only. Rows where profit is calculated as 0 require manual review).
- 🏛️ **Tax-Ready Reports (Accounting):** Generates a specialized `.xlsx` file structured for real legal tax processes. It supports over 20+ fiat currencies (USD, EUR, PLN, etc.) and includes a current-moment 'Stocktaking' sheet (requires manual adjustment for items where a buy transaction wasn't found)

> **Important Data Notes:** Both Profit and Tax-ready reports use `created_at` timestamps (the exact moment of the trade), rather than post-pending/settlement dates, strictly following standard accounting principles. Currency exchange rates are dynamically fetched using the Frankfurter API (and NBP for PLN) and perfectly align with official ECB rates.

## 📦 Setup / Installation

1. Download the latest extension `*.zip` from the **[Releases page](https://github.com/cyberbebebe/cs2-profit-checker/releases)**.
2. Unzip the archive to a folder on your computer.
3. Open Chromium-based browser (Chrome, Brave, Edge, Opera, etc.):
   - Go to `chrome://extensions/` (or usually "Menu -> Extensions -> Manage Extensions").
   - Enable **Developer mode** (toggle in the top right corner).
   - Click **Load unpacked**.
   - Select the folder where you unzipped the extension.
4. Pin the extension and click the icon to open the dashboard!

> **Disclaimer:** This tool provides a "preTax" report structure to assist you with tracking and accounting, but it does not replace professional tax advice. Always consult a certified accountant in your jurisdiction for final tax filings.

## ℹ️ Important notes:

1. Steam Community Market history is **not** fetched. There are a few reasons for this:
   - Steam has a strict limit of 500 transactions per request, and you cannot use filters to request only CS2 transactions
   - It would require inspecting every single CS:GO/CS2 item you bought or sold, which would inevitably spam the Inspect APIs of services like CSFloat or CS2Trader
   - Most high-volume trading occurs on 3rd-party marketplaces anyway. I consider this an acceptable omission

2. **Long Fetching Times:** The extension fetches your FULL transaction history (dating back to 2014) from each selected marketplace. The slowest platforms to fetch are
   - **Buff163** - 200 transactions per request (each taking ~3 seconds)
   - **Youpin** - 20 transactions per request
   - **CSMoney Market** - 100 transactions per request

3. **DMarket limitations:** DMarket API does not provide an AssetID or metadata (float, pattern, phase) for transactions made prior to September 2025.

4. **Skinport Estimation:** Skinport sales handling is currently an estimation. Since I cannot sell items there myself, I cannot verify the exact API fields Skinport uses for clean balance or fees on "Sale" transactions.

## Created for the CS2 trading community and enthusiasts by a CS2 trader

_Developed as an interesting challenge and a useful tool._
