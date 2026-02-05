package services

type buffMarketResponse struct {
	Code string       `json:"code"`
	Data buffDataLook `json:"data"`
	Msg  string       `json:"msg"`
}

type buffDataLook struct {
	GoodsInfos map[string]buffGoodsInfo `json:"goods_infos"`
	Items      []buffItemObject         `json:"items"`
	TotalPages int                      `json:"total_page"`
}

type buffGoodsInfo struct {
	ItemName string `json:"market_hash_name"`
}

type buffItemObject struct {
	TxID      string        `json:"id"`
	GoodsID   int           `json:"goods_id"`
	Price     string        `json:"price"`
	Fee       string        `json:"fee"`
	Income    string        `json:"income"`
	State     string        `json:"state"`
	StateText string        `json:"state_text"`
	UpdatedAt int64         `json:"updated_at"`
	AssetInfo buffAssetInfo `json:"asset_info"`
}

type buffAssetInfo struct {
	AssetID   string   `json:"assetid"`
	Paintwear string   `json:"paintwear"`
	Info      buffInfo `json:"info"`
}

type buffInfo struct {
	Paintseed  int `json:"paintseed"`
	Metaphysic struct {
		Data struct {
			Phase string `json:"name"`
		} `json:"data"`
	} `json:"metaphysic"`
	Keychains []struct {
		CharmName    string `json:"name"`
		CharmPattern int    `json:"pattern"`
	} `json:"keychains"`
}