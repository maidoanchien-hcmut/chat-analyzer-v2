package pancake

import "testing"

func TestDecodeListPagesParsesSpecShape(t *testing.T) {
	raw := []byte(`{"pages":[{"id":"123","name":"Demo Page"}]}`)

	pages, err := decodeListPages(raw)
	if err != nil {
		t.Fatalf("decode list pages: %v", err)
	}
	if len(pages) != 1 {
		t.Fatalf("expected 1 page, got %d", len(pages))
	}
	if pages[0].ID != "123" || pages[0].Name != "Demo Page" {
		t.Fatalf("unexpected page: %+v", pages[0])
	}
}

func TestDecodeListPagesParsesCategorizedActivatedShape(t *testing.T) {
	raw := []byte(`{"success":true,"categorized":{"activated":[{"id":"1406535699642677","name":"O2 SKIN - Tri Mun Chuan Y Khoa"}]}}`)

	pages, err := decodeListPages(raw)
	if err != nil {
		t.Fatalf("decode list pages: %v", err)
	}
	if len(pages) != 1 {
		t.Fatalf("expected 1 page, got %d", len(pages))
	}
	if pages[0].ID != "1406535699642677" || pages[0].Name != "O2 SKIN - Tri Mun Chuan Y Khoa" {
		t.Fatalf("unexpected page: %+v", pages[0])
	}
}
