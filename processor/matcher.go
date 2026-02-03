package processor

import (
	"math"
	"sort"

	"github.com/cyberbebebe/cs2-profit-checker/types"
)

func toFixed(num float64, precision int) float64 {
    output := math.Pow(10, float64(precision))
    return math.Round(num*output) / output
}

func MatchTransactions(sales []types.Transaction, buys []types.Transaction) []types.CompletedPair {

	// 1. Organize Buys into a Lookup Map (The Optimization)
	// Key: Signature, Value: List of Buys sorted by date
	buyMap := make(map[string][]types.Transaction)

	for _, b := range buys {
		sig := b.Signature
		buyMap[sig] = append(buyMap[sig], b)
	}

	// 2. Sort Buys by Date (Oldest first) for FIFO matching
	for sig := range buyMap {
		sort.Slice(buyMap[sig], func(i, j int) bool {
			return buyMap[sig][i].Date.Before(buyMap[sig][j].Date)
		})
	}

	var pairs []types.CompletedPair

	// 3. Iterate Sales and Find Matches
	for _, sale := range sales {
		sig := sale.Signature

		// Check if we have any buys for this specific item signature
		potentialBuys, exists := buyMap[sig]

		if !exists || len(potentialBuys) == 0 {
			// OPTIONAL: Create a "partial" pair (Sold but buy not found)
			continue
		}

		// MATCHING LOGIC: Find the best buy.
		// Simple FIFO: Take the oldest buy that happened BEFORE the sale
		matchIndex := -1
		for i, buy := range potentialBuys {
			if buy.Date.Before(sale.Date) {
				matchIndex = i
				break // Found the first valid buy (FIFO)
			}
		}

		if matchIndex != -1 {
			// We found a match!
			matchedBuy := potentialBuys[matchIndex]

			// Calculate Profit
			rawProfit := sale.Price - matchedBuy.Price
            rawProfitPerc := 0.0
            if matchedBuy.Price > 0 {
                rawProfitPerc = (rawProfit / matchedBuy.Price) * 100
            }
			profit := toFixed(rawProfit, 2)
            profitPerc := toFixed(rawProfitPerc, 2)

			// Create the Pair
			pair := types.CompletedPair{
				ItemName:  sale.ItemName,
				Signature: sale.Signature,
				SellTime:  sale.Date,

				BuySource:  matchedBuy.Source,
				BuyPrice:   matchedBuy.Price,
				SellSource: sale.Source,
				SellPrice:  sale.Price,

				Profit:     profit,
				ProfitPerc: profitPerc,

				BuyTxID:  matchedBuy.TxID,
				SellTxID: sale.TxID,
			}
			pairs = append(pairs, pair)

			// CRITICAL: Remove the used buy from the map so it isn't used again!
			// remove index i from slice
			buyMap[sig] = append(buyMap[sig][:matchIndex], buyMap[sig][matchIndex+1:]...)
		}
	}

	return pairs
}