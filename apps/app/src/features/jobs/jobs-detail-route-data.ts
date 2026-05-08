export const CREATE_JOB_ROUTE_DATA = { kind: "create-job" } as const;

export type CreateJobRouteData = typeof CREATE_JOB_ROUTE_DATA;

export function isCreateJobRouteData(
  data: unknown
): data is CreateJobRouteData {
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    data.kind === CREATE_JOB_ROUTE_DATA.kind
  );
}
