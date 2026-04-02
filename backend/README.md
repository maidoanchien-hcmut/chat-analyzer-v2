# backend

Full project setup is documented in the root [README](D:/Code/chat-analyzer-v2/README.md).

Quick start:

```powershell
cd D:\Code\chat-analyzer-v2\backend
bun install
bunx prisma generate
bun run dev
```

Prisma local flow:

```powershell
$env:DATABASE_URL='postgresql://chat_admin:your_password@localhost:5432/chat_analyzer_v2?schema=public'
bunx prisma migrate deploy
bunx prisma db seed
```

Bootstrap the first admin:

```powershell
bun run auth:bootstrap-admin --identifier admin --display-name "Bootstrap Admin" --password "TempAdmin!2026A"
```
