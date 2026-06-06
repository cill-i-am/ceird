import { createHash } from "node:crypto";

import * as Redacted from "effect/Redacted";

export function makeCloudflareR2BucketResourceKey(input: {
  readonly accountId: string;
  readonly bucketName: string;
  readonly jurisdiction: string;
}) {
  return `com.cloudflare.edge.r2.bucket.${input.accountId}_${input.jurisdiction}_${input.bucketName}` as const;
}

export function makeCloudflareR2AllBucketsResourceScope(accountId: string) {
  return {
    [`com.cloudflare.api.account.${accountId}`]: {
      "com.cloudflare.edge.r2.bucket.*": "*",
    },
  } as const;
}

export function makeR2SecretAccessKey(
  apiTokenValue: Redacted.Redacted<string>
) {
  return createHash("sha256")
    .update(Redacted.value(apiTokenValue))
    .digest("hex");
}
