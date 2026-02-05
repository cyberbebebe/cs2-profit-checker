package services

import (
	"encoding/json"
)

// Request Payload
type youpinPayload struct {
	Keys        string `json:"keys"`
	OrderStatus int    `json:"orderStatus"`
	PageIndex   int    `json:"pageIndex"`
	PageSize    int    `json:"pageSize"`
}

// Response Wrapper
type youpinResponse struct {
	Code int `json:"code"`
	Data struct {
		OrderList []youpinOrder `json:"orderList"`
	} `json:"data"`
}

// The Order Object
type youpinOrder struct {
	OrderNo                string          `json:"orderNo"`
	OrderDetailNo          string          `json:"orderDetailNo"` // Used as TxID
	FinishOrderTime        *int64          `json:"finishOrderTime"`        // ms
	RevocableOfferDeadline *int64          `json:"revocableOfferDeadline"` // ms
	PresenterSteamID       interface{}     `json:"presenterSteamId"`       // Can be null, string, or int
	ProductDetailList      []youpinProduct `json:"productDetailList"`
}

// The Product Object
type youpinProduct struct {
	CommodityHashName string `json:"commodityHashName"`
	Price             int64  `json:"price"` // In cents (CNY * 100)
	
	// "assertId" is the actual key in Youpin API (typo on their end)
	AssetID flexYoupinID `json:"assertId"` 

	// "abrade" is the Float Value (String)
	Abrade string `json:"abrade"` 

	PaintSeed    int    `json:"paintSeed"`
	DopplerTitle string `json:"dopplerTitle"`
}

// HELPER: Flexible ID (Handles string/int/float input)
type flexYoupinID string

func (fi *flexYoupinID) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		*fi = ""
		return nil
	}
	// Try unmarshal as string
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil { return err }
		*fi = flexYoupinID(s)
		return nil
	}
	// Try unmarshal as int/number
	var i json.Number
	if err := json.Unmarshal(b, &i); err != nil { return err }
	*fi = flexYoupinID(i.String())
	return nil
}