package processor

import (
	"math"
	"sort"
	"time"

	"github.com/cyberbebebe/cs2-profit-checker/types"
)

func toFixed(num float64, precision int) float64 {
    output := math.Pow(10, float64(precision))
    return math.Round(num*output) / output
}

func MatchTransactions(sales []types.Transaction, buys []types.Transaction) []types.CompletedPair {

	// 1. Organize Buys into a Lookup Map
	buyMap := make(map[string][]types.Transaction)

	for _, b := range buys {
		sig := b.Signature
		buyMap[sig] = append(buyMap[sig], b)
	}

	// 2. Sort Buys by Date (NEWEST first)
	for sig := range buyMap {
		sort.Slice(buyMap[sig], func(i, j int) bool {
			return buyMap[sig][i].Date.After(buyMap[sig][j].Date)
		})
	}

	var pairs []types.CompletedPair

	// 3. Iterate Sales
	for _, sale := range sales {
		sig := sale.Signature
		potentialBuys := buyMap[sig]

		matchIndex := -1

		// Try to find a valid buy
		if len(potentialBuys) > 0 {
			for i, buy := range potentialBuys {
				if buy.Date.Before(sale.Date) {
					matchIndex = i
					break // Found the newest valid buy
				}
			}
		}

		// Initialize Pair Data
		var buyPrice, profit, profitPerc float64
		var buySource, buyTxID string
		var buyTime time.Time

		if matchIndex != -1 {
			// Match
			matchedBuy := potentialBuys[matchIndex]

			buySource = matchedBuy.Source
			buyPrice = matchedBuy.Price
			buyTxID = matchedBuy.TxID
			buyTime = matchedBuy.Date

			// Calculate Profit
			rawProfit := sale.Price - matchedBuy.Price
			rawProfitPerc := 0.0
			if matchedBuy.Price > 0 {
				rawProfitPerc = (rawProfit / matchedBuy.Price) * 100
			}

			profit = toFixed(rawProfit, 2)
			profitPerc = toFixed(rawProfitPerc, 2)

			// REMOVE used buy from map so it isn't used again
			buyMap[sig] = append(buyMap[sig][:matchIndex], buyMap[sig][matchIndex+1:]...)

		} else {
			// No match, saving with 0 profit
			buySource = "N/A"
			buyPrice = 0.0
			buyTime = time.Time{}
			buyTxID = ""
			profit = 0.0
			profitPerc = 0.0
		}

		// Create the Final Pair
		pair := types.CompletedPair{
			ItemName:   sale.ItemName,
			Signature:  sale.Signature,
			BuyTime:    buyTime,
			SellTime:   sale.Date,
			
			SellSource: sale.Source,
			SellPrice:  sale.Price,
			SellTxID:   sale.TxID,

			BuySource:  buySource,
			BuyPrice:   buyPrice,
			BuyTxID:    buyTxID,
			
			Profit:     profit,
			ProfitPerc: profitPerc,

			FloatVal: sale.FloatVal,
			Phase:    sale.Phase,
			Pattern:  sale.Pattern,
		}

		pairs = append(pairs, pair)
	}

	return pairs
}