package services

import (
	"time"

	"github.com/cyberbebebe/cs2-profit-checker/types"
)

type Fetcher interface {
    Name() string
    GetSales(start, end time.Time) ([]types.Transaction, error)
    GetBuys(start, end time.Time) ([]types.Transaction, error)
}