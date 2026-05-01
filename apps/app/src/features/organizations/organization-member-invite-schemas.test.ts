import { Schema } from "effect";

import {
  decodeOrganizationMemberInviteInput,
  organizationMemberInviteSchema,
} from "./organization-member-invite-schemas";

describe("organization member invite schemas", () => {
  it("accepts member, admin, and external invites", () => {
    expect(
      decodeOrganizationMemberInviteInput({
        email: "member@example.com",
        role: "member",
      })
    ).toStrictEqual({
      email: "member@example.com",
      role: "member",
    });

    expect(
      decodeOrganizationMemberInviteInput({
        email: "admin@example.com",
        role: "admin",
      })
    ).toStrictEqual({
      email: "admin@example.com",
      role: "admin",
    });

    expect(
      decodeOrganizationMemberInviteInput({
        email: "external@example.com",
        role: "external",
      })
    ).toStrictEqual({
      email: "external@example.com",
      role: "external",
    });
  }, 10_000);

  it("rejects unsupported invite roles", () => {
    const standardSchema = Schema.standardSchemaV1(
      organizationMemberInviteSchema
    );
    const result = standardSchema["~standard"].validate({
      email: "owner@example.com",
      role: "owner",
    });

    expect(result).toMatchObject({
      issues: expect.anything(),
    });
  }, 10_000);
});
