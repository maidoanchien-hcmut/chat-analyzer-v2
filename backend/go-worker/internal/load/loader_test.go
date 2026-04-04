package load

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

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
	return pgconn.NewCommandTag("UPDATE 1"), nil
}

func TestMarkPipelineRunStartedUpdatesPipelineRunLifecycle(t *testing.T) {
	db := &recordingExecer{}
	startedAt := time.Date(2026, time.April, 2, 9, 0, 0, 0, time.UTC)

	if err := markPipelineRunStarted(context.Background(), db, "ce3ee49c-cb9c-48d3-bf89-f34c419e726e", startedAt); err != nil {
		t.Fatalf("markPipelineRunStarted returned error: %v", err)
	}

	if len(db.calls) != 1 {
		t.Fatalf("expected 1 Exec call, got %d", len(db.calls))
	}

	call := db.calls[0]
	if !strings.Contains(call.query, "UPDATE pipeline_run") {
		t.Fatalf("expected UPDATE pipeline_run query")
	}
	if !strings.Contains(call.query, "status = 'running'") {
		t.Fatalf("expected running status to be set")
	}
	if got := call.args[0]; got != "ce3ee49c-cb9c-48d3-bf89-f34c419e726e" {
		t.Fatalf("expected pipeline run id arg, got %#v", got)
	}
}

func TestUpdatePipelineRunCompletionPersistsMetricsAndReuseSummary(t *testing.T) {
	db := &recordingExecer{}
	metrics := map[string]any{"thread_days_loaded": 3}
	reuseSummary := map[string]any{
		"raw_reused_thread_count":    0,
		"raw_refetched_thread_count": 3,
		"ods_reused_thread_count":    0,
		"ods_rebuilt_thread_count":   3,
		"reuse_reason":               "fresh_run",
	}
	finishedAt := time.Date(2026, time.April, 2, 9, 30, 0, 0, time.UTC)

	if err := updatePipelineRunCompletion(
		context.Background(),
		db,
		"ce3ee49c-cb9c-48d3-bf89-f34c419e726e",
		"loaded",
		metrics,
		reuseSummary,
		"",
		finishedAt,
	); err != nil {
		t.Fatalf("updatePipelineRunCompletion returned error: %v", err)
	}

	if len(db.calls) != 1 {
		t.Fatalf("expected 1 Exec call, got %d", len(db.calls))
	}

	call := db.calls[0]
	if !strings.Contains(call.query, "reuse_summary_json") {
		t.Fatalf("expected reuse_summary_json to be updated")
	}

	metricsJSON, ok := call.args[2].([]byte)
	if !ok {
		t.Fatalf("expected marshaled metrics bytes, got %#v", call.args[2])
	}
	if got := string(metricsJSON); !strings.Contains(got, `"thread_days_loaded":3`) {
		t.Fatalf("expected metrics json to include thread_days_loaded, got %s", got)
	}

	reuseJSON, ok := call.args[3].([]byte)
	if !ok {
		t.Fatalf("expected marshaled reuse summary bytes, got %#v", call.args[3])
	}
	var decoded map[string]any
	if err := json.Unmarshal(reuseJSON, &decoded); err != nil {
		t.Fatalf("unmarshal reuse summary: %v", err)
	}
	if decoded["reuse_reason"] != "fresh_run" {
		t.Fatalf("expected reuse_reason fresh_run, got %#v", decoded["reuse_reason"])
	}
}
