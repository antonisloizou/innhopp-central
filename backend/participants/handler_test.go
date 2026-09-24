package participants

import "testing"

func TestSanitizePayloadSyncsSkydiverRoleWithSkydivingStatus(t *testing.T) {
	tests := []struct {
		name         string
		license      string
		roles        []string
		wantSkydiver bool
	}{
		{name: "licence A adds role", license: "A", roles: []string{"Participant"}, wantSkydiver: true},
		{name: "licence D adds role", license: "D", roles: []string{"Participant", "Staff"}, wantSkydiver: true},
		{name: "non jumper removes role", license: "Non jumper", roles: []string{"Participant", "Skydiver"}, wantSkydiver: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := profilePayload{FullName: "Test", Email: "test@example.test", License: tt.license, Roles: tt.roles}
			_, _, roles := sanitizePayload(&payload, "", "")
			gotSkydiver := false
			for _, role := range roles {
				if role == "Skydiver" {
					gotSkydiver = true
				}
			}
			if gotSkydiver != tt.wantSkydiver {
				t.Fatalf("Skydiver role = %t, want %t (roles: %v)", gotSkydiver, tt.wantSkydiver, roles)
			}
		})
	}
}
