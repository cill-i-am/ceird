import { Effect } from "effect";

const DELIVERY_KEY_DEDUPE_TTL_MS = 10 * 60 * 1000;
const EMAIL_ADDRESS_IN_TEXT_PATTERN =
  /[^\s<>()"']+@[^\s<>()"']+\.[^\s<>()"']+/g;

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
  return message.replaceAll(EMAIL_ADDRESS_IN_TEXT_PATTERN, "[redacted-email]");
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
