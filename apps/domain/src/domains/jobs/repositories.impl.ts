import { INTERNAL_ORGANIZATION_ROLES } from "@ceird/identity-core";
/* oxlint-disable eslint/max-classes-per-file */
import {
  ActivityId as ActivityIdSchema,
  ACTIVE_JOB_STATUSES,
  ContactId as ContactIdSchema,
  ContactNotFoundError,
  HomeDashboardSummaryResponseSchema,
  IsoDateTimeString as IsoDateTimeStringSchema,
  JobActivityPayloadSchema,
  JobActivitySchema,
  JobCollaboratorConflictError,
  JobCollaboratorId as JobCollaboratorIdSchema,
  JobCollaboratorNotFoundError,
  JobCollaboratorSchema,
  JobContactDetailSchema,
  JobContactOptionSchema,
  JobDetailSchema,
  JobListCursor as JobListCursorSchema,
  JobListCursorInvalidError,
  JobListItemSchema,
  JobMemberOptionSchema,
  OrganizationActivityCursorInvalidError,
  JobListResponseSchema,
  JobNotFoundError,
  JobSchema,
  JobVisitSchema,
  OrganizationActivityCursor as OrganizationActivityCursorSchema,
  OrganizationActivityItemSchema,
  OrganizationActivityListResponseSchema,
  OrganizationId as OrganizationIdSchema,
  TERMINAL_JOB_STATUSES,
  OrganizationMemberNotFoundError,
  UserId as UserIdSchema,
  WorkItemId as WorkItemIdSchema,
} from "@ceird/jobs-core";
import type {
  ActivityIdType as ActivityId,
  ContactIdType as ContactId,
  Job,
  JobActivity,
  JobActivityPayload,
  JobCollaborator,
  JobCollaboratorAccessLevel,
  JobCollaboratorIdType as JobCollaboratorId,
  JobCollaboratorRoleLabel,
  JobContactDetail,
  JobContactOption,
  JobDetail,
  JobExternalMemberOption,
  JobKind,
  JobListCursorType as JobListCursor,
  JobListItem,
  JobListQuery,
  JobMemberOption,
  JobOptionsResponse,
  JobPriority,
  JobProximityFilters,
  JobStatus,
  JobTitle,
  JobVisit,
  OrganizationActivityCursorType as OrganizationActivityCursor,
  OrganizationActivityItem,
  OrganizationActivityListResponse,
  OrganizationActivityQuery,
  OrganizationIdType as OrganizationId,
  UserIdType as UserId,
  WorkItemIdType as WorkItemId,
} from "@ceird/jobs-core";
import {
  LabelId as LabelIdSchema,
  LabelNotFoundError,
  LabelSchema,
} from "@ceird/labels-core";
import type { Label, LabelIdType as LabelId } from "@ceird/labels-core";
import type { ProximityExcludedCount } from "@ceird/proximity-core";
import { SiteId as SiteIdSchema, SiteNotFoundError } from "@ceird/sites-core";
import type {
  GoogleAddressComponent,
  SiteIdType as SiteId,
  SiteOption,
} from "@ceird/sites-core";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  Array as Arr,
  Context,
  Config,
  Effect,
  Layer,
  Option,
  Schema,
  pipe,
} from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql";

import { DomainDrizzle } from "../../platform/database/database.js";
import {
  contact as contactTable,
  label as labelTable,
  member,
  site as siteTable,
  siteContact,
  user as userTable,
  workItem,
  workItemActivity,
  workItemCollaborator,
  workItemLabel,
  workItemVisit,
} from "../../platform/database/schema.js";
import { ProductActivityActorsRepository } from "../activity/repository.js";
import { CommentsRepository } from "../comments/repository.js";
import { decodeJsonCursor, encodeJsonCursor } from "../json-cursor.js";
import { listSiteLabelsForSitesWithSql } from "../sites/site-label-queries.js";
import type { SiteOptionRow } from "../sites/site-option-row.js";
import { mapSiteOptionRow } from "../sites/site-option-row.js";
import { WorkItemOrganizationMismatchError } from "./errors.js";
import {
  generateActivityId,
  generateContactId,
  generateJobCollaboratorId,
  generateVisitId,
  generateWorkItemId,
} from "./id-generation.js";

const EXTERNAL_ORGANIZATION_ROLE = "external" as const;
const PROXIMITY_CANDIDATE_LIMIT = 100;
const USABLE_SITE_LOCATION_STATUSES = [
  "google_resolved",
  "manually_adjusted",
  "validated",
] as const;

interface JobCursorState {
  readonly id: WorkItemId;
  readonly updatedAt: string;
}

interface WorkItemRow {
  readonly assignee_id: string | null;
  readonly blocked_reason: string | null;
  readonly completed_at: Date | null;
  readonly completed_by_user_id: string | null;
  readonly contact_id: string | null;
  readonly coordinator_id: string | null;
  readonly created_at: Date;
  readonly created_by_user_id: string;
  readonly id: string;
  readonly kind: string;
  readonly organization_id: string;
  readonly priority: string;
  readonly site_id: string | null;
  readonly status: string;
  readonly title: string;
  readonly updated_at: Date;
}

interface WorkItemCollaboratorRow {
  readonly access_level: string;
  readonly created_at: Date;
  readonly id: string;
  readonly role_label: string;
  readonly subject_type: string;
  readonly updated_at: Date;
  readonly user_id: string | null;
  readonly work_item_id: string;
}

interface WorkItemActivityRow {
  readonly actor_id: string | null;
  readonly actor_user_id: string | null;
  readonly created_at: Date;
  readonly event_type: string;
  readonly id: string;
  readonly organization_id: string;
  readonly payload: unknown;
  readonly work_item_id: string;
}

interface OrganizationActivityRow extends WorkItemActivityRow {
  readonly actor_display_detail: string | null;
  readonly actor_display_name: string | null;
  readonly actor_kind: string | null;
  readonly actor_route_href: string | null;
  readonly actor_route_label: string | null;
  readonly job_title: string;
}

interface OrganizationActivityCursorState {
  readonly id: ActivityId;
  readonly createdAt: string;
}

interface WorkItemVisitRow {
  readonly author_user_id: string;
  readonly created_at: Date;
  readonly duration_minutes: number;
  readonly id: string;
  readonly note: string;
  readonly organization_id: string;
  readonly visit_date: Date | string;
  readonly work_item_id: string;
}

interface LabelRow {
  readonly archived_at: Date | null;
  readonly color: string;
  readonly created_at: Date;
  readonly description: string | null;
  readonly id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly organization_id: string;
  readonly updated_at: Date;
}

interface LabelAssignmentRow extends LabelRow {
  readonly inserted_count: number;
  readonly work_item_id: string | null;
}

interface WorkItemLabelRow {
  readonly archived_at: Date | null;
  readonly color: string;
  readonly created_at: Date;
  readonly description: string | null;
  readonly label_id: string;
  readonly name: string;
  readonly updated_at: Date;
  readonly work_item_id: string;
}

interface IdRow {
  readonly id: string;
}

interface JobMemberOptionRow {
  readonly email: string;
  readonly id: string;
  readonly name: string | null;
}

interface JobContactOptionRow {
  readonly email: string | null;
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly site_id: string | null;
}

interface JobContactDetailRow {
  readonly email: string | null;
  readonly id: string;
  readonly name: string;
  readonly notes: string | null;
  readonly phone: string | null;
}

interface JobProximityCandidateRow extends WorkItemRow {
  readonly site_access_notes: string | null;
  readonly site_address_components: readonly GoogleAddressComponent[] | null;
  readonly site_address_line_1: string | null;
  readonly site_address_line_2: string | null;
  readonly site_country: string | null;
  readonly site_county: string | null;
  readonly site_display_location: string | null;
  readonly site_eircode: string | null;
  readonly site_formatted_address: string | null;
  readonly site_google_place_id: string | null;
  readonly site_id_value: string | null;
  readonly site_latitude: number | null;
  readonly site_location_provider: string | null;
  readonly site_location_resolved_at: Date | null;
  readonly site_location_status: string | null;
  readonly site_longitude: number | null;
  readonly site_name: string | null;
  readonly site_raw_location_input: string | null;
  readonly site_town: string | null;
  readonly site_updated_at: Date | null;
}

interface JobProximityStatsRow {
  readonly candidate_count: number;
  readonly missing_coordinates_count: number;
  readonly no_site_count: number;
  readonly unmapped_site_count: number;
}

interface HomeDashboardJobStatsRow {
  readonly active_jobs: number;
  readonly blocked_jobs: number;
  readonly priority_watch_jobs: number;
  readonly total_jobs: number;
  readonly unassigned_jobs: number;
}

interface HomeDashboardMemberStatsRow {
  readonly total_members: number;
}

interface HomeDashboardSiteStatsRow {
  readonly mapped_sites: number;
  readonly total_sites: number;
}

interface HomeDashboardJobSummaryRow {
  readonly assignee_name: string | null;
  readonly id: string;
  readonly priority: string;
  readonly site_name: string | null;
  readonly status: string;
  readonly title: string;
  readonly updated_at: Date;
}

interface HomeDashboardSiteSummaryRow {
  readonly active_job_count: number;
  readonly address_line_1: string | null;
  readonly address_line_2: string | null;
  readonly county: string | null;
  readonly display_location: string | null;
  readonly eircode: string | null;
  readonly formatted_address: string | null;
  readonly id: string;
  readonly location_resolved_at: Date | null;
  readonly name: string;
  readonly raw_location_input: string | null;
  readonly town: string | null;
}

export interface CreateJobRecordInput {
  readonly assigneeId?: UserId;
  readonly blockedReason?: string;
  readonly completedAt?: string;
  readonly completedByUserId?: UserId;
  readonly contactId?: ContactId;
  readonly coordinatorId?: UserId;
  readonly createdByUserId: UserId;
  readonly kind?: JobKind;
  readonly organizationId: OrganizationId;
  readonly priority?: JobPriority;
  readonly siteId?: SiteId;
  readonly status?: JobStatus;
  readonly title: JobTitle;
}

export interface PatchJobRecordInput {
  readonly assigneeId?: UserId | null;
  readonly contactId?: ContactId | null;
  readonly coordinatorId?: UserId | null;
  readonly priority?: JobPriority;
  readonly siteId?: SiteId | null;
  readonly title?: JobTitle;
}

export interface LinkSiteContactRecordInput {
  readonly contactId: ContactId;
  readonly isPrimary?: boolean;
  readonly organizationId: OrganizationId;
  readonly siteId: SiteId;
}

export interface TransitionJobRecordInput {
  readonly blockedReason?: string;
  readonly completedAt?: string;
  readonly completedByUserId?: UserId | null;
  readonly status: JobStatus;
}

export interface AddJobCommentRecordInput {
  readonly authorUserId: UserId;
  readonly body: string;
  readonly organizationId: OrganizationId;
  readonly workItemId: WorkItemId;
}

export type JobsRepositoryAccess =
  | { readonly visibility: "internal" }
  | {
      readonly grant?: JobCollaborator | undefined;
      readonly userId: UserId;
      readonly visibility: "external";
    };

const INTERNAL_JOBS_REPOSITORY_ACCESS: JobsRepositoryAccess = {
  visibility: "internal",
};

export interface AttachJobCollaboratorRecordInput {
  readonly accessLevel: JobCollaboratorAccessLevel;
  readonly createdByUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly roleLabel: JobCollaboratorRoleLabel;
  readonly userId: UserId;
  readonly workItemId: WorkItemId;
}

export interface UpdateJobCollaboratorRecordInput {
  readonly accessLevel?: JobCollaboratorAccessLevel;
  readonly roleLabel?: JobCollaboratorRoleLabel;
}

export interface AddJobActivityRecordInput {
  readonly actorUserId?: UserId;
  readonly organizationId: OrganizationId;
  readonly payload: JobActivityPayload;
  readonly workItemId: WorkItemId;
}

export interface AddJobVisitRecordInput {
  readonly authorUserId: UserId;
  readonly durationMinutes: number;
  readonly note: string;
  readonly organizationId: OrganizationId;
  readonly visitDate: string;
  readonly workItemId: WorkItemId;
}

export interface CreateContactRecordInput {
  readonly email?: string;
  readonly name: string;
  readonly notes?: string;
  readonly organizationId: OrganizationId;
  readonly phone?: string;
}

export interface AssignLabelRecordInput {
  readonly labelId: LabelId;
  readonly organizationId: OrganizationId;
  readonly workItemId: WorkItemId;
}

