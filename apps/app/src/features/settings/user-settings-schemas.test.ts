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

  it("rejects malformed avatar image URLs", () => {
    expect(() =>
      decodeProfileSettingsInput({
        name: "Taylor Example",
        image: "not-a-url",
      })
    ).toThrow(/valid http or https image URL/i);
  });

  it("rejects non-http avatar image URLs", () => {
    expect(() =>
      decodeProfileSettingsInput({
        name: "Taylor Example",
        image: "ftp://example.com/avatar.png",
      })
    ).toThrow(/valid http or https image URL/i);
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

  it("allows shorter current passwords so existing users can upgrade", () => {
    expect(
      decodeChangePasswordInput({
        currentPassword: "old-pass",
        newPassword: "new-password",
        confirmPassword: "new-password",
      })
    ).toStrictEqual({
      currentPassword: "old-pass",
      newPassword: "new-password",
      confirmPassword: "new-password",
    });
  });

  it("preserves surrounding whitespace in password inputs", () => {
    expect(
      decodeChangePasswordInput({
        currentPassword: "  old-password  ",
        newPassword: "  new-password  ",
        confirmPassword: "  new-password  ",
      })
    ).toStrictEqual({
      currentPassword: "  old-password  ",
      newPassword: "  new-password  ",
      confirmPassword: "  new-password  ",
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

  it("rejects new passwords shorter than the shared password policy", () => {
    expect(() =>
      decodeChangePasswordInput({
        currentPassword: "old-password",
        newPassword: "12345678901",
        confirmPassword: "12345678901",
      })
    ).toThrow(/12/i);
  });

  it("rejects new passwords above the shared password policy maximum", () => {
    const oversizedPassword = "a".repeat(257);

    expect(() =>
      decodeChangePasswordInput({
        currentPassword: "old-password",
        newPassword: oversizedPassword,
        confirmPassword: oversizedPassword,
      })
    ).toThrow(/256/i);
  });

  it("rejects unchanged password submissions", () => {
    expect(() =>
      decodeChangePasswordInput({
        currentPassword: "same-password",
        newPassword: "same-password",
        confirmPassword: "same-password",
      })
    ).toThrow(/different from your current password/i);
  });
});
