package events

import (
	"strings"
	"testing"
)

func TestNormalizeAircraftPayloadsPreservesExistingSlotBandsWhenOmitted(t *testing.T) {
	slotPrice := 120.0
	aircraftID := int64(7)

	items, err := normalizeAircraftPayloads([]aircraftPayload{{
		ID:           &aircraftID,
		Name:         "Caravan",
		PricingModel: string(AircraftPricingModelSlot),
		RateCurrency: "EUR",
		PricePerSlot: &slotPrice,
	}})
	if err != nil {
		t.Fatalf("normalizeAircraftPayloads() returned error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("normalizeAircraftPayloads() returned %d items, want 1", len(items))
	}
	if !items[0].PreserveSlotBands {
		t.Fatalf("normalizeAircraftPayloads() did not preserve existing slot bands")
	}
	if len(items[0].SlotPricingBands) != 0 {
		t.Fatalf("normalizeAircraftPayloads() returned unexpected replacement bands: %+v", items[0].SlotPricingBands)
	}
}

func TestDefaultStaffMeetingItems(t *testing.T) {
	items := defaultStaffMeetingItems()
	seen := map[string]bool{}
	for _, item := range items {
		if seen[item.ID] {
			t.Fatalf("duplicate default item id %q", item.ID)
		}
		seen[item.ID] = true
	}
	for _, id := range []string{"default-1", "default-4", "default-12", "default-tomorrow-0", "default-tomorrow-8"} {
		if !seen[id] {
			t.Errorf("missing default staff meeting item %q", id)
		}
	}
	var firstChecklist *staffMeetingItem
	for i := range items {
		if items[i].Kind == "tomorrow" {
			firstChecklist = &items[i]
			break
		}
	}
	if firstChecklist == nil || firstChecklist.ID != "default-tomorrow-0" {
		t.Fatalf("first checklist item = %+v, want default-tomorrow-0", firstChecklist)
	}
}

func TestValidateStaffMeetingItemsAcceptsAndNormalizesValidItems(t *testing.T) {
	items := []staffMeetingItem{{ID: " custom-1 ", Title: " Item ", Kind: "tomorrow", Checked: true, Notes: " note "}}
	if err := validateStaffMeetingItems(items); err != nil {
		t.Fatalf("validateStaffMeetingItems() returned error: %v", err)
	}
	if items[0].ID != "custom-1" || items[0].Title != "Item" || items[0].Notes != "note" || !items[0].Checked {
		t.Fatalf("normalized item mismatch: %+v", items[0])
	}
}

func TestValidateStaffMeetingItemsRejectsMalformedItems(t *testing.T) {
	tests := []struct {
		name  string
		items []staffMeetingItem
		want  string
	}{
		{name: "missing id", items: []staffMeetingItem{{Title: "Item", Kind: "agenda"}}, want: "id is required"},
		{name: "duplicate id", items: []staffMeetingItem{{ID: "same", Title: "One", Kind: "agenda"}, {ID: "same", Title: "Two", Kind: "tomorrow"}}, want: "duplicate"},
		{name: "missing title", items: []staffMeetingItem{{ID: "one", Kind: "agenda"}}, want: "title is invalid"},
		{name: "invalid kind", items: []staffMeetingItem{{ID: "one", Title: "One", Kind: "other"}}, want: "kind is invalid"},
		{name: "notes too long", items: []staffMeetingItem{{ID: "one", Title: "One", Kind: "agenda", Notes: strings.Repeat("x", 10001)}}, want: "notes are too long"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateStaffMeetingItems(tt.items)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("validateStaffMeetingItems() error = %v, want containing %q", err, tt.want)
			}
		})
	}
}

func TestNormalizeAircraftPayloadsRequiresBandsForNewSlotAircraft(t *testing.T) {
	slotPrice := 120.0

	_, err := normalizeAircraftPayloads([]aircraftPayload{{
		Name:         "Caravan",
		PricingModel: string(AircraftPricingModelSlot),
		RateCurrency: "EUR",
		PricePerSlot: &slotPrice,
	}})
	if err == nil {
		t.Fatal("normalizeAircraftPayloads() expected error for new slot aircraft without bands")
	}
}
