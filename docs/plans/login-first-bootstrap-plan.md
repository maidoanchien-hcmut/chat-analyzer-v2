# Login Feature & Bootstrap Plan

**Goal:** Khởi động hệ thống, hoàn thiện luồng đăng nhập nội bộ trước mọi tính năng nghiệp vụ khác, với 1 tài khoản admin khởi nguồn và không có đăng ký public.
**Architecture:** `backend/` là seam-owner của auth, session, account management, permission enforcement và Prisma/Postgres, đồng thời bootstrap Redis cho các năng lực hạ tầng như rate limit/BullMQ/cache. `frontend/` chỉ hiển thị login, giữ access token trong memory, dùng refresh token qua cookie, và có giao diện admin để quản lý tài khoản/role. `service/` không tham gia slice này.

**Intent:** Tạo ra một nền đăng nhập nội bộ đủ production-ready để mọi slice sau này đều bám vào cùng một boundary xác thực và phân quyền.
**Observable Delta:** Có thể khởi tạo DB local, migrate schema, bootstrap 1 admin đầu tiên bằng CLI riêng, đăng nhập thành công, refresh/logout/change-password được, admin có thể tạo tài khoản mới rồi gán role cho họ, và API/UI đã có permission gate tĩnh cho slice auth với naming/model bám sát `o2-backend`.
**Allowed Mechanism:** ElysiaJS + Prisma 5.x + Postgres + Redis + JWT access token + persisted refresh session + seeded RBAC + static permission catalog.
**Forbidden Shortcuts:** Không hard-code tài khoản admin trong source, không lưu refresh token ở `localStorage`, không có public signup endpoint, không dùng JSON file/local memory làm user store, không cho `service/` hay `go-worker` sở hữu auth.
**Proof Obligations:** Prisma migration chạy được, bootstrap-admin CLI idempotent, login/refresh/logout/change-password hoạt động end-to-end, account management chỉ cho admin, permission catalog được seed và enforce ở backend, naming/model auth bám sát kiểu `o2-backend`, route guard frontend chặn user chưa xác thực, revoke session khi role/password/status đổi hoạt động đúng.

**Proof Ownership:**

- Architect-owned proof: boundary auth nằm trọn ở `backend/`; user/session/role model không làm lệch `platform` boundary đã chốt trong design; naming/model auth đủ gần `o2-backend` để giảm cognitive drift khi tích hợp.
- Executor-owned proof: migrate, bootstrap admin, login, refresh, logout, change-password, tạo tài khoản, gán role, revoke session khi đổi quyền, chặn truy cập trái quyền.
- Escalation trigger: nếu phải mở public registration, nếu muốn bỏ persisted refresh session, hoặc nếu permission model phải đi đến custom role editor hay direct per-user override ngay từ v1.

**Not Done Until:** Admin bootstrap đăng nhập được, vào được trang quản lý tài khoản, tạo user mới, gán role, user đó đổi được mật khẩu tạm ở lần đăng nhập đầu, và chỉ thấy đúng UI/API được phép.

**Solution Integrity Check:**

- Least-painful patch: hard-code một cặp `admin/admin` trong env rồi mở vài route login giả.
- Why rejected: chạy demo được nhưng phá luôn security boundary, không có session persistence, không có user lifecycle, và phải viết lại gần như toàn bộ khi thêm RBAC thật.
- Long-lived route: Prisma schema cho `Platform`, `AuthUser`, `AuthRefreshToken`, `AuthRole`, `AuthPermission`, `AuthUsersOnRoles`, `AuthRolesOnPermissions`, bootstrap admin qua CLI riêng, access token ngắn hạn + refresh session lưu DB, permission catalog seed tĩnh, admin UI quản lý tài khoản và gán đúng 1 role cho mỗi user ở v1.
- If deferred: chỉ defer custom role editor và per-user permission override; không defer schema auth/session nền tảng, join-table role model, hay permission guard.
- Debt or drift path: nếu v1 chỉ cho admin gán role có sẵn, phải ghi rõ role catalog và permission catalog là seeded/static ở phase đầu, còn data model vẫn giữ dạng join-table owner-clean như `o2-backend`.

