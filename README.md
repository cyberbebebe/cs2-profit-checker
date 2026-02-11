# Automated Profit Calculator for CS2 Traders

### Supported Marketplaces:

**DMarket, CSFloat, Skinport, Buff163, BuffMarket, CSMoney & Youpin**

This browser extension aggregates transaction history from multiple marketplaces, matches buy/sell pairs using crafted item signatures and generates precise **Profit** and **Tax-like** reports in Excel and JSON formats.

## 🚀 Features

- **Cross-Marketplace Matching:** Matches purchases and sales across different CS2 skin marketplaces using intelligent item signatures (based on Float, Pattern, and Name).
- **Smart Calculations:** Automatically accounts for specific fees of each marketplace to calculate **true** net profit.
- **Excel Reports:** Generates a formatted `.xlsx` file with profit/loss column and auto-filters for sorting by Profit ($) or Profit (%).
- **Verified Profit Report:** The extension processes only verified\* transactions for Profit Reports. Tax Reports uses createdAt timestamps.

_\*Verified transactions indicate successful deals. For recent transactions, the date aligns with the payout time (after the trade-protection period). For older transactions, it aligns with the marketplace success timestamp._

## 📦 Setup / Installation

1. Download the `cs2-profit-checker-vX.X.zip` from the **[Releases page](https://github.com/cyberbebebe/cs2-profit-checker/releases)**.
2. Unzip the archive to a folder on your computer.
3. Open your browser (Chrome, Brave, Edge, Opera, etc.):
   - Go to `chrome://extensions/` (or usually "Menu -> Extensions -> Manage Extensions").
   - Enable **Developer mode** (toggle in the top right corner).
   - Click **Load unpacked**.
   - Select the folder where you unzipped the extension.
4. Pin the extension and click the icon to open the dashboard!

---

### Created for the CS2 trading community by a CS2 trader

_Developed as an interesting challenge and a useful tool for enthusiasts._

> **Note:** This tool provides a "Tax-like" report structure to assist with accounting, but it does not replace professional tax advice.
