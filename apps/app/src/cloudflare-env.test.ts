import { describe, expect, it } from "vitest";

import type { AppCloudflareEnv } from "./cloudflare-env";

type AssertTrue<Value extends true> = Value;
type HasSameKeys<Type, Expected> = [
  Exclude<keyof Type, keyof Expected>,
  Exclude<keyof Expected, keyof Type>,
] extends [never, never]
  ? true
  : false;

const cloudflareEnvKeysMatchStackContract: AssertTrue<
  HasSameKeys<CloudflareEnv, AppCloudflareEnv>
> = true;
const cloudflareEnvSatisfiesStackContract: AssertTrue<
  CloudflareEnv extends AppCloudflareEnv ? true : false
> = true;
const stackContractSatisfiesCloudflareEnv: AssertTrue<
  AppCloudflareEnv extends CloudflareEnv ? true : false
> = true;

describe("Cloudflare app environment contract", () => {
  it("matches the Alchemy Vite Worker environment shape", () => {
    expect(cloudflareEnvKeysMatchStackContract).toBeTruthy();
    expect(cloudflareEnvSatisfiesStackContract).toBeTruthy();
    expect(stackContractSatisfiesCloudflareEnv).toBeTruthy();
  });
});
