package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/innhopp/central/backend/httpx"
)

// Claims represents the authenticated user context embedded within a session
// token. Roles are expressed as their canonical lowercase string value.
type Claims struct {
	AccountID int64    `json:"account_id"`
	Email     string   `json:"email"`
	FullName  string   `json:"full_name"`
	Roles     []string `json:"roles"`
	IssuedAt  int64    `json:"iat"`
	ExpiresAt int64    `json:"exp"`
}

type contextKey string

const claimsKey contextKey = "authClaims"

// SessionManager encapsulates signing and verifying session tokens that are
// stored as HTTP cookies or bearer tokens.
type SessionManager struct {
	secret     []byte
	cookieName string
	lifetime   time.Duration
	secure     bool
}

// NewSessionManager constructs a session manager with the provided HMAC
// secret. The secret is required and should be randomly generated for
// production deployments.
func NewSessionManager(secret string, secure bool) (*SessionManager, error) {
	trimmed := strings.TrimSpace(secret)
	if trimmed == "" {
		return nil, errors.New("session secret must be configured")
	}

	return &SessionManager{
		secret:     []byte(trimmed),
		cookieName: "innhopp_session",
		lifetime:   24 * time.Hour,
		secure:     secure,
	}, nil
}

// Issue creates a session for the supplied claims and writes it to the
// response as a secure, HTTP only cookie. The raw token is returned so that
// API clients can persist it if necessary.
func (m *SessionManager) Issue(w http.ResponseWriter, claims *Claims) (string, error) {
	now := time.Now()
	payload := *claims
	payload.IssuedAt = now.Unix()
	payload.ExpiresAt = now.Add(m.lifetime).Unix()

	token, err := m.sign(&payload)
	if err != nil {
		return "", err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     m.cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(payload.ExpiresAt, 0),
	})

	return token, nil
}

// Clear removes the session cookie from the response.
func (m *SessionManager) Clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     m.cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	})
}

// Middleware attaches claims from the inbound session, if present. Invalid
// tokens are rejected with a 401 response.
func (m *SessionManager) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := m.extractToken(r)
		if token == "" {
			next.ServeHTTP(w, r)
			return
		}

		claims, err := m.verify(token)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "invalid session token")
			return
		}

		if claims.ExpiresAt <= time.Now().Unix() {
			httpx.Error(w, http.StatusUnauthorized, "session expired")
			return
		}

		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *SessionManager) extractToken(r *http.Request) string {
	if c, err := r.Cookie(m.cookieName); err == nil && c.Value != "" {
		return c.Value
	}

	authz := strings.TrimSpace(r.Header.Get("Authorization"))
	if authz == "" {
		return ""
	}

	if !strings.HasPrefix(strings.ToLower(authz), "bearer ") {
		return ""
	}

	return strings.TrimSpace(authz[len("bearer "):])
}

// FromContext retrieves the active session claims, if any.
func FromContext(ctx context.Context) *Claims {
	if ctx == nil {
		return nil
	}
	claims, _ := ctx.Value(claimsKey).(*Claims)
	return claims
}

func (m *SessionManager) sign(claims *Claims) (string, error) {
	raw, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	payload := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(payload))
	sig := mac.Sum(nil)

	signature := base64.RawURLEncoding.EncodeToString(sig)
	return payload + "." + signature, nil
}

func (m *SessionManager) verify(token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, errors.New("token structure is invalid")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}

	providedSig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}

	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(parts[0]))
	expected := mac.Sum(nil)

	if !hmac.Equal(providedSig, expected) {
		return nil, errors.New("token signature mismatch")
	}

	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, err
	}

	return &claims, nil
}
