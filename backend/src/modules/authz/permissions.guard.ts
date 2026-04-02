import { authService, type AuthenticatedRequest } from "../auth/auth.service.ts";
import type { AuthorizationOptions } from "./authorize.ts";

type HeaderBag = Headers | Record<string, string | undefined>;
type GuardContext = {
  headers: HeaderBag;
};

type AuthorizedHandler<Context extends GuardContext> = (
  context: Context,
  auth: AuthenticatedRequest
) => unknown | Promise<unknown>;

export function withAuthorization<Context extends GuardContext>(
  options: AuthorizationOptions,
  handler: AuthorizedHandler<Context>
) {
  return async (context: Context) => {
    const auth = await authService.authenticateAccessRequest(context.headers, options);
    return handler(context, auth);
  };
}
