import { resolveAuthBaseURL } from "../../lib/auth-client";
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

  it("normalizes surrounding whitespace in login input", () => {
    expect(
      decodeLoginInput({
        email: " user@example.com ",
        password: "  supersecret  ",
      })
    ).toStrictEqual({
      email: "user@example.com",
      password: "supersecret",
    });
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

  it("normalizes surrounding whitespace in signup input", () => {
    expect(
      decodeSignupInput({
        name: " Cillian ",
        email: " cillian@example.com ",
        password: "  supersecret  ",
        confirmPassword: "  supersecret  ",
      })
    ).toStrictEqual({
      name: "Cillian",
      email: "cillian@example.com",
      password: "supersecret",
      confirmPassword: "supersecret",
    });
  }, 1000);
});

describe("auth base URL resolution", () => {
  it("maps the app portless origin to the API origin", () => {
    expect(
      resolveAuthBaseURL("https://agent-one.app.task-tracker.localhost:1355")
    ).toBe("https://agent-one.api.task-tracker.localhost:1355/api/auth");
  }, 1000);

  it("maps the raw local app dev origin to the local API origin", () => {
    expect(resolveAuthBaseURL("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3001/api/auth"
    );
  }, 1000);

  it("returns undefined when no origin is available", () => {
    expect(resolveAuthBaseURL()).toBeUndefined();
  }, 1000);

  it("returns undefined for an invalid origin", () => {
    expect(resolveAuthBaseURL("not-a-url")).toBeUndefined();
  }, 1000);
});
