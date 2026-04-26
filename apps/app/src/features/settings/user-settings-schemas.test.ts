import {
  decodeChangeEmailInput,
  decodeChangePasswordInput,
  decodeProfileSettingsInput,
} from "./user-settings-schemas";

vi.setConfig({ testTimeout: 10_000 });

describe("user settings schemas", () => {
  it("trims profile names and converts an empty image URL to null", () => {
    expect(
      decodeProfileSettingsInput({
        name: "  Taylor Example  ",
        image: "   ",
      })
    ).toStrictEqual({
      name: "Taylor Example",
      image: null,
    });
  });

  it("accepts an http avatar image URL", () => {
    expect(
      decodeProfileSettingsInput({
        name: "Taylor Example",
        image: "https://example.com/avatar.png",
      })
    ).toStrictEqual({
      name: "Taylor Example",
      image: "https://example.com/avatar.png",
    });
  });

  it("rejects short profile names", () => {
    expect(() =>
      decodeProfileSettingsInput({
        name: "T",
        image: "",
      })
    ).toThrow(/at least 2/i);
  });

  it("normalizes change email input", () => {
    expect(
      decodeChangeEmailInput({
        email: "  new@example.com  ",
      })
    ).toStrictEqual({
      email: "new@example.com",
    });
  });

  it("rejects invalid change email input", () => {
    expect(() =>
      decodeChangeEmailInput({
        email: "not-an-email",
      })
    ).toThrow(/valid email/i);
  });

  it("accepts matching password changes", () => {
    expect(
      decodeChangePasswordInput({
        currentPassword: "old-password",
        newPassword: "new-password",
        confirmPassword: "new-password",
      })
    ).toStrictEqual({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "new-password",
    });
  });

  it("rejects mismatched password confirmation", () => {
    expect(() =>
      decodeChangePasswordInput({
        currentPassword: "old-password",
        newPassword: "new-password",
        confirmPassword: "different-password",
      })
    ).toThrow(/passwords must match/i);
  });
});
