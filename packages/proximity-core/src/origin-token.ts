import { Schema } from "effect";

import { ProximityOriginToken } from "./domain.js";
import type { ProximityOriginToken as ProximityOriginTokenType } from "./domain.js";
import { UnsignedTypedOriginSchema } from "./dto.js";
import type { UnsignedTypedOrigin } from "./dto.js";

const PROXIMITY_ORIGIN_TOKEN_VERSION = "v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

const ProximityOriginTokenPayloadSchema = Schema.Struct({
  exp: Schema.Number,
  origin: UnsignedTypedOriginSchema,
});

export interface SignProximityOriginTokenInput {
  readonly now?: Date | undefined;
  readonly origin: UnsignedTypedOrigin;
  readonly secret: string;
  readonly ttlSeconds: number;
}

export interface VerifyProximityOriginTokenInput {
  readonly now?: Date | undefined;
  readonly origin: UnsignedTypedOrigin;
  readonly secret: string;
  readonly token: ProximityOriginTokenType;
}

export class ProximityOriginTokenInvalidError extends Error {
  override readonly name = "ProximityOriginTokenInvalidError";
}

export async function signProximityOriginToken(
  input: SignProximityOriginTokenInput
): Promise<ProximityOriginTokenType> {
  const now = input.now ?? new Date();
  const payload = {
    exp: Math.floor(now.getTime() / 1000) + input.ttlSeconds,
    origin: input.origin,
  };
  const encodedPayload = base64UrlEncode(
    textEncoder.encode(JSON.stringify(payload))
  );
  const signature = await signProximityOriginTokenPayload(
    input.secret,
    encodedPayload
  );

  return Schema.decodeUnknownSync(ProximityOriginToken)(
    `${PROXIMITY_ORIGIN_TOKEN_VERSION}.${encodedPayload}.${signature}`
  );
}

export async function verifyProximityOriginToken(
  input: VerifyProximityOriginTokenInput
): Promise<void> {
  const [version, encodedPayload, signature, ...extraParts] =
    input.token.split(".");

  if (
    version !== PROXIMITY_ORIGIN_TOKEN_VERSION ||
    encodedPayload === undefined ||
    signature === undefined ||
    extraParts.length > 0
  ) {
    throw new ProximityOriginTokenInvalidError("Invalid origin token shape");
  }

  const expectedSignature = await signProximityOriginTokenPayload(
    input.secret,
    encodedPayload
  );

  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new ProximityOriginTokenInvalidError(
      "Invalid origin token signature"
    );
  }

  const payload = decodeProximityOriginTokenPayload(encodedPayload);
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);

  if (payload.exp < now) {
    throw new ProximityOriginTokenInvalidError("Origin token expired");
  }

  if (!unsignedTypedOriginsEqual(payload.origin, input.origin)) {
    throw new ProximityOriginTokenInvalidError("Origin token mismatch");
  }
}

function decodeProximityOriginTokenPayload(encodedPayload: string) {
  try {
    return Schema.decodeUnknownSync(ProximityOriginTokenPayloadSchema)(
      JSON.parse(textDecoder.decode(base64UrlDecode(encodedPayload)))
    );
  } catch {
    throw new ProximityOriginTokenInvalidError("Invalid origin token payload");
  }
}

async function signProximityOriginTokenPayload(
  secret: string,
  data: string
): Promise<string> {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(data)
  );

  return base64UrlEncode(new Uint8Array(signature));
}

function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = hmacKeyCache.get(secret);

  if (cached !== undefined) {
    return cached;
  }

  const imported = crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  hmacKeyCache.set(secret, imported);

  return imported;
}

function unsignedTypedOriginsEqual(
  left: UnsignedTypedOrigin,
  right: UnsignedTypedOrigin
) {
  return (
    left.coordinates.latitude === right.coordinates.latitude &&
    left.coordinates.longitude === right.coordinates.longitude &&
    left.displayText === right.displayText &&
    left.placeId === right.placeId
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "="
  );
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }

  return bytes;
}

function timingSafeEqual(left: string, right: string): boolean {
  let difference = Number(left.length !== right.length);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    difference += Number(left.codePointAt(index) !== right.codePointAt(index));
  }

  return difference === 0;
}
