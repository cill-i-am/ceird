import { normalizeOAuthConsentSearchValue } from "./oauth.consent";

describe("OAuth consent route search normalization", () => {
  it("preserves Better Auth numeric signature fields as numbers", () => {
    expect(normalizeOAuthConsentSearchValue(1_778_998_131)).toBe(1_778_998_131);
    expect(normalizeOAuthConsentSearchValue(1_778_997_531_316)).toBe(
      1_778_997_531_316
    );
  });

  it("normalizes arrays while dropping unsupported values", () => {
    expect(
      normalizeOAuthConsentSearchValue([
        "openid",
        123,
        true,
        { unsupported: true },
      ])
    ).toStrictEqual(["openid", 123, true]);
  });
});
