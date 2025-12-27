package airfields

import "time"

// Airfield represents a landing site with location and basic metadata.
// Elevation is stored in meters; coordinates are stored as raw strings (lat/long).
type Airfield struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Latitude    string    `json:"latitude"`
	Longitude   string    `json:"longitude"`
	Coordinates string    `json:"coordinates"`
	Elevation   int       `json:"elevation"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}
