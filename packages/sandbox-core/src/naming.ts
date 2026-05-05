import { Schema } from "effect";

import { SandboxNameError } from "./errors.js";

export const SANDBOX_ID_LENGTH = 12;
const COLLISION_HASH_LENGTH = 6;
const SANDBOX_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SandboxId = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]+$/),
  Schema.brand("@ceird/SandboxId")
);

export type SandboxId = Schema.Schema.Type<typeof SandboxId>;

export const SandboxName = Schema.String.pipe(
  Schema.pattern(SANDBOX_NAME_PATTERN),
  Schema.brand("@ceird/SandboxName")
);

export type SandboxName = Schema.Schema.Type<typeof SandboxName>;

export const HostnameSlug = Schema.String.pipe(
  Schema.pattern(SANDBOX_NAME_PATTERN),
  Schema.brand("@ceird/HostnameSlug")
);

export type HostnameSlug = Schema.Schema.Type<typeof HostnameSlug>;

export const ComposeProjectName = Schema.String.pipe(
  Schema.pattern(/^ceird-sbx-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  Schema.brand("@ceird/ComposeProjectName")
);

export type ComposeProjectName = Schema.Schema.Type<typeof ComposeProjectName>;

export function sanitizeForHostname(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

export function validateSandboxId(value: string): SandboxId {
  return Schema.decodeUnknownSync(SandboxId)(value);
}

export function validateHostnameSlug(value: string): HostnameSlug {
  return Schema.decodeUnknownSync(HostnameSlug)(value);
}

export function validateSandboxName(name: string): SandboxName {
  const normalized = name.trim();

  if (!SANDBOX_NAME_PATTERN.test(normalized)) {
    throw new SandboxNameError({
      message:
        "Sandbox names must use lowercase letters, numbers, and hyphens.",
      sandboxName: name,
    });
  }

  return Schema.decodeUnknownSync(SandboxName)(normalized);
}

export function makeComposeProjectName(
  sandboxName: SandboxName
): ComposeProjectName {
  return Schema.decodeUnknownSync(ComposeProjectName)(
    `ceird-sbx-${sandboxName}`
  );
}

export function hashSandboxSeed(
  seed: string,
  length = SANDBOX_ID_LENGTH
): string {
  let hash = 5381;

  for (const character of seed) {
    hash = hash * 33 + (character.codePointAt(0) ?? 0);
  }

  return Math.abs(hash).toString(16).padStart(length, "0").slice(0, length);
}

export function ensureUniqueSlug(
  preferredSlug: string,
  sandboxId: SandboxId,
  takenSlugs?: ReadonlySet<HostnameSlug>
): HostnameSlug {
  const candidate = takenSlugs?.has(validateHostnameSlug(preferredSlug))
    ? `${preferredSlug}-${sandboxId.slice(0, COLLISION_HASH_LENGTH)}`
    : preferredSlug;
  return validateHostnameSlug(candidate);
}
