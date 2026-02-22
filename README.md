# Automated Profit & Balance Calculator for CS2 Traders

## Supported Marketplaces: **CSFloat, DMarket, Skinport, Buff163, BuffMarket, CSMoney Market & Youpin**

## 🔍 What it does?

- Checks if you're logged in on selected marketplaces
- Fetches FULL transaction history on all enabled marketplaces
- Handles currencies (CNY, EUR) and sale fees automatically
- Calculates total wallet balance on selected marketplaces. This includes usable, pending and frozen (in bargains)
- Crafts clean, detailed Profit and Tax-ready reports. However, Profit reports only support USD. Tax-ready reports support USD, EUR, and PLN.\*
- Operates everything locally on your PC. Code of each file is open

> **Note:** The CNY and EUR currency rates are calculated using the Frankfurter API, **should** be same as ECB rates.

## 🚀 Features

- **Cross-Marketplace Matching:** Matches purchases and sales across different CS2 skin marketplaces using intelligent item signatures (based on Float, Pattern, and Item name).
- **Smart Calculations:** Automatically accounts for specific fees of each marketplace to calculate **true** net profit.
- **Balance Calculator:** Calculates the total wallet balance from all connected marketplaces by pressing "Balance" button.
- **Profit Reports:** Generates a formatted `.xlsx` file with "Profit" column, carefully calculated Total Profit and auto-filters for sorting by Profit ($), Profit (%), Sell Income or Date.
- **Tax-ready Reports:** Generates a formatted `.xlsx` file suitable for real legal tax processes. The 'Stocktaking' is taken at the current moment and requires manual adjustment for items when a buy transaction was not found. **Should** fit for your accountant.

> **Note:** recently i changed the Profit reports to check sales by `created_at` timestamps/dates according to the Tax-ready reports.

## 📦 Setup / Installation

1. Download the latest extension `*.zip` from the **[Releases page](https://github.com/cyberbebebe/cs2-profit-checker/releases)**.
2. Unzip the archive to a folder on your computer.
3. Open your browser (Chrome, Brave, Edge, Opera, etc.):
   - Go to `chrome://extensions/` (or usually "Menu -> Extensions -> Manage Extensions").
   - Enable **Developer mode** (toggle in the top right corner).
   - Click **Load unpacked**.
   - Select the folder where you unzipped the extension.
4. Pin the extension and click the icon to open the dashboard!

> **Note:** This tool provides a "Tax-ready" report structure to assist with accounting, but it does not replace professional tax advice. Contact a specialist for clarification.

## ℹ️ Important notes:

1. The Steam Community Market history will not be fetched. There are a few reasons:
   - It have 500 transactions per request limit and you can't use filters to request only cs2 transactions
   - Requires to inspect every cs2(cs:go) item you sold or bought. This will lead to spam inspect apis of some services like csfloat or cs2trader.
   - You and I mostly buy and sell items on 3rd-party marketplaces.

   I think this is acceptable omission.

2. Long fetching time. It fetches FULL transaction history from 2014 at each marketplace you set. The main 3 marketplaces that fetches really long are:
   - Buff163 - 200 transactions per request (each take ~3 seconds)
   - Youpin - 20 transactions per request
   - CSMoney Market - 100 transactions per request

3. DMarket have no AssetID and "metadata" (float, pattern, phase) in transactions made before September 2025.

4. Skinport sales handling is a guess. I can't sell items here, so i can't check what fields for clean balance or fees skinport have for "Sale" transactions.

## Created for the CS2 trading community and enthusiasts by a CS2 trader

_Developed as an interesting challenge and a useful tool._
