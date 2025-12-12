package chi

import (
	"context"
	"net/http"
	"strings"
)

// Middleware mirrors the signature used by the real chi package.
type Middleware func(http.Handler) http.Handler

// Router defines the subset of the chi Router interface that the backend relies on.
type Router interface {
	http.Handler
	Use(middlewares ...Middleware)
	With(middlewares ...Middleware) Router
	Get(pattern string, handler http.HandlerFunc)
	Post(pattern string, handler http.HandlerFunc)
	Put(pattern string, handler http.HandlerFunc)
	Delete(pattern string, handler http.HandlerFunc)
	Mount(pattern string, h http.Handler)
}

type mux struct {
	routes      []route
	middlewares []Middleware
	mounts      []mount
}

type route struct {
	method   string
	segments []segment
	handler  http.Handler
	mws      []Middleware
}

type segment struct {
	key     string
	literal string
	isParam bool
}

type mount struct {
	prefix  string
	handler http.Handler
}

type paramsKey struct{}

// NewRouter constructs a new lightweight chi-compatible router.
func NewRouter() Router {
	return &mux{}
}

func (m *mux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if handler, req := m.matchMount(r); handler != nil {
		handler.ServeHTTP(w, req)
		return
	}

	for _, rt := range m.routes {
		if rt.method != r.Method {
			continue
		}
		if params, ok := matchSegments(rt.segments, r.URL.Path); ok {
			ctx := context.WithValue(r.Context(), paramsKey{}, params)
			req := r.Clone(ctx)
			handler := applyMiddlewares(rt.handler, rt.mws)
			handler.ServeHTTP(w, req)
			return
		}
	}

	http.NotFound(w, r)
}

func (m *mux) Use(middlewares ...Middleware) {
	m.middlewares = append(m.middlewares, middlewares...)
}

func (m *mux) With(middlewares ...Middleware) Router {
	// Capture current middlewares so later calls to Use on the base router do not
	// unexpectedly affect this scoped router.
	scoped := append([]Middleware{}, m.middlewares...)
	scoped = append(scoped, middlewares...)
	return &scopedMux{mux: m, middlewares: scoped}
}

func (m *mux) Get(pattern string, handler http.HandlerFunc) {
	m.addRoute(http.MethodGet, pattern, handler)
}

func (m *mux) Post(pattern string, handler http.HandlerFunc) {
	m.addRoute(http.MethodPost, pattern, handler)
}

func (m *mux) Put(pattern string, handler http.HandlerFunc) {
	m.addRoute(http.MethodPut, pattern, handler)
}

func (m *mux) Delete(pattern string, handler http.HandlerFunc) {
	m.addRoute(http.MethodDelete, pattern, handler)
}

func (m *mux) Mount(pattern string, h http.Handler) {
	m.mountWithMiddlewares(pattern, h, m.middlewares)
}

func (m *mux) addRoute(method, pattern string, handler http.HandlerFunc) {
	m.addRouteWithMiddlewares(method, pattern, handler, m.middlewares)
}

func (m *mux) addRouteWithMiddlewares(method, pattern string, handler http.HandlerFunc, middlewares []Middleware) {
	segments := parsePattern(pattern)
	m.routes = append(m.routes, route{method: method, segments: segments, handler: handler, mws: middlewares})
}

func (m *mux) mountWithMiddlewares(pattern string, h http.Handler, middlewares []Middleware) {
	prefix := cleanPattern(pattern)
	wrapped := applyMiddlewares(h, middlewares)
	m.mounts = append(m.mounts, mount{prefix: prefix, handler: wrapped})
}

