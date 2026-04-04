import { decodePasswordResetSearch } from "./password-reset-search";

describe("password reset search", () => {
  it("passes through a valid token", () => {
    expect(
      decodePasswordResetSearch({
        token: "reset-token",
      })
    ).toStrictEqual({
      token: "reset-token",
    });
  }, 1000);

  it("preserves the INVALID_TOKEN state", () => {
    expect(
      decodePasswordResetSearch({
        error: "INVALID_TOKEN",
      })
    ).toStrictEqual({
      error: "INVALID_TOKEN",
    });
  }, 1000);
});
