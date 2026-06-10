import { decodeUserSettingsSearch } from "./user-settings-search";

describe("user settings search", () => {
  it("keeps a completed email-change callback status", () => {
    expect(
      decodeUserSettingsSearch({
        emailChange: "complete",
      })
    ).toStrictEqual({
      emailChange: "complete",
    });
  }, 1000);

  it("lets Better Auth verification errors take precedence", () => {
    expect(
      decodeUserSettingsSearch({
        emailChange: "complete",
        error: "INVALID_TOKEN",
      })
    ).toStrictEqual({
      emailChange: "failed",
    });
  }, 1000);
});
