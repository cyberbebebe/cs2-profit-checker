package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/cyberbebebe/cs2-profit-checker/config"
	"github.com/cyberbebebe/cs2-profit-checker/processor"
	"github.com/cyberbebebe/cs2-profit-checker/services"
	"github.com/cyberbebebe/cs2-profit-checker/types"
	"github.com/cyberbebebe/cs2-profit-checker/utils"
)

func main(){
	// Load config and secrets
	cfg, err := config.LoadSettings("config/settings.json")
	if err != nil {
		log.Fatalf("Failed to load settings: %v", err)
	}
	secrets, err := config.LoadSecrets("config/secrets.json")
	if err != nil {
		log.Fatalf("Failed to load secrets: %v", err)
	}

	salesStart, salesEnd := utils.GetDateRange(
		cfg.StartYear, 
		cfg.StartMonth, 
		cfg.EndYear,
		cfg.EndMonth, 
	)

    buyStart := time.Date(2023, 1, 1, 0, 0, 0, 0, time.UTC)
	buyEnd := time.Now().AddDate(0, 0, 1)

	fmt.Printf("Looking for SALES between: %s and %s\n", salesStart.Format("2006-01-02"), salesEnd.Format("2006-01-02"))
	fmt.Printf("Looking for BUYS from: %s\n", buyStart.Format("2006-01-02"))

	var fetchers []services.Fetcher
	
	if cfg.FetchDMarket {
		csOnly := false
		if cfg.DmarketCSOnly{
			csOnly = true
		}
        fetchers = append(fetchers, services.NewDMarketService(secrets.DMarketKey, csOnly))
    }

	if cfg.FetchCSFloat {
        fetchers = append(fetchers, services.NewCSFloatService(secrets.CSFloatKey))
    }

	if cfg.FetchBuffMarket {
        fetchers = append(fetchers, services.NewBuffMarketService(secrets.BuffHeaders, secrets.BuffCookies))
    }
	
	if cfg.FetchCSMoney {
        fetchers = append(fetchers, services.NewCSMoneyService(secrets.CSMoneyCookies))
    }

	if cfg.FetchYoupin {
		fetchers = append(fetchers, services.NewYoupinService(secrets.YoupinHeaders, secrets.YoupinSteamID))
	}

	var allSales []types.Transaction
	var allBuys []types.Transaction

    var muSales sync.Mutex
	var muBuys sync.Mutex
	var wg sync.WaitGroup

	startTime := time.Now()

	for _, f := range fetchers {
		wg.Add(1)
		// Launch SALES fetcher
		go func(fetcher services.Fetcher){
			defer wg.Done()
			fmt.Printf("Starting %s...\n", fetcher.Name())
			sales, err := fetcher.GetSales(salesStart, salesEnd)
			if err != nil {
				log.Printf("[%s] Sales Error: %v", fetcher.Name(), err)
				return
			}
			muSales.Lock()
			allSales = append(allSales, sales...)
			muSales.Unlock()

			fmt.Printf("[%s] Found %d Sales\n", fetcher.Name(), len(sales))
		}(f)

		// Launch BUYS fetcher
		wg.Add(1)
		go func(fetcher services.Fetcher){
			defer wg.Done()
			fmt.Printf("[%s] Fetching Buys (Full History)...\n", fetcher.Name())
			buys, err := fetcher.GetBuys(buyStart, buyEnd)
			if err != nil {
				log.Printf("[%s] Buys Error: %v", fetcher.Name(), err)
				return
			}

			muBuys.Lock()
			allBuys = append(allBuys, buys...)
			muBuys.Unlock()
			fmt.Printf("[%s] Found %d Buys\n", fetcher.Name(), len(buys))

		}(f)
	}

	wg.Wait()
	fmt.Printf("\nFetching complete in %v.\nTotal Sales: %d | Total Buys: %d\n", time.Since(startTime), len(allSales), len(allBuys))

	fmt.Println("Starting matching process...")
	completedPairs := processor.MatchTransactions(allSales, allBuys)
	fmt.Printf("Successfully matched %d pairs.\n", len(completedPairs))
	
	reportName := fmt.Sprintf("trade_report_%s_to_%s", 
		salesStart.Format("02-01-2006"), 
		salesEnd.Format("02-01-2006"),
	)

	file, _ := os.Create(reportName + ".json") 
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	encoder.Encode(completedPairs)

	fmt.Printf("Report saved to %s.json\n", reportName)
	
	if cfg.CreateXLSX {
		sort.Slice(completedPairs, func(i, j int) bool {
    		return completedPairs[i].SellTime.After(completedPairs[j].SellTime)
		})
        fmt.Printf("Generating Excel report (%s.xlsx)...\n", reportName)
		
        err := utils.CreateExcelReport(completedPairs, reportName + ".xlsx")
        if err != nil {
            log.Printf("Failed to create Excel: %v", err)
        } else {
            fmt.Println("Excel report created successfully!")
        }
    }

}