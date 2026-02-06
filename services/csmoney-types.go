package services

type csmoneyResponse []csmoneyItem

type csmoneyItem struct {
	SourceID       string         `json:"sourceId"`
	UpdateTime     int64          `json:"updateTime"`
	TimeSettlement *int64         `json:"timeSettlement"`
	Offset         int64          `json:"offset"`
	Type           string         `json:"type"`
	Details        csmoneyDetails `json:"details"`
}

type csmoneyDetails struct {
	// 1. Sell structure
	OnWallet  float64 `json:"onWallet"`
	SellOrder struct {
		ID    int64 `json:"id"`
		Skins struct {
			Asset struct {
				ID        string `json:"id"`
				Float     string `json:"float"`
				PaintSeed *int   `json:"paintseed"`
				Names     struct {
					Full string `json:"full"`
				} `json:"names"`
				CharmPattern *int `json:"keychainPattern"`
			} `json:"asset"`
		} `json:"skins"`
	} `json:"sellOrder"`

	// 2. Buy structure
	Offer struct {
		Skins []struct {
			ID    int64 `json:"id"`
			Asset struct {
				ID           int64   `json:"id"`
				Float        float64 `json:"float"`
				Pattern      *int    `json:"pattern"`
				CharmPattern *int    `json:"keychainPattern"`
				Names        struct {
					Full string `json:"full"`
				} `json:"names"`
			} `json:"asset"`

			Pricing struct {
				Computed float64 `json:"computed"`
			} `json:"pricing"`
		} `json:"skins"`
	} `json:"offer"`
}