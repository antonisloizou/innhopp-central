package budgets

import "math"

func roundMoney(v float64) float64 {
	return math.Round(v*100) / 100
}

func scenarioParticipantCounts(fullLoadSize, crewOnLoad, confirmLoads, fullLoads int) (confirm, worst, full int) {
	seatsPerLoad := fullLoadSize - crewOnLoad
	if seatsPerLoad < 0 {
		seatsPerLoad = 0
	}
	if confirmLoads < 0 {
		confirmLoads = 0
	}
	if fullLoads < 0 {
		fullLoads = 0
	}
	confirm = seatsPerLoad * confirmLoads
	worst = seatsPerLoad + 1
	full = seatsPerLoad * fullLoads
	if full < confirm {
		full = confirm
	}
	return confirm, worst, full
}

func scenarioStatusFromMargin(marginWithoutTip float64) string {
	if marginWithoutTip >= 0 {
		return "green"
	}
	return "red"
}

func buildScenarioSummary(name string, participants int, expectedCost, costWithDrift, revenuePerParticipant, optionalTipPercent float64) ScenarioSummary {
	revenue := roundMoney(float64(participants) * revenuePerParticipant)
	tipRevenue := roundMoney(revenue * optionalTipPercent / 100)
	revenueWithOptionalTip := roundMoney(revenue + tipRevenue)
	marginWithoutTip := roundMoney(revenue - costWithDrift)
	marginWithTip := roundMoney(revenueWithOptionalTip - costWithDrift)
	return ScenarioSummary{
		Name:             name,
		Participants:     participants,
		ExpectedCost:     expectedCost,
		CostWithDrift:    costWithDrift,
		Revenue:          revenue,
		RevenueWithTip:   revenueWithOptionalTip,
		MarginWithoutTip: marginWithoutTip,
		MarginWithTip:    marginWithTip,
		Status:           scenarioStatusFromMargin(marginWithoutTip),
	}
}

func marginDeficit(marginWithoutTip float64) float64 {
	if marginWithoutTip < 0 {
		return roundMoney(math.Abs(marginWithoutTip))
	}
	return 0
}
