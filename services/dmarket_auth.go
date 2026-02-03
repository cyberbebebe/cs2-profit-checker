package services

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func generateDMarketHeaders(secretKey, method, apiURLPath string, body interface{}) (http.Header, error) {
	nonce := fmt.Sprintf("%d", time.Now().Unix())

	privateKeyBytes, err := hex.DecodeString(secretKey)
	if err != nil || len(privateKeyBytes) != 64 {
		return nil, fmt.Errorf("invalid secret key: must be 128 hex characters")
	}
	var privateKey [64]byte
	copy(privateKey[:], privateKeyBytes)

	publicKey := hex.EncodeToString(privateKey[32:])

	// Handle body
	var bodyStr string
	if body != nil {
		str, ok := body.(string)
		if ok {
			bodyStr = str
		} else {
			b, err := json.Marshal(body)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal body: %v", err)
			}
			bodyStr = string(b)
		}
	}

	stringToSign := method + apiURLPath + bodyStr + nonce

	signature := hex.EncodeToString(ed25519.Sign(privateKey[:], []byte(stringToSign)))

	headers := http.Header{}
	headers.Set("X-Api-Key", publicKey)
	headers.Set("X-Request-Sign", "dmar ed25519 "+signature)
	headers.Set("X-Sign-Date", nonce)

	return headers, nil
}