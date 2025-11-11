package auth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/innhopp/central/backend/httpx"
	"github.com/innhopp/central/backend/rbac"
)

// Config contains the OpenID Connect configuration required to perform the
// authorization code flow.
type Config struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	Scopes       []string
}

func (c Config) enabled() bool {
	return strings.TrimSpace(c.Issuer) != "" &&
		strings.TrimSpace(c.ClientID) != "" &&
		strings.TrimSpace(c.RedirectURL) != ""
}

func (c Config) scopeString() string {
	scopes := c.Scopes
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}
	return strings.Join(scopes, " ")
}

// Handler manages OAuth2/OIDC login and session lifecycle.
type Handler struct {
	db         *pgxpool.Pool
	sessions   *SessionManager
	states     *StateStore
	cfg        Config
	provider   *providerMetadata
	keys       *jwksCache
	httpClient *http.Client
	disabled   bool
}

// NewHandler constructs an auth handler with OIDC configuration.
func NewHandler(db *pgxpool.Pool, sessions *SessionManager, cfg Config) (*Handler, error) {
	handler := &Handler{
		db:         db,
		sessions:   sessions,
		states:     NewStateStore(10 * time.Minute),
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}

	if !cfg.enabled() {
		handler.disabled = true
		return handler, nil
	}

	metadata, err := discoverProvider(context.Background(), handler.httpClient, cfg.Issuer)
	if err != nil {
		return nil, err
	}

	handler.provider = metadata
	handler.keys = newJWKSCache(metadata.JWKSURI, handler.httpClient)
	return handler, nil
}

// Routes exposes the auth endpoints.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/login", h.beginLogin)
	r.Get("/callback", h.handleCallback)
	r.Get("/session", h.sessionInfo)
	r.Post("/logout", h.logout)
	return r
}

type loginResponse struct {
	AuthorizationURL string `json:"authorization_url"`
}

