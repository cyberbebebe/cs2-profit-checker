# CS2-Profit-Checker

### Currently supported marketplaces: **DMarket** & **CSFloat**

_(Support for BuffMarket, YouPin898, and CSMoneyMarket is planned)_

This Go app will aggregates your transactions history from multiple CS2 skins marketplaces.
It will try to automatically match "Buy" and "Sell" transactions in order to create reports in Excel (.xlsx) and JSON formats. Set needed month(s) and year(s) in settings.json (read important notes).

## Features

- **Cross-Marketplace matching:** Matches purchases and sales accross cs2 skins marketplaces using generated item signatures (based on Float, Pattern, and Name).
- **Smart calculations:** Automatically accounts fees for all marketplaces, calculates **true net profit** transactions dates.
- **Date Filtering:** Define custom date ranges by month (and year) for precise, period-based profit tracking.
- **Excel Reports**: Generates a formatted `.xlsx` file with color-coded profit/loss columns.
- **Verified Trades Only:** The app automatically filters out pending and failed trades, processing only verified transactions. **Note:** For deals made after the "Trade Revert" update, "verified" indicates post-pending success, with transaction date aligned to the fund payout time.

## Setup

1. Clone the repo: `git clone https://github.com/cyberbebebe/cs2-profit-checker.git`, `cd cs2-profit-checker`
2. Copy and fill keys in secrets.json:
   - Windows: `copy config\secrets.example.json config\secrets.json`
   - Unix/Mac: `cp config/secrets.example.json config/secrets.json`

   Open config/secrets.json and fill in your API keys (DMarket Private Key & CSFloat API Key)

3. Configure Settings:
   Open `config/settings.json` to toggle marketplaces and set your sales target date range.
4. Install dependencies: `go mod tidy`
5. Run the app:
   - `go run cmd/profitChecker/main.go`

   or build an executable:
   - `go build -o cs2-profit-checker.exe ./cmd/profitChecker`

## Important notes:

1. Data Interpretation: This code does interpreter empty `floats`, `phases`, or `patterns` as `0.0`, `""`, or `0` respectively.

   _(I could use pointers but it requires a lot of checks in every service file. Since i rarely buy and sell stickers, containers etc (items without float) i reduced some code complexity)_

2. DMarket's Limitation: I do **not** recommend to fetch DMarket's history before September 2025. Transactions made before that date lack critical metadata (float, phase, pattern and dmarket's local item ID), which makes it impossible to generate a unique "signature" (based on metadata) for matching without using any complex workarounds.

   _(DMarket's transactions lost metadata lack **can** be "recovered" by using strange workaround but it requires a major additions, changes to existing code and A LOT of authorized requests)_

3. File locking: If `report.xlsx` is open in Excel, the app cannot overwrite it.

   _Its also possible to write dates in file names according to fetched sales range, maybe i will add this later._

4. Settings details: The start and end settings are inclusive of the entire month.
   1. Example: If you set `start_month: 1` and `end_month: 2` (with year 2026), the app will fetch data for both January AND February, up to the very last second of February (23:59:59 UTC).

   2. Buy History: The app is hardcoded in `main.go` to search for "Buys" starting from 2020. However, I do **not** recommend setting your "Sales" range that far back (even before 2025) due to the metadata issues mentioned in Note 2 and the strict requests and history limits on cookie-related marketplaces.

   3. This app completely ignores transactions if the corresponding opposite transaction was not found (i.e., it does not save them to files). Keep this in mind. I think I will do something about it later.

##### Created for CS2 trading community and enthusiasts by a CS2 trader.
