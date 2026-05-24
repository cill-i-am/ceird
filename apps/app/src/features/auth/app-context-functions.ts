import { createServerFn } from "@tanstack/react-start";

import { optionalAuthFunctionMiddleware } from "./app-context-middleware";
import { decodeAppAuthContextSnapshot } from "./app-context-types";

export const getCurrentAppContext = createServerFn({
  method: "GET",
})
  .middleware([optionalAuthFunctionMiddleware])
  .handler(async ({ context }) => decodeAppAuthContextSnapshot(context));
