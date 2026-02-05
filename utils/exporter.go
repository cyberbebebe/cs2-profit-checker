package utils

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/cyberbebebe/cs2-profit-checker/types"
	"github.com/xuri/excelize/v2"
)

func CreateExcelReport(pairs []types.CompletedPair, filename string) error {
    
	f := excelize.NewFile()
	sheet := "Sheet1"

	// 1. HEADERS
	headers := []string{
		"Item Name", "Float", "Phase", "Pattern",
		"Buy Source", "Buy Price", "Buy Date",
		"Sell Source", "Sell Price", "Sell Date",
		"Profit ($)", "Profit (%)",
	}

	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	// 2. STYLES (Green/Red/Percent)
	styleGreen, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Color: "#006100", Bold: true}})
	styleRed, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Color: "#9C0006", Bold: true}})
	stylePercent, _ := f.NewStyle(&excelize.Style{NumFmt: 10})

	// 3. WRITE DATA ROWS
	lastRow := 1
	for i, p := range pairs {
		row := i + 2
		lastRow = row

		// A-D: Item Info
		f.SetCellValue(sheet, fmt.Sprintf("A%d", row), p.ItemName)
		f.SetCellValue(sheet, fmt.Sprintf("B%d", row), p.FloatVal)
		f.SetCellValue(sheet, fmt.Sprintf("C%d", row), p.Phase)
		f.SetCellValue(sheet, fmt.Sprintf("D%d", row), p.Pattern)

		// E-G: Buy Info
		f.SetCellValue(sheet, fmt.Sprintf("E%d", row), p.BuySource)
		f.SetCellValue(sheet, fmt.Sprintf("F%d", row), p.BuyPrice)
		
		if p.BuyPrice > 0 {
			f.SetCellValue(sheet, fmt.Sprintf("G%d", row), p.BuyTime.Format("2006-01-02 15:04"))
		} else {
			f.SetCellValue(sheet, fmt.Sprintf("G%d", row), "-")
		}

		// H-J: Sell Info
		f.SetCellValue(sheet, fmt.Sprintf("H%d", row), p.SellSource)
		f.SetCellValue(sheet, fmt.Sprintf("I%d", row), p.SellPrice)
		f.SetCellValue(sheet, fmt.Sprintf("J%d", row), p.SellTime.Format("2006-01-02 15:04"))

		// K: SMART PROFIT FORMULA
		formulaProfit := fmt.Sprintf("IF(F%d=0, 0, I%d-F%d)", row, row, row)
		f.SetCellFormula(sheet, fmt.Sprintf("K%d", row), formulaProfit)

		// L: Profit %
		formulaPerc := fmt.Sprintf("IFERROR(K%d/F%d, 0)", row, row)
		f.SetCellFormula(sheet, fmt.Sprintf("L%d", row), formulaPerc)
		f.SetCellStyle(sheet, fmt.Sprintf("L%d", row), fmt.Sprintf("L%d", row), stylePercent)

		// Conditional Coloring (Based on Go Logic)
		if p.Profit > 0 {
			f.SetCellStyle(sheet, fmt.Sprintf("K%d", row), fmt.Sprintf("K%d", row), styleGreen)
		} else if p.Profit < 0 {
			f.SetCellStyle(sheet, fmt.Sprintf("K%d", row), fmt.Sprintf("K%d", row), styleRed)
		}
	}

	// 4. ADD TOTALS
	totalRow := lastRow + 2
	f.SetCellValue(sheet, fmt.Sprintf("J%d", totalRow), "TOTAL PROFIT:")
	f.SetCellFormula(sheet, fmt.Sprintf("K%d", totalRow), fmt.Sprintf("SUM(K2:K%d)", lastRow))
	styleBold, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}})
	f.SetCellStyle(sheet, fmt.Sprintf("J%d", totalRow), fmt.Sprintf("K%d", totalRow), styleBold)

	// 5. ENABLE FILTERING
	f.AutoFilter(sheet, "A1:L1", nil)

	// 6. AUTO-FIT COLUMNS (New Feature)
	cols := []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"}
	
	for i := range cols {
		// Start with header length
		maxLen := len(headers[i]) + 2 

		rows, _ := f.GetRows(sheet)
		for _, rowData := range rows {
			if i < len(rowData) {
				cellLen := len(rowData[i])
				if cellLen > maxLen {
					maxLen = cellLen
				}
			}
		}

		// Cap the width so "Item Name" doesn't get insanely wide (e.g. 50 chars max)
		if maxLen > 60 {
			maxLen = 60
		}
		
		// Set Width
		width := float64(maxLen) * 1.2
		colIdxName, _ := excelize.ColumnNumberToName(i + 1)
		f.SetColWidth(sheet, colIdxName, colIdxName, width)
	}

	// 7. SAVE
	if err := f.SaveAs(filename); err != nil {
        return err
    }
    return nil
}

func SaveJSON(filename string, data []types.CompletedPair) error {
    file, err := os.Create(filename)
    if err != nil {
        return err
    }
    defer file.Close()

    encoder := json.NewEncoder(file)
    encoder.SetIndent("", "  ")
    return encoder.Encode(data)
}