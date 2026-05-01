const DELIVERY_KEY_DEDUPE_TTL_MS = 10 * 60 * 1000;

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

export function serializeUnknownError(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}
