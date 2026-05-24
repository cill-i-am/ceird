import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { optionalAuthFunctionMiddleware } from "./app-context-middleware";
import { decodeAppAuthContextSnapshot } from "./app-context-types";

const CurrentAppContextInputSchema = Schema.Struct({
  hydrateOrganizationContext: Schema.optional(Schema.Boolean),
});

export const getCurrentAppContext = createServerFn({
  method: "GET",
})
  .middleware([optionalAuthFunctionMiddleware])
  .inputValidator((input: unknown) =>
    Schema.decodeUnknownSync(CurrentAppContextInputSchema)(input ?? {})
  )
  .handler(async ({ context, data }) => {
    if (data.hydrateOrganizationContext !== true) {
      return decodeAppAuthContextSnapshot(context);
    }

    const { getRequest } = await import("@tanstack/react-start/server");
    const { buildAppAuthContextSnapshotForRequest } =
      await import("./auth-request-context.server");

    return decodeAppAuthContextSnapshot(
      await buildAppAuthContextSnapshotForRequest(getRequest(), {
        hydrateOrganizationContext: true,
        resolveActiveOrganizationFromList: true,
        session: context.session,
      })
    );
  });
