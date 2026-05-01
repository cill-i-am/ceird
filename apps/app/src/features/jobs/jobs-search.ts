import { ParseResult, Schema } from "effect";

export const JOBS_VIEW_MODES = ["list", "map"] as const;

export type JobsViewMode = (typeof JOBS_VIEW_MODES)[number];

const RawJobsSearch = Schema.Struct({
  view: Schema.optional(Schema.Unknown),
});

const JobsSearch = Schema.transform(
  RawJobsSearch,
  Schema.Struct({
    view: Schema.optional(Schema.Literal(...JOBS_VIEW_MODES)),
  }),
  {
    strict: true,
    decode: ({ view }) => {
      if (view === "list") {
        return { view: "list" as const };
      }

      if (view === "map") {
        return { view: "map" as const };
      }

      return { view: undefined };
    },
    encode: (search) => search,
  }
);

export type JobsSearch = typeof JobsSearch.Type;

export function decodeJobsSearch(input: unknown): JobsSearch {
  return ParseResult.decodeUnknownSync(JobsSearch)(input);
}

export function isJobsMapViewSearch(search: unknown) {
  if (typeof search !== "object" || search === null) {
    return false;
  }

  return decodeJobsSearch(search).view === "map";
}
