import { LabelId } from "@ceird/labels-core/ids";
import {
  AddSiteCommentInputSchema,
  AssignSiteLabelInputSchema,
  CreateServiceAreaInputSchema,
  CreateSiteInputSchema,
  SiteListQuerySchema,
  UpdateServiceAreaInputSchema,
  UpdateSiteInputSchema,
} from "@ceird/sites-core/dto";
import { ServiceAreaId, SiteId } from "@ceird/sites-core/ids";
import { Schema } from "effect";

import {
  defineAgentAction,
  EmptyAgentActionInputSchema,
} from "../action-registry.js";

const SitePathInputSchema = Schema.Struct({
  siteId: SiteId,
});

const UpdateSiteActionInputSchema = Schema.Struct({
  input: UpdateSiteInputSchema,
  siteId: SiteId,
});

const SiteCommentActionInputSchema = Schema.Struct({
  input: AddSiteCommentInputSchema,
  siteId: SiteId,
});

const SiteLabelActionInputSchema = Schema.Struct({
  input: AssignSiteLabelInputSchema,
  siteId: SiteId,
});

const RemoveSiteLabelActionInputSchema = Schema.Struct({
  labelId: LabelId,
  siteId: SiteId,
});

const UpdateServiceAreaActionInputSchema = Schema.Struct({
  input: UpdateServiceAreaInputSchema,
  serviceAreaId: ServiceAreaId,
});

export const siteAgentActions = [
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List site options",
      summary: "Read site and service area options.",
      target: "sites",
    },
    inputSchema: EmptyAgentActionInputSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription: "List site options available in the organization.",
    modelName: "listSiteOptions",
    name: "ceird.sites.options",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List sites",
      summary: "Read organization sites.",
      target: "sites",
    },
    inputSchema: SiteListQuerySchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription: "List Ceird sites, optionally filtered by service area.",
    modelName: "listSites",
    name: "ceird.sites.list",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Create site",
      summary: "Create a new customer site.",
      target: "site",
    },
    inputSchema: CreateSiteInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Create a Ceird site with address and access details.",
    modelName: "createSite",
    name: "ceird.sites.create",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Update site",
      summary: "Update an existing customer site.",
      target: "site",
    },
    inputSchema: UpdateSiteActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Update an existing Ceird site by ID.",
    modelName: "updateSite",
    name: "ceird.sites.update",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List site comments",
      summary: "Read comments for a site.",
      target: "site",
    },
    inputSchema: SitePathInputSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription: "List comments for a Ceird site by ID.",
    modelName: "listSiteComments",
    name: "ceird.sites.comments.list",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Add site comment",
      summary: "Add a comment to a site.",
      target: "site",
    },
    inputSchema: SiteCommentActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Add a comment to a Ceird site.",
    modelName: "addSiteComment",
    name: "ceird.sites.comments.add",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Assign site label",
      summary: "Assign a label to a site.",
      target: "site",
    },
    inputSchema: SiteLabelActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Assign an existing label to a Ceird site.",
    modelName: "assignSiteLabel",
    name: "ceird.sites.assign_label",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm_destructive",
    display: {
      label: "Remove site label",
      summary: "Remove a label from a site.",
      target: "site",
    },
    inputSchema: RemoveSiteLabelActionInputSchema,
    executionStatus: "executable",
    kind: "destructive",
    modelDescription: "Remove a label from a Ceird site.",
    modelName: "removeSiteLabel",
    name: "ceird.sites.remove_label",
  }),
] as const;

export const serviceAreaAgentActions = [
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List service areas",
      summary: "Read organization service areas.",
      target: "service areas",
    },
    inputSchema: EmptyAgentActionInputSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription: "List Ceird service areas.",
    modelName: "listServiceAreas",
    name: "ceird.service_areas.list",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Create service area",
      summary: "Create a new service area.",
      target: "service area",
    },
    inputSchema: CreateServiceAreaInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Create a Ceird service area.",
    modelName: "createServiceArea",
    name: "ceird.service_areas.create",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Update service area",
      summary: "Update an existing service area.",
      target: "service area",
    },
    inputSchema: UpdateServiceAreaActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Update a Ceird service area by ID.",
    modelName: "updateServiceArea",
    name: "ceird.service_areas.update",
  }),
] as const;
