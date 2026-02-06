package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/cyberbebebe/cs2-profit-checker/types"
	"github.com/cyberbebebe/cs2-profit-checker/utils"
)

type BuffMarketService struct {
	Headers map[string]string
	Cookies map[string]string
	Client *http.Client
}

func NewBuffMarketService(headers, cookies map[string]string) *BuffMarketService {
    return &BuffMarketService{
		Headers: headers,
		Cookies: cookies,
        Client: &http.Client{
            Timeout: 10 * time.Second,
        },
    }
}

func (s *BuffMarketService) Name() string {
    return "BuffMarket"
}

func (s *BuffMarketService) GetSales(startTime, endTime time.Time)([]types.Transaction, error){
	return s.fetchHistory("sell", startTime, endTime)
}

func (s *BuffMarketService) GetBuys(startTime, endTime time.Time)([]types.Transaction, error){
	return s.fetchHistory("buy", startTime, endTime)
}


func (s *BuffMarketService) fetchHistory(action string, startTime, endTime time.Time) ([]types.Transaction, error){
	var allTxs []types.Transaction
	page := 1

	for{
		url := fmt.Sprintf("https://api.buff.market/api/market/%s_order/history?game=csgo&page_num=%d&page_size=200&state=success", action, page)

		req, _ := http.NewRequest("GET", url, nil)

		for k, v := range s.Headers {
			req.Header.Set(k, v)
		}
		for k, v := range s.Cookies {
			req.AddCookie(&http.Cookie{Name: k, Value: v})
		}

		resp, err := s.Client.Do(req)
		if err != nil{
			return nil, fmt.Errorf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200{
			return nil, fmt.Errorf("BuffMarket response error: %v", err)
		}

		var response buffMarketResponse
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			return nil, fmt.Errorf("json decode error: %v", err)
		}

		if response.Code != "OK" {
			return nil, fmt.Errorf("buff API error: %s - %s", response.Code, response.Msg)
		}

		for _, raw := range response.Data.Items{

			if raw.State != "SUCCESS"{
				continue
			}

			goodsIDStr := strconv.Itoa(raw.GoodsID)
			info, exists := response.Data.GoodsInfos[goodsIDStr]

			itemName := "Unknown Item"
			if exists {
				itemName = info.ItemName
			}

			cleanTx := convertBuffMarketTx(raw, itemName, action)
			
			if cleanTx.Date.After(endTime) {
				continue
			}
			
			if cleanTx.Date.Before(startTime) {
				return allTxs, nil
			}

			allTxs = append(allTxs, cleanTx)

		}

		if page >= response.Data.TotalPages{
			return allTxs, nil
		}

		page++

		time.Sleep(2 * time.Second)
	}

}

func convertBuffMarketTx(raw buffItemObject, itemName string, action string) types.Transaction{

	txType := types.TxSell
	if action == "buy" {
		txType = types.TxBuy
	}

	priceVal, _ := strconv.ParseFloat(raw.Price, 64)
	feeVal, _ := strconv.ParseFloat(raw.Fee, 64)

	finalPrice := priceVal - feeVal

	floatVal, _ := strconv.ParseFloat(raw.AssetInfo.Paintwear, 64)
	date := time.Unix(raw.UpdatedAt, 0)

	finalPattern := -1

	if raw.AssetInfo.Info.Paintseed != nil{
		finalPattern = *raw.AssetInfo.Info.Paintseed
	}
	
	// Charm check
	if len(raw.AssetInfo.Info.Keychains) > 0 {
		charmObject := raw.AssetInfo.Info.Keychains[0]
		
		// Contains for situations where "Charm" part is not in CharmName
		if strings.Contains(itemName, charmObject.CharmName) {
			finalPattern = *charmObject.CharmPattern
    	}
	}

	tx := types.Transaction{
		Source:    "BuffMarket",
		Type:      txType,
		TxID:      raw.TxID,
		AssetID:   raw.AssetInfo.AssetID,
		ItemName:  itemName,
		Price:     finalPrice,
		Currency:  "USD",
		Date:      date,
		FloatVal:  floatVal,
		Pattern:   finalPattern,
		Phase:     raw.AssetInfo.Info.Metaphysic.Data.Phase,
	}

	tx.Signature = utils.GenerateSignature(tx.ItemName, tx.FloatVal, finalPattern)
	
	return tx
}