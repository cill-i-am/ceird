import {
  AgentActionsApiGroup,
  AgentInternalApiGroup,
  AgentThreadsApiGroup,
} from "@ceird/agents-core";
import { SyncInternalApiGroup } from "@ceird/domain-core";
import {
  IdentityApiGroup,
  UserPreferencesApiGroup,
} from "@ceird/identity-core";
import { JobsApiGroup } from "@ceird/jobs-core";
import { LabelsApiGroup } from "@ceird/labels-core";
import { ProximityApiGroup } from "@ceird/proximity-core";
import { SitesApiGroup } from "@ceird/sites-core";
import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";

import { HealthPayload } from "./system/health.js";

export const SystemApiGroup = HttpApiGroup.make("system")
  .add(HttpApiEndpoint.get("root", "/", { success: Schema.String }))
  .add(HttpApiEndpoint.get("health", "/health", { success: HealthPayload }));

export const AppApi = HttpApi.make("CeirdApi")
  .add(SystemApiGroup)
  .add(AgentActionsApiGroup)
  .add(AgentThreadsApiGroup)
  .add(AgentInternalApiGroup)
  .add(IdentityApiGroup)
  .add(SyncInternalApiGroup)
  .add(UserPreferencesApiGroup)
  .add(JobsApiGroup)
  .add(LabelsApiGroup)
  .add(ProximityApiGroup)
  .add(SitesApiGroup);
