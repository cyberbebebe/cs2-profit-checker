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

Go 1.24.5

Surf - Browser impersonation and JA3 fingerprinting to bypass Cloudflare.

Excelize - High-performance Excel report generation.

## Setup

### Quick start (No installation required)

1. Download: Go to the Releases Page and download the latest `.zip` file (e.g., CS2.Profit.Checker.v1.0.zip)

2. Extract: Unzip the downloaded archive to a folder on your computer

3. Configure Secrets:
   - Open the config folder
   - Rename `secrets.example.json` to `secrets.json`
   - Open secrets.json with a text editor (like Notepad) and fill in:
   1. API Keys: For DMarket and CSFloat.

   2. Cookies: For scraped marketplaces (Buff, Youpin, CSMoney).
      Follow the instructions inside the file to get these from your browser

4. Configure Settings:
   - Open `config/settings.json`
   - Set `true` for the marketplaces you want to fetch
   - Define the date range (months and years) for your report

5. Run the Tool: Double-click `tradeReporter.exe`.

   _The app will create your Excel and JSON reports in the same folder_

### Build from source code (Advanced)

If you want to modify the code or compile it yourself

1. Install Go: Ensure you have Go 1.21+ installed.

2. Clone, configure secrets and config (described in # Quick start, steps **1** to **3**)

3. Install Dependencies: `go mod tidy`

4. Run or Build:
   - `go run cmd/profitChecker/main.go`

   - `go build -o tradeReporter.exe ./cmd/profitChecker`

## Important notes:

1. Settings details: The start and end settings are inclusive of the entire month.
   1. Example: If you set `start_month: 1` and `end_month: 2` (with year 2026), the app will fetch data for both January AND February, up to the very last second of February (23:59:59 UTC).

   2. Buy History: The app is hardcoded in `main.go` to request for "Buys" starting from 1/1/2023 on every marketplace. However, I do **not** recommend setting your "Sales" range that far back (even before 2025) due to the metadata issues mentioned, the strict requests and history limits on cookie-scraped marketplaces. (BuffMarket deletes transactions older than 1 year, CSMoneyMarket have strict rate limits for history fetching, DMarket have no metadata in old transactions).

   3. I recommend to set `dmarket_cs_only` to `true` in settings for DMarket fetching. Even if you buy and sale items from other items the matching logic is kinda braindead right now. Maybe i will fix it later.

   4. This app fetches sales transactions for a specified date range and then tries to find corresponding buy transactions. If there are no matching buy transactions, the profit (in dollars and as a percentage) in the JSON file and Excel table will be set to 0 and 0%, respectively, profit cell will calculate profit automatically after filling buy price cell for this item.

2. Data Interpretation: This code does interpreter empty `floats`, `phases`, or `patterns` as `0.0`, `""`, or `-1` respectively.

   Charms patterns from non-applied Charm transactions are stored using same "Pattern" field as weapons patterns. I'm doing it to trying minimize missmatching for Charms transactions (I hope).

   _(Maybe you will suggest how i need to handle matching for commodity items such as containers, stickers, charms)._

3. DMarket's Limitation: I do **not** recommend to fetch DMarket's history before September 2025. Transactions made before that date lack critical metadata (float, phase, pattern and dmarket's local item ID), which makes it impossible to generate a unique "signature" (based on metadata) for matching without using any complex workarounds.

   _(DMarket's transactions lost metadata lack **can** be recovered (almost) fully by using strange workaround but it requires a major additions, changes to existing code and A LOT of authorized requests or only partially but this will use only few requests and some addition matching logic)_

4. File locking: If `report*.xlsx` is open in Excel, the app cannot overwrite it.

5. You need to have same IP as logged session on **scraped** marketplaces from which you want to fetch data.

### Created for CS2 trading community and enthusiasts by a CS2 trader

#### as an interesting challenge and as useful tool.

### Does **NOT** represent actual tax report
