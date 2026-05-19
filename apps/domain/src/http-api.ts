import { JobsApiGroup, RateCardsApiGroup } from "@ceird/jobs-core";
import { LabelsApiGroup } from "@ceird/labels-core";
import { ServiceAreasApiGroup, SitesApiGroup } from "@ceird/sites-core";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

import { HealthPayload } from "./system/health.js";

export const SystemApiGroup = HttpApiGroup.make("system")
  .add(HttpApiEndpoint.get("root", "/").addSuccess(Schema.String))
  .add(HttpApiEndpoint.get("health", "/health").addSuccess(HealthPayload));

export const AppApi = HttpApi.make("CeirdApi")
  .add(SystemApiGroup)
  .add(JobsApiGroup)
  .add(RateCardsApiGroup)
  .add(LabelsApiGroup)
  .add(SitesApiGroup)
  .add(ServiceAreasApiGroup);
