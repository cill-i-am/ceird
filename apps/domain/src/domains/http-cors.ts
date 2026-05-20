import { Effect, Layer } from "effect";
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
} from "effect/unstable/http";

import {
  loadAuthenticationConfig,
  matchesTrustedOrigin,
} from "./identity/authentication/config.js";

export const DomainCorsLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* loadAuthenticationConfig;
    const cors = HttpMiddleware.cors({
      allowedOrigins: (origin) =>
        matchesTrustedOrigin(origin, config.trustedOrigins),
      credentials: true,
    });

    return HttpRouter.middleware(
      HttpMiddleware.make((httpApp) =>
        HttpServerRequest.HttpServerRequest.pipe(
          Effect.flatMap((request) =>
            isAuthenticationCorsOwnedPath(request.url) ? httpApp : cors(httpApp)
          )
        )
      ),
      { global: true }
    );
  })
);

function isAuthenticationCorsOwnedPath(url: string) {
  const pathname = requestPathname(url);

  return (
    pathname.startsWith("/api/auth/") || pathname.startsWith("/api/public/")
  );
}

function requestPathname(url: string) {
  const queryIndex = url.indexOf("?");
  const pathOrUrl = queryIndex === -1 ? url : url.slice(0, queryIndex);

  if (pathOrUrl.startsWith("/")) {
    return pathOrUrl;
  }

  try {
    return new URL(pathOrUrl).pathname;
  } catch {
    return pathOrUrl;
  }
}
