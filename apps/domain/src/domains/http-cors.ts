import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";

import {
  loadAuthenticationConfig,
  matchesTrustedOrigin,
} from "./identity/authentication/config.js";

export const DomainCorsLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const config = yield* loadAuthenticationConfig;

    return HttpApiBuilder.middlewareCors({
      allowedOrigins: (origin) =>
        matchesTrustedOrigin(origin, config.trustedOrigins),
      credentials: true,
    });
  })
);
