package events

import "testing"

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
