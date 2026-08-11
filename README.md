# CS2 Profit Checker <br> Automated CS2 Trading Profit & Accounting

## Supported marketplaces: **Buff163, Youpin, C5Game, CSFloat, DMarket, CSMoney, BuffMarket, Skinport, Skins, SkinSwap, SkinPlace, Avan, Aim**

## 🔍 Features & What It Does

This extension operates entirely locally on your PC. It doesn't collect any data to 3rd party servers.

- 🔄 **Cross-Marketplace Matching:** Checks your login status with 1 click and fetches your **full** transaction history across all enabled marketplaces. Automatically matches purchases and sales between them.
- 💰 **Balance & Fee Calculations:** Automatically accounts for the specific selling fees of each marketplace to calculate your **true** net profit. It also calculates your total wallet balance across all connected marketplaces, including usable, pending, and frozen funds (e.g., in active bargains).
- 📈 **Profit Reports:** Generates a clean, formatted `.xlsx` file detailing your trades. Includes "Profit" and "Profit %" columns, and features auto-filters for easy sorting by Profit, Date, or Price. The Dashboard table serves as a convenient preview of this file.
- 📊 **Dashboard:** A convenient built-in Profit Report table where you can set or modify prices for any transaction. Includes a Statistics bar showcasing your best/worst deals and average profits (per deal, day, week, month). The table is fully sortable and paginated (defaults to 500 rows per page).
- 🏛️ **Accounting:** Generates a specialized `.xlsx` file structured for real legal accounting. It supports over 20+ fiat currencies (USD, EUR, PLN, etc.) and includes a current-moment 'Stocktaking' sheet (requires manual review and adjustments).

## 📊 Marketplaces Coverage

- ✅ Fully supported: **CSFloat, Buff163, Youpin, CSMoney, DMarket, BuffMarket, C5Game, Skins**
- ⚠️ Partially supported (Sales or Buy only / Untested): **SkinSwap, Skinport, AvanMarket, AimMarket**
- ❌ Not supported: **Steam community market history & trade history fetching**

## 👁️‍🗨️ Dashboard Preview

![Dashboard Preview](preview/preview.png)

## 📦 Setup / Installation

1. Download the latest extension `*.zip` from the **[Releases page](https://github.com/cyberbebebe/cs2-profit-checker/releases)**.
2. Unzip the archive to a folder on your computer.
3. Open Chromium-based browser (Chrome, Brave, Edge, Opera, etc.):
   - Go to `chrome://extensions/` (or usually "Menu -> Extensions -> Manage Extensions").
   - Enable **Developer mode** (toggle in the top right corner).
   - Click **Load unpacked**.
   - Select the folder where you unzipped the extension.
4. Pin the extension and click the icon to open the dashboard!

> **Disclaimer:** This tool provides a "Pre-Tax" report structure to assist you with tracking and accounting, but it does not replace professional tax advice. Always consult a certified accountant in your jurisdiction for final tax filings.

## ℹ️ Important Notes:

1. **Long Fetching Times:** The extension fetches your **FULL** transaction history from each marketplace.
   The slowest platforms to fetch are:
   - **Buff163** - 200 transactions per request (each taking ~3 seconds).
   - **Youpin** - 20 transactions per request.
   - **CSMoney Market** - 100 transactions per request.
   - **Skins** - 50 transactions per request.

2. **Non-fetchable Items & Limitations:**
   - Fetching non-CS2 items works only on DMarket, probably could work on SkinSwap, SkinPlace and Skinport. Untested.
   - Steam Community Market & Trade Histories - Multi-currency complexity, missing float data, and rate-limits makes this unfetchable.
   - Skinport: Virtual Inventory/Store is unsupported; Seller history is untested (please verify).
   - SkinSwap: Trade, Insta-Sell and Balance - only Market (China proxybuy) supported currently.
   - Balances: We haven't added balance function for some marketplaces: SkinSwap, AimMarket, AvanMarket.
   - Other marketplaces - Too many exist to support all of them; We don't use all of them, some have inconvenient history formats or other limitations.

3. **Commodity & Trade Matching (Profit Report & Dashboard):**
   - Tries to match items without float by name as fallback after other items name+float matching. *Could match some items wrong. Please verify it manually.* 

If you have any questions, suggestions, or found a bug, please write to [Issues](https://github.com/cyberbebebe/cs2-profit-checker/issues) or message me on [Steam](https://steamcommunity.com/profiles/76561198874907166).

## Created for the CS2 trading community and enthusiasts by a CS2 trader

_Developed as an interesting challenge and a useful tool._
