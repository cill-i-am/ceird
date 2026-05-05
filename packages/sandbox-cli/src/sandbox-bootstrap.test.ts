import {
  acquireInstallLock,
  getInstallLockTimeoutMs,
} from "../docker/sandbox-bootstrap.mjs";

describe("getInstallLockTimeoutMs()", () => {
  it("uses a safe default timeout", () => {
    expect(getInstallLockTimeoutMs({})).toBe(300_000);
  }, 10_000);

  it("respects a custom timeout in seconds", () => {
    expect(
      getInstallLockTimeoutMs({
        CEIRD_SANDBOX_INSTALL_LOCK_TIMEOUT_SECONDS: "12",
      })
    ).toBe(12_000);
  }, 10_000);

  it("falls back to the default timeout for invalid values", () => {
    expect(
      getInstallLockTimeoutMs({
        CEIRD_SANDBOX_INSTALL_LOCK_TIMEOUT_SECONDS: "0",
      })
    ).toBe(300_000);
    expect(
      getInstallLockTimeoutMs({
        CEIRD_SANDBOX_INSTALL_LOCK_TIMEOUT_SECONDS: "nope",
      })
    ).toBe(300_000);
  }, 10_000);
});

describe("acquireInstallLock()", () => {
  it("returns once the lock directory can be created", async () => {
    let attempts = 0;

    await expect(
      acquireInstallLock({
        installLock: "/tmp/install.lock",
        timeoutMs: 5000,
        mkdir: () => {
          attempts += 1;
          return Promise.resolve();
        },
        sleep: () => Promise.resolve(),
        now: () => 0,
      })
    ).resolves.toBeUndefined();

    expect(attempts).toBe(1);
  }, 10_000);

  it("fails with a clear timeout instead of waiting forever", async () => {
    let now = 0;

    await expect(
      acquireInstallLock({
        installLock: "/tmp/install.lock",
        timeoutMs: 2000,
        mkdir: () => {
          const error = new Error("exists") as NodeJS.ErrnoException;
          error.code = "EEXIST";
          return Promise.reject(error);
        },
        sleep: () => {
          now += 1000;
          return Promise.resolve();
        },
        now: () => now,
      })
    ).rejects.toThrow(/timed out waiting for sandbox install lock/i);
  }, 10_000);

  it("rethrows non-lock creation failures immediately", async () => {
    await expect(
      acquireInstallLock({
        installLock: "/tmp/install.lock",
        timeoutMs: 5000,
        mkdir: () => {
          const error = new Error("permission denied") as NodeJS.ErrnoException;
          error.code = "EACCES";
          return Promise.reject(error);
        },
        sleep: () => Promise.resolve(),
        now: () => 0,
      })
    ).rejects.toThrow(/permission denied/i);
  }, 10_000);
});
