package utils

import (
	"fmt"

	"github.com/cyberbebebe/cs2-profit-checker/types"
	"github.com/xuri/excelize/v2"
)

func CreateExcelReport(pairs []types.CompletedPair, filename string) error {
    f := excelize.NewFile()
    sheet := "Sheet1"

    headers := []string{
        "Item Name", "Profit ($)", "Profit (%)", 
        "Buy Source", "Buy Price", "Buy Date", 
        "Sell Source", "Sell Income", "Sell Date", "Signature",
    }
    
    for i, h := range headers {
        cell, _ := excelize.CoordinatesToCellName(i+1, 1)
        f.SetCellValue(sheet, cell, h)
    }

    // 2. Define Styles (Optional)
    // Green text for profit
    styleGreen, _ := f.NewStyle(&excelize.Style{
        Font: &excelize.Font{Color: "#006100", Bold: true},
        Fill: excelize.Fill{Type: "pattern", Color: []string{"#C6EFCE"}, Pattern: 1},
    })
	
    // Red text for loss
    styleRed, _ := f.NewStyle(&excelize.Style{
        Font: &excelize.Font{Color: "#9C0006", Bold: true},
        Fill: excelize.Fill{Type: "pattern", Color: []string{"#FFC7CE"}, Pattern: 1},
    })

    // 3. Write Data
    for i, p := range pairs {
        row := i + 2 // Start at Row 2

        // Write values
        f.SetCellValue(sheet, fmt.Sprintf("A%d", row), p.ItemName)
        f.SetCellValue(sheet, fmt.Sprintf("B%d", row), p.Profit)
        f.SetCellValue(sheet, fmt.Sprintf("C%d", row), p.ProfitPerc)
        f.SetCellValue(sheet, fmt.Sprintf("D%d", row), p.BuySource)
        f.SetCellValue(sheet, fmt.Sprintf("E%d", row), p.BuyPrice)
        f.SetCellValue(sheet, fmt.Sprintf("F%d", row), p.BuyTime.Format("2006-01-02 15:04"))
        f.SetCellValue(sheet, fmt.Sprintf("G%d", row), p.SellSource)
        f.SetCellValue(sheet, fmt.Sprintf("H%d", row), p.SellPrice)
        f.SetCellValue(sheet, fmt.Sprintf("I%d", row), p.SellTime.Format("2006-01-02 15:04"))
        f.SetCellValue(sheet, fmt.Sprintf("J%d", row), p.Signature)

        // Apply Conditional Styling to Profit Column (B)
        cellName := fmt.Sprintf("B%d", row)
        if p.Profit > 0 {
            f.SetCellStyle(sheet, cellName, cellName, styleGreen)
        } else if p.Profit < 0 {
            f.SetCellStyle(sheet, cellName, cellName, styleRed)
        }
    }

    // 4. Save
    if err := f.SaveAs(filename); err != nil {
        return err
    }
    return nil
}