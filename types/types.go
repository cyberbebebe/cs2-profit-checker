package types

import "time"

type TxType string

const (
    TxBuy  TxType = "BUY"
    TxSell TxType = "SELL"
)

// Complete data object
type Transaction struct {
    Source    string    `json:"source"`
    Type      TxType    `json:"type"`
    TxID      string    `json:"tx_id"`
    AssetID   string    `json:"asset_id"`
    ItemName  string    `json:"item_name"`
    Price     float64   `json:"price"`
    Currency  string    `json:"currency"`
    Date      time.Time `json:"date"`
    FloatVal  float64   `json:"float_value"`
	Phase     string    `json:"phase"`
    Pattern   int       `json:"pattern"`
    Signature string    `json:"signature"`
}

// Merged "complete" deal
type CompletedPair struct {
    ItemName   string    `json:"item_name"`
    
    // Buy Info
    BuySource  string    `json:"buy_source"`
    BuyPrice   float64   `json:"buy_price"`
    BuyTime    time.Time `json:"buy_time"`
    BuyTxID    string    `json:"buy_tx_id"`

    // Sell Info
    SellSource string    `json:"sell_source"`
    SellPrice  float64   `json:"sell_price"`
    SellTime   time.Time `json:"sell_time"`
    SellTxID   string    `json:"sell_tx_id"`

    // Results
    Profit     float64   `json:"profit"`
    ProfitPerc float64   `json:"profit_percent"`
    Signature  string    `json:"signature"`

    // Metadata
    FloatVal float64
    Phase    string
    Pattern  int
}

type Settings struct {
    CreateXLSX    bool `json:"create_xlsx"`
    FetchDMarket  bool `json:"fetch_dmarket"`
    DmarketCSOnly bool `json:"dmarket_cs_only"`
    FetchCSFloat  bool `json:"fetch_csfloat"`
    FetchBuffMarket     bool `json:"fetch_buffmarket"`
    FetchCSMoney  bool `json:"fetch_csmoney"`
    FetchYoupin   bool `json:"fetch_youpin"`
    
    StartYear     int  `json:"start_year"`
    StartMonth    int  `json:"start_month"`
    EndYear       int  `json:"end_year"`
    EndMonth      int  `json:"end_month"`
}

type Secrets struct {
    DMarketKey    string            `json:"dmarket_key"`
    CSFloatKey    string            `json:"csfloat_key"`
    
    BuffCookies      map[string]string `json:"buffmarket_cookies"`
    BuffHeaders      map[string]string `json:"buffmarket_headers"`
    CSMoneyCookies   map[string]string `json:"csmoney_cookie"`
    YoupinHeaders    map[string]string `json:"youpin_headers"`
    YoupinSteamID    string `json:"youpin_steamid"`
}