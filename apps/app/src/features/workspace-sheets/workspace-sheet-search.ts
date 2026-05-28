import type { ContactIdType, WorkItemIdType } from "@ceird/jobs-core";
import type { SiteIdType } from "@ceird/sites-core";

export const WORKSPACE_SHEET_STACK_LIMIT = 5;

export type WorkspaceSheet =
  | {
      readonly contactId?: ContactIdType;
      readonly kind: "job.create";
      readonly siteId?: SiteIdType;
    }
  | {
      readonly jobId: WorkItemIdType;
      readonly kind: "job.detail";
    }
  | {
      readonly kind: "site.create";
      readonly targetSheetId?: string;
    }
  | {
      readonly kind: "site.detail";
      readonly siteId: SiteIdType;
    };

export interface WorkspaceSheetSearch {
  readonly sheets?: readonly WorkspaceSheet[] | undefined;
}

const WORKSPACE_SHEET_ALLOWED_KEYS = {
  "job.create": new Set(["contactId", "kind", "siteId"]),
  "job.detail": new Set(["jobId", "kind"]),
  "site.create": new Set(["kind", "targetSheetId"]),
  "site.detail": new Set(["kind", "siteId"]),
} satisfies Record<WorkspaceSheet["kind"], ReadonlySet<string>>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function decodeWorkspaceSheetSearch(
  input: unknown
): WorkspaceSheetSearch {
  if (!isRecord(input) || !Array.isArray(input.sheets)) {
    return {};
  }

  const sheets: WorkspaceSheet[] = [];

  for (const entry of input.sheets) {
    const sheet = decodeWorkspaceSheet(entry);

    if (sheet !== undefined) {
      sheets.push(sheet);
    }
  }

  const search = withWorkspaceSheetStack({}, sheets);

  return search.sheets === undefined ? {} : search;
}

export function getWorkspaceSheetStack(
  search: WorkspaceSheetSearch
): readonly WorkspaceSheet[] {
  return search.sheets ?? [];
}

export function getActiveWorkspaceSheet(search: WorkspaceSheetSearch) {
  const stack = getWorkspaceSheetStack(search);

  return stack.at(-1);
}

export function openWorkspaceSheetSearch<T extends WorkspaceSheetSearch>(
  search: T,
  sheet: WorkspaceSheet
) {
  return withWorkspaceSheetStack(search, [sheet]);
}

export function createWorkspaceSheetSearch(sheet: WorkspaceSheet) {
  return openWorkspaceSheetSearch({}, sheet);
}

export function pushWorkspaceSheetSearch<T extends WorkspaceSheetSearch>(
  search: T,
  sheet: WorkspaceSheet
) {
  return withWorkspaceSheetStack(search, [
    ...getWorkspaceSheetStack(search),
    sheet,
  ]);
}

export function replaceTopWorkspaceSheetSearch<T extends WorkspaceSheetSearch>(
  search: T,
  sheet: WorkspaceSheet
) {
  const stack = getWorkspaceSheetStack(search);
  const nextStack =
    stack.length === 0 ? [sheet] : [...stack.slice(0, -1), sheet];

  return withWorkspaceSheetStack(search, nextStack);
}

export function popWorkspaceSheetSearch<T extends WorkspaceSheetSearch>(
  search: T
) {
  return withWorkspaceSheetStack(
    search,
    getWorkspaceSheetStack(search).slice(0, -1)
  );
}

export function closeWorkspaceSheetsSearch<T extends WorkspaceSheetSearch>(
  search: T
) {
  return withWorkspaceSheetStack(search, []);
}

function decodeWorkspaceSheet(input: unknown): WorkspaceSheet | undefined {
  if (!isRecord(input) || typeof input.kind !== "string") {
    return undefined;
  }

  if (!hasOnlyWorkspaceSheetKeys(input.kind, input)) {
    return undefined;
  }

  switch (input.kind) {
    case "job.create": {
      const siteId = decodeSiteId(input.siteId);
      const contactId = decodeContactId(input.contactId);

      if (
        (input.siteId !== undefined && siteId === undefined) ||
        (input.contactId !== undefined && contactId === undefined)
      ) {
        return undefined;
      }

      return {
        ...(contactId === undefined ? {} : { contactId }),
        kind: "job.create",
        ...(siteId === undefined ? {} : { siteId }),
      };
    }
    case "job.detail": {
      const jobId = decodeWorkItemId(input.jobId);

      return jobId === undefined
        ? undefined
        : {
            jobId,
            kind: "job.detail",
          };
    }
    case "site.create": {
      const targetSheetId = decodeTargetSheetId(input.targetSheetId);

      if (input.targetSheetId !== undefined && targetSheetId === undefined) {
        return undefined;
      }

      return {
        kind: "site.create",
        ...(targetSheetId === undefined ? {} : { targetSheetId }),
      };
    }
    case "site.detail": {
      const siteId = decodeSiteId(input.siteId);

      return siteId === undefined
        ? undefined
        : {
            kind: "site.detail",
            siteId,
          };
    }
    default: {
      return undefined;
    }
  }
}

function decodeContactId(value: unknown): ContactIdType | undefined {
  return isUuid(value) ? (value as ContactIdType) : undefined;
}

function decodeSiteId(value: unknown): SiteIdType | undefined {
  return isUuid(value) ? (value as SiteIdType) : undefined;
}

function decodeWorkItemId(value: unknown): WorkItemIdType | undefined {
  return isUuid(value) ? (value as WorkItemIdType) : undefined;
}

function decodeTargetSheetId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    ? value
    : undefined;
}

function hasOnlyWorkspaceSheetKeys(
  kind: string,
  value: Readonly<Record<string, unknown>>
) {
  const allowedKeys =
    WORKSPACE_SHEET_ALLOWED_KEYS[kind as WorkspaceSheet["kind"]];

  return (
    allowedKeys !== undefined &&
    Object.keys(value).every((key) => allowedKeys.has(key))
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function withWorkspaceSheetStack<T extends WorkspaceSheetSearch>(
  search: T,
  sheets: readonly WorkspaceSheet[]
) {
  const nextSheets = sheets.slice(-WORKSPACE_SHEET_STACK_LIMIT);

  return {
    ...search,
    sheets: nextSheets.length === 0 ? undefined : nextSheets,
  };
}
