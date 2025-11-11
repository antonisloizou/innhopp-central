package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type stateEntry struct {
	nonce  string
	expiry time.Time
}

// StateStore tracks short lived OAuth2 state and nonce pairs used to defend
// against CSRF during the authorization code flow.
type StateStore struct {
	mu     sync.Mutex
	values map[string]stateEntry
	ttl    time.Duration
}

// NewStateStore constructs a state store with the provided TTL.
func NewStateStore(ttl time.Duration) *StateStore {
	return &StateStore{
		values: make(map[string]stateEntry),
		ttl:    ttl,
	}
}

// Create registers a new state/nonce pair.
func (s *StateStore) Create() (state string, nonce string, err error) {
	state, err = randomToken()
	if err != nil {
		return "", "", err
	}

	nonce, err = randomToken()
	if err != nil {
		return "", "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.values[state] = stateEntry{nonce: nonce, expiry: time.Now().Add(s.ttl)}
	s.evictExpiredLocked()
	return state, nonce, nil
}

// Verify consumes an existing state value and returns the stored nonce if it
// exists and is not expired.
func (s *StateStore) Verify(state string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, ok := s.values[state]
	if !ok {
		return "", false
	}

	delete(s.values, state)
	if time.Now().After(entry.expiry) {
		return "", false
	}

	s.evictExpiredLocked()
	return entry.nonce, true
}

func (s *StateStore) evictExpiredLocked() {
	now := time.Now()
	for key, entry := range s.values {
		if now.After(entry.expiry) {
			delete(s.values, key)
		}
	}
}

func randomToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