func (h *Handler) beginLogin(w http.ResponseWriter, r *http.Request) {
	if h.disabled {
		httpx.Error(w, http.StatusServiceUnavailable, "oidc not configured")
		return
	}

	state, nonce, err := h.states.Create()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create login state")
		return
	}

	query := url.Values{}
	query.Set("response_type", "code")
	query.Set("client_id", h.cfg.ClientID)
	query.Set("redirect_uri", h.cfg.RedirectURL)
	query.Set("scope", h.cfg.scopeString())
	query.Set("state", state)
	query.Set("nonce", nonce)

	authURL := h.provider.AuthorizationEndpoint + "?" + query.Encode()
	httpx.WriteJSON(w, http.StatusOK, loginResponse{AuthorizationURL: authURL})
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	IDToken     string `json:"id_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
}

func (h *Handler) handleCallback(w http.ResponseWriter, r *http.Request) {
	if h.disabled {
		httpx.Error(w, http.StatusServiceUnavailable, "oidc not configured")
		return
	}

	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if state == "" || code == "" {
		httpx.Error(w, http.StatusBadRequest, "missing state or code")
		return
	}

	nonce, ok := h.states.Verify(state)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "invalid authorization state")
		return
	}

	token, err := h.exchangeCode(r.Context(), code)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "failed to exchange code")
		return
	}

	claims, err := h.verifyIDToken(r.Context(), token.IDToken, nonce)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "id token validation failed")
		return
	}

	account, err := h.ensureAccount(r.Context(), claims)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to persist account")
		return
	}

	normalized := h.collectRoles(account.Roles, claims.AllRoles())
	if len(normalized) == 0 {
		normalized = append(normalized, string(rbac.RoleParticipant))
	}

	if err := h.assignRoles(r.Context(), account.ID, normalized); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to assign account roles")
		return
	}

	finalRoles, err := h.loadAccountRoles(r.Context(), account.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load account roles")
		return
	}

	claimsToPersist := &Claims{
		AccountID: account.ID,
		Email:     account.Email,
		FullName:  account.FullName,
		Roles:     finalRoles,
	}

	rawToken, err := h.sessions.Issue(w, claimsToPersist)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	resp := sessionResponse{
		AccountID: account.ID,
		Email:     account.Email,
		FullName:  account.FullName,
		Roles:     finalRoles,
		Token:     rawToken,
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

type sessionResponse struct {
	AccountID int64    `json:"account_id"`
	Email     string   `json:"email"`
	FullName  string   `json:"full_name"`
	Roles     []string `json:"roles"`
	Token     string   `json:"token,omitempty"`
}

func (h *Handler) sessionInfo(w http.ResponseWriter, r *http.Request) {
	claims := FromContext(r.Context())
	if claims == nil {
		httpx.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	resp := sessionResponse{
		AccountID: claims.AccountID,
		Email:     claims.Email,
		FullName:  claims.FullName,
		Roles:     claims.Roles,
	}

	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	h.sessions.Clear(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (h *Handler) exchangeCode(ctx context.Context, code string) (*tokenResponse, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", h.cfg.RedirectURL)
	form.Set("client_id", h.cfg.ClientID)
	if h.cfg.ClientSecret != "" {
		form.Set("client_secret", h.cfg.ClientSecret)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.provider.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		return nil, fmt.Errorf("token endpoint returned %d: %s", res.StatusCode, string(body))
	}

	var token tokenResponse
	if err := json.NewDecoder(res.Body).Decode(&token); err != nil {
		return nil, err
	}
	return &token, nil
}

func (h *Handler) verifyIDToken(ctx context.Context, raw string, nonce string) (*idTokenClaims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return nil, errors.New("id token structure invalid")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}

	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, err
	}

	if header.Alg != "RS256" {
		return nil, fmt.Errorf("unsupported id token alg %s", header.Alg)
	}

	key, err := h.keys.key(ctx, header.Kid)
	if err != nil {
		return nil, err
	}

	signed := parts[0] + "." + parts[1]
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, err
	}

	hash := sha256.Sum256([]byte(signed))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, hash[:], sig); err != nil {
		return nil, err
	}

	var claims idTokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, err
	}

	if err := claims.Validate(h.cfg.ClientID, h.cfg.Issuer, nonce); err != nil {
		return nil, err
	}

	return &claims, nil
}

func (h *Handler) ensureAccount(ctx context.Context, claims *idTokenClaims) (*Account, error) {
	row := h.db.QueryRow(ctx,
		`INSERT INTO accounts (subject, email, full_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (subject)
         DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name
         RETURNING id, subject, email, full_name`,
		claims.Subject, strings.ToLower(claims.Email), claims.Name,
	)

	var account Account
	if err := row.Scan(&account.ID, &account.Subject, &account.Email, &account.FullName); err != nil {
		return nil, err
	}

	roles, err := h.loadAccountRoles(ctx, account.ID)
	if err != nil {
		return nil, err
	}
	account.Roles = roles

	return &account, nil
}

func (h *Handler) loadAccountRoles(ctx context.Context, accountID int64) ([]string, error) {
	rows, err := h.db.Query(ctx, `SELECT role_name FROM account_roles WHERE account_id = $1`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []string
	for rows.Next() {
		var role string
		if err := rows.Scan(&role); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, nil
}

func (h *Handler) assignRoles(ctx context.Context, accountID int64, roles []string) error {
	batch := &pgx.Batch{}
	for _, role := range roles {
		batch.Queue(`INSERT INTO account_roles (account_id, role_name)
        VALUES ($1, $2)
        ON CONFLICT (account_id, role_name) DO NOTHING`, accountID, role)
	}

	br := h.db.SendBatch(ctx, batch)
	defer br.Close()
	for range roles {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}

func (h *Handler) collectRoles(existing []string, tokenRoles []string) []string {
	normalized := make(map[string]struct{})
	for _, role := range existing {
		normalized[strings.ToLower(role)] = struct{}{}
	}

	for _, role := range tokenRoles {
		key := normalizeRole(role)
		if key != "" {
			normalized[key] = struct{}{}
		}
	}

	out := make([]string, 0, len(normalized))
	for role := range normalized {
		out = append(out, role)
	}
	return out
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin":
		return string(rbac.RoleAdmin)
	case "staff":
		return string(rbac.RoleStaff)
	case "jumpmaster", "jump_master":
		return string(rbac.RoleJumpMaster)
	case "jumpleader", "jump_leader":
		return string(rbac.RoleJumpLeader)
	case "groundcrew", "ground_crew":
		return string(rbac.RoleGroundCrew)
	case "driver":
		return string(rbac.RoleDriver)
	case "packer":
		return string(rbac.RolePacker)
	case "participant":
		return string(rbac.RoleParticipant)
	default:
		return ""
	}
}

// Account represents a persisted identity in the database.
type Account struct {
	ID       int64
	Subject  string
	Email    string
	FullName string
	Roles    []string
}

type providerMetadata struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
	JWKSURI               string `json:"jwks_uri"`
}

func discoverProvider(ctx context.Context, client *http.Client, issuer string) (*providerMetadata, error) {
	wellKnown := strings.TrimRight(issuer, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, wellKnown, nil)
	if err != nil {
		return nil, err
	}

	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		return nil, fmt.Errorf("discovery failed with %d: %s", res.StatusCode, string(body))
	}

	var metadata providerMetadata
	if err := json.NewDecoder(res.Body).Decode(&metadata); err != nil {
		return nil, err
	}
	return &metadata, nil
}

type jwksCache struct {
	mu       sync.Mutex
	keys     map[string]*rsa.PublicKey
	source   string
	client   *http.Client
	fetched  time.Time
	lifespan time.Duration
}

func newJWKSCache(uri string, client *http.Client) *jwksCache {
	return &jwksCache{
		keys:     make(map[string]*rsa.PublicKey),
		source:   uri,
		client:   client,
		lifespan: time.Hour,
	}
}

func (c *jwksCache) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if key, ok := c.keys[kid]; ok && time.Since(c.fetched) < c.lifespan {
		return key, nil
	}

	if err := c.refresh(ctx); err != nil {
		return nil, err
	}

	key, ok := c.keys[kid]
	if !ok {
		return nil, fmt.Errorf("jwks missing key %s", kid)
	}
	return key, nil
}

func (c *jwksCache) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.source, nil)
	if err != nil {
		return err
	}

	res, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<10))
		return fmt.Errorf("jwks fetch failed with %d: %s", res.StatusCode, string(body))
	}

	var payload struct {
		Keys []struct {
			Kty string `json:"kty"`
			Kid string `json:"kid"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}

	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return err
	}

	keys := make(map[string]*rsa.PublicKey)
	for _, jwk := range payload.Keys {
		if jwk.Kty != "RSA" {
			continue
		}
		nBytes, err := base64.RawURLEncoding.DecodeString(jwk.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(jwk.E)
		if err != nil {
			continue
		}
		var eInt int
		for _, b := range eBytes {
			eInt = eInt<<8 + int(b)
		}
		if eInt == 0 {
			continue
		}

		key := &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: eInt,
		}
		keys[jwk.Kid] = key
	}

	if len(keys) == 0 {
		return errors.New("no jwk keys discovered")
	}

	c.keys = keys
	c.fetched = time.Now()
	return nil
}

