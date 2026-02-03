package services

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/cyberbebebe/cs2-profit-checker/types"
	"github.com/cyberbebebe/cs2-profit-checker/utils"
)

type csfloatResponse struct {
	Trades []trade `json:"trades"`
	Count int `json:"count"`
}

type trade struct {
	ID         string      `json:"id"`
	VerifiedAt string      `json:"verified_at"`
	Contract   contract    `json:"contract"`
}

type contract struct{
	Item item `json:"item"`
	Price int `json:"price"` // Cents!
}	

type item struct{
	AssetID  string `json:"asset_id"`
	ItemName string `json:"market_hash_name"`
	FloatValue float64 `json:"float_value"`
	Phase string `json:"phase"`
	Pattern int `json:"paint_seed"`
	
}

type CSFloatService struct {
	ApiKey string
	Client *http.Client
}

// SERVICE FUNCTIONS
func NewCSFloatService(apiKey string) *CSFloatService{
	return &CSFloatService{
		ApiKey: apiKey,
		Client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (s *CSFloatService) Name() string {
	return "CSFloat"
}

// SALE HISTORY
func (s *CSFloatService) GetSales(startTime, endTime time.Time)([]types.Transaction, error){
	return s.fetchTrades("seller", startTime, endTime)
}

// BUY HISTORY
func (s *CSFloatService) GetBuys(startTime, endTime time.Time)([]types.Transaction, error){
	return s.fetchTrades("buyer", startTime, endTime)
}

// Shared fetcher
func (s *CSFloatService) fetchTrades(role string, startTime, endTime time.Time) ([]types.Transaction, error){
	var allTxs []types.Transaction
	page := 0

	for{
		url := fmt.Sprintf("https://csfloat.com/api/v1/me/trades?role=%s&state=verified&limit=1000&page=%d", role, page)

		req, _ := http.NewRequest("GET", url, nil)

		req.Header.Set("Authorization", s.ApiKey)

		resp, err := s.Client.Do(req)
		if err != nil{
			return nil, fmt.Errorf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200{
			return nil, fmt.Errorf("CSFloat API Error: %d", resp.StatusCode)
		}

		var response csfloatResponse
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil{
			return nil, fmt.Errorf("decode error: %v", err)
		}

		if len(response.Trades) == 0 {
			break
		}

		for _, raw := range response.Trades{
			cleanTx := convertCsfloatTx(raw, role)

			if cleanTx.Date.After(endTime) {
				continue
			}
			if cleanTx.Date.Before(startTime) {
				return allTxs, nil
			}

			allTxs = append(allTxs, cleanTx)
		} 

		page++
		time.Sleep(1500 * time.Millisecond)
	}
	return allTxs, nil
}

func convertCsfloatTx(raw trade, role string) types.Transaction{
	t, err := time.Parse(time.RFC3339, raw.VerifiedAt)
	if err != nil {
		t = time.Now() // Fallback
	}

	txType := types.TxSell
	if role == "buyer" {
		txType = types.TxBuy
	}

	var finalPrice float64

	// Calculate 98% of the value if our sale
	if role == "seller" {
        afterFeeCents := float64(raw.Contract.Price) * 0.98
        finalPrice = math.Round(afterFeeCents) / 100.0

    } else {
        finalPrice = float64(raw.Contract.Price) / 100.0
	}

	tx := types.Transaction{
		Source:    "CSFloat",
		Type:      txType,
		TxID:      raw.ID,
		AssetID:   raw.Contract.Item.AssetID,
		ItemName:  raw.Contract.Item.ItemName,
		Price:     finalPrice,
		Currency:  "USD",
		Date:      t,
		FloatVal:  raw.Contract.Item.FloatValue,
		Pattern:   raw.Contract.Item.Pattern,
		Phase:     raw.Contract.Item.Phase,
	}

	tx.Signature = utils.GenerateSignature(tx.ItemName, tx.FloatVal, tx.Pattern)
	
	return tx

}