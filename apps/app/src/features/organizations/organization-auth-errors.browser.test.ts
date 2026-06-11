import {
  CREATE_ORGANIZATION_LIMIT_REACHED_MESSAGE,
  INVITE_MEMBER_MEMBERSHIP_LIMIT_REACHED_MESSAGE,
  INVITE_MEMBER_PENDING_LIMIT_REACHED_MESSAGE,
  INVITE_MEMBER_RATE_LIMIT_REACHED_MESSAGE,
  getAcceptInvitationFailureMessage,
  getCreateOrganizationFailureMessage,
  getInviteMemberFailureMessage,
} from "./organization-auth-errors";

describe("organization auth error messages", () => {
  it("maps organization creation limit errors to useful onboarding copy", () => {
    expect(
      getCreateOrganizationFailureMessage(
        {
          code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
          message: "You have reached the maximum number of organizations",
          status: 403,
        },
        "Fallback"
      )
    ).toBe(CREATE_ORGANIZATION_LIMIT_REACHED_MESSAGE);
  }, 10_000);

  it("maps pending invitation limit errors to actionable invite copy", () => {
    expect(
      getInviteMemberFailureMessage(
        {
          code: "INVITATION_LIMIT_REACHED",
          message: "Invitation limit reached",
          status: 403,
        },
        "Fallback"
      )
    ).toBe(INVITE_MEMBER_PENDING_LIMIT_REACHED_MESSAGE);
  }, 10_000);

  it("maps membership limit errors to actionable invite copy", () => {
    expect(
      getInviteMemberFailureMessage(
        {
          code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
          message: "Organization membership limit reached",
          status: 403,
        },
        "Fallback"
      )
    ).toBe(INVITE_MEMBER_MEMBERSHIP_LIMIT_REACHED_MESSAGE);
  }, 10_000);

  it("maps invitation rate-limit responses to retry-later copy", () => {
    expect(
      getInviteMemberFailureMessage(
        {
          message: "Too many requests. Please try again later.",
          status: 429,
          statusText: "Too Many Requests",
        },
        "Fallback"
      )
    ).toBe(INVITE_MEMBER_RATE_LIMIT_REACHED_MESSAGE);
  }, 10_000);

  it("maps accepted-invitation organization limit errors to account-limit copy", () => {
    expect(
      getAcceptInvitationFailureMessage(
        {
          code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
          message: "You have reached the maximum number of organizations",
          status: 403,
        },
        "Fallback"
      )
    ).toBe(CREATE_ORGANIZATION_LIMIT_REACHED_MESSAGE);
  }, 10_000);

  it("maps accepted-invitation membership limit errors to full-team copy", () => {
    expect(
      getAcceptInvitationFailureMessage(
        {
          code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
          message: "Organization membership limit reached",
          status: 403,
        },
        "Fallback"
      )
    ).toBe(INVITE_MEMBER_MEMBERSHIP_LIMIT_REACHED_MESSAGE);
  }, 10_000);
});