**Temporary Bridge Policy:**

- Allowed temporary bridges: role catalog seed tĩnh; permission catalog seed tĩnh; giao diện admin chỉ gán role, chưa cho sửa permission matrix.
- Why temporary: đủ để vận hành v1 mà không khóa chặt kiến trúc vào hard-coded authorization lâu dài.
- Removal point: phase sau có thể thêm role editor hoặc direct permission override mà không thay schema cốt lõi.
- Final acceptance rule: không còn bridge nào dạng hard-coded user/password hoặc session in-memory khi đóng slice.

**Tham Khảo `o2-backend`:**

- Học theo:
  - boundary `platform` chạy xuyên suốt auth entities
  - naming explicit kiểu `AuthUser`, `AuthRole`, `AuthPermission`, `AuthUsersOnRoles`, `AuthRolesOnPermissions`
  - permission catalog seed trong DB
  - route-level permission metadata + backend guard
- Không copy:
  - permission matrix quá lớn ngay từ đầu
  - lưu refresh token dạng raw value trong DB
  - public register/forgot-password flow cho v1 nội bộ

## Kiến Trúc Đề Xuất

### Boundary

- `backend/`
  - auth API
  - session rotation
  - account management
  - RBAC enforcement
  - Prisma schema/migrations/seed
  - Redis bootstrap cho rate limit/BullMQ/caching infra
- `frontend/`
  - login screen
  - auth store
  - route guard
  - admin account management UI
- `service/`
  - không tham gia
- `backend/go-worker/`
  - không tham gia

### Data Model Tối Thiểu

- `platform`
  - phase đầu có thể seed 1 `default platform`
  - giữ boundary để không phải đập lại schema khi hệ thống tích hợp vào app lớn hơn
- `auth_user`
  - `platform_id`
  - email hoặc username nội bộ
  - display name
  - password hash
  - password changed at
  - `must_change_password`
  - `authz_version`
  - `is_active`
  - timestamps
- `auth_refresh_token`
  - `platform_id`
  - `user_id`
  - hashed refresh token
  - `family_id`
  - `is_active`
  - device/session metadata tối thiểu
  - ip address, user agent, last seen at
  - expires at, revoked at, revoked reason, rotated from session id
- `auth_role`
  - `platform_id`
  - seeded catalog
  - `name`, `description`, `is_active`
- `auth_permission`
  - `platform_id`
  - seeded catalog
  - `code`, `name`, `description`, `screen`, `is_active`
- `auth_users_on_roles`
  - `platform_id`
  - `user_id`
  - `role_id`
  - v1 chỉ cho đúng 1 role active trên mỗi user, nhưng vẫn giữ bảng riêng để không khóa kiến trúc
- `auth_roles_on_permissions`
  - `platform_id`
  - `role_id`
  - `permission_id`
- `auth_audit_log`
  - login success/failure, logout, create user, disable user, role change, password reset, change password, bootstrap admin

Rule chốt:

- auth user thuộc đúng 1 `platform` ở v1, giống hướng `o2-backend`
- access token và refresh session luôn gắn với đúng 1 `auth_user` và `platform_id`
- source of truth cho auth là `auth_user + auth_users_on_roles + auth_roles_on_permissions + auth_refresh_token`

### Role Catalog V1

- `admin`
  - cũng chính là role của IT ở v1
  - toàn quyền hệ thống
  - dùng cho tài khoản bootstrap đầu tiên
- `viewer`
  - chỉ xem dashboard/report/export và các màn read-only được mở cho business

Rule chốt:

- không seed `it_operator`; IT dùng luôn role `admin`
- v1 mỗi user chỉ chọn 1 role chính trong UI admin, dù persistence vẫn là `auth_users_on_roles`
- nếu sau này cần tách `bod_viewer`, `sales_lead`, `ops_viewer`, chỉ thêm role seed mới, không đổi schema

### Permission Catalog V1

Permission được seed tĩnh trong DB, khai báo bằng enum/code trong backend theo style `o2-backend`, và map vào role qua `auth_roles_on_permissions`.

Nhóm `AUTH`

