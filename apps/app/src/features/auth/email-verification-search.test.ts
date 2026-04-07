import { decodeEmailVerificationSearch } from "./email-verification-search";

describe("email verification search", () => {
  it("defaults to the success state", () => {
    expect(decodeEmailVerificationSearch({})).toStrictEqual({
      status: "success",
    });
  }, 1000);

  it("maps invalid_token to the invalid-token state", () => {
    expect(
      decodeEmailVerificationSearch({
        error: "invalid_token",
      })
    ).toStrictEqual({
      status: "invalid-token",
    });
  }, 1000);
});
