import {
  buildPasswordResetRedirectTo,
  createBrowserCeirdAuthClient,
  createCeirdAuthClient,
  resolveApiBaseURL,
  resolveAuthBaseURL,
} from "../../lib/auth-client";
import {
  decodeLoginInput,
  decodePasswordResetInput,
  decodePasswordResetRequestInput,
  decodeSignupInput,
} from "./auth-schemas";

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
        password: "supersecret",
      })
    ).toStrictEqual({
      email: "user@example.com",
      password: "supersecret",
    });
  }, 1000);

  it("preserves surrounding whitespace in passwords", () => {
    expect(
      decodeLoginInput({
        email: " user@example.com ",
        password: "  supersecret  ",
      })
    ).toStrictEqual({
      email: "user@example.com",
      password: "  supersecret  ",
    });
  }, 1000);

  it("normalizes surrounding whitespace in signup input", () => {
    expect(
      decodeSignupInput({
        name: " Cillian ",
        email: " cillian@example.com ",
        password: "supersecret",
      })
    ).toStrictEqual({
      name: "Cillian",
      email: "cillian@example.com",
      password: "supersecret",
    });
  }, 1000);

  it("rejects stale password confirmation fields at the signup boundary", () => {
    expect(() =>
      decodeSignupInput({
        name: "Cillian",
        email: "cillian@example.com",
        password: "supersecret",
        confirmPassword: "supersecret",
      })
    ).toThrow(/is unexpected/);
  }, 1000);

  it("rejects short reset request passwords", () => {
    expect(() =>
      decodePasswordResetInput({
        password: "short",
      })
    ).toThrow(/8/i);
  }, 1000);

  it("normalizes surrounding whitespace in reset request input", () => {
    expect(
      decodePasswordResetRequestInput({
        email: " user@example.com ",
      })
    ).toStrictEqual({
      email: "user@example.com",
    });
  }, 1000);
});

describe("auth base URL resolution", () => {
  it("resolves the api base URL from the same origin mapping rules", () => {
    expect(resolveApiBaseURL("https://app.ceird.example.com")).toBe(
      "https://api.ceird.example.com/api"
    );
  }, 1000);

  it("prefers an injected auth origin when one is provided", () => {
    expect(
      resolveAuthBaseURL("http://127.0.0.1:4300", "http://127.0.0.1:4301")
    ).toBe("http://127.0.0.1:4301/api/auth");
  }, 1000);

  it("maps conventional app domains to the API origin", () => {
    expect(resolveAuthBaseURL("https://app.ceird.example.com")).toBe(
      "https://api.ceird.example.com/api/auth"
    );
  }, 1000);

  it("maps the raw local app dev origin to the local API origin", () => {
    expect(resolveAuthBaseURL("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3001/api/auth"
    );
  }, 1000);

  it("maps the local app origin to the matching local API auth origin", () => {
    expect(resolveAuthBaseURL("http://app.localhost:1337")).toBe(
      "http://api.localhost:1337/api/auth"
    );
  }, 1000);

  it("returns undefined when no origin is available", () => {
    expect(resolveAuthBaseURL()).toBeUndefined();
  }, 1000);

  it("returns undefined for an invalid origin", () => {
    expect(resolveAuthBaseURL("not-a-url")).toBeUndefined();
  }, 1000);

  it("falls back to host-based mapping when the injected auth origin is invalid", () => {
    expect(
      resolveAuthBaseURL("https://app.ceird.example.com", "not-a-url")
    ).toBe("https://api.ceird.example.com/api/auth");
  }, 1000);

  it("maps conventional app subdomains for browser auth clients", () => {
    const authClient = createBrowserCeirdAuthClient(
      "https://app.ceird.example.com"
    );

    expect(authClient.$fetch).toBeDefined();
  }, 1000);

  it("configures external as a member-level organization client role", () => {
    const authClient = createCeirdAuthClient();

    expect([
      authClient.organization.checkRolePermission({
        role: "external",
        permissions: {
          ac: ["read"],
        },
      }),
      authClient.organization.checkRolePermission({
        role: "external",
        permissions: {
          member: ["create"],
        },
      }),
    ]).toStrictEqual([true, false]);
  }, 1000);

  it("builds the password reset redirect URL from an origin", () => {
    expect(buildPasswordResetRedirectTo("https://app.example.com")).toBe(
      "https://app.example.com/reset-password"
    );
  }, 1000);
});
