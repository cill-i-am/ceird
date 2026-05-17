import {
  buildInvitationContinuationSearch,
  getInvitationAcceptanceNavigationTarget,
  validateInvitationContinuationSearch,
} from "./invitation-continuation";

describe("invitation continuation", () => {
  it("reads the invitation id from route search", () => {
    expect(
      validateInvitationContinuationSearch({
        invitation: "inv_123",
      })
    ).toStrictEqual({
      invitation: "inv_123",
    });
  }, 10_000);

  it("drops invalid invitation continuation values", () => {
    expect(
      validateInvitationContinuationSearch({
        invitation: 123,
      })
    ).toStrictEqual({
      invitation: undefined,
    });
  }, 10_000);

  it("builds preserved auth search for an invitation", () => {
    expect(buildInvitationContinuationSearch("inv_123")).toStrictEqual({
      invitation: "inv_123",
    });
  }, 10_000);

  it("builds the accept-invitation navigation target", () => {
    expect(getInvitationAcceptanceNavigationTarget("inv_123")).toStrictEqual({
      params: {
        invitationId: "inv_123",
      },
      to: "/accept-invitation/$invitationId",
    });
  }, 10_000);
});
