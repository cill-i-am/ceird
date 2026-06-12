import { AppApiRequestError } from "#/features/api/app-api-errors";

// All-pages app helpers are transitional route-loader support. Match the
// existing sites cap so a broken cursor chain cannot loop indefinitely.
export const MAX_ALL_PAGES = 1000;

export interface AllPagesPaginationState {
  readonly resourceName: string;
  readonly seenCursors: Set<string>;
  pageCount: number;
}

export function createAllPagesPaginationState(
  resourceName: string,
  initialCursor: string | undefined
): AllPagesPaginationState {
  const seenCursors = new Set<string>();

  if (initialCursor !== undefined) {
    seenCursors.add(initialCursor);
  }

  return {
    pageCount: 0,
    resourceName,
    seenCursors,
  };
}

export function ensureAllPagesLimit(state: AllPagesPaginationState) {
  state.pageCount += 1;

  if (state.pageCount > MAX_ALL_PAGES) {
    throw new AppApiRequestError({
      message: `${state.resourceName} pagination exceeded the maximum page count.`,
    });
  }
}

export function ensureAllPagesCursorProgress(
  state: AllPagesPaginationState,
  nextCursor: string
) {
  if (state.seenCursors.has(nextCursor)) {
    throw new AppApiRequestError({
      message: `${state.resourceName} pagination returned a repeated cursor.`,
    });
  }

  state.seenCursors.add(nextCursor);
}
