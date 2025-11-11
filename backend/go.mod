module github.com/innhopp/central/backend

go 1.22

require (
	github.com/go-chi/chi/v5 v5.0.0
	github.com/jackc/pgx/v5 v5.5.4
)

replace github.com/go-chi/chi/v5 => ./third_party/chi
