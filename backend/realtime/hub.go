package realtime

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type Message struct {
	Event string
	Data  []byte
}

type Payload struct {
	Resource    string    `json:"resource"`
	ResourceID  int64     `json:"resource_id"`
	Reason      string    `json:"reason,omitempty"`
	RelatedType string    `json:"related_type,omitempty"`
	RelatedID   int64     `json:"related_id,omitempty"`
	PublishedAt time.Time `json:"published_at"`
}

type Hub struct {
	mu   sync.RWMutex
	subs map[string]map[chan Message]struct{}
}

func NewHub() *Hub {
	return &Hub{
		subs: make(map[string]map[chan Message]struct{}),
	}
}

func Topic(resource string, id int64) string {
	return fmt.Sprintf("%s:%d", resource, id)
}

func UpdatePayload(resource string, resourceID int64, reason string) Payload {
	return Payload{
		Resource:    resource,
		ResourceID:  resourceID,
		Reason:      reason,
		PublishedAt: time.Now().UTC(),
	}
}

func RelatedUpdatePayload(resource string, resourceID int64, reason string, relatedType string, relatedID int64) Payload {
	payload := UpdatePayload(resource, resourceID, reason)
	payload.RelatedType = relatedType
	payload.RelatedID = relatedID
	return payload
}

func (h *Hub) Publish(topic string, event string, payload any) {
	if h == nil {
		return
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}

	h.mu.RLock()
	subscribers := h.subs[topic]
	if len(subscribers) == 0 {
		h.mu.RUnlock()
		return
	}
	channels := make([]chan Message, 0, len(subscribers))
	for ch := range subscribers {
		channels = append(channels, ch)
	}
	h.mu.RUnlock()

	msg := Message{Event: event, Data: data}
	for _, ch := range channels {
		select {
		case ch <- msg:
		default:
		}
	}
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request, topic string) {
	if h == nil {
		http.Error(w, "stream unavailable", http.StatusServiceUnavailable)
		return
	}
	controller := http.NewResponseController(w)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	ch := make(chan Message, 8)
	h.subscribe(topic, ch)
	defer h.unsubscribe(topic, ch)

	_, _ = fmt.Fprint(w, ": connected\n\n")
	if err := controller.Flush(); err != nil {
		return
	}

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-ch:
			_, _ = fmt.Fprintf(w, "event: %s\n", msg.Event)
			_, _ = fmt.Fprintf(w, "data: %s\n\n", msg.Data)
			if err := controller.Flush(); err != nil {
				return
			}
		case <-ticker.C:
			_, _ = fmt.Fprint(w, ": keepalive\n\n")
			if err := controller.Flush(); err != nil {
				return
			}
		}
	}
}

func (h *Hub) subscribe(topic string, ch chan Message) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[topic] == nil {
		h.subs[topic] = make(map[chan Message]struct{})
	}
	h.subs[topic][ch] = struct{}{}
}

func (h *Hub) unsubscribe(topic string, ch chan Message) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if subscribers, ok := h.subs[topic]; ok {
		delete(subscribers, ch)
		if len(subscribers) == 0 {
			delete(h.subs, topic)
		}
	}
	close(ch)
}
