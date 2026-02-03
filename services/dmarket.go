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

type dmarketWebTransaction struct {
	Type       string `json:"type"`
	ID         string `json:"id"`
	CustomID   string `json:"customId"`
	Emitter    string `json:"emitter"`
	Action     string `json:"action"`
	Subject    string `json:"subject"`
	Contractor struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Type  string `json:"type"`
	} `json:"contractor"`
	Details struct {
		SettlementTime int64  `json:"-"`
		Image          string `json:"-"`
		ItemID         string `json:"itemId"`
		Extra          struct {
			FloatPartValue string  `json:"floatPartValue"`
			FloatValue     float64 `json:"floatValue"`
			PaintSeed      int    `json:"paintSeed"` // to compare nil instead of 0
			PhaseTitle     string  `json:"phaseTitle"`
		} `json:"extra"`
	} `json:"details"`
	Changes []struct {
		Money struct {
			Amount   string `json:"amount"`
			Currency string `json:"currency"`
		} `json:"money"`
		ChangeType string `json:"changeType"`
	} `json:"changes"`
	From    string `json:"from"`
	To      string `json:"to"`
	Status  string `json:"status"`
	Balance struct {
		Amount   string `json:"amount"`
		Currency string `json:"currency"`
	} `json:"balance"`
	UpdatedAt int64 `json:"updatedAt"`
	CreatedAt int64 `json:"createdAt"`
}

type webHistoryResponse struct {
	Objects []dmarketWebTransaction `json:"objects"`
	Total   int           `json:"total"`
}

type DMarketService struct {
    PrivateKey string
    Client     *http.Client
}

// SERVICE FUNCTIONS
func NewDMarketService(privateKey string) *DMarketService {
    return &DMarketService{
        PrivateKey: privateKey,
        Client: &http.Client{
            Timeout: 10 * time.Second,
        },
    }
}

func (s *DMarketService) Name() string {
    return "DMarket"
}

// SALE HISTORY
func (s *DMarketService) GetSales(startTime, endTime time.Time) ([]types.Transaction, error){
	var allSales []types.Transaction
	
	limit := 1000
    offset := 0
    root := "https://api.dmarket.com"

	for{
		apiPath := fmt.Sprintf("/exchange/v1/history?activities=sell&statuses=success&sortBy=updatedAt&limit=%d&offset=%d", limit, offset)

		req, _ := http.NewRequest("GET", root+apiPath, nil)
		
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
			
			cleanTx := convertDMarketWebTx(sold)
			if cleanTx.Date.After(endTime){
				continue
			}

			if cleanTx.Date.Before(startTime) {
                 return allSales, nil
            }

			allSales = append(allSales, cleanTx)
		}

		if itemsFetched < limit {
            break
        }

		offset += itemsFetched

		time.Sleep(200 * time.Millisecond)
	}

	return allSales, nil

}

// BUY HISTORY
func (s *DMarketService) GetBuys(startTime, endTime time.Time) ([]types.Transaction, error){
	var allBuys []types.Transaction
	
	limit := 1000
    offset := 0
    root := "https://api.dmarket.com"

	for{
		apiPath := fmt.Sprintf("/exchange/v1/history?activities=purchase,target_closed&statuses=success&sortBy=updatedAt&limit=%d&offset=%d", limit, offset)

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
			
			cleanTx := convertDMarketWebTx(sold)
			if cleanTx.Date.After(endTime){
				continue
			}

			if cleanTx.Date.Before(startTime) {
                 return allBuys, nil
            }

			allBuys = append(allBuys, cleanTx)
		}

		if itemsFetched < limit {
            break
        }

		offset += itemsFetched

		time.Sleep(200 * time.Millisecond)
	}

	return allBuys, nil

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