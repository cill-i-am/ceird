import { getPublicInvitationPreview, resolveApiBaseURL } from "./auth-client";

describe("auth client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and decodes the public invitation preview contract", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        email: "m***@e***.com",
        organizationName: "Acme Field Ops",
        role: "member",
      })
    );

    await expect(
      getPublicInvitationPreview("inv_123", "https://api.example.com/api")
    ).resolves.toStrictEqual({
      email: "m***@e***.com",
      organizationName: "Acme Field Ops",
      role: "member",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      new URL(
        "public/invitations/inv_123/preview",
        "https://api.example.com/api/"
      ),
      {
        headers: {
          accept: "application/json",
        },
      }
    );
  }, 1000);

  it("returns null when the preview payload does not match the shared contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        email: "m***@e***.com",
        organizationName: 123,
        role: "member",
      })
    );

    await expect(
      getPublicInvitationPreview("inv_123", "https://api.example.com/api")
    ).resolves.toBeNull();
  }, 1000);

  it("uses the same app-to-api origin mapping for public endpoints", () => {
    expect(
      resolveApiBaseURL("https://agent-one.app.task-tracker.localhost:1355")
    ).toBe("https://agent-one.api.task-tracker.localhost:1355/api");
  }, 1000);
});