export interface LabelAssignmentResult {
  readonly changed: boolean;
  readonly label: Label;
}

export interface JobProximityCandidate {
  readonly job: JobListItem;
  readonly site: SiteOption;
}

export interface JobProximityCandidateSet {
  readonly candidateCount: number;
  readonly candidateLimitApplied: boolean;
  readonly candidates: readonly JobProximityCandidate[];
  readonly excluded: readonly ProximityExcludedCount[];
}

const decodeJob = Schema.decodeUnknownSync(JobSchema);
const decodeJobActivity = Schema.decodeUnknownSync(JobActivitySchema);
const decodeJobActivityPayload = Schema.decodeUnknownSync(
  JobActivityPayloadSchema
);
const decodeActivityId = Schema.decodeUnknownSync(ActivityIdSchema);
const decodeOrganizationActivityCursor = Schema.decodeUnknownSync(
  OrganizationActivityCursorSchema
);
const decodeOrganizationActivityItem = Schema.decodeUnknownSync(
  OrganizationActivityItemSchema
);
const decodeOrganizationActivityListResponse = Schema.decodeUnknownSync(
  OrganizationActivityListResponseSchema
);
const decodeContactId = Schema.decodeUnknownSync(ContactIdSchema);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationIdSchema);
const decodeJobCollaborator = Schema.decodeUnknownSync(JobCollaboratorSchema);
const decodeJobCollaboratorId = Schema.decodeUnknownSync(
  JobCollaboratorIdSchema
);
const decodeJobContactDetail = Schema.decodeUnknownSync(JobContactDetailSchema);
const decodeJobDetail = Schema.decodeUnknownSync(JobDetailSchema);
const decodeLabel = Schema.decodeUnknownSync(LabelSchema);
const decodeLabelId = Schema.decodeUnknownSync(LabelIdSchema);
const decodeJobListCursor = Schema.decodeUnknownSync(JobListCursorSchema);
const decodeJobListItem = Schema.decodeUnknownSync(JobListItemSchema);
const decodeJobMemberOption = Schema.decodeUnknownSync(JobMemberOptionSchema);
const decodeUserId = Schema.decodeUnknownSync(UserIdSchema);
const decodeJobContactOption = Schema.decodeUnknownSync(JobContactOptionSchema);
const decodeJobListResponse = Schema.decodeUnknownSync(JobListResponseSchema);
const decodeHomeDashboardSummaryResponse = Schema.decodeUnknownSync(
  HomeDashboardSummaryResponseSchema
);
const decodeJobVisit = Schema.decodeUnknownSync(JobVisitSchema);
const decodeSiteId = Schema.decodeUnknownSync(SiteIdSchema);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemIdSchema);
const decodeJobCursorState = Schema.decodeUnknownSync(
  Schema.Struct({
    id: WorkItemIdSchema,
    updatedAt: IsoDateTimeStringSchema,
  })
);
const decodeOrganizationActivityCursorState = Schema.decodeUnknownSync(
  Schema.Struct({
    id: ActivityIdSchema,
    createdAt: IsoDateTimeStringSchema,
  })
);

const workItemSelection = {
  assignee_id: workItem.assigneeId,
  blocked_reason: workItem.blockedReason,
  completed_at: workItem.completedAt,
  completed_by_user_id: workItem.completedByUserId,
  contact_id: workItem.contactId,
  coordinator_id: workItem.coordinatorId,
  created_at: workItem.createdAt,
  created_by_user_id: workItem.createdByUserId,
  id: workItem.id,
  kind: workItem.kind,
  organization_id: workItem.organizationId,
  priority: workItem.priority,
  site_id: workItem.siteId,
  status: workItem.status,
  title: workItem.title,
  updated_at: workItem.updatedAt,
} satisfies Record<keyof WorkItemRow, unknown>;

const workItemCollaboratorSelection = {
  access_level: workItemCollaborator.accessLevel,
  created_at: workItemCollaborator.createdAt,
  id: workItemCollaborator.id,
  role_label: workItemCollaborator.roleLabel,
  subject_type: workItemCollaborator.subjectType,
  updated_at: workItemCollaborator.updatedAt,
  user_id: workItemCollaborator.userId,
  work_item_id: workItemCollaborator.workItemId,
} satisfies Record<keyof WorkItemCollaboratorRow, unknown>;

const workItemActivitySelection = {
  actor_id: workItemActivity.actorId,
  actor_user_id: workItemActivity.actorUserId,
  created_at: workItemActivity.createdAt,
  event_type: workItemActivity.eventType,
  id: workItemActivity.id,
  organization_id: workItemActivity.organizationId,
  payload: workItemActivity.payload,
  work_item_id: workItemActivity.workItemId,
} satisfies Record<keyof WorkItemActivityRow, unknown>;

const workItemVisitSelection = {
  author_user_id: workItemVisit.authorUserId,
  created_at: workItemVisit.createdAt,
  duration_minutes: workItemVisit.durationMinutes,
  id: workItemVisit.id,
  note: workItemVisit.note,
  organization_id: workItemVisit.organizationId,
  visit_date: workItemVisit.visitDate,
  work_item_id: workItemVisit.workItemId,
} satisfies Record<keyof WorkItemVisitRow, unknown>;

const labelSelection = {
  archived_at: labelTable.archivedAt,
  color: labelTable.color,
  created_at: labelTable.createdAt,
  description: labelTable.description,
  id: labelTable.id,
  name: labelTable.name,
  normalized_name: labelTable.normalizedName,
  organization_id: labelTable.organizationId,
  updated_at: labelTable.updatedAt,
} satisfies Record<keyof LabelRow, unknown>;

const workItemLabelSelection = {
  archived_at: labelTable.archivedAt,
  color: labelTable.color,
  created_at: labelTable.createdAt,
  description: labelTable.description,
  label_id: workItemLabel.labelId,
  name: labelTable.name,
  updated_at: labelTable.updatedAt,
  work_item_id: workItemLabel.workItemId,
} satisfies Record<keyof WorkItemLabelRow, unknown>;

const jobMemberOptionSelection = {
  email: userTable.email,
  id: userTable.id,
  name: userTable.name,
} satisfies Record<keyof JobMemberOptionRow, unknown>;

const jobContactOptionFromWorkItemSelection = {
  email: contactTable.email,
  id: contactTable.id,
  name: contactTable.name,
  phone: contactTable.phone,
  site_id: workItem.siteId,
} satisfies Record<keyof JobContactOptionRow, unknown>;

const jobContactOptionFromSiteContactSelection = {
  email: contactTable.email,
  id: contactTable.id,
  name: contactTable.name,
  phone: contactTable.phone,
  site_id: siteContact.siteId,
} satisfies Record<keyof JobContactOptionRow, unknown>;

const jobContactDetailSelection = {
  email: contactTable.email,
  id: contactTable.id,
  name: contactTable.name,
  notes: contactTable.notes,
  phone: contactTable.phone,
} satisfies Record<keyof JobContactDetailRow, unknown>;

const siteOptionSelection = {
  access_notes: siteTable.accessNotes,
  address_components: siteTable.addressComponents,
  address_line_1: siteTable.addressLine1,
  address_line_2: siteTable.addressLine2,
  country: siteTable.country,
  county: siteTable.county,
  display_location: siteTable.displayLocation,
  eircode: siteTable.eircode,
  formatted_address: siteTable.formattedAddress,
  google_place_id: siteTable.googlePlaceId,
  id: siteTable.id,
  latitude: siteTable.latitude,
  location_provider: siteTable.locationProvider,
  location_resolved_at: siteTable.locationResolvedAt,
  location_status: siteTable.locationStatus,
  longitude: siteTable.longitude,
  name: siteTable.name,
  raw_location_input: siteTable.rawLocationInput,
  town: siteTable.town,
  updated_at: siteTable.updatedAt,
} satisfies Record<keyof SiteOptionRow, unknown>;

