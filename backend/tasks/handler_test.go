package tasks

import (
	"testing"
	"time"

	"github.com/innhopp/central/backend/rbac"
)

func TestValidateInput(t *testing.T) {
	tests := []struct {
		name         string
		input        taskInput
		requireEvent bool
		wantError    bool
	}{
		{name: "valid date only", input: taskInput{EventID: 1, Title: "Book transport", Description: "Confirm the return bus.", DueOn: "2026-11-20"}, requireEvent: true},
		{name: "blank due date", input: taskInput{EventID: 1, Title: "Book transport", Description: "Confirm the return bus."}, requireEvent: true},
		{name: "missing description", input: taskInput{EventID: 1, Title: "Book transport"}, requireEvent: true, wantError: true},
		{name: "timestamp rejected", input: taskInput{EventID: 1, Title: "Book transport", Description: "Confirm it.", DueOn: "2026-11-20T10:00:00Z"}, requireEvent: true, wantError: true},
		{name: "missing event", input: taskInput{Title: "Book transport", Description: "Confirm it."}, requireEvent: true, wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateInput(test.input, test.requireEvent)
			if (err != nil) != test.wantError {
				t.Fatalf("validateInput() error = %v, wantError %v", err, test.wantError)
			}
		})
	}
}

func TestStaffRolesExcludeParticipant(t *testing.T) {
	for _, role := range staffRoles {
		if role == "participant" {
			t.Fatal("participant must not be an eligible task assignee")
		}
	}
}

func TestVersionsMatch(t *testing.T) {
	current := time.Date(2026, 11, 14, 12, 30, 0, 123000, time.UTC)
	if !versionsMatch(current, current) {
		t.Fatal("identical versions must match")
	}
	if versionsMatch(current, current.Add(time.Microsecond)) {
		t.Fatal("different versions must be rejected")
	}
	if versionsMatch(current, time.Time{}) {
		t.Fatal("missing expected version must be rejected")
	}
}

func TestAllOperationalStaffHaveTaskPermissions(t *testing.T) {
	permissions := []rbac.Permission{rbac.PermissionViewTasks, rbac.PermissionManageTasks, rbac.PermissionCommentTasks, rbac.PermissionViewTaskAudit, rbac.PermissionRestoreTasks}
	for _, permission := range permissions {
		allowed := rbac.RoleMatrix[permission]
		for _, roleName := range staffRoles {
			role := rbac.Role(roleName)
			found := false
			for _, candidate := range allowed {
				if candidate == role {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("%s must allow %s", permission, role)
			}
		}
	}
}