- `GET_AUTH_ME`
- `REFRESH_AUTH_SESSION`
- `LOGOUT_AUTH_SESSION`
- `CHANGE_OWN_PASSWORD`

Nhóm `USERS`

- `GET_USERS`
- `GET_USER`
- `CREATE_USER`
- `UPDATE_USER`
- `RESET_USER_PASSWORD`
- `DISABLE_USER`

Nhóm `ROLES`

- `GET_ROLES`
- `ASSIGN_ROLE`

Nhóm `PERMISSIONS`

- `GET_PERMISSIONS`

Nhóm `AUDIT`

- `GET_AUDIT_LOGS`

Nhóm `DASHBOARD`

- `GET_DASHBOARD`
- `EXPORT_REPORT`

Mapping role v1:

- `admin`
  - toàn bộ permission trên
- `viewer`
  - `GET_AUTH_ME`
  - `REFRESH_AUTH_SESSION`
  - `LOGOUT_AUTH_SESSION`
  - `CHANGE_OWN_PASSWORD`
  - `GET_DASHBOARD`
  - `EXPORT_REPORT`

## 3 Hướng Triển Khai

### App-local auth chuẩn trong `backend/` với Prisma

- Prisma line chốt ở `5.x`
- dùng `schema.prisma` chuẩn với `generator client { provider = "prisma-client-js" }`
- không dùng `prisma.config.ts`
- Password hash: `argon2id`
- Access token JWT ngắn hạn, ví dụ 15 phút
- Refresh token random opaque token, hash rồi lưu DB
- Cookie refresh token: `HttpOnly`
- Role/permission đọc từ DB
- naming Prisma model, DTO, repository và enum permission bám sát style `o2-backend`

Ưu điểm:

- đúng với kiến trúc hiện tại
- dễ seed admin đầu tiên
- không phụ thuộc vendor ngoài
- khớp design đang có

Nhược điểm:

- phải tự làm session rotation, audit log, account UI

## Failure Modes Và Mitigation

- Bootstrap admin bị chạy lặp:
  - bootstrap CLI phải idempotent và từ chối tạo admin thứ hai trùng định danh
- Mất quyền truy cập vì disable nhầm admin cuối cùng:
  - không cho disable `admin` cuối cùng còn active
- Refresh token bị lộ:
  - lưu hash trong DB, rotate mỗi lần refresh, revoke chain khi nghi ngờ compromise
- Permission cache cũ sau khi đổi role:
  - cache permission theo `user_id`
  - role đổi hoặc user bị disable thì xóa cache ngay và revoke session liên quan
- Role đổi nhưng access token cũ còn sống:
  - mọi `auth_user` phải có `authz_version`
  - access token mang `authz_version`
  - khi role/status đổi thì tăng version và revoke các `auth_refresh_token` liên quan
- Đổi mật khẩu nhưng session cũ vẫn còn hiệu lực:
  - password là thuộc `auth_user`
  - đổi password hoặc reset password phải revoke tất cả `auth_refresh_token` của user đó trên platform hiện tại
- Redis tạm thời không sẵn sàng:
  - không được làm mất source of truth của auth
  - login/session persistence vẫn dựa trên Postgres
  - chỉ degrade các tính năng phụ trợ như rate limit hoặc queue bootstrap
- User bị xoá cứng làm gãy audit:
  - không hard delete; dùng `disabled_at` hoặc `is_active = false`
- Frontend giữ session sai cách:
  - access token chỉ ở memory/Pinia
  - refresh token chỉ ở cookie
- Admin tạo user nhưng chưa set password an toàn:
  - hỗ trợ `temporary password` + `must_change_password`
- Lệch `platform` boundary:
  - mọi auth entity chính phải có hoặc suy ra được `platform_id`
- Permission catalog drift giữa code và DB:
  - permission code trong backend là source of truth của seed
  - migration/seed phải upsert theo code, không theo tên hiển thị

## Implementation Tasks

### Task 1: Bootstrap backend skeleton cho auth

**Scope:** `backend/`
**Owner boundary:** auth API, env config, Prisma bootstrap
**Implementation shape:**

