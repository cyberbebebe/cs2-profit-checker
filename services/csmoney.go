package services

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"strconv"
	"time"

	"github.com/cyberbebebe/cs2-profit-checker/types"
	"github.com/cyberbebebe/cs2-profit-checker/utils"
	"github.com/enetx/g"
	shttp "github.com/enetx/http"
	"github.com/enetx/surf"
)

type CSMoneyService struct {
	Cookies []*shttp.Cookie
	Client  *surf.Client
}


func NewCSMoneyService(cookies map[string]string) *CSMoneyService {
	var cookieSlice []*shttp.Cookie
	for name, value := range cookies {
		cookieSlice = append(cookieSlice, &shttp.Cookie{
			Name:  name,
			Value: value,
		})
	}

	// Create Surf Client
	surfClient := surf.NewClient().
		Builder().
		Impersonate().Chrome().
		Session().
		Build().
		Unwrap()

	return &CSMoneyService{
		Cookies: cookieSlice,
		Client:  surfClient,
	}
}



func (s *CSMoneyService) Name() string {
	return "CSMoney"
}

func (s *CSMoneyService) GetSales(startTime, endTime time.Time) ([]types.Transaction, error){
	return s.fetchHistory("sold", startTime, endTime)
}

func (s *CSMoneyService) GetBuys(startTime, endTime time.Time) ([]types.Transaction, error){
	return s.fetchHistory("accepted", startTime, endTime)
}

func (s *CSMoneyService) fetchHistory(status string, startTime, endTime time.Time) ([]types.Transaction, error) {
	var allTxs []types.Transaction

	offset := ""
	acceptedStr := ""
	if status == "accepted"{
		acceptedStr = "&type=buy"
	}

	for{
		url := fmt.Sprintf("https://cs.money/2.0/market/history?limit=100&noCache=true%s&status=%s%s", offset, status, acceptedStr)
		g_url := g.String(url)
		
		req := s.Client.Get(g_url)
		for _, cookie := range s.Cookies {
			req = req.AddCookies(cookie)
		}
		resp := req.Do()

		if !resp.IsOk() {
			return allTxs, fmt.Errorf("request failed: %v", resp.Err())
		}

		response := resp.Ok()
		defer response.Body.Close()

		if response.StatusCode != 200 {
			return allTxs, fmt.Errorf("CSMoney error %d", response.StatusCode)
		}
		
		// Get body as bytes
		bodyResult := response.Body.Bytes()
		if !bodyResult.IsOk() {
			return allTxs, fmt.Errorf("failed to read body: %v", bodyResult.Err())
		}
		
		bodyBytes := bodyResult.Ok()
		
		var items csmoneyResponse
		if err := json.Unmarshal(bodyBytes.Std(), &items); err != nil {
			return allTxs, fmt.Errorf("decode error: %v", err)
		}

		for _, raw := range items {
			txs := s.convertCSMoneyTx(raw)
			for _, tx := range txs {
				if tx.Date.After(endTime) { continue }
				if tx.Date.Before(startTime) { return allTxs, nil }
				allTxs = append(allTxs, tx)
			}
		}
		
		lastItem := items[len(items)-1]
		newOffset := lastItem.Offset

		if len(items) < 100 {
			break
		}

		offset = fmt.Sprintf("&offset=%d", newOffset)

		sleepMs := 3000 + rand.Intn(1500) 
		time.Sleep(time.Duration(sleepMs) * time.Millisecond)
	}

	return allTxs, nil

}

func (s *CSMoneyService) convertCSMoneyTx(raw csmoneyItem) []types.Transaction {
	var transactions []types.Transaction
	
	date := time.Unix(raw.UpdateTime/1000, 0)
	if raw.TimeSettlement != nil {
        date = time.Unix(*raw.TimeSettlement, 0)
    }

	// SALES
	if raw.Type == "sell" {
		data := raw.Details.SellOrder.Skins
		
		finalPattern := -1
		if data.Asset.PaintSeed != nil{
			finalPattern = *data.Asset.PaintSeed
		}
		if data.Asset.CharmPattern != nil {
			finalPattern = *data.Asset.CharmPattern
		}

		fVal, _ := strconv.ParseFloat(data.Asset.Float, 64)
		cleanName, phase := utils.ExtractPhase(data.Asset.Names.Full)
		tx := types.Transaction{
			Source:    "CSMoney",
			Type:      types.TxSell,
			TxID:      raw.SourceID,
			AssetID:   data.Asset.ID,     
			ItemName:  cleanName,
			Price:     raw.Details.OnWallet,
			Currency:  "USD",
			Date:      date,
			FloatVal:  fVal,
			Pattern:   finalPattern,
			Phase:     phase,
		}
		// Signature
		tx.Signature = utils.GenerateSignature(tx.ItemName, tx.FloatVal, finalPattern)
		transactions = append(transactions, tx)

	// BUYS
	} else if raw.Type == "buy" {
		for _, skin := range raw.Details.Offer.Skins {
			cleanName, phase := utils.ExtractPhase(skin.Asset.Names.Full)

			finalPattern := -1
			if skin.Asset.Pattern != nil{
				finalPattern = *skin.Asset.Pattern
			}
			if skin.Asset.CharmPattern != nil {
				finalPattern = *skin.Asset.CharmPattern
		}

			tx := types.Transaction{
				Source:    "CSMoney",
				Type:      types.TxBuy,
				TxID:      fmt.Sprintf("%d", skin.ID),
				AssetID:   fmt.Sprintf("%d", skin.Asset.ID),
				ItemName:  cleanName,
				Price:     skin.Pricing.Computed,
				Currency:  "USD",
				Date:      date,
				FloatVal:  skin.Asset.Float,
				Pattern:   finalPattern,
				Phase:     phase,
			}
			// Signature
			tx.Signature = utils.GenerateSignature(tx.ItemName, tx.FloatVal, finalPattern)
			transactions = append(transactions, tx)
		}
	}

	return transactions
}