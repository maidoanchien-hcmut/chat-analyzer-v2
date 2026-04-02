import { Elysia, t } from "elysia";
import { authorize } from "../authz/authorize.ts";
import { permissionCodes } from "../authz/permissions.ts";
import { authService } from "../auth/auth.service.ts";
import { extractRequestMetadata } from "../auth/auth.service.ts";
import { adminAccountsService } from "./admin-accounts.service.ts";
import {
  assignRolesBodySchema,
  createUserBodySchema,
  permissionSummarySchema,
  resetPasswordBodySchema,
  roleSummarySchema,
  updateUserBodySchema,
  userSummarySchema,
  usersResponseSchema
} from "./admin-accounts.schema.ts";

const idParamsSchema = t.Object({
  id: t.Numeric()
});

export const adminAccountsController = new Elysia({ prefix: "/admin" })
  .get(
    "/users",
    async ({ headers }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        permissions: [permissionCodes.GET_USERS]
      });
      return adminAccountsService.listUsers(auth);
    },
    {
      ...authorize({
        permissions: [permissionCodes.GET_USERS]
      }),
      response: usersResponseSchema
    }
  )
  .post(
    "/users",
    async ({ body, headers }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        permissions: [permissionCodes.CREATE_USER]
      });
      return adminAccountsService.createUser(auth, body, extractRequestMetadata(headers));
    },
    {
      ...authorize({
        permissions: [permissionCodes.CREATE_USER]
      }),
      body: createUserBodySchema,
      response: userSummarySchema
    }
  )
  .patch(
    "/users/:id",
    async ({ params, body, headers }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        permissions: [permissionCodes.UPDATE_USER]
      });
      return adminAccountsService.updateUser(auth, Number(params.id), body, extractRequestMetadata(headers));
    },
    {
      ...authorize({
        permissions: [permissionCodes.UPDATE_USER]
      }),
      params: idParamsSchema,
      body: updateUserBodySchema,
      response: userSummarySchema
    }
  )
  .post(
    "/users/:id/reset-password",
    async ({ params, body, headers }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        permissions: [permissionCodes.RESET_USER_PASSWORD]
      });
      return adminAccountsService.resetPassword(auth, Number(params.id), body, extractRequestMetadata(headers));
    },
    {
      ...authorize({
        permissions: [permissionCodes.RESET_USER_PASSWORD]
      }),
      params: idParamsSchema,
      body: resetPasswordBodySchema,
      response: t.Object({
        message: t.String()
      })
    }
  )
  .put(
    "/users/:id/roles",
    async ({ params, body, headers }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        permissions: [permissionCodes.ASSIGN_ROLE]
      });
      return adminAccountsService.assignRole(auth, Number(params.id), body, extractRequestMetadata(headers));
    },
    {
      ...authorize({
        permissions: [permissionCodes.ASSIGN_ROLE]
      }),
      params: idParamsSchema,
      body: assignRolesBodySchema,
      response: userSummarySchema
    }
  )
  .get(
    "/roles",
    async ({ headers }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        permissions: [permissionCodes.GET_ROLES]
      });
      return adminAccountsService.getRoles(auth);
    },
    {
      ...authorize({
        permissions: [permissionCodes.GET_ROLES]
      }),
      response: t.Array(roleSummarySchema)
    }
  )
  .get(
    "/permissions",
    async ({ headers }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        permissions: [permissionCodes.GET_PERMISSIONS]
      });
      return adminAccountsService.getPermissions(auth);
    },
    {
      ...authorize({
        permissions: [permissionCodes.GET_PERMISSIONS]
      }),
      response: t.Array(permissionSummarySchema)
    }
  );
