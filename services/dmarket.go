package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/cyberbebebe/cs2-profit-checker/types"
	"github.com/cyberbebebe/cs2-profit-checker/utils"
)

type DMarketService struct {
	CS2only 		bool
    PrivateKey string
    Client     *http.Client
}

func NewDMarketService(privateKey string, csOnly bool) *DMarketService {
    return &DMarketService{
        PrivateKey: privateKey,
        Client: &http.Client{
            Timeout: 10 * time.Second,
        },
		CS2only: csOnly,
    }
}

func (s *DMarketService) Name() string {
    return "DMarket"
}

func (s *DMarketService) GetSales(startTime, endTime time.Time) ([]types.Transaction, error){
	return s.fetchHistory("sell", startTime, endTime)

}

func (s *DMarketService) GetBuys(startTime, endTime time.Time) ([]types.Transaction, error){
	return s.fetchHistory("buy", startTime, endTime)
}

func (s *DMarketService) fetchHistory(activity string, startTime, endTime time.Time) ([]types.Transaction, error){
	var allTxs []types.Transaction
	
	limit := 1000
    offset := 0
    root := "https://api.dmarket.com"
	activities := "sell"
	if activity == "buy"{
		activities = "purchase,target_closed"
	}

	for{
		apiPath := fmt.Sprintf("/exchange/v1/history?activities=%s&statuses=success&sortBy=updatedAt&limit=%d&offset=%d", activities, limit, offset)

		req, err := http.NewRequest("GET", root+apiPath, nil)
		if err != nil{
			return nil, err
		}
		
		headers, err := generateDMarketHeaders(s.PrivateKey, "GET", apiPath, nil)
		req.Header = headers

		resp, err := s.Client.Do(req)
        if err != nil {
            return nil, fmt.Errorf("request failed: %v", err)
        }
        defer resp.Body.Close()

		if resp.StatusCode == 429 {
            time.Sleep(5 * time.Second)
            continue
        }

		if resp.StatusCode != 200 {
            return nil, fmt.Errorf("API error: status %d", resp.StatusCode)
        }

		var response webHistoryResponse
        if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
            return nil, fmt.Errorf("json decode error: %v", err)
        }
		itemsFetched := len(response.Objects)
        if itemsFetched == 0 {
            break 
        }

		for _, sold := range response.Objects{
			if s.CS2only{
				if sold.Contractor.ID != "a8db"{
					continue
				}
			}
			cleanTx := convertDMarketWebTx(sold)
			if cleanTx.Date.After(endTime){
				continue
			}

			if cleanTx.Date.Before(startTime) {
                 return allTxs, nil
            }

			allTxs = append(allTxs, cleanTx)
		}

		if itemsFetched < limit {
            break
        }

		offset += itemsFetched

		time.Sleep(200 * time.Millisecond)
	}

	return allTxs, nil
}

func convertDMarketWebTx(raw dmarketWebTransaction) types.Transaction{
	var price float64

	price, _ = strconv.ParseFloat(raw.Changes[0].Money.Amount, 64)
	
	unixTime := raw.UpdatedAt
    if unixTime == 0 {
        unixTime = raw.CreatedAt
    }
    finalDate := time.Unix(unixTime, 0)

	txType := types.TxBuy
    if raw.Type == "sell" {
        txType = types.TxSell
    }

	tx := types.Transaction{
        Source:    "DMarket",
        Type:      txType,
        TxID:      raw.ID,
        AssetID:   raw.Details.ItemID,
        ItemName:  raw.Subject,
        Price:     price,
        Currency:  "USD",
        Date:      finalDate,
        FloatVal:  raw.Details.Extra.FloatValue,
        Pattern:   raw.Details.Extra.PaintSeed,
        Phase:     raw.Details.Extra.PhaseTitle,
    }
	
	tx.Signature = utils.GenerateSignature(tx.ItemName, tx.FloatVal, tx.Pattern)

	return tx
}