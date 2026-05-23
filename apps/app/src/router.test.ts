import {
  ROUTER_LOADER_STALE_TIME_MS,
  ROUTER_PRELOAD_STALE_TIME_MS,
  getRouter,
} from "./router";

describe("app router", () => {
  it("keeps route loader and intent preload data briefly fresh", () => {
    const router = getRouter();

    expect(router.options.defaultPreload).toBe("intent");
    expect(router.options.defaultStaleTime).toBe(ROUTER_LOADER_STALE_TIME_MS);
    expect(router.options.defaultPreloadStaleTime).toBe(
      ROUTER_PRELOAD_STALE_TIME_MS
    );
  });
});
