package services

type dmarketWebTransaction struct {
	Type       string `json:"type"`
	ID         string `json:"id"`
	CustomID   string `json:"customId"`
	Emitter    string `json:"emitter"`
	Action     string `json:"action"`
	Subject    string `json:"subject"`
	Contractor struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Type  string `json:"type"`
	} `json:"contractor"`
	Details struct {
		SettlementTime int64  `json:"-"`
		Image          string `json:"-"`
		ItemID         string `json:"itemId"`
		Extra          struct {
			FloatPartValue string  `json:"floatPartValue"`
			FloatValue     float64 `json:"floatValue"`
			PaintSeed      *int     `json:"paintSeed"` // to compare nil instead of 0
			PhaseTitle     string  `json:"phaseTitle"`
		} `json:"extra"`
	} `json:"details"`
	Changes []struct {
		Money struct {
			Amount   string `json:"amount"`
			Currency string `json:"currency"`
		} `json:"money"`
		ChangeType string `json:"changeType"`
	} `json:"changes"`
	From    string `json:"from"`
	To      string `json:"to"`
	Status  string `json:"status"`
	Balance struct {
		Amount   string `json:"amount"`
		Currency string `json:"currency"`
	} `json:"balance"`
	UpdatedAt int64 `json:"updatedAt"`
	CreatedAt int64 `json:"createdAt"`
}

type webHistoryResponse struct {
	Objects []dmarketWebTransaction `json:"objects"`
	Total   int                     `json:"total"`
}