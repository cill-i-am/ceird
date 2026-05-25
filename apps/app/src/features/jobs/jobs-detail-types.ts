import type { UserIdType } from "@ceird/jobs-core";

export type JobDetailActionPanel =
  | "collaborators"
  | "comments"
  | "costs"
  | "site"
  | "visits"
  | "workflow";

export interface ExternalMemberOption {
  readonly email: string;
  readonly name: string;
  readonly userId: UserIdType;
}
