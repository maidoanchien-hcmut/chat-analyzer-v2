package load

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"chat-analyzer-v2/backend/go-worker/internal/config"
	"github.com/jackc/pgx/v5/pgconn"
)

type execCall struct {
	query string
	args  []any
}

type recordingExecer struct {
	calls []execCall
}

func (r *recordingExecer) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	r.calls = append(r.calls, execCall{
		query: query,
		args:  append([]any(nil), args...),
	})
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func TestInsertETLRunStartPersistsControlPlaneOwnership(t *testing.T) {
	db := &recordingExecer{}
	startedAt := time.Date(2026, time.April, 2, 9, 0, 0, 0, time.UTC)
	runParams := json.RawMessage(`{"initial_conversation_limit":25}`)
	cfg := config.Config{
		ConnectedPageID:  "connected-page-1",
		PageID:           "1406535699642677",
		BusinessTimezone: "Asia/Ho_Chi_Minh",
		RunMode:          "onboarding_sample",
		ProcessingMode:   "etl_and_ai",
		BusinessDay:      time.Date(2026, time.April, 1, 0, 0, 0, 0, time.FixedZone("ICT", 7*60*60)),
		SnapshotVersion:  3,
		RunParamsJSON:    runParams,
	}

	if _, err := insertETLRunStart(context.Background(), db, cfg, startedAt); err != nil {
		t.Fatalf("insertETLRunStart returned error: %v", err)
	}

	if len(db.calls) != 1 {
		t.Fatalf("expected 1 Exec call, got %d", len(db.calls))
	}

	call := db.calls[0]
	if !strings.Contains(call.query, "connected_page_id") {
		t.Fatalf("expected INSERT query to include connected_page_id column")
	}
	if !strings.Contains(call.query, "processing_mode") {
		t.Fatalf("expected INSERT query to include processing_mode column")
	}
	if !strings.Contains(call.query, "run_params_json") {
		t.Fatalf("expected INSERT query to include run_params_json column")
	}
	if got := call.args[3]; got != "connected-page-1" {
		t.Fatalf("expected connected_page_id arg, got %#v", got)
	}
	if got := call.args[5]; got != "etl_and_ai" {
		t.Fatalf("expected processing_mode arg, got %#v", got)
	}
	if got := string(call.args[13].(json.RawMessage)); got != string(runParams) {
		t.Fatalf("expected run_params_json %s, got %s", string(runParams), got)
	}
}
