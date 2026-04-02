package extract

import (
	"chat-analyzer-v2/backend/go-worker/internal/pancake"
	"chat-analyzer-v2/backend/go-worker/internal/transform"
)

type DayWindow = transform.DayWindow
type PageWindow = transform.PageWindow

func FilterMessagePage(messages []pancake.Message, window DayWindow) (PageWindow, error) {
	return transform.FilterMessagePage(messages, window)
}
