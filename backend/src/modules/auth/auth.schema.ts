import { t } from "elysia";

export const loginBodySchema = t.Object({
  identifier: t.String({ minLength: 1 }),
  password: t.String({ minLength: 1 })
});

export const changePasswordBodySchema = t.Object({
  currentPassword: t.String({ minLength: 1 }),
  newPassword: t.String({ minLength: 12 })
});

export const authUserProfileSchema = t.Object({
  id: t.Number(),
  identifier: t.String(),
  displayName: t.String(),
  email: t.Nullable(t.String()),
  isActive: t.Boolean(),
  mustChangePassword: t.Boolean()
});

export const platformProfileSchema = t.Object({
  id: t.Number(),
  code: t.String(),
  name: t.String(),
  brandName: t.Nullable(t.String())
});

export const authMeResponseSchema = t.Object({
  user: authUserProfileSchema,
  platform: platformProfileSchema,
  roleIds: t.Array(t.Number()),
  roleCodes: t.Array(t.String()),
  permissions: t.Array(t.String())
});

export const authTokenResponseSchema = t.Object({
  accessToken: t.String(),
  profile: authMeResponseSchema
});

export const messageResponseSchema = t.Object({
  message: t.String()
});

