package services

type csfloatResponse struct {
	Trades []trade `json:"trades"`
	Count  int     `json:"count"`
}

type trade struct {
	ID         string   `json:"id"`
	VerifiedAt string   `json:"verified_at"`
	Contract   contract `json:"contract"`
}

type contract struct {
	Item  item `json:"item"`
	Price int  `json:"price"` // Cents!
}

type item struct {
	AssetID      string  `json:"asset_id"`
	ItemName     string  `json:"market_hash_name"`
	FloatValue   float64 `json:"float_value"`
	Phase        string  `json:"phase"`
	Pattern      *int     `json:"paint_seed"`
	CharmPattern *int     `json:"keychain_pattern"`
}