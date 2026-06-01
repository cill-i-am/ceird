import { describe, expect, it } from "vitest";

import { isBrowserCanceledRequest } from "../../e2e/helpers/performance";

describe("E2E performance helper", () => {
  it("treats browser-canceled requests as navigation noise", () => {
    expect(
      isBrowserCanceledRequest({
        failure: () => ({ errorText: "net::ERR_ABORTED" }),
      })
    ).toBeTruthy();
  });

  it("keeps non-canceled request failures actionable", () => {
    expect(
      isBrowserCanceledRequest({
        failure: () => ({ errorText: "net::ERR_FAILED" }),
      })
    ).toBeFalsy();
  });
});
