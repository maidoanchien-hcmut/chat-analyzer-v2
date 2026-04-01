# go-worker

`go-worker` owns seam 1 extract/ETL work.

This initial scaffold provides a read-only Pancake extractor that:

- loads config from `.env` and CLI flags
- lists accessible pages
- generates a page access token from the user access token
- fetches conversations, messages, tags, and page customers
- caps message paging per conversation during sample runs to avoid aggressive rate-limit spikes
- writes raw JSON samples to `docs/pancake-api-samples/`

## Run

```powershell
cd D:\Code\chat-analyzer-v2\backend\go-worker
copy .env.example .env
go run .
```

## Notes

- `PANCAKE_PAGE_ACCESS_TOKEN` is intentionally not part of the config. The worker obtains it from Pancake.
- Raw samples are written locally for development/debugging and are ignored by git in `docs/pancake-api-samples/`.
- Token-like fields are redacted before sample files are written.