- chuyển `backend/` từ stub sang cấu trúc thật:
  - `src/app.ts`
  - `src/server.ts`
  - `src/config/*`
  - `src/modules/auth/*`
  - `src/modules/admin-accounts/*`
  - `src/modules/authz/*`
  - `prisma/schema.prisma`
- thêm env loader và error model tối thiểu
- thêm Redis config/bootstrap tối thiểu
- thêm permission guard + decorator tối thiểu theo kiểu route metadata
- thêm health endpoint
  **Proof:**
- app boot được
- env thiếu biến bắt buộc thì fail sớm
  **Verification:**
- `bun run src/server.ts` hoặc script tương đương
- health endpoint trả OK

### Task 2: Prisma schema, migration, seed catalogs

**Scope:** `backend/prisma/*`
**Owner boundary:** user/session/RBAC persistence
**Implementation shape:**

- tạo schema cho:
  - `Platform`
  - `AuthUser`
  - `AuthRefreshToken`
  - `AuthRole`
  - `AuthPermission`
  - `AuthUsersOnRoles`
  - `AuthRolesOnPermissions`
  - `AuthAuditLog`
- seed:
  - `default platform`
  - role catalog
  - permission catalog
  - role-permission mapping
  - rule v1: mỗi user có tối đa 1 role active
    **Proof:**
- migration sạch
- seed chạy nhiều lần không tạo duplicate
  **Verification:**
- `bunx prisma migrate dev --name init_auth`
- `bunx prisma db seed`
- `bunx prisma studio` kiểm tra dữ liệu seed

### Task 3: Bootstrap admin CLI

**Scope:** `backend/`
**Owner boundary:** one-time privileged bootstrap
**Implementation shape:**

- tạo CLI riêng, ví dụ `auth:bootstrap-admin`
- CLI này:
  - tạo `default platform` nếu chưa có
  - tạo `admin` đầu tiên nếu chưa có
  - gán `platform_id` mặc định cho admin đầu tiên
  - gán role `admin`
- không nhét bootstrap admin vào generic seed
  **Proof:**
- chạy nhiều lần không duplicate
- không tạo thêm admin ngoài ý muốn
  **Verification:**
- chạy CLI 2 lần liên tiếp
- kiểm tra DB chỉ có 1 bootstrap admin như mong muốn

### Task 4: Auth API

**Scope:** `backend/src/modules/auth/*`
**Owner boundary:** login/session lifecycle
**Implementation shape:**

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `POST /auth/change-password`
- `GET /auth/me`
- password verify bằng `argon2id`
- refresh token rotation mỗi lần refresh
- access token ký JWT với claims đủ dùng:
  - `sub`
  - `platform_id`
  - `sid`
  - `authz_version`
  - `role_ids`
  - `role_codes`
- permission snapshot trả qua `GET /auth/me`, không phải source of truth trong JWT
- nếu `must_change_password` thì chỉ mở tối thiểu các route cần cho đổi mật khẩu và logout
  **Proof:**
- login đúng tạo access token + refresh cookie
- login sai không leak thông tin
- refresh dùng token cũ sau rotation bị từ chối
- change-password revoke session theo policy
  **Verification:**
- integration test auth flow
- manual curl/Postman smoke

### Task 5: Admin account management API

**Scope:** `backend/src/modules/admin-accounts/*`
**Owner boundary:** internal-only user lifecycle
**Implementation shape:**

- không có `POST /auth/register`
- chỉ admin mới có:
  - `POST /admin/users`
  - `GET /admin/users`
  - `PATCH /admin/users/:id`
  - `POST /admin/users/:id/reset-password`
  - `PUT /admin/users/:id/roles`
  - `GET /admin/roles`
  - `GET /admin/permissions`
- account creation flow:
  - admin tạo user với temporary password
  - user được gắn vào `default platform` ở v1
  - user được chọn đúng 1 role trong role catalog seed, nhưng payload vẫn đi theo naming `roleIds`
  - user login lần đầu phải đổi mật khẩu
  - đổi role hoặc disable user phải revoke các `auth_refresh_token` liên quan
    **Proof:**
