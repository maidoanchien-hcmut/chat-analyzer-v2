package extract

import (
	"testing"

	"chat-analyzer-v2/backend/go-worker/internal/pancake"
)

func TestFlattenAdClicksReturnsStableOrderAcrossMapBuckets(t *testing.T) {
	values := map[string][]pancake.SourceRef{
		"bucket-b": {
			{
				AdID:       "ad-2",
				PostID:     "post-2",
				InsertedAt: "2026-04-01T09:00:00",
			},
		},
		"bucket-a": {
			{
				AdID:       "ad-1",
				PostID:     "post-1",
				InsertedAt: "2026-04-01T09:00:00",
			},
		},
	}

	flattened := flattenAdClicks(values)
	if len(flattened) != 2 {
		t.Fatalf("expected 2 flattened items, got %d", len(flattened))
	}
	if flattened[0].AdID != "ad-1" || flattened[0].PostID != "post-1" {
		t.Fatalf("expected lexically first source ref first, got %#v", flattened[0])
	}
	if flattened[1].AdID != "ad-2" || flattened[1].PostID != "post-2" {
		t.Fatalf("expected lexically second source ref second, got %#v", flattened[1])
	}
}
