import { JobsApiGroup, RateCardsApiGroup } from "@ceird/jobs-core";
import { LabelsApiGroup } from "@ceird/labels-core";
import { ServiceAreasApiGroup, SitesApiGroup } from "@ceird/sites-core";
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
  .add(JobsApiGroup)
  .add(RateCardsApiGroup)
  .add(LabelsApiGroup)
  .add(SitesApiGroup)
  .add(ServiceAreasApiGroup);
