import { platformsService } from "../src/modules/platforms/platforms.service.ts";
import { authRepository } from "../src/modules/auth/auth.repository.ts";
import { adminAccountsRepository } from "../src/modules/admin-accounts/admin-accounts.repository.ts";
import { hashPassword } from "../src/infra/password.ts";
import { roleCodes } from "../src/modules/authz/permissions.ts";

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

const identifier = readArg("--identifier");
const displayName = readArg("--display-name");
const password = readArg("--password");
const email = readArg("--email");

if (!identifier || !displayName || !password) {
  console.error("Usage: bun run auth:bootstrap-admin --identifier <identifier> --display-name <name> --password <password> [--email <email>]");
  process.exit(1);
}

const platform = await platformsService.ensureDefaultPlatform();
const adminRole = (await adminAccountsRepository.listRoles(platform.id)).find((role) => role.code === roleCodes.ADMIN);

if (!adminRole) {
  console.error("Admin role is missing. Run prisma seed first.");
  process.exit(1);
}

const existingAdmins = await adminAccountsRepository.listUsers(platform.id);
const activeAdmin = existingAdmins.find((user) =>
  user.roles.some((roleLink) => roleLink.isActive && roleLink.role.code === roleCodes.ADMIN)
);

if (activeAdmin) {
  if (activeAdmin.identifier === identifier.trim().toLowerCase()) {
    console.log(`Bootstrap admin already exists with id=${activeAdmin.id}.`);
    process.exit(0);
  }

  console.error(`An admin user already exists with identifier=${activeAdmin.identifier}. Refusing to create another bootstrap admin.`);
  process.exit(1);
}

const passwordHash = await hashPassword(password);

const created = await authRepository.transaction(async (tx) => {
  const user = await tx.authUser.create({
    data: {
      platformId: platform.id,
      identifier: identifier.trim().toLowerCase(),
      displayName: displayName.trim(),
      email: email?.trim().toLowerCase() ?? null,
      passwordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      isActive: true
    }
  });

  await tx.authUsersOnRoles.create({
    data: {
      platformId: platform.id,
      userId: user.id,
      roleId: adminRole.id,
      isActive: true
    }
  });

  return user;
});

await authRepository.createAuditLog({
  platformId: platform.id,
  userId: created.id,
  action: "auth.bootstrap_admin",
  targetType: "auth_user",
  targetId: String(created.id),
  request: {
    ipAddress: null,
    userAgent: "bootstrap-admin-cli",
    origin: null
  }
});

console.log(`Bootstrap admin created with id=${created.id} and identifier=${created.identifier}.`);