- non-admin bị chặn
- admin tạo user thành công
- disable user thì user không refresh/login tiếp được
- role change làm access cũ hết hiệu lực
  **Verification:**
- authorization tests
- manual admin flow

### Task 6: Frontend login shell

**Scope:** `frontend/`
**Owner boundary:** UX đăng nhập và route guard
**Implementation shape:**

- bootstrap Vue app
- login page
- auth store:
  - access token in memory
  - silent refresh
  - logout
- force-change-password flow ở lần login đầu
- route guard + permission gate
- shell admin page cho account management
- permission snapshot từ `GET /auth/me` để chặn UI ở client, nhưng backend vẫn là source of truth
  **Proof:**
- chưa login thì bị đẩy về login
- login xong route guard hoạt động
- refresh page vẫn lấy lại access token qua refresh cookie
- user `must_change_password` bị chặn khỏi app chính cho đến khi đổi xong
  **Verification:**
- manual browser flow
- frontend typecheck/build

### Task 7: Hardening tối thiểu cho slice auth

**Scope:** backend + frontend
**Owner boundary:** security/runtime behavior
**Implementation shape:**

- rate limit login
- audit log
- cookie config theo env
- permission cache qua Redis là optional accelerator, không là source of truth
- cookie contract nên có thêm:
  - `AUTH_REFRESH_COOKIE_SAME_SITE`
  - `AUTH_REFRESH_COOKIE_PATH`
  - optional `AUTH_REFRESH_COOKIE_DOMAIN`
- CSRF posture cho refresh/logout nếu dùng cookie
- password policy tối thiểu
- disable hard delete user
- session revoke on role/status/password change
  **Proof:**
- login brute-force có guard cơ bản
- audit log ghi được action nhạy cảm
- đổi role hoặc đổi password làm session cũ mất hiệu lực
  **Verification:**
- targeted tests
- manual abuse checks

## API Contract V1

### Public auth endpoints

- `POST /auth/login`
  - input: `identifier`, `password`
  - output: access token + profile
  - side effect: set refresh cookie
- `POST /auth/refresh`
  - input: cookie only
  - output: new access token
  - side effect: rotate refresh cookie
- `POST /auth/logout`
  - input: cookie only
  - side effect: revoke current refresh session
- `POST /auth/logout-all`
  - side effect: revoke all refresh sessions của user hiện tại trên platform hiện tại
- `POST /auth/change-password`
  - input: `current_password` hoặc `temporary_password`, `new_password`
  - side effect: đổi password, clear `must_change_password`, revoke tất cả session của user theo policy
- `GET /auth/me`
  - output: current user + platform info + role ids + role codes + permission snapshot

### Admin endpoints

- `GET /admin/users`
- `POST /admin/users`
- `PATCH /admin/users/:id`
- `PUT /admin/users/:id/roles`
- `POST /admin/users/:id/reset-password`
- `GET /admin/roles`
- `GET /admin/permissions`

## File Layout Đề Xuất

### Backend

```text
backend/
  prisma/
    schema.prisma
    seed.ts
  scripts/
    bootstrap-admin.ts
  src/
    app.ts
    server.ts
    config/
      env.ts
      auth.ts
    modules/
      auth/
        auth.controller.ts
        auth.service.ts
        auth.repository.ts
        auth.schema.ts
        auth.types.ts
      authz/
        permissions.ts
        permissions.guard.ts
        authorize.ts
      admin-accounts/
        admin-accounts.controller.ts
        admin-accounts.service.ts
        admin-accounts.repository.ts
        admin-accounts.schema.ts
      platforms/
        platforms.service.ts
    infra/
      prisma.ts
      jwt.ts
      password.ts
      cookies.ts
      redis.ts
```

### Frontend

```text
frontend/
  src/
    main.ts
    app/
    modules/
      auth/
        api.ts
        store.ts
        routes.ts
        pages/LoginPage.vue
      admin-accounts/
        api.ts
        pages/AccountsPage.vue
        components/UserForm.vue
    router/
    shared/
```

## WSL Postgres + Redis + Prisma Setup

### Kết nối thử

