-- CreateTable
CREATE TABLE "platform" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand_name" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_user" (
    "id" SERIAL NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "identifier" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_changed_at" TIMESTAMP(3) NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "authz_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "disabled_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_refresh_token" (
    "id" SERIAL NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "device_label" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "rotated_from_token_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_role" (
    "id" SERIAL NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_permission" (
    "id" SERIAL NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "screen" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_users_on_roles" (
    "id" SERIAL NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "auth_users_on_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_roles_on_permissions" (
    "id" SERIAL NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "auth_roles_on_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_audit_log" (
    "id" SERIAL NOT NULL,
    "platform_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_code_key" ON "platform"("code");

-- CreateIndex
CREATE INDEX "auth_user_platform_id_is_active_idx" ON "auth_user"("platform_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "auth_user_platform_id_identifier_key" ON "auth_user"("platform_id", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "auth_user_platform_id_email_key" ON "auth_user"("platform_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_refresh_token_token_hash_key" ON "auth_refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "auth_refresh_token_user_id_is_active_idx" ON "auth_refresh_token"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "auth_refresh_token_platform_id_family_id_idx" ON "auth_refresh_token"("platform_id", "family_id");

-- CreateIndex
CREATE INDEX "auth_refresh_token_expires_at_idx" ON "auth_refresh_token"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_role_platform_id_code_key" ON "auth_role"("platform_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "auth_permission_platform_id_code_key" ON "auth_permission"("platform_id", "code");

-- CreateIndex
CREATE INDEX "auth_users_on_roles_platform_id_user_id_is_active_idx" ON "auth_users_on_roles"("platform_id", "user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_on_roles_platform_id_user_id_role_id_key" ON "auth_users_on_roles"("platform_id", "user_id", "role_id");

-- CreateIndex
CREATE INDEX "auth_roles_on_permissions_platform_id_role_id_is_active_idx" ON "auth_roles_on_permissions"("platform_id", "role_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "auth_roles_on_permissions_platform_id_role_id_permission_id_key" ON "auth_roles_on_permissions"("platform_id", "role_id", "permission_id");

-- CreateIndex
CREATE INDEX "auth_audit_log_platform_id_created_at_idx" ON "auth_audit_log"("platform_id", "created_at");

-- CreateIndex
CREATE INDEX "auth_audit_log_user_id_created_at_idx" ON "auth_audit_log"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "auth_user" ADD CONSTRAINT "auth_user_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_refresh_token" ADD CONSTRAINT "auth_refresh_token_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_refresh_token" ADD CONSTRAINT "auth_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_refresh_token" ADD CONSTRAINT "auth_refresh_token_rotated_from_token_id_fkey" FOREIGN KEY ("rotated_from_token_id") REFERENCES "auth_refresh_token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_role" ADD CONSTRAINT "auth_role_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_permission" ADD CONSTRAINT "auth_permission_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_users_on_roles" ADD CONSTRAINT "auth_users_on_roles_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_users_on_roles" ADD CONSTRAINT "auth_users_on_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_users_on_roles" ADD CONSTRAINT "auth_users_on_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_roles_on_permissions" ADD CONSTRAINT "auth_roles_on_permissions_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_roles_on_permissions" ADD CONSTRAINT "auth_roles_on_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_roles_on_permissions" ADD CONSTRAINT "auth_roles_on_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "auth_permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_audit_log" ADD CONSTRAINT "auth_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

