package auth

import "testing"

func TestNormalizeRoleAcceptsParticipantProfileLabels(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "participant", in: "Participant", want: "participant"},
		{name: "staff", in: "Staff", want: "staff"},
		{name: "jump master", in: "Jump Master", want: "jump_master"},
		{name: "jump leader", in: "Jump Leader", want: "jump_leader"},
		{name: "ground crew", in: "Ground Crew", want: "ground_crew"},
		{name: "driver", in: "Driver", want: "driver"},
		{name: "unsupported participant role", in: "Pilot", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeRole(tt.in); got != tt.want {
				t.Fatalf("normalizeRole(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestCollectRolesMergesExistingAndParticipantRoles(t *testing.T) {
	h := &Handler{}

	got := h.collectRoles(
		[]string{"staff"},
		[]string{"Participant", "Jump Master", "Ground Crew", "Pilot"},
	)

	want := map[string]struct{}{
		"staff":       {},
		"participant": {},
		"jump_master": {},
		"ground_crew": {},
	}

	if len(got) != len(want) {
		t.Fatalf("collectRoles() returned %d roles, want %d: %v", len(got), len(want), got)
	}

	for _, role := range got {
		if _, ok := want[role]; !ok {
			t.Fatalf("collectRoles() returned unexpected role %q", role)
		}
		delete(want, role)
	}

	if len(want) != 0 {
		t.Fatalf("collectRoles() missed roles: %v", want)
	}
}
