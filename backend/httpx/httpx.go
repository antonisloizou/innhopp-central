package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
)

// DecodeJSON decodes the request body into dest enforcing strict JSON handling.
func DecodeJSON(r *http.Request, dest any) error {
	defer r.Body.Close()

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(dest); err != nil {
		return err
	}

	if decoder.More() {
		return errors.New("unexpected data after JSON payload")
	}

	return nil
}

// WriteJSON serializes v as JSON with the provided status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes a structured error response.
func Error(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}
