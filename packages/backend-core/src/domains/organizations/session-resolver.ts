import type { Effect } from "effect";
import { Context } from "effect";

export interface CurrentOrganizationActorSession {
  readonly session: {
    readonly activeOrganizationId?: string | null | undefined;
  };
  readonly user: {
    readonly id: string;
  };
}

export interface CurrentOrganizationSessionResolverService {
  readonly getSession: (
    headers: Headers
  ) => Effect.Effect<
    CurrentOrganizationActorSession | null | undefined,
    unknown
  >;
}

export class CurrentOrganizationSessionResolver extends Context.Tag(
  "@ceird/domains/organizations/CurrentOrganizationSessionResolver"
)<
  CurrentOrganizationSessionResolver,
  CurrentOrganizationSessionResolverService
>() {}
