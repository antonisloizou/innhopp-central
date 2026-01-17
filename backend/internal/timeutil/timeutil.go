package timeutil

import (
	"errors"
	"regexp"
	"strings"
	"time"
)

var tzSuffixRE = regexp.MustCompile(`([+-]\d{2}:?\d{2}|Z)$`)

var eventTimestampLayouts = []string{
	"2006-01-02T15:04:05.999999999",
	"2006-01-02T15:04:05",
	"2006-01-02T15:04",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02 15:04:05",
	"2006-01-02 15:04",
}

func ParseEventTimestamp(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, errors.New("timestamp is required")
	}
	trimmed = tzSuffixRE.ReplaceAllString(trimmed, "")
	for _, layout := range eventTimestampLayouts {
		if parsed, err := time.ParseInLocation(layout, trimmed, time.UTC); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, errors.New("invalid timestamp")
}

func ParseOptionalEventTimestamp(value string) (*time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parsed, err := ParseEventTimestamp(value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func ParseEventDate(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, errors.New("date is required")
	}
	parsed, err := time.ParseInLocation("2006-01-02", trimmed, time.UTC)
	if err != nil {
		return time.Time{}, err
	}
	return parsed, nil
}

func ParseOptionalEventDate(value string) (*time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parsed, err := ParseEventDate(value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}
