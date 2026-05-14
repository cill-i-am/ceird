import {
  authCardViewTransition,
  getAuthSuccessNavigationTarget,
  getForgotPasswordNavigationTarget,
  getLoginNavigationTarget,
  getSignupNavigationTarget,
} from "./auth-navigation";

describe("auth navigation", () => {
  it("returns home navigation when there is no invitation continuation", () => {
    expect(getAuthSuccessNavigationTarget()).toStrictEqual({
      to: "/",
      viewTransition: authCardViewTransition,
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

  it("uses the shared auth-card view transition for auth route links", () => {
    expect(authCardViewTransition).toStrictEqual({
      types: ["auth-card"],
    });
    expect(getLoginNavigationTarget().viewTransition).toBe(
      authCardViewTransition
    );
    expect(getSignupNavigationTarget().viewTransition).toBe(
      authCardViewTransition
    );
    expect(getForgotPasswordNavigationTarget().viewTransition).toBe(
      authCardViewTransition
    );
  }, 10_000);
});
