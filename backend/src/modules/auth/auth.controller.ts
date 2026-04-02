import { Elysia } from "elysia";
import { AppError } from "../../core/errors.ts";
import { authorize } from "../authz/authorize.ts";
import { permissionCodes } from "../authz/permissions.ts";
import { authService, extractRequestMetadata, readHeader } from "./auth.service.ts";
import {
  authMeResponseSchema,
  authTokenResponseSchema,
  changePasswordBodySchema,
  loginBodySchema,
  messageResponseSchema
} from "./auth.schema.ts";

export const authController = new Elysia({ prefix: "/auth" })
  .post(
    "/login",
    async ({ body, headers, set }) => {
      const result = await authService.login(body, extractRequestMetadata(headers));
      set.headers["set-cookie"] = result.setCookie;
      return result.response;
    },
    {
      body: loginBodySchema,
      response: authTokenResponseSchema
    }
  )
  .post(
    "/refresh",
    async ({ headers, set }) => {
      const result = await authService.refresh(readHeader(headers, "cookie"), extractRequestMetadata(headers));
      set.headers["set-cookie"] = result.setCookie;
      return result.response;
    },
    {
      ...authorize({
        allowMustChangePassword: true,
        permissions: [permissionCodes.REFRESH_AUTH_SESSION]
      }),
      response: authTokenResponseSchema
    }
  )
  .post(
    "/logout",
    async ({ headers, set }) => {
      const result = await authService.logout(readHeader(headers, "cookie"), extractRequestMetadata(headers));
      set.headers["set-cookie"] = result.setCookie;
      return result.response;
    },
    {
      response: messageResponseSchema
    }
  )
  .post(
    "/logout-all",
    async ({ headers, set }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        allowMustChangePassword: true,
        permissions: [permissionCodes.LOGOUT_AUTH_SESSION]
      });
      const result = await authService.logoutAll(auth, extractRequestMetadata(headers));
      set.headers["set-cookie"] = result.setCookie;
      return result.response;
    },
    {
      ...authorize({
        allowMustChangePassword: true,
        permissions: [permissionCodes.LOGOUT_AUTH_SESSION]
      }),
      response: messageResponseSchema
    }
  )
  .post(
    "/change-password",
    async ({ body, headers, set }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        allowMustChangePassword: true,
        permissions: [permissionCodes.CHANGE_OWN_PASSWORD]
      });
      const result = await authService.changePassword(auth, body, extractRequestMetadata(headers));
      set.headers["set-cookie"] = result.setCookie;
      return result.response;
    },
    {
      ...authorize({
        allowMustChangePassword: true,
        permissions: [permissionCodes.CHANGE_OWN_PASSWORD]
      }),
      body: changePasswordBodySchema,
      response: authTokenResponseSchema
    }
  )
  .get(
    "/me",
    async ({ headers }) => {
      const auth = await authService.authenticateAccessRequest(headers, {
        permissions: [permissionCodes.GET_AUTH_ME],
        allowMustChangePassword: true
      });
      return authService.getMe(auth);
    },
    {
      ...authorize({
        permissions: [permissionCodes.GET_AUTH_ME],
        allowMustChangePassword: true
      }),
      response: authMeResponseSchema
    }
  )
  .onError(({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return {
        code: error.code,
        message: error.message,
        details: error.details ?? null
      };
    }

    if (code === "VALIDATION") {
      set.status = 400;
      return {
        code: "VALIDATION_ERROR",
        message: "Request validation failed."
      };
    }
  });
