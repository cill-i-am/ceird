import { decodeEmailVerificationSearch } from "./email-verification-search";

describe("email verification search", () => {
  it("maps bare search params to the invalid-token state", () => {
    expect(decodeEmailVerificationSearch({})).toStrictEqual({
      status: "invalid-token",
    });
  }, 1000);

  it("maps status=success to the success state", () => {
    expect(
      decodeEmailVerificationSearch({
        status: "success",
      })
    ).toStrictEqual({
      status: "success",
    });
  }, 1000);

  it("maps INVALID_TOKEN to the invalid-token state", () => {
    expect(
      decodeEmailVerificationSearch({
        error: "INVALID_TOKEN",
      })
    ).toStrictEqual({
      status: "invalid-token",
    });
  }, 1000);

  it("maps TOKEN_EXPIRED to the invalid-token state", () => {
    expect(
      decodeEmailVerificationSearch({
        error: "TOKEN_EXPIRED",
      })
    ).toStrictEqual({
      status: "invalid-token",
    });
  }, 1000);

  it("maps any string error to the invalid-token state", () => {
    expect(
      decodeEmailVerificationSearch({
        error: "USER_NOT_FOUND",
      })
    ).toStrictEqual({
      status: "invalid-token",
    });
  }, 1000);

  it("prefers any string error over status=success", () => {
    expect(
      decodeEmailVerificationSearch({
        error: "USER_NOT_FOUND",
        status: "success",
      })
    ).toStrictEqual({
      status: "invalid-token",
    });
  }, 1000);
});