export class JobsRepository extends Context.Service<JobsRepository>()(
  "@ceird/domains/jobs/JobsRepository",
  {
    make: Effect.gen(function* JobsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;
      const { db } = yield* DomainDrizzle;
      // Raw SQL remains for write transactions, lock-taking checks, and complex
      // cursor/search/proximity/activity queries outside this safe-read slice.
      const commentsRepository = yield* CommentsRepository;
      const actors = yield* ProductActivityActorsRepository;
      const defaultListLimit = yield* Config.int(
        "JOBS_DEFAULT_LIST_LIMIT"
      ).pipe(Config.withDefault(50));
      const boundedDefaultListLimit = clampJobListLimit(defaultListLimit);

      const withTransaction = Effect.fn("JobsRepository.withTransaction")(
        <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => sql.withTransaction(effect)
      );

      const ensureSiteInOrganization = Effect.fn(
        "JobsRepository.ensureSiteInOrganization"
      )(function* (organizationId: OrganizationId, siteId: SiteId) {
        const rows = yield* sql<IdRow>`
          select id
          from sites
          where organization_id = ${organizationId}
            and id = ${siteId}
            and archived_at is null
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new SiteNotFoundError({
              message: "Site does not exist in the organization",
              siteId,
            })
          );
        }

        return siteId;
      });

      const ensureContactInOrganization = Effect.fn(
        "JobsRepository.ensureContactInOrganization"
      )(function* (organizationId: OrganizationId, contactId: ContactId) {
        const rows = yield* sql<IdRow>`
          select id
          from contacts
          where organization_id = ${organizationId}
            and id = ${contactId}
            and archived_at is null
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new ContactNotFoundError({
              contactId,
              message: "Contact does not exist in the organization",
            })
          );
        }

        return contactId;
      });

      const linkSiteContact = Effect.fn("JobsRepository.linkSiteContact")(
        function* (input: LinkSiteContactRecordInput) {
          const rows = yield* sql<{
            readonly contact_organization_id: string;
            readonly site_organization_id: string;
          }>`
          select
            sites.organization_id as site_organization_id,
            contacts.organization_id as contact_organization_id
          from sites
          join contacts on contacts.id = ${input.contactId}
          where sites.id = ${input.siteId}
            and sites.organization_id = ${input.organizationId}
            and sites.archived_at is null
            and contacts.archived_at is null
          limit 1
        `;

          const [ownership] = rows;

          if (ownership === undefined) {
            const siteExists = yield* sql<IdRow>`
            select id
            from sites
            where organization_id = ${input.organizationId}
              and id = ${input.siteId}
              and archived_at is null
            limit 1
          `;

            if (siteExists[0] === undefined) {
              return yield* Effect.fail(
                new SiteNotFoundError({
                  message: "Site does not exist",
                  siteId: input.siteId,
                })
              );
            }

            return yield* Effect.fail(
              new ContactNotFoundError({
                contactId: input.contactId,
                message: "Contact does not exist",
              })
            );
          }

          if (
            ownership.site_organization_id !== ownership.contact_organization_id
          ) {
            return yield* Effect.fail(
              new ContactNotFoundError({
                contactId: input.contactId,
                message: "Contact does not belong to the site's organization",
              })
            );
          }

          yield* sql`
          insert into site_contacts ${sql.insert({
            contact_id: input.contactId,
            is_primary: input.isPrimary ?? false,
            organization_id: input.organizationId,
            site_id: input.siteId,
          })}
          on conflict do nothing
        `;
        }
      );

      const ensureOrganizationMember = Effect.fn(
        "JobsRepository.ensureOrganizationMember"
      )(function* (
        organizationId: OrganizationId,
        userId: UserId,
        options?: {
          readonly forUpdate?: boolean;
        }
      ) {
        const lockClause =
          options?.forUpdate === true ? sql`for update` : sql``;
        const rows = yield* sql<IdRow>`
          select user_id as id
          from member
          where organization_id = ${organizationId}
            and user_id = ${userId}
            and role in ${sql.in(INTERNAL_ORGANIZATION_ROLES)}
          limit 1
          ${lockClause}
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new OrganizationMemberNotFoundError({
              message: "User is not a member of the organization",
              organizationId,
              userId,
            })
          );
        }

        return userId;
      });

      const ensureExternalOrganizationMember = Effect.fn(
        "JobsRepository.ensureExternalOrganizationMember"
      )(function* (organizationId: OrganizationId, userId: UserId) {
        const rows = yield* sql<IdRow>`
          select user_id as id
          from member
          where organization_id = ${organizationId}
            and user_id = ${userId}
            and role = ${EXTERNAL_ORGANIZATION_ROLE}
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new OrganizationMemberNotFoundError({
              message: "User is not an external member of the organization",
              organizationId,
              userId,
            })
          );
        }

        return userId;
      });

      const ensureCommentAuthorCanReferenceWorkItem = Effect.fn(
        "JobsRepository.ensureCommentAuthorCanReferenceWorkItem"
      )(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId,
        userId: UserId
      ) {
        const internalRows = yield* sql<IdRow>`
          select user_id as id
          from member
          where organization_id = ${organizationId}
            and user_id = ${userId}
            and role in ${sql.in(INTERNAL_ORGANIZATION_ROLES)}
          limit 1
          for update
        `;

        if (internalRows[0] !== undefined) {
          return userId;
        }

        const grantRows = yield* sql<IdRow>`
          select id
          from work_item_collaborators
          where organization_id = ${organizationId}
            and work_item_id = ${workItemId}
            and subject_type = 'user'
            and user_id = ${userId}
          limit 1
          for update
        `;

        if (grantRows[0] !== undefined) {
          return userId;
        }

        return yield* Effect.fail(
          new OrganizationMemberNotFoundError({
            message:
              "User is not an internal organization member or job collaborator",
            organizationId,
            userId,
          })
        );
      });

      const lookupWorkItemOrganization = Effect.fn(
        "JobsRepository.lookupWorkItemOrganization"
      )(function* (
        workItemId: WorkItemId,
        options?: {
          readonly forUpdate?: boolean;
        }
      ) {
        const lockClause =
          options?.forUpdate === true ? sql`for update` : sql``;
        const rows = yield* sql<{ readonly organization_id: string }>`
          select organization_id
          from work_items
          where id = ${workItemId}
          limit 1
          ${lockClause}
        `;

        return Option.fromNullishOr(rows[0]?.organization_id).pipe(
          Option.map(decodeOrganizationId)
        );
      });

      const ensureWorkItemOrganizationMatches = Effect.fn(
        "JobsRepository.ensureWorkItemOrganizationMatches"
      )(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId,
        options?: {
          readonly forUpdate?: boolean;
        }
      ) {
        const workItemOrganizationId = yield* lookupWorkItemOrganization(
          workItemId,
          options
        );

        if (Option.isNone(workItemOrganizationId)) {
          return yield* Effect.fail(
            new JobNotFoundError({
              message: "Job does not exist",
              workItemId,
            })
          );
        }

        if (workItemOrganizationId.value !== organizationId) {
          return yield* Effect.fail(
            new WorkItemOrganizationMismatchError({
              message: "Job does not belong to the organization",
              organizationId,
              workItemId,
            })
          );
        }

        return workItemId;
      });

      const validateLinkedJobReferences = Effect.fn(
        "JobsRepository.validateLinkedJobReferences"
      )(function* (
        organizationId: OrganizationId,
        input: {
          readonly assigneeId?: UserId | null;
          readonly contactId?: ContactId | null;
          readonly coordinatorId?: UserId | null;
          readonly siteId?: SiteId | null;
        }
      ) {
        if (input.siteId !== undefined && input.siteId !== null) {
          yield* ensureSiteInOrganization(organizationId, input.siteId);
        }

        if (input.contactId !== undefined && input.contactId !== null) {
          yield* ensureContactInOrganization(organizationId, input.contactId);
        }

        if (input.assigneeId !== undefined && input.assigneeId !== null) {
          yield* ensureOrganizationMember(organizationId, input.assigneeId);
          yield* actors.ensureMemberActor({
            organizationId,
            userId: input.assigneeId,
          });
        }

        if (input.coordinatorId !== undefined && input.coordinatorId !== null) {
          yield* ensureOrganizationMember(organizationId, input.coordinatorId);
          yield* actors.ensureMemberActor({
            organizationId,
            userId: input.coordinatorId,
          });
        }
      });

      const refreshActiveJobSummaryForSites = Effect.fn(
        "JobsRepository.refreshActiveJobSummaryForSites"
      )(function* (
        organizationId: OrganizationId,
        siteIds: readonly (SiteId | undefined)[]
      ) {
        const impactedSiteIds = [
          ...new Set(siteIds.filter(isDefined)),
        ].toSorted();

        if (impactedSiteIds.length === 0) {
          return;
        }

        // Serialize by site before reading the aggregate so concurrent service
        // transactions cannot overwrite the summary with a stale count.
        for (const siteId of impactedSiteIds) {
          yield* sql`
            select pg_advisory_xact_lock(
              hashtextextended(
                ${organizationId}::text || ':' || ${siteId}::text,
                0
              )
            )
          `;
        }

        yield* sql`
          insert into site_active_job_summaries (
            site_id,
            organization_id,
            active_job_count,
            highest_active_job_priority,
            updated_at
          )
          select
            work_items.site_id,
            work_items.organization_id,
            count(*)::integer as active_job_count,
            case max(
              case work_items.priority
                when 'urgent' then 4
                when 'high' then 3
                when 'medium' then 2
                when 'low' then 1
                else 0
              end
            )
              when 4 then 'urgent'
              when 3 then 'high'
              when 2 then 'medium'
              when 1 then 'low'
              when 0 then case when count(*) > 0 then 'none' else null end
              else null
            end as highest_active_job_priority,
            now()
          from work_items
          where work_items.organization_id = ${organizationId}
            and work_items.site_id in ${sql.in(impactedSiteIds)}
            and work_items.status not in ${sql.in(TERMINAL_JOB_STATUSES)}
          group by work_items.site_id, work_items.organization_id
          on conflict (site_id, organization_id) do update set
            active_job_count = excluded.active_job_count,
            highest_active_job_priority = excluded.highest_active_job_priority,
            updated_at = excluded.updated_at
        `;

        yield* sql`
          delete from site_active_job_summaries
          where organization_id = ${organizationId}
            and site_id in ${sql.in(impactedSiteIds)}
            and not exists (
              select 1
              from work_items
              where work_items.organization_id = site_active_job_summaries.organization_id
                and work_items.site_id = site_active_job_summaries.site_id
                and work_items.status not in ${sql.in(TERMINAL_JOB_STATUSES)}
            )
        `;
      });

      const listLabelsForWorkItems = Effect.fn(
        "JobsRepository.listLabelsForWorkItems"
      )(function* (
        organizationId: OrganizationId,
        workItemIds: readonly WorkItemId[]
      ) {
        if (workItemIds.length === 0) {
          return new Map<WorkItemId, Label[]>();
        }

        const rows = yield* db
          .select(workItemLabelSelection)
          .from(workItemLabel)
          .innerJoin(
            labelTable,
            and(
              eq(labelTable.id, workItemLabel.labelId),
              eq(labelTable.organizationId, workItemLabel.organizationId)
            )
          )
          .innerJoin(
            workItem,
            and(
              eq(workItem.id, workItemLabel.workItemId),
              eq(workItem.organizationId, workItemLabel.organizationId)
            )
          )
          .where(
            and(
              eq(workItemLabel.organizationId, organizationId),
              eq(labelTable.organizationId, organizationId),
              eq(workItem.organizationId, organizationId),
              inArray(workItemLabel.workItemId, workItemIds),
              isNull(labelTable.archivedAt)
            )
          )
          .orderBy(asc(labelTable.name), asc(labelTable.id))
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        const labelsByWorkItemId = new Map<WorkItemId, Label[]>();

        for (const row of rows) {
          const workItemId = decodeWorkItemId(row.work_item_id);
          const labels = labelsByWorkItemId.get(workItemId) ?? [];
          labels.push(
            decodeLabel({
              archivedAt: row.archived_at?.toISOString() ?? null,
              color: row.color,
              createdAt: row.created_at.toISOString(),
              description: row.description,
              id: decodeLabelId(row.label_id),
              name: row.name,
              updatedAt: row.updated_at.toISOString(),
            })
          );
          labelsByWorkItemId.set(workItemId, labels);
        }

        return labelsByWorkItemId;
      });

      const mapJobRowWithLabels = Effect.fn(
        "JobsRepository.mapJobRowWithLabels"
      )(function* (organizationId: OrganizationId, row: WorkItemRow) {
        const workItemId = decodeWorkItemId(row.id);
        const labelsByWorkItemId = yield* listLabelsForWorkItems(
          organizationId,
          [workItemId]
        );

        return mapJobRow(row, labelsByWorkItemId.get(workItemId) ?? []);
      });

      const list = Effect.fn("JobsRepository.list")(function* (
        organizationId: OrganizationId,
        query: JobListQuery,
        access?: JobsRepositoryAccess
      ) {
        const resolvedAccess = access ?? INTERNAL_JOBS_REPOSITORY_ACCESS;
        const limit = clampJobListLimit(query.limit ?? boundedDefaultListLimit);
        const clauses = [sql`work_items.organization_id = ${organizationId}`];
        const labelFilterJoin =
          query.labelId === undefined
            ? sql``
            : sql`
              join work_item_labels as filter_work_item_labels
                on filter_work_item_labels.work_item_id = work_items.id
                and filter_work_item_labels.organization_id = work_items.organization_id
              join labels as filter_labels
                on filter_labels.id = filter_work_item_labels.label_id
                and filter_labels.organization_id = filter_work_item_labels.organization_id
            `;
        if (query.labelId !== undefined) {
          clauses.push(
            sql`filter_work_item_labels.organization_id = ${organizationId}`
          );
          clauses.push(sql`filter_labels.id = ${query.labelId}`);
          clauses.push(sql`filter_labels.organization_id = ${organizationId}`);
          clauses.push(sql`filter_labels.archived_at is null`);
        }

        if (query.status === "active") {
          clauses.push(
            sql`work_items.status not in ${sql.in(TERMINAL_JOB_STATUSES)}`
          );
        } else if (query.status !== undefined && query.status !== "all") {
          clauses.push(sql`work_items.status = ${query.status}`);
        }

        if (query.assigneeId === "unassigned") {
          clauses.push(sql`work_items.assignee_id is null`);
        } else if (query.assigneeId !== undefined) {
          clauses.push(sql`work_items.assignee_id = ${query.assigneeId}`);
        }

        if (query.coordinatorId !== undefined) {
          clauses.push(sql`work_items.coordinator_id = ${query.coordinatorId}`);
        }

        if (query.priority !== undefined) {
          clauses.push(sql`work_items.priority = ${query.priority}`);
        }

        if (query.siteId !== undefined) {
          clauses.push(sql`work_items.site_id = ${query.siteId}`);
        }

        if (query.query !== undefined) {
          const queryPattern = `%${query.query}%`;
          clauses.push(sql`(
            work_items.title ilike ${queryPattern}
            or work_items.kind::text ilike ${queryPattern}
            or sites.name ilike ${queryPattern}
            or sites.display_location ilike ${queryPattern}
            or sites.eircode ilike ${queryPattern}
            or contacts.name ilike ${queryPattern}
            or contacts.email ilike ${queryPattern}
            or contacts.phone ilike ${queryPattern}
          )`);
        }

        if (resolvedAccess.visibility === "external") {
          clauses.push(sql`exists (
            select 1
            from work_item_collaborators
            where work_item_collaborators.organization_id = ${organizationId}
              and work_item_collaborators.work_item_id = work_items.id
              and work_item_collaborators.subject_type = 'user'
              and work_item_collaborators.user_id = ${resolvedAccess.userId}
          )`);
        }

        if (query.cursor !== undefined) {
          const encodedCursor = query.cursor;
          const cursor = yield* Effect.try({
            try: () => decodeCursor(encodedCursor),
            catch: () =>
              new JobListCursorInvalidError({
                cursor: encodedCursor,
                message: "Job list cursor is invalid",
              }),
          });

          clauses.push(
            sql`(
              work_items.updated_at < ${cursor.updatedAt}
              or (
                work_items.updated_at = ${cursor.updatedAt}
                and work_items.id < ${cursor.id}
              )
            )`
          );
        }

        const rows = yield* sql<WorkItemRow>`
          select
            work_items.id,
            work_items.kind,
            work_items.title,
            work_items.status,
            work_items.priority,
            work_items.site_id,
            work_items.contact_id,
            work_items.assignee_id,
            work_items.coordinator_id,
            work_items.blocked_reason,
            work_items.completed_at,
            work_items.completed_by_user_id,
            work_items.created_at,
            work_items.updated_at,
            work_items.created_by_user_id,
            work_items.organization_id
          from work_items
          left join sites
            on sites.id = work_items.site_id
            and sites.organization_id = work_items.organization_id
          left join contacts
            on contacts.id = work_items.contact_id
            and contacts.organization_id = work_items.organization_id
          ${labelFilterJoin}
          where ${sql.and(clauses)}
          order by work_items.updated_at desc, work_items.id desc
          limit ${limit + 1}
        `;

        const pageRows = Arr.take(rows, limit);
        const labelsByWorkItemId = yield* listLabelsForWorkItems(
          organizationId,
          pipe(
            pageRows,
            Arr.map((row) => decodeWorkItemId(row.id))
          )
        );
        const items = pipe(
          pageRows,
          Arr.map((row) =>
            mapJobListItemRow(
              row,
              labelsByWorkItemId.get(decodeWorkItemId(row.id)) ?? []
            )
          )
        );
        const nextCursorRow = rows.length > limit ? rows[limit - 1] : undefined;
        const nextCursor =
          nextCursorRow === undefined ? undefined : encodeCursor(nextCursorRow);

        return decodeJobListResponse({ items, nextCursor });
      });

      const getHomeDashboardSummary = Effect.fn(
        "JobsRepository.getHomeDashboardSummary"
      )(function* (organizationId: OrganizationId) {
        const [
          jobStatsRows,
          memberStatsRows,
          siteStatsRows,
          jobRows,
          siteRows,
        ] = yield* Effect.all(
          [
            sql<HomeDashboardJobStatsRow>`
              select
                count(*)::integer as total_jobs,
                count(*) filter (
                  where work_items.status in ${sql.in(ACTIVE_JOB_STATUSES)}
                )::integer as active_jobs,
                count(*) filter (
                  where work_items.status = 'blocked'
                )::integer as blocked_jobs,
                count(*) filter (
                  where work_items.priority in ('urgent', 'high')
                )::integer as priority_watch_jobs,
                count(*) filter (
                  where work_items.status in ${sql.in(ACTIVE_JOB_STATUSES)}
                    and work_items.assignee_id is null
                )::integer as unassigned_jobs
              from work_items
              where work_items.organization_id = ${organizationId}
            `,
            sql<HomeDashboardMemberStatsRow>`
              select count(*)::integer as total_members
              from member
              where member.organization_id = ${organizationId}
                and member.role in ${sql.in(INTERNAL_ORGANIZATION_ROLES)}
            `,
            sql<HomeDashboardSiteStatsRow>`
              select
                count(*)::integer as total_sites,
                count(*) filter (
                  where sites.location_status in ${sql.in(
                    USABLE_SITE_LOCATION_STATUSES
                  )}
                    and sites.latitude is not null
                    and sites.longitude is not null
                )::integer as mapped_sites
              from sites
              where sites.organization_id = ${organizationId}
                and sites.archived_at is null
            `,
            sql<HomeDashboardJobSummaryRow>`
              select
                work_items.id,
                work_items.title,
                work_items.status,
                work_items.priority,
                work_items.updated_at,
                assignee.name as assignee_name,
                sites.name as site_name
              from work_items
              left join "user" as assignee
                on assignee.id = work_items.assignee_id
              left join sites
                on sites.id = work_items.site_id
                and sites.organization_id = work_items.organization_id
                and sites.archived_at is null
              where work_items.organization_id = ${organizationId}
                and work_items.status in ${sql.in(ACTIVE_JOB_STATUSES)}
              order by work_items.updated_at desc, work_items.id desc
              limit 5
            `,
            sql<HomeDashboardSiteSummaryRow>`
              with active_site_counts as (
                select
                  work_items.site_id,
                  count(*)::integer as active_job_count
                from work_items
                where work_items.organization_id = ${organizationId}
                  and work_items.status in ${sql.in(ACTIVE_JOB_STATUSES)}
                  and work_items.site_id is not null
                group by work_items.site_id
              )
              select
                sites.address_line_1,
                sites.address_line_2,
                sites.county,
                sites.display_location,
                sites.eircode,
                sites.formatted_address,
                sites.id,
                sites.location_resolved_at,
                sites.name,
                sites.raw_location_input,
                sites.town,
                active_site_counts.active_job_count
              from active_site_counts
              join sites
                on sites.id = active_site_counts.site_id
                and sites.organization_id = ${organizationId}
                and sites.archived_at is null
              order by active_site_counts.active_job_count desc, sites.name asc, sites.id asc
              limit 5
            `,
          ],
          { concurrency: 5 }
        );
        const [jobStats] = jobStatsRows;
        const [memberStats] = memberStatsRows;
        const [siteStats] = siteStatsRows;

        return decodeHomeDashboardSummaryResponse({
          jobs: {
            items: jobRows.map(mapHomeDashboardJobSummaryRow),
            stats: {
              activeJobs: jobStats?.active_jobs ?? 0,
              blockedJobs: jobStats?.blocked_jobs ?? 0,
              priorityWatchJobs: jobStats?.priority_watch_jobs ?? 0,
              totalJobs: jobStats?.total_jobs ?? 0,
              unassignedJobs: jobStats?.unassigned_jobs ?? 0,
            },
          },
          members: {
            total: memberStats?.total_members ?? 0,
          },
          sites: {
            items: siteRows.map(mapHomeDashboardSiteSummaryRow),
            stats: {
              mappedSites: siteStats?.mapped_sites ?? 0,
              totalSites: siteStats?.total_sites ?? 0,
            },
          },
        });
      });

      const listProximityCandidates = Effect.fn(
        "JobsRepository.listProximityCandidates"
      )(function* (
        organizationId: OrganizationId,
        filters: JobProximityFilters,
        access?: JobsRepositoryAccess
      ) {
        const resolvedAccess = access ?? INTERNAL_JOBS_REPOSITORY_ACCESS;
        const clauses = [sql`work_items.organization_id = ${organizationId}`];
        const statusFilter = filters.status ?? "active";

        if (statusFilter === "active") {
          clauses.push(
            sql`work_items.status not in ${sql.in(TERMINAL_JOB_STATUSES)}`
          );
        } else if (statusFilter !== "all") {
          clauses.push(sql`work_items.status = ${statusFilter}`);
        }

        if (filters.assigneeId !== undefined) {
          if (filters.assigneeId.kind === "unassigned") {
            clauses.push(sql`work_items.assignee_id is null`);
          } else if (filters.assigneeId.kind === "user") {
            clauses.push(
              sql`work_items.assignee_id = ${filters.assigneeId.userId}`
            );
          }
        }

        if (filters.coordinatorId !== undefined) {
          clauses.push(
            sql`work_items.coordinator_id = ${filters.coordinatorId}`
          );
        }

        if (filters.priority !== undefined) {
          clauses.push(sql`work_items.priority = ${filters.priority}`);
        }

        if (filters.siteId !== undefined) {
          clauses.push(sql`work_items.site_id = ${filters.siteId}`);
        }

        if (filters.labelId !== undefined) {
          clauses.push(sql`exists (
            select 1
            from work_item_labels
            join labels
              on labels.id = work_item_labels.label_id
              and labels.organization_id = work_item_labels.organization_id
            where work_item_labels.organization_id = ${organizationId}
              and work_item_labels.work_item_id = work_items.id
              and work_item_labels.label_id = ${filters.labelId}
              and labels.archived_at is null
          )`);
        }

        if (filters.query !== undefined) {
          const queryPattern = `%${filters.query}%`;
          clauses.push(sql`(
            work_items.title ilike ${queryPattern}
            or sites.name ilike ${queryPattern}
            or sites.display_location ilike ${queryPattern}
            or sites.eircode ilike ${queryPattern}
          )`);
        }

        if (resolvedAccess.visibility === "external") {
          clauses.push(sql`exists (
            select 1
            from work_item_collaborators
            where work_item_collaborators.organization_id = ${organizationId}
              and work_item_collaborators.work_item_id = work_items.id
              and work_item_collaborators.subject_type = 'user'
              and work_item_collaborators.user_id = ${resolvedAccess.userId}
          )`);
        }

        const routeableSiteClause = sql`
          sites.id is not null
          and sites.location_status in ${sql.in(USABLE_SITE_LOCATION_STATUSES)}
          and sites.latitude is not null
          and sites.longitude is not null
        `;
        const statsRows = yield* sql<JobProximityStatsRow>`
          select
            count(*) filter (where ${routeableSiteClause})::integer as candidate_count,
            count(*) filter (where work_items.site_id is null)::integer as no_site_count,
            count(*) filter (
              where work_items.site_id is not null
                and (
                  sites.id is null
                  or sites.location_status not in ${sql.in(USABLE_SITE_LOCATION_STATUSES)}
                )
            )::integer as unmapped_site_count,
            count(*) filter (
              where sites.id is not null
                and sites.location_status in ${sql.in(USABLE_SITE_LOCATION_STATUSES)}
                and (sites.latitude is null or sites.longitude is null)
            )::integer as missing_coordinates_count
          from work_items
          left join sites
            on sites.id = work_items.site_id
            and sites.organization_id = work_items.organization_id
            and sites.archived_at is null
          where ${sql.and(clauses)}
        `;
        const stats = statsRows[0] ?? {
          candidate_count: 0,
          missing_coordinates_count: 0,
          no_site_count: 0,
          unmapped_site_count: 0,
        };
        const rows = yield* sql<JobProximityCandidateRow>`
          select
            work_items.id,
            work_items.kind,
            work_items.title,
            work_items.status,
            work_items.priority,
            work_items.site_id,
            work_items.contact_id,
            work_items.assignee_id,
            work_items.coordinator_id,
            work_items.blocked_reason,
            work_items.completed_at,
            work_items.completed_by_user_id,
            work_items.created_at,
            work_items.updated_at,
            work_items.created_by_user_id,
            work_items.organization_id,
            sites.access_notes as site_access_notes,
            sites.address_components as site_address_components,
            sites.address_line_1 as site_address_line_1,
            sites.address_line_2 as site_address_line_2,
            sites.country as site_country,
            sites.county as site_county,
            sites.display_location as site_display_location,
            sites.eircode as site_eircode,
            sites.formatted_address as site_formatted_address,
            sites.google_place_id as site_google_place_id,
            sites.id as site_id_value,
            sites.latitude as site_latitude,
            sites.location_provider as site_location_provider,
            sites.location_resolved_at as site_location_resolved_at,
            sites.location_status as site_location_status,
            sites.longitude as site_longitude,
            sites.name as site_name,
            sites.raw_location_input as site_raw_location_input,
            sites.town as site_town,
            sites.updated_at as site_updated_at
          from work_items
          left join sites
            on sites.id = work_items.site_id
            and sites.organization_id = work_items.organization_id
            and sites.archived_at is null
          where ${sql.and([...clauses, routeableSiteClause])}
          order by work_items.updated_at desc, work_items.id desc
          limit ${PROXIMITY_CANDIDATE_LIMIT + 1}
        `;
        const pageRows = Arr.take(rows, PROXIMITY_CANDIDATE_LIMIT);
        const workItemIds = pageRows.map((row) => decodeWorkItemId(row.id));
        const routableSiteIds = pageRows.flatMap((row) =>
          row.site_id_value === null ? [] : [decodeSiteId(row.site_id_value)]
        );
        const includeSiteLabels = resolvedAccess.visibility !== "external";
        const [labelsByWorkItemId, labelsBySiteId] = yield* Effect.all(
          [
            listLabelsForWorkItems(organizationId, workItemIds),
            includeSiteLabels
              ? listSiteLabelsForSitesWithSql(sql, organizationId, [
                  ...new Set(routableSiteIds),
                ])
              : Effect.succeed(new Map<SiteId, readonly Label[]>()),
          ],
          { concurrency: 2 }
        );
        const excluded = new Map<ProximityExcludedCount["reason"], number>();
        addExcluded(excluded, "no_site", stats.no_site_count);
        addExcluded(excluded, "unmapped_site", stats.unmapped_site_count);
        addExcluded(
          excluded,
          "missing_coordinates",
          stats.missing_coordinates_count
        );
        const candidates: JobProximityCandidate[] = [];

        for (const row of pageRows) {
          const siteId = decodeSiteId(row.site_id_value);
          const site = mapJobProximitySiteOptionRow(
            row,
            labelsBySiteId.get(siteId) ?? []
          );

          candidates.push({
            job: mapJobListItemRow(
              row,
              labelsByWorkItemId.get(decodeWorkItemId(row.id)) ?? []
            ),
            site,
          });
        }

        return {
          candidateCount: stats.candidate_count,
          candidateLimitApplied:
            stats.candidate_count > PROXIMITY_CANDIDATE_LIMIT,
          candidates,
          excluded: [...excluded.entries()].map(([reason, count]) => ({
            count,
            reason,
          })),
        } satisfies JobProximityCandidateSet;
      });

      const listOrganizationActivity = Effect.fn(
        "JobsRepository.listOrganizationActivity"
      )(function* (
        organizationId: OrganizationId,
        query: OrganizationActivityQuery
      ) {
        const limit = clampJobListLimit(query.limit ?? boundedDefaultListLimit);
        const clauses = [
          sql`work_item_activity.organization_id = ${organizationId}`,
          sql`work_items.organization_id = ${organizationId}`,
        ];

        if (query.actorUserId !== undefined) {
          clauses.push(
            sql`work_item_activity.actor_user_id = ${query.actorUserId}`
          );
        }

        if (query.eventType !== undefined) {
          clauses.push(sql`work_item_activity.event_type = ${query.eventType}`);
        }

        if (query.fromDate !== undefined) {
          clauses.push(
            sql`work_item_activity.created_at >= ${isoDateToUtcStartDate(
              query.fromDate
            )}`
          );
        }

        if (query.toDate !== undefined) {
          clauses.push(
            sql`work_item_activity.created_at < ${getExclusiveDateUpperBound(
              query.toDate
            )}`
          );
        }

        if (query.jobTitle !== undefined) {
          clauses.push(sql`work_items.title ilike ${`%${query.jobTitle}%`}`);
        }

        if (query.cursor !== undefined) {
          const encodedCursor = query.cursor;
          const cursor = yield* Effect.try({
            try: () => decodeOrganizationActivityCursorValue(encodedCursor),
            catch: () =>
              new OrganizationActivityCursorInvalidError({
                cursor: encodedCursor,
                message: "Organization activity cursor is invalid",
              }),
          });

          clauses.push(sql`(
            work_item_activity.created_at < ${cursor.createdAt}
            or (
              work_item_activity.created_at = ${cursor.createdAt}
              and work_item_activity.id < ${cursor.id}
            )
          )`);
        }

        const rows = yield* sql<OrganizationActivityRow>`
          select
            work_item_activity.*,
            work_items.title as job_title,
            product_activity_actors.kind as actor_kind,
            product_activity_actors.display_name as actor_display_name,
            product_activity_actors.display_detail as actor_display_detail,
            product_activity_actors.route_href as actor_route_href,
            product_activity_actors.route_label as actor_route_label
          from work_item_activity
          join work_items
            on work_items.id = work_item_activity.work_item_id
            and work_items.organization_id = work_item_activity.organization_id
          left join product_activity_actors
            on product_activity_actors.id = work_item_activity.actor_id
            and product_activity_actors.organization_id = work_item_activity.organization_id
          where ${sql.and(clauses)}
          order by work_item_activity.created_at desc, work_item_activity.id desc
          limit ${limit + 1}
        `;

        const items = pipe(
          rows,
          Arr.take(limit),
          Arr.map(mapOrganizationActivityRow)
        );
        const nextCursorRow = rows.length > limit ? rows[limit - 1] : undefined;

        const response: OrganizationActivityListResponse =
          decodeOrganizationActivityListResponse({
            items,
            nextCursor:
              nextCursorRow === undefined
                ? undefined
                : encodeOrganizationActivityCursor(nextCursorRow),
          });

        return response;
      });

      const listMemberOptions = Effect.fn("JobsRepository.listMemberOptions")(
        function* (organizationId: OrganizationId) {
          const rows = yield* db
            .select(jobMemberOptionSelection)
            .from(member)
            .innerJoin(userTable, eq(userTable.id, member.userId))
            .where(
              and(
                eq(member.organizationId, organizationId),
                inArray(member.role, INTERNAL_ORGANIZATION_ROLES)
              )
            )
            .orderBy(asc(userTable.name), asc(userTable.email))
            .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

          return rows.map(mapJobMemberOptionRow);
        }
      );

      const listExternalMemberOptions = Effect.fn(
        "JobsRepository.listExternalMemberOptions"
      )(function* (organizationId: OrganizationId) {
        const rows = yield* db
          .select(jobMemberOptionSelection)
          .from(member)
          .innerJoin(userTable, eq(userTable.id, member.userId))
          .where(
            and(
              eq(member.organizationId, organizationId),
              eq(member.role, EXTERNAL_ORGANIZATION_ROLE)
            )
          )
          .orderBy(asc(userTable.name), asc(userTable.email))
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        return rows.map(mapJobExternalMemberOptionRow);
      });

      const listExternalScopedOptions = Effect.fn(
        "JobsRepository.listExternalScopedOptions"
      )(function* (organizationId: OrganizationId, userId: UserId) {
        const visibleCollaboratorWhere = and(
          eq(workItemCollaborator.organizationId, organizationId),
          eq(workItemCollaborator.subjectType, "user"),
          eq(workItemCollaborator.userId, userId)
        );
        const joinVisibleWorkItems = and(
          eq(workItem.id, workItemCollaborator.workItemId),
          eq(workItem.organizationId, workItemCollaborator.organizationId)
        );
        const labelsEffect = db
          .selectDistinct(labelSelection)
          .from(workItemCollaborator)
          .innerJoin(workItem, joinVisibleWorkItems)
          .innerJoin(
            workItemLabel,
            and(
              eq(workItemLabel.workItemId, workItem.id),
              eq(workItemLabel.organizationId, workItem.organizationId)
            )
          )
          .innerJoin(
            labelTable,
            and(
              eq(labelTable.id, workItemLabel.labelId),
              eq(labelTable.organizationId, workItemLabel.organizationId)
            )
          )
          .where(and(visibleCollaboratorWhere, isNull(labelTable.archivedAt)))
          .orderBy(asc(labelTable.name), asc(labelTable.id))
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));
        const sitesEffect = db
          .selectDistinct(siteOptionSelection)
          .from(workItemCollaborator)
          .innerJoin(workItem, joinVisibleWorkItems)
          .innerJoin(
            siteTable,
            and(
              eq(siteTable.id, workItem.siteId),
              eq(siteTable.organizationId, workItem.organizationId)
            )
          )
          .where(and(visibleCollaboratorWhere, isNull(siteTable.archivedAt)))
          .orderBy(asc(siteTable.name), asc(siteTable.id))
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));
        const contactsEffect = db
          .selectDistinct(jobContactOptionFromWorkItemSelection)
          .from(workItemCollaborator)
          .innerJoin(workItem, joinVisibleWorkItems)
          .innerJoin(
            contactTable,
            and(
              eq(contactTable.id, workItem.contactId),
              eq(contactTable.organizationId, workItem.organizationId)
            )
          )
          .where(and(visibleCollaboratorWhere, isNull(contactTable.archivedAt)))
          .orderBy(
            asc(contactTable.name),
            asc(contactTable.id),
            asc(workItem.siteId)
          )
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));
        const [labels, sites, contacts] = yield* Effect.all(
          [labelsEffect, sitesEffect, contactsEffect],
          { concurrency: 3 }
        );

        return {
          contacts: mapJobContactOptions(contacts),
          labels: labels.map(mapLabelRow),
          members: [],
          sites: sites.map((row) => mapSiteOptionRow(row)),
        } satisfies JobOptionsResponse;
      });

      const listCollaborators = Effect.fn("JobsRepository.listCollaborators")(
        function* (organizationId: OrganizationId, workItemId: WorkItemId) {
          yield* ensureWorkItemOrganizationMatches(organizationId, workItemId);

          const rows = yield* db
            .select(workItemCollaboratorSelection)
            .from(workItemCollaborator)
            .where(
              and(
                eq(workItemCollaborator.organizationId, organizationId),
                eq(workItemCollaborator.workItemId, workItemId)
              )
            )
            .orderBy(
              asc(workItemCollaborator.createdAt),
              asc(workItemCollaborator.id)
            )
            .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

          return rows.map(mapJobCollaboratorRow);
        }
      );

      const attachCollaborator = Effect.fn("JobsRepository.attachCollaborator")(
        function* (input: AttachJobCollaboratorRecordInput) {
          yield* ensureWorkItemOrganizationMatches(
            input.organizationId,
            input.workItemId
          );
          yield* ensureOrganizationMember(
            input.organizationId,
            input.createdByUserId
          );
          yield* ensureExternalOrganizationMember(
            input.organizationId,
            input.userId
          );

          const insertCollaborator = sql<WorkItemCollaboratorRow>`
          insert into work_item_collaborators ${sql
            .insert({
              access_level: input.accessLevel,
              created_by_user_id: input.createdByUserId,
              id: generateJobCollaboratorId(),
              organization_id: input.organizationId,
              role_label: input.roleLabel,
              subject_type: "user",
              user_id: input.userId,
              work_item_id: input.workItemId,
            })
            .returning("*")}
        `;
          const rows = yield* insertCollaborator.pipe(
            Effect.catchTag("SqlError", (error) =>
              mapJobCollaboratorConflict(error, input)
            )
          );
          const row = yield* getRequiredRow(
            rows,
            "inserted work item collaborator"
          );

          return mapJobCollaboratorRow(row);
        }
      );

      const updateCollaborator = Effect.fn("JobsRepository.updateCollaborator")(
        function* (
          organizationId: OrganizationId,
          workItemId: WorkItemId,
          collaboratorId: JobCollaboratorId,
          input: UpdateJobCollaboratorRecordInput
        ) {
          const values: Record<string, unknown> = {
            updated_at: new Date(),
          };

          if (input.accessLevel !== undefined) {
            values.access_level = input.accessLevel;
          }

          if (input.roleLabel !== undefined) {
            values.role_label = input.roleLabel;
          }

          const rows = yield* sql<WorkItemCollaboratorRow>`
          update work_item_collaborators
          set ${sql.update(values)}
          where organization_id = ${organizationId}
            and work_item_id = ${workItemId}
            and id = ${collaboratorId}
          returning *
        `;
          const [row] = rows;

          if (row === undefined) {
            return yield* Effect.fail(
              new JobCollaboratorNotFoundError({
                collaboratorId,
                message: "Job collaborator does not exist in the organization",
                workItemId,
              })
            );
          }

          return mapJobCollaboratorRow(row);
        }
      );

      const removeCollaborator = Effect.fn("JobsRepository.removeCollaborator")(
        function* (
          organizationId: OrganizationId,
          workItemId: WorkItemId,
          collaboratorId: JobCollaboratorId
        ) {
          const rows = yield* sql<WorkItemCollaboratorRow>`
          delete from work_item_collaborators
          where organization_id = ${organizationId}
            and work_item_id = ${workItemId}
            and id = ${collaboratorId}
          returning *
        `;
          const [row] = rows;

          if (row === undefined) {
            return yield* Effect.fail(
              new JobCollaboratorNotFoundError({
                collaboratorId,
                message: "Job collaborator does not exist in the organization",
                workItemId,
              })
            );
          }

          return mapJobCollaboratorRow(row);
        }
      );

      const findUserCollaboratorGrant = Effect.fn(
        "JobsRepository.findUserCollaboratorGrant"
      )(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId,
        userId: UserId
      ) {
        const rows = yield* db
          .select(workItemCollaboratorSelection)
          .from(workItemCollaborator)
          .where(
            and(
              eq(workItemCollaborator.organizationId, organizationId),
              eq(workItemCollaborator.workItemId, workItemId),
              eq(workItemCollaborator.subjectType, "user"),
              eq(workItemCollaborator.userId, userId)
            )
          )
          .limit(1)
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        return Option.fromNullishOr(rows[0]).pipe(
          Option.map(mapJobCollaboratorRow)
        );
      });

      const listAccessibleWorkItemIdsForUser = Effect.fn(
        "JobsRepository.listAccessibleWorkItemIdsForUser"
      )(function* (organizationId: OrganizationId, userId: UserId) {
        const rows = yield* db
          .select({ id: workItem.id })
          .from(workItemCollaborator)
          .innerJoin(
            workItem,
            and(
              eq(workItem.id, workItemCollaborator.workItemId),
              eq(workItem.organizationId, workItemCollaborator.organizationId)
            )
          )
          .where(
            and(
              eq(workItemCollaborator.organizationId, organizationId),
              eq(workItemCollaborator.subjectType, "user"),
              eq(workItemCollaborator.userId, userId)
            )
          )
          .orderBy(desc(workItem.updatedAt), desc(workItem.id))
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        return rows.map((row) => decodeWorkItemId(row.id));
      });

      const findById = Effect.fn("JobsRepository.findById")(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId
      ) {
        return yield* findJobById(organizationId, workItemId);
      });

      const findByIdForUpdate = Effect.fn("JobsRepository.findByIdForUpdate")(
        function* (organizationId: OrganizationId, workItemId: WorkItemId) {
          return yield* findJobById(organizationId, workItemId, {
            forUpdate: true,
          });
        }
      );

      const findJobById = Effect.fn("JobsRepository.findJobById")(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId,
        options?: {
          readonly forUpdate?: boolean;
        }
      ) {
        if (options?.forUpdate !== true) {
          const rows = yield* db
            .select(workItemSelection)
            .from(workItem)
            .where(
              and(
                eq(workItem.organizationId, organizationId),
                eq(workItem.id, workItemId)
              )
            )
            .limit(1)
            .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

          return Option.fromNullishOr(rows[0]).pipe(
            Option.map((row) => mapJobRow(row))
          );
        }

        // Keep the lock-taking variant raw so existing write transactions retain
        // their exact `for update` behavior until the whole workflow migrates.
        const lockClause =
          options?.forUpdate === true ? sql`for update` : sql``;
        const rows = yield* sql<WorkItemRow>`
          select
            id,
            kind,
            title,
            status,
            priority,
            site_id,
            contact_id,
            assignee_id,
            coordinator_id,
            blocked_reason,
            completed_at,
            completed_by_user_id,
            created_at,
            updated_at,
            created_by_user_id,
            organization_id
          from work_items
          where organization_id = ${organizationId}
            and id = ${workItemId}
          limit 1
          ${lockClause}
        `;

        return Option.fromNullishOr(rows[0]).pipe(
          Option.map((row) => mapJobRow(row))
        );
      });

      const getDetail = Effect.fn("JobsRepository.getDetail")(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId,
        access?: JobsRepositoryAccess
      ) {
        const resolvedAccess = access ?? INTERNAL_JOBS_REPOSITORY_ACCESS;
        let grant = Option.none<JobCollaborator>();

        if (resolvedAccess.visibility === "external") {
          grant =
            resolvedAccess.grant === undefined
              ? yield* findUserCollaboratorGrant(
                  organizationId,
                  workItemId,
                  resolvedAccess.userId
                )
              : Option.some(resolvedAccess.grant);
        }

        if (resolvedAccess.visibility === "external" && Option.isNone(grant)) {
          return Option.none<JobDetail>();
        }

        const job = yield* findById(organizationId, workItemId).pipe(
          Effect.map(Option.getOrUndefined)
        );

        if (job === undefined) {
          return Option.none<JobDetail>();
        }

        const activityEffect =
          resolvedAccess.visibility === "external"
            ? Effect.succeed<WorkItemActivityRow[]>([])
            : db
                .select(workItemActivitySelection)
                .from(workItemActivity)
                .where(
                  and(
                    eq(workItemActivity.workItemId, workItemId),
                    eq(workItemActivity.organizationId, organizationId)
                  )
                )
                .orderBy(
                  desc(workItemActivity.createdAt),
                  desc(workItemActivity.id)
                )
                .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));
        const visitsEffect =
          resolvedAccess.visibility === "external"
            ? Effect.succeed<WorkItemVisitRow[]>([])
            : db
                .select(workItemVisitSelection)
                .from(workItemVisit)
                .where(
                  and(
                    eq(workItemVisit.workItemId, workItemId),
                    eq(workItemVisit.organizationId, organizationId)
                  )
                )
                .orderBy(desc(workItemVisit.visitDate), desc(workItemVisit.id))
                .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));
        const contactEffect =
          job.contactId === undefined
            ? Effect.succeed(Option.none<JobContactDetail>())
            : findContactDetailById(organizationId, job.contactId).pipe(
                Effect.map(Option.fromNullishOr)
              );
        const siteEffect =
          job.siteId === undefined
            ? Effect.succeed(Option.none<SiteOption>())
            : findSiteDetailById(
                organizationId,
                job.siteId,
                resolvedAccess.visibility !== "external"
              );

        const [
          comments,
          labelsByWorkItemId,
          activity,
          visits,
          contactOption,
          siteOption,
        ] = yield* Effect.all(
          [
            commentsRepository.listForWorkItem(organizationId, workItemId),
            listLabelsForWorkItems(organizationId, [workItemId]),
            activityEffect,
            visitsEffect,
            contactEffect,
            siteEffect,
          ],
          { concurrency: 3 }
        );

        return Option.some(
          decodeJobDetail({
            activity:
              resolvedAccess.visibility === "external"
                ? []
                : activity.map(mapJobActivityRow),
            comments,
            contact: Option.getOrUndefined(contactOption),
            site: Option.getOrUndefined(siteOption),
            job: {
              ...job,
              labels: labelsByWorkItemId.get(workItemId) ?? [],
            },
            viewerAccess: {
              canComment:
                resolvedAccess.visibility === "external"
                  ? Option.match(grant, {
                      onNone: () => false,
                      onSome: (collaborator) =>
                        collaborator.accessLevel === "comment",
                    })
                  : true,
              visibility: resolvedAccess.visibility,
            },
            visits:
              resolvedAccess.visibility === "external"
                ? []
                : visits.map(mapJobVisitRow),
          })
        );
      });

      const findSiteDetailById = Effect.fn("JobsRepository.findSiteDetailById")(
        function* (
          organizationId: OrganizationId,
          siteId: SiteId,
          includeLabels = true
        ) {
          const rows = yield* db
            .select(siteOptionSelection)
            .from(siteTable)
            .where(
              and(
                eq(siteTable.organizationId, organizationId),
                eq(siteTable.id, siteId),
                isNull(siteTable.archivedAt)
              )
            )
            .limit(1)
            .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

          const [row] = rows;

          if (row === undefined) {
            return Option.none<SiteOption>();
          }

          const labelsBySiteId = includeLabels
            ? yield* listSiteLabelsForSitesWithSql(sql, organizationId, [
                siteId,
              ])
            : new Map<SiteId, Label[]>();

          return Option.some(
            mapSiteOptionRow(row, labelsBySiteId.get(siteId) ?? [])
          );
        }
      );

      const findContactDetailById = Effect.fn(
        "JobsRepository.findContactDetailById"
      )(function* (organizationId: OrganizationId, contactId: ContactId) {
        const rows = yield* db
          .select(jobContactDetailSelection)
          .from(contactTable)
          .where(
            and(
              eq(contactTable.organizationId, organizationId),
              eq(contactTable.id, contactId),
              isNull(contactTable.archivedAt)
            )
          )
          .limit(1)
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        return Option.fromNullishOr(rows[0]).pipe(
          Option.map(mapJobContactDetailRow),
          Option.getOrUndefined
        );
      });

      const create = Effect.fn("JobsRepository.create")(function* (
        input: CreateJobRecordInput
      ) {
        yield* ensureOrganizationMember(
          input.organizationId,
          input.createdByUserId
        );

        if (input.completedByUserId !== undefined) {
          yield* ensureOrganizationMember(
            input.organizationId,
            input.completedByUserId
          );
        }

        yield* validateLinkedJobReferences(input.organizationId, {
          assigneeId: input.assigneeId,
          contactId: input.contactId,
          coordinatorId: input.coordinatorId,
          siteId: input.siteId,
        });

        const insertValues: Record<string, unknown> = {
          blocked_reason:
            input.status === "blocked" ? (input.blockedReason ?? null) : null,
          completed_at:
            input.status === "completed" && input.completedAt !== undefined
              ? parseIsoDateTime(input.completedAt)
              : null,
          completed_by_user_id:
            input.status === "completed"
              ? (input.completedByUserId ?? null)
              : null,
          created_by_user_id: input.createdByUserId,
          id: generateWorkItemId(),
          kind: input.kind ?? "job",
          organization_id: input.organizationId,
          priority: input.priority ?? "none",
          status: input.status ?? "new",
          title: input.title,
        };

        if (input.siteId !== undefined) {
          insertValues.site_id = input.siteId;
        }

        if (input.contactId !== undefined) {
          insertValues.contact_id = input.contactId;
        }

        if (input.assigneeId !== undefined) {
          insertValues.assignee_id = input.assigneeId;
        }

        if (input.coordinatorId !== undefined) {
          insertValues.coordinator_id = input.coordinatorId;
        }

        const rows = yield* sql<WorkItemRow>`
          insert into work_items ${sql.insert(insertValues).returning("*")}
        `;

        const row = yield* getRequiredRow(rows, "inserted work item");
        yield* refreshActiveJobSummaryForSites(input.organizationId, [
          input.siteId,
        ]);

        return mapJobRow(row);
      });

      const patch = Effect.fn("JobsRepository.patch")(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId,
        input: PatchJobRecordInput
      ) {
        yield* validateLinkedJobReferences(organizationId, input);

        const existingSiteRows = yield* sql<{
          readonly site_id: string | null;
        }>`
          select site_id
          from work_items
          where organization_id = ${organizationId}
            and id = ${workItemId}
          for update
        `;
        const previousSiteId =
          existingSiteRows[0]?.site_id === null ||
          existingSiteRows[0]?.site_id === undefined
            ? undefined
            : decodeSiteId(existingSiteRows[0].site_id);

        const values: Record<string, unknown> = {
          updated_at: new Date(),
        };

        if (input.title !== undefined) {
          values.title = input.title;
        }

        if (input.priority !== undefined) {
          values.priority = input.priority;
        }

        if (input.siteId !== undefined) {
          values.site_id = input.siteId;
        }

        if (input.contactId !== undefined) {
          values.contact_id = input.contactId;
        }

        if (input.assigneeId !== undefined) {
          values.assignee_id = input.assigneeId;
        }

        if (input.coordinatorId !== undefined) {
          values.coordinator_id = input.coordinatorId;
        }

        const rows = yield* sql<WorkItemRow>`
          update work_items
          set ${sql.update(values)}
          where organization_id = ${organizationId}
            and id = ${workItemId}
          returning *
        `;

        const [row] = rows;

        if (row === undefined) {
          return Option.none<Job>();
        }

        yield* refreshActiveJobSummaryForSites(organizationId, [
          previousSiteId,
          row.site_id === null ? undefined : decodeSiteId(row.site_id),
        ]);

        return Option.some(yield* mapJobRowWithLabels(organizationId, row));
      });

      const transition = Effect.fn("JobsRepository.transition")(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId,
        input: TransitionJobRecordInput
      ) {
        if (
          input.completedByUserId !== undefined &&
          input.completedByUserId !== null
        ) {
          yield* ensureOrganizationMember(
            organizationId,
            input.completedByUserId
          );
        }

        const values: Record<string, unknown> = {
          blocked_reason:
            input.status === "blocked" ? (input.blockedReason ?? null) : null,
          completed_by_user_id:
            input.status === "completed"
              ? (input.completedByUserId ?? null)
              : null,
          status: input.status,
          updated_at: new Date(),
        };

        if (input.status === "completed") {
          values.completed_at =
            input.completedAt === undefined
              ? new Date()
              : parseIsoDateTime(input.completedAt);
        } else {
          values.completed_at = null;
        }

        const rows = yield* sql<WorkItemRow>`
          update work_items
          set ${sql.update(values)}
          where organization_id = ${organizationId}
            and id = ${workItemId}
          returning *
        `;

        const [row] = rows;

        if (row === undefined) {
          return Option.none<Job>();
        }

        yield* refreshActiveJobSummaryForSites(organizationId, [
          row.site_id === null ? undefined : decodeSiteId(row.site_id),
        ]);

        return Option.some(yield* mapJobRowWithLabels(organizationId, row));
      });

      const reopen = Effect.fn("JobsRepository.reopen")(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId
      ) {
        const rows = yield* sql<WorkItemRow>`
          update work_items
          set ${sql.update({
            blocked_reason: null,
            completed_at: null,
            completed_by_user_id: null,
            status: "in_progress",
            updated_at: new Date(),
          })}
          where organization_id = ${organizationId}
            and id = ${workItemId}
          returning *
        `;

        const [row] = rows;

        if (row === undefined) {
          return Option.none<Job>();
        }

        yield* refreshActiveJobSummaryForSites(organizationId, [
          row.site_id === null ? undefined : decodeSiteId(row.site_id),
        ]);

        return Option.some(yield* mapJobRowWithLabels(organizationId, row));
      });

      const addComment = Effect.fn("JobsRepository.addComment")(function* (
        input: AddJobCommentRecordInput
      ) {
        yield* ensureWorkItemOrganizationMatches(
          input.organizationId,
          input.workItemId,
          { forUpdate: true }
        );

        yield* ensureCommentAuthorCanReferenceWorkItem(
          input.organizationId,
          input.workItemId,
          input.authorUserId
        );

        return yield* commentsRepository.addForWorkItem(input);
      });

      const addActivity = Effect.fn("JobsRepository.addActivity")(function* (
        input: AddJobActivityRecordInput
      ) {
        yield* ensureWorkItemOrganizationMatches(
          input.organizationId,
          input.workItemId
        );

        if (input.actorUserId !== undefined) {
          yield* ensureOrganizationMember(
            input.organizationId,
            input.actorUserId
          );
        }

        const actorProjection =
          input.actorUserId === undefined
            ? undefined
            : yield* actors.ensureMemberActor({
                organizationId: input.organizationId,
                userId: input.actorUserId,
              });

        const rows = yield* sql<WorkItemActivityRow>`
          insert into work_item_activity ${sql
            .insert({
              actor_id: actorProjection?.actor.id ?? null,
              actor_user_id: input.actorUserId ?? null,
              event_type: input.payload.eventType,
              id: generateActivityId(),
              organization_id: input.organizationId,
              payload: input.payload,
              work_item_id: input.workItemId,
            })
            .returning("*")}
        `;

        const row = yield* getRequiredRow(rows, "inserted work item activity");

        return mapJobActivityRow(row);
      });

      const addVisit = Effect.fn("JobsRepository.addVisit")(function* (
        input: AddJobVisitRecordInput
      ) {
        yield* ensureWorkItemOrganizationMatches(
          input.organizationId,
          input.workItemId
        );
        yield* ensureOrganizationMember(
          input.organizationId,
          input.authorUserId,
          { forUpdate: true }
        );

        const rows = yield* sql<WorkItemVisitRow>`
          insert into work_item_visits ${sql
            .insert({
              author_user_id: input.authorUserId,
              duration_minutes: input.durationMinutes,
              id: generateVisitId(),
              note: input.note,
              organization_id: input.organizationId,
              visit_date: input.visitDate,
              work_item_id: input.workItemId,
            })
            .returning("*")}
        `;

        const row = yield* getRequiredRow(rows, "inserted work item visit");

        return mapJobVisitRow(row);
      });

      return {
        addActivity,
        addComment,
        addVisit,
        attachCollaborator,
        create,
        findById,
        findByIdForUpdate,
        findUserCollaboratorGrant,
        getDetail,
        getHomeDashboardSummary,
        list,
        listProximityCandidates,
        listAccessibleWorkItemIdsForUser,
        listCollaborators,
        listExternalMemberOptions,
        listExternalScopedOptions,
        listMemberOptions,
        listOrganizationActivity,
        linkSiteContact,
        patch,
        removeCollaborator,
        reopen,
        transition,
        updateCollaborator,
        withTransaction,
      };
    }),
  }
) {
  static readonly addActivity = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["addActivity"]
    >
  ) => JobsRepository.use((service) => service.addActivity(...args));
  static readonly addComment = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["addComment"]
    >
  ) => JobsRepository.use((service) => service.addComment(...args));
  static readonly addVisit = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["addVisit"]
    >
  ) => JobsRepository.use((service) => service.addVisit(...args));
  static readonly attachCollaborator = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["attachCollaborator"]
    >
  ) => JobsRepository.use((service) => service.attachCollaborator(...args));
  static readonly create = (
    ...args: Parameters<Context.Service.Shape<typeof JobsRepository>["create"]>
  ) => JobsRepository.use((service) => service.create(...args));
  static readonly findUserCollaboratorGrant = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["findUserCollaboratorGrant"]
    >
  ) =>
    JobsRepository.use((service) => service.findUserCollaboratorGrant(...args));
  static readonly getDetail = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["getDetail"]
    >
  ) => JobsRepository.use((service) => service.getDetail(...args));
  static readonly getHomeDashboardSummary = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["getHomeDashboardSummary"]
    >
  ) =>
    JobsRepository.use((service) => service.getHomeDashboardSummary(...args));
  static readonly linkSiteContact = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["linkSiteContact"]
    >
  ) => JobsRepository.use((service) => service.linkSiteContact(...args));
  static readonly list = (
    ...args: Parameters<Context.Service.Shape<typeof JobsRepository>["list"]>
  ) => JobsRepository.use((service) => service.list(...args));
  static readonly listProximityCandidates = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["listProximityCandidates"]
    >
  ) =>
    JobsRepository.use((service) => service.listProximityCandidates(...args));
  static readonly listAccessibleWorkItemIdsForUser = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof JobsRepository
      >["listAccessibleWorkItemIdsForUser"]
    >
  ) =>
    JobsRepository.use((service) =>
      service.listAccessibleWorkItemIdsForUser(...args)
    );
  static readonly listCollaborators = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["listCollaborators"]
    >
  ) => JobsRepository.use((service) => service.listCollaborators(...args));
  static readonly listExternalMemberOptions = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["listExternalMemberOptions"]
    >
  ) =>
    JobsRepository.use((service) => service.listExternalMemberOptions(...args));
  static readonly listOrganizationActivity = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["listOrganizationActivity"]
    >
  ) =>
    JobsRepository.use((service) => service.listOrganizationActivity(...args));
  static readonly listMemberOptions = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["listMemberOptions"]
    >
  ) => JobsRepository.use((service) => service.listMemberOptions(...args));
  static readonly listExternalScopedOptions = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["listExternalScopedOptions"]
    >
  ) =>
    JobsRepository.use((service) => service.listExternalScopedOptions(...args));
  static readonly patch = (
    ...args: Parameters<Context.Service.Shape<typeof JobsRepository>["patch"]>
  ) => JobsRepository.use((service) => service.patch(...args));
  static readonly removeCollaborator = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["removeCollaborator"]
    >
  ) => JobsRepository.use((service) => service.removeCollaborator(...args));
  static readonly reopen = (
    ...args: Parameters<Context.Service.Shape<typeof JobsRepository>["reopen"]>
  ) => JobsRepository.use((service) => service.reopen(...args));
  static readonly transition = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["transition"]
    >
  ) => JobsRepository.use((service) => service.transition(...args));
  static readonly updateCollaborator = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["updateCollaborator"]
    >
  ) => JobsRepository.use((service) => service.updateCollaborator(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    JobsRepository,
    JobsRepository.make
  );
  static readonly Default = JobsRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(CommentsRepository.Default),
    Layer.provide(ProductActivityActorsRepository.Default)
  );
}

