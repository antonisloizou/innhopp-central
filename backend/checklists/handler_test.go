package checklists

import "testing"

func TestSeedTemplatesCoverEveryProposedChecklistItem(t *testing.T) {
	want := map[string]struct {
		readiness, execution, closeout int
	}{
		"jump_leader": {6, 0, 2},
		"jump_master": {5, 1, 1},
		"ground_crew": {7, 1, 2},
		"boat_crew":   {3, 1, 1},
	}

	for role, expected := range want {
		items := seedTemplates[role]
		got := struct{ readiness, execution, closeout int }{}
		keys := map[string]bool{}
		for _, item := range items {
			if item.Key == "" || item.Label == "" || item.Detail == "" {
				t.Fatalf("%s has an incomplete seed item: %#v", role, item)
			}
			if keys[item.Key] {
				t.Fatalf("%s repeats item key %q", role, item.Key)
			}
			keys[item.Key] = true
			switch item.Phase {
			case "readiness":
				got.readiness++
			case "execution":
				got.execution++
			case "closeout":
				got.closeout++
			default:
				t.Fatalf("%s item %q has invalid phase %q", role, item.Key, item.Phase)
			}
		}
		if got != expected {
			t.Errorf("%s phase counts = %#v, want %#v", role, got, expected)
		}
	}

	boatCoordination := seedTemplates["ground_crew"][6]
	if boatCoordination.Key != "boat_coordination" || !boatCoordination.RequiresRescueBoat {
		t.Fatal("ground crew boat coordination must be required only for rescue-boat innhopps")
	}
}

func TestRolesForRescueBoat(t *testing.T) {
	if got := rolesFor(false); len(got) != 3 {
		t.Fatalf("rolesFor(false) = %v, want three mandatory roles", got)
	}
	if got := rolesFor(true); len(got) != 4 || got[3] != "boat_crew" {
		t.Fatalf("rolesFor(true) = %v, want boat crew included", got)
	}
}

func TestOperationalTeamDetailReflectsRescueBoatRequirement(t *testing.T) {
	if got, want := operationalTeamDetail(false), "Jump Master and Ground Crew are confirmed."; got != want {
		t.Fatalf("operationalTeamDetail(false) = %q, want %q", got, want)
	}
	if got, want := operationalTeamDetail(true), "Jump Master, Ground Crew and Boat Crew are confirmed."; got != want {
		t.Fatalf("operationalTeamDetail(true) = %q, want %q", got, want)
	}
}
