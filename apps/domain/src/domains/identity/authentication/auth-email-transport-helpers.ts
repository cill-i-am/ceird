import { createHash } from "node:crypto";

import { Effect } from "effect";

const DELIVERY_KEY_DEDUPE_TTL_MS = 10 * 60 * 1000;
const EMAIL_ADDRESS_IN_TEXT_PATTERN =
  /[^\s<>()"']+@[^\s<>()"']+\.[^\s<>()"']+/g;
const URL_WITH_QUERY_PATTERN = /\bhttps?:\/\/[^\s<>()"']+/g;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(token|code|secret|password|key)=([^&\s<>()"']+)/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function buildRecipientLogContext(recipient: string) {
  const [_, domain = ""] = recipient.split("@");

  return {
    recipientDomain: domain,
  };
}

export function buildRedactedRecipientDescription(recipient: string) {
  const [_, domain = ""] = recipient.split("@");

  return domain.length > 0 ? `recipient at ${domain}` : "recipient";
}

export function makeDeliveryKeyDedupeStore() {
  const entries = new Map<string, number>();

  function pruneExpired(now: number) {
    for (const [deliveryKey, expiresAt] of entries.entries()) {
      if (expiresAt <= now) {
        entries.delete(deliveryKey);
      }
    }
  }

  return {
    reserve(deliveryKey: string) {
      const now = Date.now();
      pruneExpired(now);

      if (entries.has(deliveryKey)) {
        return false;
      }

      entries.set(deliveryKey, now + DELIVERY_KEY_DEDUPE_TTL_MS);
      return true;
    },
    retain(deliveryKey: string) {
      entries.set(deliveryKey, Date.now() + DELIVERY_KEY_DEDUPE_TTL_MS);
    },
    release(deliveryKey: string) {
      entries.delete(deliveryKey);
    },
  };
}

export function sendWithDeliveryKeyDedupe<E, R>(input: {
  readonly deliveryKey: string | undefined;
  readonly dedupeStore: ReturnType<typeof makeDeliveryKeyDedupeStore>;
  readonly sendEffect: Effect.Effect<void, E, R>;
  readonly logDeduped: Effect.Effect<void, never, R>;
}) {
  const { deliveryKey } = input;

  if (!deliveryKey) {
    return input.sendEffect;
  }

  return Effect.sync(() => input.dedupeStore.reserve(deliveryKey)).pipe(
    Effect.flatMap((shouldSend) =>
      shouldSend
        ? input.sendEffect.pipe(
            Effect.tap(() =>
              Effect.sync(() => input.dedupeStore.retain(deliveryKey))
            ),
            Effect.tapError(() =>
              Effect.sync(() => input.dedupeStore.release(deliveryKey))
            )
          )
        : input.logDeduped
    )
  );
}

export function sanitizeProviderErrorMessage(message: string) {
  return message
    .replaceAll(EMAIL_ADDRESS_IN_TEXT_PATTERN, "[redacted-email]")
    .replaceAll(URL_WITH_QUERY_PATTERN, (url) => sanitizeUrl(url))
    .replaceAll(SECRET_ASSIGNMENT_PATTERN, "$1=[redacted]")
    .replaceAll(BEARER_TOKEN_PATTERN, "Bearer [redacted]");
}

export function serializeUnknownError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return sanitizeProviderErrorMessage(error.message);
  }

  return sanitizeProviderErrorMessage(String(error));
}

export function fingerprintDeliveryKey(deliveryKey: string | undefined) {
  if (deliveryKey === undefined) {
    return;
  }

  return createHash("sha256").update(deliveryKey).digest("hex").slice(0, 16);
}

function sanitizeUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.search.length > 0) {
      url.search = "?[redacted]";
    }

    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value.replaceAll(SECRET_ASSIGNMENT_PATTERN, "$1=[redacted]");
  }
}