export class ContactsRepository extends Context.Service<ContactsRepository>()(
  "@ceird/domains/jobs/ContactsRepository",
  {
    make: Effect.gen(function* ContactsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;
      const { db } = yield* DomainDrizzle;

      const findById = Effect.fn("ContactsRepository.findById")(function* (
        organizationId: OrganizationId,
        contactId: ContactId
      ) {
        const rows = yield* db
          .select({ id: contactTable.id })
          .from(contactTable)
          .where(
            and(
              eq(contactTable.organizationId, organizationId),
              eq(contactTable.id, contactId),
              isNull(contactTable.archivedAt)
            )
          )
          .limit(1)
          .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

        return Option.fromNullishOr(rows[0]?.id).pipe(
          Option.map(decodeContactId)
        );
      });

      // Keep contact creation raw while write paths still use Effect SQL.
      const create = Effect.fn("ContactsRepository.create")(function* (
        input: CreateContactRecordInput
      ) {
        const values: Record<string, unknown> = {
          id: generateContactId(),
          name: input.name,
          organization_id: input.organizationId,
        };

        if (input.email !== undefined) {
          values.email = input.email;
        }

        if (input.phone !== undefined) {
          values.phone = input.phone;
        }

        if (input.notes !== undefined) {
          values.notes = input.notes;
        }

        const rows = yield* sql<IdRow>`
          insert into contacts ${sql.insert(values).returning("id")}
        `;

        const row = yield* getRequiredRow(rows, "inserted contact id");

        return decodeContactId(row.id);
      });

      const listOptions = Effect.fn("ContactsRepository.listOptions")(
        function* (organizationId: OrganizationId) {
          const rows = yield* db
            .select(jobContactOptionFromSiteContactSelection)
            .from(contactTable)
            .leftJoin(
              siteContact,
              and(
                eq(siteContact.contactId, contactTable.id),
                eq(siteContact.organizationId, contactTable.organizationId)
              )
            )
            .where(
              and(
                eq(contactTable.organizationId, organizationId),
                isNull(contactTable.archivedAt)
              )
            )
            .orderBy(
              asc(contactTable.name),
              asc(contactTable.id),
              asc(siteContact.siteId)
            )
            .pipe(Effect.catchTag("EffectDrizzleQueryError", Effect.fail));

          return mapJobContactOptions(rows);
        }
      );

      return {
        create,
        findById,
        listOptions,
      };
    }),
  }
) {
  static readonly create = (
    ...args: Parameters<
      Context.Service.Shape<typeof ContactsRepository>["create"]
    >
  ) => ContactsRepository.use((service) => service.create(...args));
  static readonly findById = (
    ...args: Parameters<
      Context.Service.Shape<typeof ContactsRepository>["findById"]
    >
  ) => ContactsRepository.use((service) => service.findById(...args));
  static readonly listOptions = (
    ...args: Parameters<
      Context.Service.Shape<typeof ContactsRepository>["listOptions"]
    >
  ) => ContactsRepository.use((service) => service.listOptions(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    ContactsRepository,
    ContactsRepository.make
  );
  static readonly Default = ContactsRepository.DefaultWithoutDependencies;
}

export class JobLabelAssignmentsRepository extends Context.Service<JobLabelAssignmentsRepository>()(
  "@ceird/domains/jobs/JobLabelAssignmentsRepository",
  {
    make: Effect.gen(function* JobLabelAssignmentsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;
      // Label assignment stays raw because it combines label reads, existence
      // checks, inserts, and lock semantics as one write workflow.

      const lookupWorkItemOrganization = Effect.fn(
        "JobLabelAssignmentsRepository.lookupWorkItemOrganization"
      )(function* (workItemId: WorkItemId) {
        const rows = yield* sql<{ readonly organization_id: string }>`
          select organization_id
          from work_items
          where id = ${workItemId}
          limit 1
        `;

        return Option.fromNullishOr(rows[0]?.organization_id).pipe(
          Option.map(decodeOrganizationId)
        );
      });

      const ensureWorkItemOrganizationMatches = Effect.fn(
        "JobLabelAssignmentsRepository.ensureWorkItemOrganizationMatches"
      )(function* (organizationId: OrganizationId, workItemId: WorkItemId) {
        const workItemOrganizationId =
          yield* lookupWorkItemOrganization(workItemId);

        if (Option.isNone(workItemOrganizationId)) {
          return yield* Effect.fail(
            new JobNotFoundError({
              message: "Job does not exist",
              workItemId,
            })
          );
        }

        if (workItemOrganizationId.value !== organizationId) {
          return yield* Effect.fail(
            new WorkItemOrganizationMismatchError({
              message: "Job does not belong to the organization",
              organizationId,
              workItemId,
            })
          );
        }

        return workItemId;
      });

      const findActiveLabel = Effect.fn(
        "JobLabelAssignmentsRepository.findActiveLabel"
      )(function* (organizationId: OrganizationId, labelId: LabelId) {
        const rows = yield* sql<LabelRow>`
          select *
          from labels
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          limit 1
        `;

        return Option.fromNullishOr(rows[0]).pipe(Option.map(mapLabelRow));
      });

      const getActiveLabelOrFail = Effect.fn(
        "JobLabelAssignmentsRepository.getActiveLabelOrFail"
      )(function* (organizationId: OrganizationId, labelId: LabelId) {
        const label = yield* findActiveLabel(organizationId, labelId).pipe(
          Effect.map(Option.getOrUndefined)
        );

        if (label === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        return label;
      });

      const assignToJob = Effect.fn(
        "JobLabelAssignmentsRepository.assignToJob"
      )(function* (input: AssignLabelRecordInput) {
        const rows = yield* sql<LabelAssignmentRow>`
            with active_label as (
              select *
              from labels
              where organization_id = ${input.organizationId}
                and id = ${input.labelId}
                and archived_at is null
              for share
            ),
            organization_work_item as (
              select id
              from work_items
              where organization_id = ${input.organizationId}
                and id = ${input.workItemId}
            ),
            inserted_label as (
              insert into work_item_labels (
                work_item_id,
                label_id,
                organization_id
              )
              select
                organization_work_item.id,
                active_label.id,
                active_label.organization_id
              from active_label
              join organization_work_item on true
              on conflict do nothing
              returning label_id
            )
            select
              active_label.*,
              organization_work_item.id as work_item_id,
              (select count(*) from inserted_label)::integer as inserted_count
            from active_label
            left join organization_work_item on true
            limit 1
          `;

        const [row] = rows;

        if (row === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId: input.labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        if (row.work_item_id === null) {
          yield* ensureWorkItemOrganizationMatches(
            input.organizationId,
            input.workItemId
          );
        }

        return {
          changed: row.inserted_count > 0,
          label: mapLabelRow(row),
        };
      });

      const removeFromJob = Effect.fn(
        "JobLabelAssignmentsRepository.removeFromJob"
      )(function* (input: AssignLabelRecordInput) {
        const label = yield* getActiveLabelOrFail(
          input.organizationId,
          input.labelId
        );
        yield* ensureWorkItemOrganizationMatches(
          input.organizationId,
          input.workItemId
        );

        const rows = yield* sql<IdRow>`
          delete from work_item_labels
          using labels, work_items
          where work_item_labels.label_id = labels.id
            and work_item_labels.work_item_id = work_items.id
            and labels.organization_id = ${input.organizationId}
            and labels.id = ${input.labelId}
            and work_items.organization_id = ${input.organizationId}
            and work_items.id = ${input.workItemId}
          returning work_item_labels.label_id as id
        `;

        return {
          changed: rows.length > 0,
          label,
        };
      });

      return {
        assignToJob,
        removeFromJob,
      };
    }),
  }
) {
  static readonly assignToJob = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobLabelAssignmentsRepository>["assignToJob"]
    >
  ) =>
    JobLabelAssignmentsRepository.use((service) =>
      service.assignToJob(...args)
    );
  static readonly removeFromJob = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof JobLabelAssignmentsRepository
      >["removeFromJob"]
    >
  ) =>
    JobLabelAssignmentsRepository.use((service) =>
      service.removeFromJob(...args)
    );
  static readonly DefaultWithoutDependencies = Layer.effect(
    JobLabelAssignmentsRepository,
    JobLabelAssignmentsRepository.make
  );
  static readonly Default =
    JobLabelAssignmentsRepository.DefaultWithoutDependencies;
}

