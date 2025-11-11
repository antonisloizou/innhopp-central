package rbac

import (
	"net/http"

	"github.com/innhopp/central/backend/httpx"
)

// RoleResolver extracts roles for the current request context.
type RoleResolver func(r *http.Request) []Role

// Enforcer coordinates RBAC evaluation for HTTP handlers.
type Enforcer struct {
	resolve RoleResolver
}

// NewEnforcer constructs an RBAC enforcer with the provided resolver.
func NewEnforcer(resolver RoleResolver) *Enforcer {
	return &Enforcer{resolve: resolver}
}

// Authorize ensures the caller has one of the roles mapped to the supplied
// permission. If no user is present the request is rejected with 401.
func (e *Enforcer) Authorize(permission Permission) func(http.Handler) http.Handler {
	allowed := RoleMatrix[permission]
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			roles := e.resolve(r)
			if len(roles) == 0 {
				httpx.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}

			if hasIntersection(roles, allowed) {
				next.ServeHTTP(w, r)
				return
			}

			httpx.Error(w, http.StatusForbidden, "insufficient role membership")
		})
	}
}

func hasIntersection(userRoles, allowed []Role) bool {
	if len(userRoles) == 0 || len(allowed) == 0 {
		return false
	}
	roleSet := make(map[Role]struct{}, len(userRoles))
	for _, role := range userRoles {
		roleSet[role] = struct{}{}
	}
	for _, required := range allowed {
		if _, ok := roleSet[required]; ok {
			return true
		}
	}
	return false
}
