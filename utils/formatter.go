package utils

import (
	"fmt"
	"time"
)

func GenerateSignature(name string, floatVal float64, pattern int) string{
	return fmt.Sprintf("%s|%.8f|%d", name, floatVal, pattern)
}

func GetDateRange(startYear, startMonth, endYear, endMonth int) (time.Time, time.Time) {
    start := time.Date(startYear, time.Month(startMonth), 1, 0, 0, 0, 0, time.UTC)
    endBase := time.Date(endYear, time.Month(endMonth), 1, 0, 0, 0, 0, time.UTC)
    end := endBase.AddDate(0, 1, 0)

    return start, end
}