type idTokenClaims struct {
	Issuer   string        `json:"iss"`
	Subject  string        `json:"sub"`
	Audience audienceClaim `json:"aud"`
	Expiry   int64         `json:"exp"`
	Nonce    string        `json:"nonce"`
	Email    string        `json:"email"`
	Name     string        `json:"name"`
	Roles    []string      `json:"roles"`
	Groups   []string      `json:"groups"`
}

func (c *idTokenClaims) Validate(clientID, issuer, nonce string) error {
	if c.Issuer != issuer {
		return errors.New("issuer mismatch")
	}
	if !c.Audience.Contains(clientID) {
		return errors.New("audience mismatch")
	}
	if c.Nonce != nonce {
		return errors.New("nonce mismatch")
	}
	if time.Now().Unix() > c.Expiry {
		return errors.New("id token expired")
	}
	if strings.TrimSpace(c.Email) == "" {
		return errors.New("email claim missing")
	}
	return nil
}

func (c *idTokenClaims) AllRoles() []string {
	roles := append([]string{}, c.Roles...)
	roles = append(roles, c.Groups...)
	return roles
}

type audienceClaim []string

func (a *audienceClaim) UnmarshalJSON(data []byte) error {
	if len(data) == 0 {
		return errors.New("audience claim empty")
	}
	if data[0] == '"' {
		var single string
		if err := json.Unmarshal(data, &single); err != nil {
			return err
		}
		*a = []string{single}
		return nil
	}
	var list []string
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}
	*a = list
	return nil
}

func (a audienceClaim) Contains(expected string) bool {
	for _, v := range a {
		if v == expected {
			return true
		}
	}
	return false
}
