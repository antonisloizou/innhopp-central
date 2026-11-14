package budgets

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnsureEventBudgetTx idempotently creates and initializes an event budget.
func EnsureEventBudgetTx(ctx context.Context, tx pgx.Tx, eventID int64, eventName, currency string) (int64, error) {
	baseCurrency := normalizeCurrency(currency)
	name := strings.TrimSpace(eventName)
	if name == "" {
		name = "Event"
	}
	name += " budget"
	var budgetID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO event_budgets (event_id, name, base_currency, display_currency, status, notes)
		VALUES ($1,$2,$3,$3,'draft','')
		ON CONFLICT (event_id) DO UPDATE SET event_id=EXCLUDED.event_id
		RETURNING id
	`, eventID, name, baseCurrency).Scan(&budgetID); err != nil {
		return 0, err
	}
	for i, section := range defaultSections {
		if _, err := tx.Exec(ctx, `INSERT INTO budget_sections (budget_id,code,name,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT (budget_id,code) DO NOTHING`, budgetID, section.Code, section.Name, i); err != nil {
			return 0, err
		}
	}
	for key, value := range defaultAssumptions {
		if _, err := tx.Exec(ctx, `INSERT INTO budget_assumptions (budget_id,key,value_num) VALUES($1,$2,$3) ON CONFLICT (budget_id,key) DO NOTHING`, budgetID, key, value); err != nil {
			return 0, err
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO budget_currencies (budget_id,currency_code,rate_to_base) VALUES($1,$2,1) ON CONFLICT (budget_id,currency_code) DO NOTHING`, budgetID, baseCurrency); err != nil {
		return 0, err
	}
	return budgetID, nil
}

// BackfillMissingEventBudgets initializes budgets for legacy events that lack one.
func BackfillMissingEventBudgets(ctx context.Context, db *pgxpool.Pool) error {
	tx, err := db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT e.id,e.name,COALESCE(e.currency,'EUR') FROM events e LEFT JOIN event_budgets b ON b.event_id=e.id WHERE b.id IS NULL ORDER BY e.id`)
	if err != nil {
		return err
	}
	type eventSeed struct {
		id             int64
		name, currency string
	}
	seeds := []eventSeed{}
	for rows.Next() {
		var seed eventSeed
		if err := rows.Scan(&seed.id, &seed.name, &seed.currency); err != nil {
			rows.Close()
			return err
		}
		seeds = append(seeds, seed)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()
	for _, seed := range seeds {
		if _, err := EnsureEventBudgetTx(ctx, tx, seed.id, seed.name, seed.currency); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