func (m *mux) matchMount(r *http.Request) (http.Handler, *http.Request) {
	path := r.URL.Path
	var matched mount
	var found bool
	for _, mt := range m.mounts {
		if strings.HasPrefix(path, mt.prefix) {
			if len(path) == len(mt.prefix) || strings.HasPrefix(path, mt.prefix+"/") {
				if !found || len(mt.prefix) > len(matched.prefix) {
					matched = mt
					found = true
				}
			}
		}
	}

	if !found {
		return nil, nil
	}

	subPath := strings.TrimPrefix(path, matched.prefix)
	if subPath == "" {
		subPath = "/"
	}

	if !strings.HasPrefix(subPath, "/") {
		subPath = "/" + subPath
	}

	req := r.Clone(r.Context())
	req.URL.Path = subPath
	return matched.handler, req
}

func parsePattern(pattern string) []segment {
	cleaned := cleanPattern(pattern)
	if cleaned == "/" {
		return nil
	}

	parts := strings.Split(strings.Trim(cleaned, "/"), "/")
	segments := make([]segment, 0, len(parts))
	for _, p := range parts {
		if strings.HasPrefix(p, "{") && strings.HasSuffix(p, "}") {
			key := strings.TrimSuffix(strings.TrimPrefix(p, "{"), "}")
			segments = append(segments, segment{key: key, isParam: true})
		} else {
			segments = append(segments, segment{literal: p})
		}
	}
	return segments
}

func matchSegments(segments []segment, path string) (map[string]string, bool) {
	if len(segments) == 0 {
		cleaned := cleanPattern(path)
		return nil, cleaned == "/"
	}

	parts := strings.Split(strings.Trim(cleanPattern(path), "/"), "/")
	if len(parts) != len(segments) {
		return nil, false
	}

	params := make(map[string]string, len(segments))
	for i, seg := range segments {
		part := parts[i]
		if seg.isParam {
			params[seg.key] = part
			continue
		}
		if seg.literal != part {
			return nil, false
		}
	}

	return params, true
}

func cleanPattern(pattern string) string {
	if pattern == "" {
		return "/"
	}
	if !strings.HasPrefix(pattern, "/") {
		pattern = "/" + pattern
	}
	if len(pattern) > 1 && strings.HasSuffix(pattern, "/") {
		pattern = strings.TrimSuffix(pattern, "/")
	}
	return pattern
}

func applyMiddlewares(handler http.Handler, middlewares []Middleware) http.Handler {
	h := handler
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

// URLParam fetches a path parameter populated by the router.
func URLParam(r *http.Request, key string) string {
	params, _ := r.Context().Value(paramsKey{}).(map[string]string)
	if params == nil {
		return ""
	}
	return params[key]
}

// scopedMux shares the underlying mux but applies an additional middleware
// stack to routes registered through it (mirroring chi.Router.With behavior).
type scopedMux struct {
	mux         *mux
	middlewares []Middleware
}

func (s *scopedMux) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *scopedMux) Use(middlewares ...Middleware) {
	s.middlewares = append(s.middlewares, middlewares...)
}

func (s *scopedMux) With(middlewares ...Middleware) Router {
	scoped := append([]Middleware{}, s.middlewares...)
	scoped = append(scoped, middlewares...)
	return &scopedMux{mux: s.mux, middlewares: scoped}
}

func (s *scopedMux) Get(pattern string, handler http.HandlerFunc) {
	s.mux.addRouteWithMiddlewares(http.MethodGet, pattern, handler, s.middlewares)
}

func (s *scopedMux) Post(pattern string, handler http.HandlerFunc) {
	s.mux.addRouteWithMiddlewares(http.MethodPost, pattern, handler, s.middlewares)
}

func (s *scopedMux) Put(pattern string, handler http.HandlerFunc) {
	s.mux.addRouteWithMiddlewares(http.MethodPut, pattern, handler, s.middlewares)
}

func (s *scopedMux) Delete(pattern string, handler http.HandlerFunc) {
	s.mux.addRouteWithMiddlewares(http.MethodDelete, pattern, handler, s.middlewares)
}

func (s *scopedMux) Mount(pattern string, h http.Handler) {
	s.mux.mountWithMiddlewares(pattern, h, s.middlewares)
}
