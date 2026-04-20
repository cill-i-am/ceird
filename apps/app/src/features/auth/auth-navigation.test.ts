import { getAuthSuccessNavigationTarget } from "./auth-navigation";

describe("auth navigation", () => {
  it("returns home navigation when there is no invitation continuation", () => {
    expect(getAuthSuccessNavigationTarget()).toStrictEqual({
      to: "/",
    });
  }, 10_000);

  it("returns the accept-invitation route when continuation is present", () => {
    expect(getAuthSuccessNavigationTarget("inv_123")).toStrictEqual({
      params: {
        invitationId: "inv_123",
      },
      to: "/accept-invitation/$invitationId",
    });
  }, 10_000);
});