Trước hết thử luôn URL `localhost:5432`. WSL2 hiện nay thường forward port tự động sang Windows host.

Nếu vẫn không được:

1. sửa `postgresql.conf`

```bash
sudo nano /etc/postgresql/*/main/postgresql.conf
```

đặt:

```conf
listen_addresses = '*'
```

2. sửa `pg_hba.conf`

```bash
sudo nano /etc/postgresql/*/main/pg_hba.conf
```

thêm rule local dev:

```conf
host    all    all    127.0.0.1/32    scram-sha-256
host    all    all    ::1/128         scram-sha-256
```

3. restart Postgres

```bash
sudo service postgresql restart
```

Nếu Windows host vẫn không vào được qua `localhost`, lúc đó mới kiểm tra WSL IP:

```bash
hostname -I
```

và dùng IP đó trong `DATABASE_URL`.

### Ghi chú local dev:

- `frontend` Vue 3 mặc định chạy ở `http://localhost:5173`
- `backend` dùng port mặc định `3000`
- naming env của `backend` nên theo kiểu chuẩn server/runtime, không dùng prefix `APP_*` mơ hồ
- `frontend` dùng env theo convention của Vite, hiện tại là `VITE_BACKEND_API_BASE_URL`
- file mẫu frontend nằm ở [frontend/.env.example](D:/Code/chat-analyzer-v2/frontend/.env.example)
- `DB_*` là phần dễ điền bằng tay, còn `.env.example` hiện tại vẫn khai báo thêm `DATABASE_URL` dẫn xuất từ các biến này
- `REDIS_*` là phần dễ điền bằng tay, còn `.env.example` hiện tại vẫn khai báo thêm `REDIS_URL` dẫn xuất từ các biến này
- backend bootstrap và Prisma phải bám đúng contract env như trong `.env.example`

Khởi tạo Prisma:

```bash
cd backend
bunx prisma init --datasource-provider postgresql
```

Lưu ý:

- `schema.prisma` vẫn sẽ dùng `env("DATABASE_URL")`
- file `.env` hiện tại đã khai báo sẵn cả `DB_*` và `DATABASE_URL`
- Redis client sẽ dùng `REDIS_URL` hoặc tự compose lại từ `REDIS_*`
- nếu env loader runtime không hỗ trợ expansion `${VAR}`, backend phải tự compose lại `DATABASE_URL` trong config layer từ `DB_*`
- nếu env loader runtime không hỗ trợ expansion `${VAR}`, backend cũng phải tự compose lại `REDIS_URL` từ `REDIS_*`
- Prisma CLI và backend runtime phải dùng đúng các tên biến đang có trong `.env.example`
- auth runtime phải bind token với `auth_user.platform_id`, không chỉ với `user id`

### Prisma Rules V1

- provider: `postgresql`
- migration phải là nguồn sự thật duy nhất cho schema app
- tuyệt đối không chỉnh tay schema DB ngoài migration, trừ các thao tác cài Postgres ban đầu
- seed phải idempotent

## Verification Checklist

- `psql` kết nối được vào `chat_analyzer_v2`
- `redis-cli ping` trả `PONG`
- Prisma migrate chạy sạch
- Seed tạo đúng 1 admin khởi nguồn
- bootstrap CLI chạy lặp không duplicate admin
- Không có public signup route
- Admin login được
- Refresh hoạt động và rotate token
- Change-password hoạt động và clear `must_change_password`
- Admin tạo user mới được
- Gán đúng 1 role được dù API dùng naming `roleIds`
- `GET /auth/me` trả permission snapshot đúng
- Backend route guard chặn đúng theo permission
- Đổi role hoặc disable user làm session của user đó mất hiệu lực
- Đổi hoặc reset password làm toàn bộ session của user đó trên platform hiện tại mất hiệu lực
- User thường không vào được màn admin
- Frontend refresh trang không làm mất session hợp lệ

## Out Of Scope Cho Slice Này

- forgot-password qua email
- SSO ngoài
- self-service registration
- custom role editor UI
- custom permission editor UI
- MFA
- audit dashboard đầy đủ
- AI/service integration
