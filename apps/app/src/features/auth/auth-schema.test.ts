

import { decodeLoginInput, decodeSignupInput } from "./auth-schemas";

describe("auth schemas", () => {
  it("rejects an invalid login email", () => {
    expect(() =>
      decodeLoginInput({
        email: "not-an-email",
        password: "supersecret",
      })
    ).toThrow(/email/i);
  }, 1000);

  it("rejects mismatched signup passwords", () => {
    expect(() =>
      decodeSignupInput({
        name: "Cillian",
        email: "cillian@example.com",
        password: "supersecret",
        confirmPassword: "different-secret",
      })
    ).toThrow(/match/i);
  }, 1000);
});
