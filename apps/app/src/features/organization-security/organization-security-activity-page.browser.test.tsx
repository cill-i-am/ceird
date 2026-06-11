import type {
  OrganizationSecurityActivityCursor,
  OrganizationSecurityActivityEventId,
  OrganizationSecurityActivityListResponse,
  UserId,
} from "@ceird/identity-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { OrganizationSecurityActivitySearch } from "./organization-security-search";

const ownerUserId = "user_owner" as UserId;
const memberUserId = "user_member" as UserId;
const nextCursor = "cursor_123" as OrganizationSecurityActivityCursor;

const securityActivity = {
  items: [
    {
      actor: {
        email: "owner@example.com",
        id: ownerUserId,
        name: "Owner User",
      },
      createdAt: "2026-06-07T10:30:00.000Z",
      eventType: "organization_member_role_updated",
      id: "audit_role" as OrganizationSecurityActivityEventId,
      organizationId: "org_123" as never,
      roleChange: {
        after: "admin",
        before: "member",
      },
      summary: "Changed Taylor Member from Member to Admin.",
      target: {
        label: "Taylor Member",
        memberId: "member_123",
        type: "member",
        userId: memberUserId,
      },
    },
    {
      actor: {
        email: "owner@example.com",
        id: ownerUserId,
        name: "Owner User",
      },
      createdAt: "2026-06-07T11:00:00.000Z",
      eventType: "organization_invitation_created",
      id: "audit_invite" as OrganizationSecurityActivityEventId,
      organizationId: "org_123" as never,
      summary: "Invited m***@e***.com.",
      target: {
        label: "m***@e***.com",
        type: "invitation",
      },
    },
  ],
  nextCursor,
} satisfies OrganizationSecurityActivityListResponse;

describe("organization security activity page", () => {
  it(
    "renders security activity rows without exposing raw provenance",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationSecurityActivityPage } =
        await import("./organization-security-activity-page");

      render(
        <OrganizationSecurityActivityPage
          activity={securityActivity}
          search={{}}
          onSearchChange={vi.fn<
            (search: OrganizationSecurityActivitySearch) => void
          >()}
        />
      );

      expect(
        screen.getByRole("heading", { name: "Security activity" })
      ).toBeVisible();
      expect(
        screen.getByText("Changed Taylor Member from Member to Admin.")
      ).toBeVisible();
      expect(screen.getByText("Invited m***@e***.com.")).toBeVisible();
      expect(
        screen.getByText(/IP address and user agent details/i)
      ).toBeVisible();
      expect(screen.queryByText("203.0.113.10")).not.toBeInTheDocument();
      expect(screen.queryByText("Ceird Test Browser")).not.toBeInTheDocument();
      expect(screen.getByText("2 recent events shown")).toBeVisible();
      expect(screen.getByRole("button", { name: "Next page" })).toBeVisible();
    }
  );

  it(
    "commits filters through the route search callback",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const onSearchChange =
        vi.fn<(search: OrganizationSecurityActivitySearch) => void>();
      const { OrganizationSecurityActivityPage } =
        await import("./organization-security-activity-page");

      render(
        <OrganizationSecurityActivityPage
          activity={securityActivity}
          search={{
            cursor: "old_cursor" as OrganizationSecurityActivityCursor,
          }}
          onSearchChange={onSearchChange}
        />
      );

      await user.selectOptions(screen.getByLabelText("Event type"), [
        "organization_member_role_updated",
      ]);
      expect(onSearchChange).toHaveBeenLastCalledWith({
        cursor: undefined,
        eventType: "organization_member_role_updated",
      });

      await user.selectOptions(screen.getByLabelText("Target type"), [
        "member",
      ]);
      expect(onSearchChange).toHaveBeenLastCalledWith({
        cursor: undefined,
        targetType: "member",
      });

      await user.type(screen.getByLabelText("Target search"), "Taylor{Enter}");
      expect(onSearchChange).toHaveBeenLastCalledWith({
        cursor: undefined,
        targetSearch: "Taylor",
      });
    }
  );

  it(
    "requests the next cursor page",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const onSearchChange =
        vi.fn<(search: OrganizationSecurityActivitySearch) => void>();
      const { OrganizationSecurityActivityPage } =
        await import("./organization-security-activity-page");

      render(
        <OrganizationSecurityActivityPage
          activity={securityActivity}
          search={{ eventType: "organization_invitation_created" }}
          onSearchChange={onSearchChange}
        />
      );

      await user.click(screen.getByRole("button", { name: "Next page" }));

      expect(onSearchChange).toHaveBeenCalledWith({
        cursor: nextCursor,
        eventType: "organization_invitation_created",
      });
    }
  );

  it(
    "renders active filters and clears them",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const onSearchChange =
        vi.fn<(search: OrganizationSecurityActivitySearch) => void>();
      const { OrganizationSecurityActivityPage } =
        await import("./organization-security-activity-page");

      render(
        <OrganizationSecurityActivityPage
          activity={securityActivity}
          search={{
            actorUserId: ownerUserId,
            eventType: "organization_invitation_created",
            fromDate: "2026-06-01" as never,
            targetSearch: "Taylor",
            targetType: "member",
            toDate: "2026-06-07" as never,
          }}
          onSearchChange={onSearchChange}
        />
      );

      expect(screen.getAllByText("Actor: Owner User")[0]).toBeVisible();
      expect(screen.getByText("Event type: Invitation created")).toBeVisible();
      expect(screen.getByText("Target search: Taylor")).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Clear filters" }));

      expect(onSearchChange).toHaveBeenCalledWith({});
    }
  );

  it(
    "renders filtered empty state copy",
    {
      timeout: 10_000,
    },
    async () => {
      const { OrganizationSecurityActivityPage } =
        await import("./organization-security-activity-page");

      render(
        <OrganizationSecurityActivityPage
          activity={{ items: [], nextCursor: undefined }}
          search={{ targetSearch: "missing" }}
          onSearchChange={vi.fn<
            (search: OrganizationSecurityActivitySearch) => void
          >()}
        />
      );

      expect(
        screen.getByText("No security events match these filters.")
      ).toBeVisible();
      expect(
        screen.getByText(/Clear filters or adjust the actor, event, target/i)
      ).toBeVisible();
    }
  );
});
