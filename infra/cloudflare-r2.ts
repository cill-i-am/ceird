import { createHash } from "node:crypto";

import * as Redacted from "effect/Redacted";

export function makeCloudflareR2BucketResourceKey(input: {
  readonly accountId: string;
  readonly bucketName: string;
  readonly jurisdiction: string;
}) {
  return `com.cloudflare.edge.r2.bucket.${input.accountId}_${input.jurisdiction}_${input.bucketName}` as const;
}

export const electricStorageR2PermissionGroups = [
  "Workers R2 Storage Bucket Item Read",
  "Workers R2 Storage Bucket Item Write",
] as const;

export function makeElectricStorageR2TokenPolicy(input: {
  readonly accountId: string;
  readonly bucketName: string;
  readonly jurisdiction: string;
}) {
  return {
    effect: "allow" as const,
    permissionGroups: [...electricStorageR2PermissionGroups],
    resources: {
      [makeCloudflareR2BucketResourceKey(input)]: "*",
    },
  };
}

export function makeR2SecretAccessKey(
  apiTokenValue: Redacted.Redacted<string>
) {
  return createHash("sha256")
    .update(Redacted.value(apiTokenValue))
    .digest("hex");
}
