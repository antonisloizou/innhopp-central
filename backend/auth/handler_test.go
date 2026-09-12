package auth

import (
	"context"
	"strings"
	"testing"
)

func TestEnsureParticipantProfileSQLHasClosedColumnList(t *testing.T) {
	if !strings.Contains(ensureParticipantProfileSQL, "account_roles\n\t\t)") {
		t.Fatal("participant-profile insert must close its column list before SELECT")
	}
	if !strings.Contains(ensureParticipantProfileSQL, ")\n\t\tON CONFLICT DO NOTHING") {
		t.Fatal("participant-profile insert must close the NOT EXISTS clause before ON CONFLICT")
	}
	if !strings.Contains(ensureParticipantProfileSQL, "COALESCE($4::TEXT[], ARRAY[]::TEXT[])") {
		t.Fatal("participant-profile insert must store an empty account-role array when the account has no roles")
	}
}

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

func TestPostLoginPathPreservesRequestedRoute(t *testing.T) {
	h := &Handler{}

	path, err := h.postLoginPath(context.Background(), &Account{ID: 42}, []string{"participant"}, "/events/9/innhopps/4")
	if err != nil {
		t.Fatalf("postLoginPath() returned an error: %v", err)
	}
	if path != "/events/9/innhopps/4" {
		t.Fatalf("postLoginPath() = %q, want requested route", path)
	}
}

func TestPostLoginPathSendsNewParticipantToProfile(t *testing.T) {
	h := &Handler{}

	path, err := h.postLoginPath(context.Background(), &Account{ID: 42, IsNew: true}, []string{"participant"}, "")
	if err != nil {
		t.Fatalf("postLoginPath() returned an error: %v", err)
	}
	if path != profilePostLoginPath {
		t.Fatalf("postLoginPath() = %q, want %q", path, profilePostLoginPath)
	}
}

func TestPostLoginPathKeepsStaffOnEventList(t *testing.T) {
	h := &Handler{}

	path, err := h.postLoginPath(context.Background(), &Account{ID: 42, IsNew: true}, []string{"staff"}, "")
	if err != nil {
		t.Fatalf("postLoginPath() returned an error: %v", err)
	}
	if path != defaultPostLoginPath {
		t.Fatalf("postLoginPath() = %q, want %q", path, defaultPostLoginPath)
	}
}

func TestIsParticipantOnly(t *testing.T) {
	tests := []struct {
		roles []string
		want  bool
	}{
		{roles: []string{"participant"}, want: true},
		{roles: []string{"Participant"}, want: true},
		{roles: []string{"participant", "staff"}, want: false},
		{roles: []string{"staff"}, want: false},
		{roles: nil, want: false},
	}

	for _, tt := range tests {
		if got := isParticipantOnly(tt.roles); got != tt.want {
			t.Fatalf("isParticipantOnly(%v) = %t, want %t", tt.roles, got, tt.want)
		}
	}
}
