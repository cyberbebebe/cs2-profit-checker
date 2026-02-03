package config

import (
    "encoding/json"
    "os"
	"github.com/cyberbebebe/cs2-profit-checker/types"
)


func LoadSettings(path string) (*types.Settings, error) {
    file, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    defer file.Close()
    
    var cfg types.Settings
    if err := json.NewDecoder(file).Decode(&cfg); err != nil {
        return nil, err
    }
    return &cfg, nil
}

func LoadSecrets(path string) (*types.Secrets, error) {
    file, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    defer file.Close()
    
    var sec types.Secrets
    if err := json.NewDecoder(file).Decode(&sec); err != nil {
        return nil, err
    }
    return &sec, nil
}