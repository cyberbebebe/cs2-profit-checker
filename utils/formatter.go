package utils

import (
	"fmt"
	"math"
	"strings"
	"time"
)

// Generate unique (almost) signature
func GenerateSignature(name string, floatVal float64, pattern int) string{
	return fmt.Sprintf("%s|%.8f|%d", name, floatVal, pattern)
}

// Date timestamps helper
func GetDateRange(startYear, startMonth, endYear, endMonth int) (time.Time, time.Time) {
    start := time.Date(startYear, time.Month(startMonth), 1, 0, 0, 0, 0, time.UTC)
    endBase := time.Date(endYear, time.Month(endMonth), 1, 0, 0, 0, 0, time.UTC)
    end := endBase.AddDate(0, 1, 0)

    return start, end
}

// CSMoney Name Doppler exctractor
func ExtractPhase(name string) (cleanName string, phase string){
	if strings.Contains(name, "Doppler") {
			if strings.Contains(name, "Phase 1") { phase = "Phase 1" 
			} else if strings.Contains(name, "Phase 2") { phase = "Phase 2" 
			} else if strings.Contains(name, "Phase 3") { phase = "Phase 3" 
			} else if strings.Contains(name, "Phase 4") { phase = "Phase 4" 
			} else if strings.Contains(name, "Ruby") { phase = "Ruby" 
			} else if strings.Contains(name, "Sapphire") { phase = "Sapphire" 
			} else if strings.Contains(name, "Black Pearl") { phase = "Black Pearl" 
			} else if strings.Contains(name, "Emerald") { phase = "Emerald" }
			
			if phase != ""{
				// Remove " Phase 1" 
				cleanName = strings.Replace(name, " "+phase, "", 1)
				return cleanName, phase
			}
	}
	return name, ""
}

// Rounding float to set precision
func FloatRound(num float64) float64 {
    return math.Round(num*100) / 100
}