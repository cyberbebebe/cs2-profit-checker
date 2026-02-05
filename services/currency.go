package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Global instance
var Currency = &CurrencyService{}

type CurrencyService struct {
	rates map[string]float64
	mu    sync.RWMutex
	loaded bool
}

// Response structure for Frankfurter Bulk Request
type frankfurterResponse struct {
	Rates map[string]map[string]float64 `json:"rates"`
}

// LoadRates fetches ALL history (from 2020 to Now)
func (s *CurrencyService) LoadRates() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.loaded {
		return nil 
	}

	// Dynamic Range: 2020-01-01 to Today
	url := "https://api.frankfurter.dev/v1/2020-01-01..?from=CNY&to=USD"

	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("failed to fetch currency: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("currency API error: %d", resp.StatusCode)
	}

	var data frankfurterResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return fmt.Errorf("decode error: %v", err)
	}

	// Flatten the map for easier lookup
	s.rates = make(map[string]float64)
	for dateStr, rateMap := range data.Rates {
		if rate, ok := rateMap["USD"]; ok {
			s.rates[dateStr] = rate
		}
	}

	s.loaded = true
	fmt.Printf("[Currency] Loaded rates for %d days.\n", len(s.rates))
	return nil
}

// GetRate finds the rate for a specific date.
func (s *CurrencyService) GetRate(date time.Time) float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Default fallback if everything fails
	const fallbackRate = 0.1395

	if len(s.rates) == 0 {
		return fallbackRate
	}

	// Try finding the date, loop back 5 days if missing
	currentDate := date
	for i := 0; i < 5; i++ {
		dateStr := currentDate.Format("2006-01-02")
		if rate, exists := s.rates[dateStr]; exists {
			return rate
		}
		// Go back 1 day
		currentDate = currentDate.AddDate(0, 0, -1)
	}

	return fallbackRate
}