package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/cyberbebebe/cs2-profit-checker/types"
	"github.com/cyberbebebe/cs2-profit-checker/utils"
)

type YoupinService struct {
	SteamID string
	Headers map[string]string
	Client  *http.Client
}

func NewYoupinService(headers map[string]string, steamID string) *YoupinService {
	return &YoupinService{
		Headers: headers,
		Client: &http.Client{
			Timeout: 15 * time.Second, // 10s was in python, gave it a bit more
		},
		SteamID: steamID,
	}
}

func (s *YoupinService) Name() string { 
	return "Youpin"
}

func (s *YoupinService) GetSales(start, end time.Time) ([]types.Transaction, error) {
	return s.fetchHistory("Sell", start, end)
}

func (s *YoupinService) GetBuys(start, end time.Time) ([]types.Transaction, error) {
	return s.fetchHistory("Buy", start, end)
}

func (s *YoupinService) fetchHistory(mode string, startTime, endTime time.Time) ([]types.Transaction, error) {
	var results []types.Transaction

	if err := Currency.LoadRates(); err != nil {
		fmt.Printf("⚠️ Warning: Failed to load currency rates: %v\n", err)
	}
	
	// Setup URL & Payload based on Mode
	url := ""
	if mode == "Buy" {
		url = "https://api.youpin898.com/api/youpin/bff/trade/sale/v1/buy/list"
	} else {
		url = "https://api.youpin898.com/api/youpin/bff/trade/sale/v1/sell/list"
	}

	page := 1
	pageSize := 20

	for {
		// Prepare Payload
		payload := youpinPayload{
			Keys:        "",
			OrderStatus: 340,
			PageIndex:   page,
			PageSize:    pageSize,
		}
		jsonPayload, _ := json.Marshal(payload)

		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
		if err != nil {
			return results, fmt.Errorf("create req failed: %v", err)
		}

		for k, v := range s.Headers {
			req.Header.Set(k, v)
		}

		resp, err := s.Client.Do(req)
		if err != nil {
			return results, fmt.Errorf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			return results, fmt.Errorf("Youpin HTTP Error: %d", resp.StatusCode)
		}

		var response youpinResponse
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			return results, fmt.Errorf("decode error: %v", err)
		}

		orderList := response.Data.OrderList
		if len(orderList) == 0 {
			break
		}

		for _, order := range orderList {
			var rawTime int64
			if order.RevocableOfferDeadline != nil && *order.RevocableOfferDeadline > 0 {
				rawTime = *order.RevocableOfferDeadline
			} else if order.FinishOrderTime != nil {
				rawTime = *order.FinishOrderTime
			}

			// Convert ms to Time
			txDate := time.Unix(rawTime/1000, 0)

			// Time Filtering
			if txDate.After(endTime) {
				continue
			}
			if txDate.Before(startTime) {
				return results, nil 
			}
			
			// Skip gifting purchases
			if mode == "Buy" && order.PresenterSteamID != nil {
				pID := fmt.Sprintf("%v", order.PresenterSteamID)
				if pID != s.SteamID {
					continue
				}
			}

			// Process Items
			for _, item := range order.ProductDetailList {
				// Price Calculation
				priceCNY := float64(item.Price) / 100.0
				
				// Fee Calculation (Only for Sales)
				if mode == "Sell" {
					priceCNY = priceCNY * 0.99
				}

				rate := Currency.GetRate(txDate)
				rawUSD := priceCNY * rate
				priceUSD := utils.FloatRound(rawUSD)

				// Metadata Parsing
				floatVal, _ := strconv.ParseFloat(item.Abrade, 64)
				phase := item.DopplerTitle

				txType := types.TxSell
				if mode == "Buy" {
					txType = types.TxBuy
				}
				
				// Name
				name := item.CommodityHashName

				tx := types.Transaction{
					Source:    "Youpin",
					Type:      txType,
					TxID:      order.OrderDetailNo,
					AssetID:   string(item.AssetID),
					ItemName:  name,
					Price:     priceUSD,
					Currency:  "USD",
					Date:      txDate,
					FloatVal:  floatVal,
					Pattern:   item.PaintSeed,
					Phase:     phase,
					Signature: utils.GenerateSignature(name, floatVal, item.PaintSeed),
				}

				results = append(results, tx)
			}
		}

		// Pagination and break
		if len(orderList) < pageSize {
			break
		}

		page++

		sleepMs := 3000 + rand.Intn(2000)
		time.Sleep(time.Duration(sleepMs) * time.Millisecond)
	}

	return results, nil
}