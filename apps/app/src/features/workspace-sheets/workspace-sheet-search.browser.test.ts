import type { ContactIdType, WorkItemIdType } from "@ceird/jobs-core";
import type { SiteIdType } from "@ceird/sites-core";

import {
  closeWorkspaceSheetsSearch,
  createWorkspaceSheetSearch,
  decodeWorkspaceSheetSearch,
  getActiveWorkspaceSheet,
  popWorkspaceSheetSearch,
  pushWorkspaceSheetSearch,
  replaceTopWorkspaceSheetSearch,
  WORKSPACE_SHEET_STACK_LIMIT,
} from "./workspace-sheet-search";

const SITE_ID = "019e6b6f-03d3-73e3-9dc6-d303722eef9a" as SiteIdType;
const JOB_ID = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
const CONTACT_ID = "22222222-2222-4222-8222-222222222222" as ContactIdType;

describe("workspace sheet search", () => {
  it("decodes a valid sheet stack", () => {
    expect(
      decodeWorkspaceSheetSearch({
        sheets: [
          { kind: "site.detail", siteId: SITE_ID },
          { kind: "job.create", contactId: CONTACT_ID, siteId: SITE_ID },
          { kind: "job.detail", jobId: JOB_ID },
          { kind: "site.create" },
        ],
      })
    ).toStrictEqual({
      sheets: [
        { kind: "site.detail", siteId: SITE_ID },
        { kind: "job.create", contactId: CONTACT_ID, siteId: SITE_ID },
        { kind: "job.detail", jobId: JOB_ID },
        { kind: "site.create" },
      ],
    });
  });

  it("drops invalid sheet entries and invalid branded ids", () => {
    expect(
      decodeWorkspaceSheetSearch({
        sheets: [
          { kind: "site.detail", siteId: "not-a-uuid" },
          { kind: "job.create", contactId: "also-invalid", siteId: SITE_ID },
          { kind: "job.detail", jobId: JOB_ID },
          { kind: "unknown", siteId: SITE_ID },
        ],
      })
    ).toStrictEqual({
      sheets: [{ kind: "job.detail", jobId: JOB_ID }],
    });
  });

  it("caps decoded and generated sheet stacks", () => {
    expect(
      decodeWorkspaceSheetSearch({
        sheets: [
          { kind: "site.create" },
          { kind: "site.create" },
          { kind: "site.create" },
          { kind: "site.create" },
          { kind: "site.create" },
          { kind: "job.detail", jobId: JOB_ID },
        ],
      })
    ).toStrictEqual({
      sheets: [
        ...Array.from({ length: WORKSPACE_SHEET_STACK_LIMIT - 1 }, () => ({
          kind: "site.create",
        })),
        { jobId: JOB_ID, kind: "job.detail" },
      ],
    });

    expect(
      pushWorkspaceSheetSearch(
        {
          sheets: Array.from({ length: WORKSPACE_SHEET_STACK_LIMIT }, () => ({
            kind: "site.create" as const,
          })),
        },
        { jobId: JOB_ID, kind: "job.detail" }
      )
    ).toStrictEqual({
      sheets: [
        ...Array.from({ length: WORKSPACE_SHEET_STACK_LIMIT - 1 }, () => ({
          kind: "site.create",
        })),
        { jobId: JOB_ID, kind: "job.detail" },
      ],
    });
  });

  it("returns empty search when no valid sheet entries remain", () => {
    expect(
      decodeWorkspaceSheetSearch({
        sheets: [
          { kind: "site.detail", siteId: "not-a-uuid" },
          { kind: "job.detail", jobId: "not-a-uuid" },
        ],
      })
    ).toStrictEqual({});
  });

  it("preserves non-sheet search while pushing and replacing sheets", () => {
    const pushed = pushWorkspaceSheetSearch(
      {
        sheets: [{ kind: "site.detail", siteId: SITE_ID }],
        view: "map",
      },
      { kind: "job.create", siteId: SITE_ID }
    );

    expect(pushed).toStrictEqual({
      sheets: [
        { kind: "site.detail", siteId: SITE_ID },
        { kind: "job.create", siteId: SITE_ID },
      ],
      view: "map",
    });

    expect(
      replaceTopWorkspaceSheetSearch(pushed, {
        kind: "site.create",
      })
    ).toStrictEqual({
      sheets: [
        { kind: "site.detail", siteId: SITE_ID },
        { kind: "site.create" },
      ],
      view: "map",
    });
  });

  it("creates destination-owned sheet search without preserving source params", () => {
    expect(createWorkspaceSheetSearch({ kind: "site.create" })).toStrictEqual({
      sheets: [{ kind: "site.create" }],
    });
  });

  it("pops and clears the sheet stack without dropping other search state", () => {
    const search = {
      sheets: [
        { kind: "site.detail", siteId: SITE_ID },
        { kind: "job.create", siteId: SITE_ID },
      ],
      view: "map",
    } as const;

    expect(popWorkspaceSheetSearch(search)).toStrictEqual({
      sheets: [{ kind: "site.detail", siteId: SITE_ID }],
      view: "map",
    });
    expect(closeWorkspaceSheetsSearch(search)).toStrictEqual({
      sheets: undefined,
      view: "map",
    });
  });

  it("returns the final stack item as the active sheet", () => {
    expect(
      getActiveWorkspaceSheet({
        sheets: [
          { kind: "site.detail", siteId: SITE_ID },
          { kind: "job.create", siteId: SITE_ID },
        ],
      })
    ).toStrictEqual({ kind: "job.create", siteId: SITE_ID });
    expect(getActiveWorkspaceSheet({})).toBeUndefined();
  });
});
