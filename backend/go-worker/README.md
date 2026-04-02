# go-worker

`go-worker` owns seam 1 extract/ETL work.

Current worker path follows the production extract shape from [pancake-seam1-extract-transform-audit.md](D:/Code/chat-analyzer-v2/docs/plans/pancake-seam1-extract-transform-audit.md):

- loads config from `.env` and CLI flags
- resolves the target page from the Pancake user access token
- generates a page access token at runtime
- fetches the page tag dictionary once per run
- selects conversations in the requested `business_day` window
- pages conversation messages and keeps only the `message-day` slice for that business day
- stops paging a conversation as soon as a message page contains records older than the day window

## Run

```powershell
cd D:\Code\chat-analyzer-v2\backend\go-worker
copy .env.example .env
go run . -business-day 2026-03-31
```

## Notes

- `PANCAKE_PAGE_ACCESS_TOKEN` is intentionally not part of the config. The worker obtains it from Pancake.
- `PANCAKE_MAX_CONVERSATIONS` and `PANCAKE_MAX_MESSAGE_PAGES_PER_CONVERSATION` are optional debug caps. Use `0` for the full production path.
- `docs/pancake-api-samples/` stays as a static audit artifact only. The worker no longer writes sample payloads there.