export const JobsRepositoriesLive = Layer.mergeAll(
  CommentsRepository.Default,
  JobsRepository.Default,
  ContactsRepository.Default,
  JobLabelAssignmentsRepository.Default
);

export const withJobsTransaction = <Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>
) =>
  Effect.gen(function* () {
    const repository = yield* JobsRepository;

    return yield* repository.withTransaction(effect);
  });

function mapJobRow(row: WorkItemRow, labels: readonly Label[] = []): Job {
  return decodeJob({
    assigneeId: nullableToUndefined(row.assignee_id),
    blockedReason: nullableToUndefined(row.blocked_reason),
    completedAt:
      row.completed_at === null ? undefined : row.completed_at.toISOString(),
    completedByUserId: nullableToUndefined(row.completed_by_user_id),
    contactId: nullableToUndefined(row.contact_id),
    coordinatorId: nullableToUndefined(row.coordinator_id),
    createdAt: row.created_at.toISOString(),
    createdByUserId: row.created_by_user_id,
    id: row.id,
    kind: row.kind,
    labels,
    priority: row.priority,
    siteId: nullableToUndefined(row.site_id),
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapJobListItemRow(row: WorkItemRow, labels: readonly Label[] = []) {
  return decodeJobListItem({
    assigneeId: nullableToUndefined(row.assignee_id),
    contactId: nullableToUndefined(row.contact_id),
    coordinatorId: nullableToUndefined(row.coordinator_id),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    kind: row.kind,
    labels,
    priority: row.priority,
    siteId: nullableToUndefined(row.site_id),
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapHomeDashboardJobSummaryRow(row: HomeDashboardJobSummaryRow) {
  return {
    assigneeName: nullableToUndefined(row.assignee_name),
    id: row.id,
    priority: row.priority,
    siteName: nullableToUndefined(row.site_name),
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapHomeDashboardSiteSummaryRow(row: HomeDashboardSiteSummaryRow) {
  return {
    activeJobCount: row.active_job_count,
    addressLine1: nullableToUndefined(row.address_line_1),
    addressLine2: nullableToUndefined(row.address_line_2),
    county: nullableToUndefined(row.county),
    displayLocation: row.display_location ?? "",
    eircode: nullableToUndefined(row.eircode),
    formattedAddress: nullableToUndefined(row.formatted_address),
    id: row.id,
    locationResolvedAt: nullableToUndefined(
      row.location_resolved_at?.toISOString()
    ),
    name: row.name,
    rawLocationInput: nullableToUndefined(row.raw_location_input),
    town: nullableToUndefined(row.town),
  };
}

function mapJobProximitySiteOptionRow(
  row: JobProximityCandidateRow,
  labels: readonly Label[] = []
) {
  return mapSiteOptionRow(
    {
      access_notes: row.site_access_notes,
      address_components: row.site_address_components,
      address_line_1: row.site_address_line_1,
      address_line_2: row.site_address_line_2,
      country: row.site_country,
      county: row.site_county,
      display_location: row.site_display_location ?? "",
      eircode: row.site_eircode,
      formatted_address: row.site_formatted_address,
      google_place_id: row.site_google_place_id,
      id: row.site_id_value ?? "",
      latitude: row.site_latitude,
      location_provider: row.site_location_provider,
      location_resolved_at: row.site_location_resolved_at,
      location_status: row.site_location_status ?? "unverified",
      longitude: row.site_longitude,
      name: row.site_name ?? "",
      raw_location_input: row.site_raw_location_input,
      town: row.site_town,
      updated_at: row.site_updated_at ?? row.updated_at,
    },
    labels
  );
}

function addExcluded(
  excluded: Map<ProximityExcludedCount["reason"], number>,
  reason: ProximityExcludedCount["reason"],
  count: number
) {
  if (count <= 0) {
    return;
  }

  excluded.set(reason, (excluded.get(reason) ?? 0) + count);
}

function mapJobCollaboratorRow(row: WorkItemCollaboratorRow): JobCollaborator {
  return decodeJobCollaborator({
    accessLevel: row.access_level,
    createdAt: row.created_at.toISOString(),
    id: decodeJobCollaboratorId(row.id),
    roleLabel: row.role_label,
    subjectType: row.subject_type,
    updatedAt: row.updated_at.toISOString(),
    userId: nullableToUndefined(row.user_id),
    workItemId: decodeWorkItemId(row.work_item_id),
  });
}

function mapLabelRow(row: LabelRow): Label {
  return decodeLabel({
    archivedAt: row.archived_at?.toISOString() ?? null,
    color: row.color,
    createdAt: row.created_at.toISOString(),
    description: row.description,
    id: decodeLabelId(row.id),
    name: row.name,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapJobMemberOptionRow(row: JobMemberOptionRow): JobMemberOption {
  return decodeJobMemberOption({
    id: row.id,
    name: normalizeOptionName(row.name, row.email),
  });
}

function mapJobExternalMemberOptionRow(
  row: JobMemberOptionRow
): JobExternalMemberOption {
  return {
    email: row.email,
    id: decodeUserId(row.id),
    name: normalizeOptionName(row.name, row.email),
  };
}

function mapJobContactOptions(
  rows: readonly JobContactOptionRow[]
): readonly JobContactOption[] {
  const contacts = new Map<
    string,
    {
      readonly email?: string;
      readonly id: string;
      readonly name: string;
      readonly phone?: string;
      readonly siteIds: SiteId[];
    }
  >();

  for (const row of rows) {
    const existing = contacts.get(row.id);

    if (existing === undefined) {
      contacts.set(row.id, {
        email: nullableToUndefined(row.email),
        id: row.id,
        name: row.name,
        phone: nullableToUndefined(row.phone),
        siteIds: row.site_id === null ? [] : [decodeSiteId(row.site_id)],
      });
      continue;
    }

    if (row.site_id !== null) {
      existing.siteIds.push(decodeSiteId(row.site_id));
    }
  }

  return [...contacts.values()].map((contact) =>
    decodeJobContactOption(contact)
  );
}

function mapJobContactDetailRow(row: JobContactDetailRow): JobContactDetail {
  return decodeJobContactDetail({
    email: nullableToUndefined(row.email),
    id: row.id,
    name: row.name,
    notes: nullableToUndefined(row.notes),
    phone: nullableToUndefined(row.phone),
  });
}

function mapJobActivityRow(row: WorkItemActivityRow): JobActivity {
  return decodeJobActivity({
    actorUserId: nullableToUndefined(row.actor_user_id),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    payload: decodeJobActivityPayload(row.payload),
    workItemId: row.work_item_id,
  });
}

function mapOrganizationActivityRow(
  row: OrganizationActivityRow
): OrganizationActivityItem {
  return decodeOrganizationActivityItem({
    actor: mapProductActorProjection(row),
    createdAt: row.created_at.toISOString(),
    eventType: row.event_type,
    id: row.id,
    jobTitle: row.job_title,
    payload: decodeJobActivityPayload(row.payload),
    workItemId: row.work_item_id,
  });
}

function mapProductActorProjection(row: OrganizationActivityRow) {
  if (
    row.actor_id === null ||
    row.actor_kind === null ||
    row.actor_display_name === null
  ) {
    return;
  }

  return {
    displayDetail: nullableToUndefined(row.actor_display_detail),
    displayName: row.actor_display_name,
    id: row.actor_id,
    kind: row.actor_kind,
    route:
      row.actor_route_href === null || row.actor_route_label === null
        ? undefined
        : {
            href: row.actor_route_href,
            label: row.actor_route_label,
          },
  };
}

function mapJobVisitRow(row: WorkItemVisitRow): JobVisit {
  return decodeJobVisit({
    authorUserId: row.author_user_id,
    createdAt: row.created_at.toISOString(),
    durationMinutes: row.duration_minutes,
    id: row.id,
    note: row.note,
    visitDate: formatPgDate(row.visit_date),
    workItemId: row.work_item_id,
  });
}

function encodeCursor(
  row: Pick<WorkItemRow, "id" | "updated_at">
): JobListCursor {
  return encodeJsonCursor(
    {
      id: decodeWorkItemId(row.id),
      updatedAt: row.updated_at.toISOString(),
    } satisfies JobCursorState,
    decodeJobListCursor
  );
}

function decodeCursor(cursor: JobListCursor): {
  readonly id: WorkItemId;
  readonly updatedAt: Date;
} {
  const value = decodeJsonCursor(cursor, decodeJobCursorState);

  return {
    id: value.id,
    updatedAt: new Date(value.updatedAt),
  };
}

function encodeOrganizationActivityCursor(
  row: Pick<OrganizationActivityRow, "id" | "created_at">
): OrganizationActivityCursor {
  return encodeJsonCursor(
    {
      id: decodeActivityId(row.id),
      createdAt: row.created_at.toISOString(),
    } satisfies OrganizationActivityCursorState,
    decodeOrganizationActivityCursor
  );
}

function decodeOrganizationActivityCursorValue(
  cursor: OrganizationActivityCursor
): OrganizationActivityCursorState {
  return decodeJsonCursor(cursor, decodeOrganizationActivityCursorState);
}

function nullableToUndefined<Value>(
  value: Value | null | undefined
): Value | undefined {
  return value === null ? undefined : value;
}

function isDefined<Value>(value: Value | undefined): value is Value {
  return value !== undefined;
}

function normalizeOptionName(value: string | null, fallback: string): string {
  if (value !== null && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

function mapJobCollaboratorConflict(
  error: SqlError.SqlError,
  input: AttachJobCollaboratorRecordInput
): Effect.Effect<never, JobCollaboratorConflictError | SqlError.SqlError> {
  if (
    isUniqueConstraintError(error, "work_item_collaborators_user_unique_idx")
  ) {
    return Effect.fail(
      new JobCollaboratorConflictError({
        message: "User is already a collaborator on the job",
        userId: input.userId,
        workItemId: input.workItemId,
      })
    );
  }

  return Effect.fail(error);
}

function isUniqueConstraintError(
  error: unknown,
  constraintName: string
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "constraint" in error.cause &&
    error.cause.constraint === constraintName
  );
}

function getRequiredRow<Value>(
  rows: readonly Value[],
  label: string
): Effect.Effect<Value> {
  const [row] = rows;

  if (row === undefined) {
    return Effect.die(new Error(`Expected ${label} row to be returned`));
  }

  return Effect.succeed(row);
}

function parseIsoDateTime(value: string): Date {
  return new Date(value);
}

function isoDateToUtcStartDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function getExclusiveDateUpperBound(value: string): Date {
  const start = isoDateToUtcStartDate(value);

  return new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate() + 1
    )
  );
}

function formatPgDate(value: Date | string): string {
  if (typeof value === "string") {
    return value;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function clampJobListLimit(limit: number): number {
  return Math.min(100, Math.max(1, limit));
}
