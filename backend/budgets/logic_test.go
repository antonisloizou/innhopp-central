package budgets

import "testing"

func TestScenarioParticipantCounts(t *testing.T) {
	confirm, worst, planned := scenarioParticipantCounts(14, 2, 1, 2)
	if confirm != 12 {
		t.Fatalf("confirm participants mismatch: got %d want 12", confirm)
	}
	if worst != 13 {
		t.Fatalf("worst participants mismatch: got %d want 13", worst)
	}
	if planned != 24 {
		t.Fatalf("planned participants mismatch: got %d want 24", planned)
	}
}

func TestScenarioParticipantCountsClampsToZero(t *testing.T) {
	confirm, worst, planned := scenarioParticipantCounts(1, 3, 1, 2)
	if confirm != 0 {
		t.Fatalf("confirm participants mismatch: got %d want 0", confirm)
	}
	if worst != 1 {
		t.Fatalf("worst participants mismatch: got %d want 1", worst)
	}
	if planned != 0 {
		t.Fatalf("planned participants mismatch: got %d want 0", planned)
	}
}

func TestBuildScenarioSummaryArithmetic(t *testing.T) {
	scenario := buildScenarioSummary("Confirm", 10, 1000, 1030, 300, 8)
	if scenario.Revenue != 3000 {
		t.Fatalf("revenue mismatch: got %.2f want 3000.00", scenario.Revenue)
	}
	if scenario.RevenueWithTip != 3240 {
		t.Fatalf("revenue with tip mismatch: got %.2f want 3240.00", scenario.RevenueWithTip)
	}
	if scenario.MarginWithoutTip != 1970 {
		t.Fatalf("margin without tip mismatch: got %.2f want 1970.00", scenario.MarginWithoutTip)
	}
	if scenario.MarginWithTip != 2210 {
		t.Fatalf("margin with tip mismatch: got %.2f want 2210.00", scenario.MarginWithTip)
	}
	if scenario.Status != "green" {
		t.Fatalf("status mismatch: got %s want green", scenario.Status)
	}
}

func TestScenarioStatusAndMarginDeficit(t *testing.T) {
	if got := scenarioStatusFromMargin(-0.01); got != "red" {
		t.Fatalf("status mismatch: got %s want red", got)
	}
	if got := scenarioStatusFromMargin(0); got != "green" {
		t.Fatalf("status mismatch: got %s want green", got)
	}
	if got := marginDeficit(-123.456); got != 123.46 {
		t.Fatalf("margin deficit mismatch: got %.2f want 123.46", got)
	}
	if got := marginDeficit(10); got != 0 {
		t.Fatalf("margin deficit mismatch: got %.2f want 0", got)
	}
}
