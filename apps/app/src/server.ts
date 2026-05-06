import type { Register } from "@tanstack/react-router";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import type { RequestHandler } from "@tanstack/react-start/server";

const fetch = createStartHandler<Register>(defaultStreamHandler);
type FetchOptions = Parameters<typeof fetch>[1];

export interface ServerEntry {
  readonly fetch: RequestHandler<Register>;
}

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args);
    },
  };
}

export default createServerEntry({
  fetch(request, opts) {
    return fetch(request, isFetchOptions(opts) ? opts : undefined);
  },
});

function isFetchOptions(opts: unknown): opts is FetchOptions {
  return opts === undefined || (typeof opts === "object" && opts !== null);
}
