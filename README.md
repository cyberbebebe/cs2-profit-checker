# Automated Profit Calculator for CS2 Traders

## Supported marketplaces: **DMarket, CSFloat, BuffMarket, CSMoney & Youpin**

_(Updating and extension form is planned)_

This Go app aggregates transactions history from multiple marketplaces, matches buy/sell pairs using advanced item signatures, and generates precise net profit reports in Excel and JSON formats. (At least, tries to)

## Features

- **Cross-Marketplace matching:** Matches purchases and sales accross cs2 skins marketplaces using generated item signatures (based on Float, Pattern, and Name).
- **Smart calculations:** Automatically accounts for fees (all) and currencies (currently only CNY) for all marketplaces, calculates **true** net profit.
- **Date Filtering:** Define custom date ranges by month and year for precise, period-based profit tracking. These ranges are automatically reflected in the report filenames
- **Excel Reports**: Generates a formatted .xlsx file with color-coded profit/loss columns, sortable by date or profit margin.
- **Verified Trades Only:** The app only processing only verified\* transactions.

\*Verified indicates post-pending successful deals. For newer transactions, the date aligns with the fund payout time (after trade-protection period). For older transactions, it aligns with the marketplace success timestamp.

## Built With

Go (1.24.5), 1.16+ is required;

Surf - Browser impersonation and JA3 fingerprinting to bypass Cloudflare.

Excelize - High-performance Excel report generation.

## Setup

### Quick start (No installation required)
1. Clone the repo: `git clone https://github.com/cyberbebebe/cs2-profit-checker.git`, 

`cd cs2-profit-checker`

2. Configure Secrets: You need to create your private secrets file from the template:
   - Windows: `copy config\secrets.example.json config\secrets.json`
   - Unix/Mac: `cp config/secrets.example.json config/secrets.json`

   Open config/secrets.json and fill:
   1. API keys (DMarket Private key & CSFloat API Key)
   2. For scraped marketplaces (Buff, Youpin, CSMoney), follow the instructions inside the JSON file to get your session cookies/headers from your browser.

3. Configure marketplaces and date range to fetch:
   Open `config/settings.json` to toggle which marketplaces to fetch and define the date range for your report.

4. Run the Tool:

   Double-click: `tradeReporter.exe`

   Or run via terminal: .\tradeReporter.exe

### Build from source code (Advanced)
If you want to modify the code or compile it yourself

1. Install Go: Ensure you have Go 1.21+ installed.

2. Configure secrets and config (described in quick start, steps **2** and **3**)

3. Run the app:
   - `go run cmd/profitChecker/main.go`

   or build an executable:
   - `go build -o tradeReporter.exe ./cmd/profitChecker`

## Important notes:

1. Settings details: The start and end settings are inclusive of the entire month.
   1. Example: If you set `start_month: 1` and `end_month: 2` (with year 2026), the app will fetch data for both January AND February, up to the very last second of February (23:59:59 UTC).

   2. Buy History: The app is hardcoded in `main.go` to request for "Buys" starting from 1/1/2024 on every marketplace. However, I do **not** recommend setting your "Sales" range that far back (even before 2025) due to the metadata issues mentioned in Note 2, the strict requests and history limits on cookie-related marketplaces. (For example, BuffMarket deletes transactions older than 1 year, CSMoneyMarket have strict rate limits for history fetching).

   3. I recommend to set `dmarket_cs_only` to `true` in settings for dmarket fetching. Even if you buy and sale items from other items the matching logic is kinda braindead right now. Maybe i will fix it later.

   4. This app saves sale transactions without found matching buy transactions, however profit (both $ and %) in this case in json file and Excel table will be 0 and 0%.

2. Data Interpretation: This code does interpreter empty `floats`, `phases`, or `patterns` as `0.0`, `""`, or `0` respectively. (Charms patterns from non-applied Charm transactions on CSFloat are stored using same "Pattern" field. I'm doing this so that Charms transactions are not mismatched (I hope).)

   _(I could use pointers but it requires a lot of checks in every service file. Since i rarely buy and sell stickers, containers etc (items without float) i reduced some code complexity, maybe you will suggest how i need to handle this)._

3. DMarket's Limitation: I do **not** recommend to fetch DMarket's history before September 2025. Transactions made before that date lack critical metadata (float, phase, pattern and dmarket's local item ID), which makes it impossible to generate a unique "signature" (based on metadata) for matching without using any complex workarounds.

   _(DMarket's transactions lost metadata lack **can** be recovered (almost) fully by using strange workaround but it requires a major additions, changes to existing code and A LOT of authorized requests or only partially but this will use only few requests and some addition matching logic)_

4. File locking: If `report*.xlsx` is open in Excel, the app cannot overwrite it.

5. You must be logged in from the same IP address on every marketplace from which you want to fetch data. For example, do not use a VPN to log in to them.

### Created for CS2 trading community and enthusiasts by a CS2 trader

#### as an interesting challenge (and as useful tool for tax report xd)
