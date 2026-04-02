import { t } from "elysia";

export const createUserBodySchema = t.Object({
  identifier: t.String({ minLength: 1 }),
  displayName: t.String({ minLength: 1 }),
  email: t.Optional(t.String({ format: "email" })),
  temporaryPassword: t.String({ minLength: 12 }),
  roleIds: t.Array(t.Number(), { minItems: 1, maxItems: 1 }),
  isActive: t.Boolean()
});

export const updateUserBodySchema = t.Object({
  displayName: t.Optional(t.String({ minLength: 1 })),
  email: t.Optional(t.Nullable(t.String({ format: "email" }))),
  isActive: t.Optional(t.Boolean())
});

export const resetPasswordBodySchema = t.Object({
  temporaryPassword: t.String({ minLength: 12 })
});

export const assignRolesBodySchema = t.Object({
  roleIds: t.Array(t.Number(), { minItems: 1, maxItems: 1 })
});

export const userSummarySchema = t.Object({
  id: t.Number(),
  identifier: t.String(),
  displayName: t.String(),
  email: t.Nullable(t.String()),
  isActive: t.Boolean(),
  mustChangePassword: t.Boolean(),
  roleIds: t.Array(t.Number()),
  roleCodes: t.Array(t.String())
});

export const usersResponseSchema = t.Object({
  items: t.Array(userSummarySchema),
  count: t.Number()
});

export const roleSummarySchema = t.Object({
  id: t.Number(),
  code: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  isActive: t.Boolean(),
  permissionCodes: t.Optional(t.Array(t.String()))
});

export const permissionSummarySchema = t.Object({
  id: t.Number(),
  code: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  screen: t.Nullable(t.String()),
  isActive: t.Boolean()
});
