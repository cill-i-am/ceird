/* oxlint-disable eslint/max-classes-per-file */

import { SqlClient } from "@effect/sql";
import type { SqlError } from "@effect/sql";
import {
  ActivityId as ActivityIdSchema,
  ContactId as ContactIdSchema,
  ContactNotFoundError,
  IsoDateTimeString as IsoDateTimeStringSchema,
  JobActivityPayloadSchema,
  JobActivitySchema,
  JobCommentSchema,
  JobCostLineSchema,
  JobCostLineQuantitySchema,
  JobCostSummaryLimitExceededError,
  JobContactDetailSchema,
  JobContactOptionSchema,
  JobDetailSchema,
  JobLabelId as JobLabelIdSchema,
  JobLabelNameSchema,
  JobLabelNameConflictError,
  JobLabelNotFoundError,
  JobLabelSchema,
  JobLabelsResponseSchema,
  JobListCursor as JobListCursorSchema,
  JobListCursorInvalidError,
  JobListItemSchema,
  JobMemberOptionSchema,
  OrganizationActivityCursorInvalidError,
  JobListResponseSchema,
  JobNotFoundError,
  JobSchema,
  JobSiteOptionSchema,
  JobVisitSchema,
  OrganizationActivityCursor as OrganizationActivityCursorSchema,
  OrganizationActivityItemSchema,
  OrganizationActivityListResponseSchema,
  OrganizationId as OrganizationIdSchema,
  OrganizationMemberNotFoundError,
  RATE_CARD_NOT_FOUND_ERROR_TAG,
  RateCardNotFoundError,
  RateCardSchema,
  ServiceAreaNotFoundError,
  ServiceAreaOptionSchema,
  ServiceAreaSchema,
  SiteNotFoundError,
  SiteId as SiteIdSchema,
  WorkItemId as WorkItemIdSchema,
  calculateJobCostLineTotalMinor,
  calculateJobCostSummary,
  normalizeJobLabelName,
} from "@task-tracker/jobs-core";
import type {
  ActivityIdType as ActivityId,
  ContactIdType as ContactId,
  Job,
  JobActivity,
  JobActivityPayload,
  JobComment,
  JobCostLine,
  JobCostLineType,
  JobContactDetail,
  JobContactOption,
  JobDetail,
  JobExternalReference,
  JobKind,
  JobLabel,
  JobLabelIdType as JobLabelId,
  JobLabelName,
  JobListCursorType as JobListCursor,
  JobListQuery,
  JobMemberOption,
  JobPriority,
  RateCard,
  RateCardIdType as RateCardId,
  RateCardLineInput,
  JobStatus,
  JobSiteOption,
  JobTitle,
  JobVisit,
  IsoDateTimeStringType as IsoDateTimeString,
  OrganizationActivityCursorType as OrganizationActivityCursor,
  OrganizationActivityItem,
  OrganizationActivityListResponse,
  OrganizationActivityQuery,
  OrganizationIdType as OrganizationId,
  ServiceArea,
  ServiceAreaIdType as ServiceAreaId,
  ServiceAreaOption,
  SiteCountry,
  SiteGeocodingProvider,
  SiteIdType as SiteId,
  UserIdType as UserId,
  WorkItemIdType as WorkItemId,
} from "@task-tracker/jobs-core";
import { Config, Effect, Layer, Option, Schema } from "effect";

import { WorkItemOrganizationMismatchError } from "./errors.js";
import {
  generateActivityId,
  generateCommentId,
  generateContactId,
  generateCostLineId,
  generateJobLabelId,
  generateRateCardId,
  generateRateCardLineId,
  generateServiceAreaId,
  generateSiteId,
  generateVisitId,
  generateWorkItemId,
} from "./id-generation.js";

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
  readonly external_reference: string | null;
  readonly id: string;
  readonly kind: string;
  readonly organization_id: string;
  readonly priority: string;
  readonly site_id: string | null;
  readonly status: string;
  readonly title: string;
  readonly updated_at: Date;
}

interface WorkItemCommentRow {
  readonly author_user_id: string;
  readonly body: string;
  readonly created_at: Date;
  readonly id: string;
  readonly work_item_id: string;
}

interface WorkItemActivityRow {
  readonly actor_user_id: string | null;
  readonly created_at: Date;
  readonly event_type: string;
  readonly id: string;
  readonly organization_id: string;
  readonly payload: unknown;
  readonly work_item_id: string;
}

interface OrganizationActivityRow extends WorkItemActivityRow {
  readonly actor_email: string | null;
  readonly actor_name: string | null;
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

interface JobLabelRow {
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly id: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly organization_id: string;
  readonly updated_at: Date;
}

interface JobLabelAssignmentRow extends JobLabelRow {
  readonly inserted_count: number;
  readonly work_item_id: string | null;
}

interface ArchivedJobLabel {
  readonly label: JobLabel;
  readonly removedWorkItemIds: readonly WorkItemId[];
}

interface WorkItemLabelRow {
  readonly created_at: Date;
  readonly label_id: string;
  readonly name: string;
  readonly updated_at: Date;
  readonly work_item_id: string;
}

interface WorkItemCostLineRow {
  readonly author_user_id: string;
  readonly created_at: Date;
  readonly description: string;
  readonly id: string;
  readonly organization_id: string;
  readonly quantity: string;
  readonly tax_rate_basis_points: number | null;
  readonly type: string;
  readonly unit_price_minor: number;
  readonly work_item_id: string;
}

interface WorkItemCostLineSubtotalRow {
  readonly subtotal_minor: string | null;
}

interface IdRow {
  readonly id: string;
}

interface JobMemberOptionRow {
  readonly email: string;
  readonly id: string;
  readonly name: string | null;
}

interface ServiceAreaRow {
  readonly description: string | null;
  readonly id: string;
  readonly name: string;
}

interface ServiceAreaOptionRow {
  readonly id: string;
  readonly name: string;
}

interface RateCardRow {
  readonly created_at: Date;
  readonly id: string;
  readonly name: string;
  readonly updated_at: Date;
}

interface RateCardLineRow {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly position: number;
  readonly rate_card_id: string;
  readonly unit: string;
  readonly value: number | string;
}

interface JobSiteOptionRow {
  readonly access_notes: string | null;
  readonly address_line_1: string;
  readonly address_line_2: string | null;
  readonly country: string;
  readonly county: string;
  readonly eircode: string | null;
  readonly geocoded_at: Date;
  readonly geocoding_provider: string;
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly service_area_id: string | null;
  readonly service_area_name: string | null;
  readonly town: string | null;
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

export interface CreateJobRecordInput {
  readonly assigneeId?: UserId;
  readonly blockedReason?: string;
  readonly completedAt?: string;
  readonly completedByUserId?: UserId;
  readonly contactId?: ContactId;
  readonly coordinatorId?: UserId;
  readonly createdByUserId: UserId;
  readonly externalReference?: JobExternalReference;
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
  readonly externalReference?: JobExternalReference | null;
  readonly priority?: JobPriority;
  readonly siteId?: SiteId | null;
  readonly title?: JobTitle;
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
  readonly workItemId: WorkItemId;
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

export interface AddJobCostLineRecordInput {
  readonly authorUserId: UserId;
  readonly description: string;
  readonly organizationId: OrganizationId;
  readonly quantity: number;
  readonly taxRateBasisPoints?: number;
  readonly type: JobCostLineType;
  readonly unitPriceMinor: number;
  readonly workItemId: WorkItemId;
}

export interface CreateSiteRecordInput {
  readonly accessNotes?: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly country: SiteCountry;
  readonly county: string;
  readonly eircode?: string;
  readonly geocodedAt: IsoDateTimeString;
  readonly geocodingProvider: SiteGeocodingProvider;
  readonly latitude: number;
  readonly name: string;
  readonly organizationId: OrganizationId;
  readonly serviceAreaId?: ServiceAreaId;
  readonly longitude: number;
  readonly town?: string;
}

export interface UpdateSiteRecordInput {
  readonly accessNotes?: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly country: SiteCountry;
  readonly county: string;
  readonly eircode?: string;
  readonly geocodedAt: IsoDateTimeString;
  readonly geocodingProvider: SiteGeocodingProvider;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
  readonly serviceAreaId?: ServiceAreaId;
  readonly town?: string;
}

export interface CreateServiceAreaRecordInput {
  readonly description?: string;
  readonly name: string;
  readonly organizationId: OrganizationId;
}

export interface UpdateServiceAreaRecordInput {
  readonly description?: string | null;
  readonly name?: string;
}

export interface CreateRateCardRecordInput {
  readonly lines: readonly RateCardLineInput[];
  readonly name: string;
  readonly organizationId: OrganizationId;
}

export interface UpdateRateCardRecordInput {
  readonly lines?: readonly RateCardLineInput[];
  readonly name?: string;
}

export interface CreateContactRecordInput {
  readonly email?: string;
  readonly name: string;
  readonly notes?: string;
  readonly organizationId: OrganizationId;
  readonly phone?: string;
}

export interface LinkSiteContactInput {
  readonly contactId: ContactId;
  readonly isPrimary?: boolean;
  readonly organizationId: OrganizationId;
  readonly siteId: SiteId;
}

export interface CreateJobLabelRecordInput {
  readonly name: JobLabelName;
  readonly organizationId: OrganizationId;
}

export interface UpdateJobLabelRecordInput {
  readonly name: JobLabelName;
}

export interface AssignJobLabelRecordInput {
  readonly labelId: JobLabelId;
  readonly organizationId: OrganizationId;
  readonly workItemId: WorkItemId;
}

export interface JobLabelAssignmentResult {
  readonly changed: boolean;
  readonly label: JobLabel;
}

export type ArchiveJobLabelResult = ArchivedJobLabel;

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
const decodeJobComment = Schema.decodeUnknownSync(JobCommentSchema);
const decodeJobCostLine = Schema.decodeUnknownSync(JobCostLineSchema);
const decodeJobCostLineQuantity = Schema.decodeUnknownSync(
  JobCostLineQuantitySchema
);
const decodeJobContactDetail = Schema.decodeUnknownSync(JobContactDetailSchema);
const decodeJobDetail = Schema.decodeUnknownSync(JobDetailSchema);
const decodeJobLabel = Schema.decodeUnknownSync(JobLabelSchema);
const decodeJobLabelId = Schema.decodeUnknownSync(JobLabelIdSchema);
const decodeJobLabelName = Schema.decodeUnknownSync(JobLabelNameSchema);
const decodeJobLabelsResponse = Schema.decodeUnknownSync(
  JobLabelsResponseSchema
);
const decodeJobListCursor = Schema.decodeUnknownSync(JobListCursorSchema);
const decodeJobListItem = Schema.decodeUnknownSync(JobListItemSchema);
const decodeJobMemberOption = Schema.decodeUnknownSync(JobMemberOptionSchema);
const decodeJobContactOption = Schema.decodeUnknownSync(JobContactOptionSchema);
const decodeJobListResponse = Schema.decodeUnknownSync(JobListResponseSchema);
const decodeJobSiteOption = Schema.decodeUnknownSync(JobSiteOptionSchema);
const decodeJobVisit = Schema.decodeUnknownSync(JobVisitSchema);
const decodeRateCard = Schema.decodeUnknownSync(RateCardSchema);
const decodeServiceArea = Schema.decodeUnknownSync(ServiceAreaSchema);
const decodeServiceAreaOption = Schema.decodeUnknownSync(
  ServiceAreaOptionSchema
);
const decodeSiteId = Schema.decodeUnknownSync(SiteIdSchema);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemIdSchema);
const decodeIsoDateTimeString = Schema.decodeUnknownSync(
  IsoDateTimeStringSchema
);
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

export class JobsRepository extends Effect.Service<JobsRepository>()(
  "@task-tracker/domains/jobs/JobsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* JobsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;
      const defaultListLimit = yield* Config.integer(
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

        return Option.fromNullable(rows[0]?.organization_id).pipe(
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
        }

        if (input.coordinatorId !== undefined && input.coordinatorId !== null) {
          yield* ensureOrganizationMember(organizationId, input.coordinatorId);
        }
      });

      const listLabelsForWorkItems = Effect.fn(
        "JobsRepository.listLabelsForWorkItems"
      )(function* (
        organizationId: OrganizationId,
        workItemIds: readonly WorkItemId[]
      ) {
        if (workItemIds.length === 0) {
          return new Map<string, readonly JobLabel[]>();
        }

        const rows = yield* sql<WorkItemLabelRow>`
          select
            work_item_labels.work_item_id,
            work_item_labels.label_id,
            job_labels.created_at,
            job_labels.name,
            job_labels.updated_at
          from work_item_labels
          join job_labels on job_labels.id = work_item_labels.label_id
          join work_items on work_items.id = work_item_labels.work_item_id
          where job_labels.organization_id = ${organizationId}
            and work_items.organization_id = ${organizationId}
            and work_item_labels.work_item_id in ${sql.in(workItemIds)}
            and job_labels.archived_at is null
          order by job_labels.name asc, job_labels.id asc
        `;

        const labelsByWorkItemId = new Map<string, JobLabel[]>();

        for (const row of rows) {
          const labels = labelsByWorkItemId.get(row.work_item_id) ?? [];
          labels.push(
            decodeJobLabel({
              createdAt: row.created_at.toISOString(),
              id: decodeJobLabelId(row.label_id),
              name: row.name,
              updatedAt: row.updated_at.toISOString(),
            })
          );
          labelsByWorkItemId.set(row.work_item_id, labels);
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
        query: JobListQuery
      ) {
        const limit = clampJobListLimit(query.limit ?? boundedDefaultListLimit);
        const clauses = [sql`work_items.organization_id = ${organizationId}`];
        const labelFilterJoin =
          query.labelId === undefined
            ? sql``
            : sql`
              join work_item_labels as filter_labels on filter_labels.work_item_id = work_items.id
              join job_labels as filter_job_labels on filter_job_labels.id = filter_labels.label_id
            `;
        const sitesJoin =
          query.serviceAreaId === undefined
            ? sql``
            : sql`left join sites on sites.id = work_items.site_id`;

        if (query.labelId !== undefined) {
          clauses.push(
            sql`filter_job_labels.organization_id = ${organizationId}`
          );
          clauses.push(sql`filter_job_labels.id = ${query.labelId}`);
          clauses.push(sql`filter_job_labels.archived_at is null`);
        }

        if (query.status !== undefined) {
          clauses.push(sql`work_items.status = ${query.status}`);
        }

        if (query.assigneeId !== undefined) {
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

        if (query.serviceAreaId !== undefined) {
          clauses.push(sql`sites.service_area_id = ${query.serviceAreaId}`);
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
            work_items.external_reference,
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
          ${labelFilterJoin}
          ${sitesJoin}
          where ${sql.and(clauses)}
          order by work_items.updated_at desc, work_items.id desc
          limit ${limit + 1}
        `;

        const labelsByWorkItemId = yield* listLabelsForWorkItems(
          organizationId,
          rows.slice(0, limit).map((row) => decodeWorkItemId(row.id))
        );
        const items = rows
          .slice(0, limit)
          .map((row) =>
            mapJobListItemRow(row, labelsByWorkItemId.get(row.id) ?? [])
          );
        const nextCursorRow = rows.length > limit ? rows[limit - 1] : undefined;
        const nextCursor =
          nextCursorRow === undefined ? undefined : encodeCursor(nextCursorRow);

        return decodeJobListResponse({ items, nextCursor });
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
            "user".name as actor_name,
            "user".email as actor_email
          from work_item_activity
          join work_items on work_items.id = work_item_activity.work_item_id
          left join "user" on "user".id = work_item_activity.actor_user_id
          where ${sql.and(clauses)}
          order by work_item_activity.created_at desc, work_item_activity.id desc
          limit ${limit + 1}
        `;

        const items = rows.slice(0, limit).map(mapOrganizationActivityRow);
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
          const rows = yield* sql<JobMemberOptionRow>`
          select
            "user".id,
            "user".name,
            "user".email
          from member
          join "user" on "user".id = member.user_id
          where member.organization_id = ${organizationId}
          order by "user".name asc, "user".email asc
        `;

          return rows.map(mapJobMemberOptionRow);
        }
      );

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
        const lockClause =
          options?.forUpdate === true ? sql`for update` : sql``;
        const rows = yield* sql<WorkItemRow>`
          select *
          from work_items
          where organization_id = ${organizationId}
            and id = ${workItemId}
          limit 1
          ${lockClause}
        `;

        return Option.fromNullable(rows[0]).pipe(
          Option.map((row) => mapJobRow(row))
        );
      });

      const getDetail = Effect.fn("JobsRepository.getDetail")(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId
      ) {
        const job = yield* findById(organizationId, workItemId).pipe(
          Effect.map(Option.getOrUndefined)
        );

        if (job === undefined) {
          return Option.none<JobDetail>();
        }

        const [comments, activity, visits, labelsByWorkItemId, costLines] =
          yield* Effect.all([
            sql<WorkItemCommentRow>`
            select *
            from work_item_comments
            where work_item_id = ${workItemId}
            order by created_at asc, id asc
          `,
            sql<WorkItemActivityRow>`
            select *
            from work_item_activity
            where work_item_id = ${workItemId}
            order by created_at desc, id desc
          `,
            sql<WorkItemVisitRow>`
            select *
            from work_item_visits
            where work_item_id = ${workItemId}
            order by visit_date desc, id desc
          `,
            listLabelsForWorkItems(organizationId, [workItemId]),
            sql<WorkItemCostLineRow>`
            select *
            from work_item_cost_lines
            where work_item_id = ${workItemId}
            order by created_at desc, id desc
          `,
          ]);
        const contact =
          job.contactId === undefined
            ? undefined
            : yield* findContactDetailById(organizationId, job.contactId);

        const mappedCostLines = costLines.map(mapJobCostLineRow);

        return Option.some(
          decodeJobDetail({
            activity: activity.map(mapJobActivityRow),
            comments: comments.map(mapJobCommentRow),
            contact,
            costLines: mappedCostLines,
            costSummary: calculateJobCostSummary(mappedCostLines),
            job: {
              ...job,
              labels: labelsByWorkItemId.get(workItemId) ?? [],
            },
            visits: visits.map(mapJobVisitRow),
          })
        );
      });

      const findContactDetailById = Effect.fn(
        "JobsRepository.findContactDetailById"
      )(function* (organizationId: OrganizationId, contactId: ContactId) {
        const rows = yield* sql<JobContactDetailRow>`
          select
            id,
            name,
            email,
            phone,
            notes
          from contacts
          where organization_id = ${organizationId}
            and id = ${contactId}
          limit 1
        `;

        return Option.fromNullable(rows[0]).pipe(
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
          external_reference: input.externalReference ?? null,
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

        return mapJobRow(row);
      });

      const patch = Effect.fn("JobsRepository.patch")(function* (
        organizationId: OrganizationId,
        workItemId: WorkItemId,
        input: PatchJobRecordInput
      ) {
        yield* validateLinkedJobReferences(organizationId, input);

        const values: Record<string, unknown> = {
          updated_at: new Date(),
        };

        if (input.title !== undefined) {
          values.title = input.title;
        }

        if (input.priority !== undefined) {
          values.priority = input.priority;
        }

        if (input.externalReference !== undefined) {
          values.external_reference = input.externalReference;
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

        return row === undefined
          ? Option.none<Job>()
          : Option.some(yield* mapJobRowWithLabels(organizationId, row));
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

        return row === undefined
          ? Option.none<Job>()
          : Option.some(yield* mapJobRowWithLabels(organizationId, row));
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

        return row === undefined
          ? Option.none<Job>()
          : Option.some(yield* mapJobRowWithLabels(organizationId, row));
      });

      const addComment = Effect.fn("JobsRepository.addComment")(function* (
        input: AddJobCommentRecordInput
      ) {
        const workItemOrganizationId = yield* lookupWorkItemOrganization(
          input.workItemId
        );

        if (Option.isNone(workItemOrganizationId)) {
          return yield* Effect.fail(
            new JobNotFoundError({
              message: "Job does not exist",
              workItemId: input.workItemId,
            })
          );
        }

        yield* ensureOrganizationMember(
          workItemOrganizationId.value,
          input.authorUserId,
          { forUpdate: true }
        );

        const rows = yield* sql<WorkItemCommentRow>`
          insert into work_item_comments ${sql
            .insert({
              author_user_id: input.authorUserId,
              body: input.body,
              id: generateCommentId(),
              work_item_id: input.workItemId,
            })
            .returning("*")}
        `;

        const row = yield* getRequiredRow(rows, "inserted work item comment");

        return mapJobCommentRow(row);
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

        const rows = yield* sql<WorkItemActivityRow>`
          insert into work_item_activity ${sql
            .insert({
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

      const addCostLine = Effect.fn("JobsRepository.addCostLine")(function* (
        input: AddJobCostLineRecordInput
      ) {
        return yield* withTransaction(
          Effect.gen(function* () {
            yield* ensureWorkItemOrganizationMatches(
              input.organizationId,
              input.workItemId,
              { forUpdate: true }
            );
            yield* ensureOrganizationMember(
              input.organizationId,
              input.authorUserId,
              {
                forUpdate: true,
              }
            );

            const subtotalRows = yield* sql<WorkItemCostLineSubtotalRow>`
              select sum(floor(((quantity * 100) * unit_price_minor + 50) / 100))::text as subtotal_minor
              from work_item_cost_lines
              where work_item_id = ${input.workItemId}
            `;
            const lineTotalMinor = calculateJobCostLineTotalMinor({
              quantity: input.quantity,
              unitPriceMinor: input.unitPriceMinor,
            });
            const subtotalRow = yield* getRequiredRow(
              subtotalRows,
              "work item cost line subtotal"
            );
            const currentSubtotalMinor = Number(
              subtotalRow.subtotal_minor ?? 0
            );

            if (
              !Number.isSafeInteger(currentSubtotalMinor) ||
              !Number.isSafeInteger(currentSubtotalMinor + lineTotalMinor)
            ) {
              return yield* Effect.fail(
                new JobCostSummaryLimitExceededError({
                  message:
                    "Job cost summary subtotal would exceed a safe integer",
                  workItemId: input.workItemId,
                })
              );
            }

            const rows = yield* sql<WorkItemCostLineRow>`
              insert into work_item_cost_lines ${sql
                .insert({
                  author_user_id: input.authorUserId,
                  description: input.description,
                  id: generateCostLineId(),
                  organization_id: input.organizationId,
                  quantity: String(decodeJobCostLineQuantity(input.quantity)),
                  tax_rate_basis_points: input.taxRateBasisPoints ?? null,
                  type: input.type,
                  unit_price_minor: input.unitPriceMinor,
                  work_item_id: input.workItemId,
                })
                .returning("*")}
            `;

            const row = yield* getRequiredRow(
              rows,
              "inserted work item cost line"
            );

            return mapJobCostLineRow(row);
          })
        );
      });

      return {
        addActivity,
        addComment,
        addCostLine,
        addVisit,
        create,
        findById,
        findByIdForUpdate,
        getDetail,
        list,
        listOrganizationActivity,
        listMemberOptions,
        patch,
        reopen,
        transition,
        withTransaction,
      };
    }),
  }
) {}

export class SitesRepository extends Effect.Service<SitesRepository>()(
  "@task-tracker/domains/jobs/SitesRepository",
  {
    accessors: true,
    effect: Effect.gen(function* SitesRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const ensureServiceAreaInOrganization = Effect.fn(
        "SitesRepository.ensureServiceAreaInOrganization"
      )(function* (
        organizationId: OrganizationId,
        serviceAreaId: ServiceAreaId
      ) {
        const rows = yield* sql<IdRow>`
          select id
          from service_areas
          where organization_id = ${organizationId}
            and id = ${serviceAreaId}
            and archived_at is null
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new ServiceAreaNotFoundError({
              message: "Service area does not exist in the organization",
              organizationId,
              serviceAreaId,
            })
          );
        }

        return serviceAreaId;
      });

      const findById = Effect.fn("SitesRepository.findById")(function* (
        organizationId: OrganizationId,
        siteId: SiteId
      ) {
        const rows = yield* sql<IdRow>`
          select id
          from sites
          where organization_id = ${organizationId}
            and id = ${siteId}
          limit 1
        `;

        return Option.fromNullable(rows[0]?.id).pipe(Option.map(decodeSiteId));
      });

      const create = Effect.fn("SitesRepository.create")(function* (
        input: CreateSiteRecordInput
      ) {
        if (input.serviceAreaId !== undefined) {
          yield* ensureServiceAreaInOrganization(
            input.organizationId,
            input.serviceAreaId
          );
        }

        const values: Record<string, unknown> = {
          address_line_1: input.addressLine1,
          country: input.country,
          county: input.county,
          geocoded_at: isoDateTimeStringToDate(input.geocodedAt),
          geocoding_provider: input.geocodingProvider,
          id: generateSiteId(),
          latitude: input.latitude,
          longitude: input.longitude,
          name: input.name,
          organization_id: input.organizationId,
        };

        if (input.serviceAreaId !== undefined) {
          values.service_area_id = input.serviceAreaId;
        }

        if (input.addressLine2 !== undefined) {
          values.address_line_2 = input.addressLine2;
        }

        if (input.town !== undefined) {
          values.town = input.town;
        }

        if (input.eircode !== undefined) {
          values.eircode = input.eircode;
        }

        if (input.accessNotes !== undefined) {
          values.access_notes = input.accessNotes;
        }

        const rows = yield* sql<IdRow>`
          insert into sites ${sql.insert(values).returning("id")}
        `;

        const row = yield* getRequiredRow(rows, "inserted site id");

        return decodeSiteId(row.id);
      });

      const update = Effect.fn("SitesRepository.update")(function* (
        organizationId: OrganizationId,
        siteId: SiteId,
        input: UpdateSiteRecordInput
      ) {
        if (input.serviceAreaId !== undefined) {
          yield* ensureServiceAreaInOrganization(
            organizationId,
            input.serviceAreaId
          );
        }

        const rows = yield* sql<IdRow>`
          update sites
          set ${sql.update({
            access_notes: input.accessNotes ?? null,
            address_line_1: input.addressLine1,
            address_line_2: input.addressLine2 ?? null,
            country: input.country,
            county: input.county,
            eircode: input.eircode ?? null,
            geocoded_at: isoDateTimeStringToDate(input.geocodedAt),
            geocoding_provider: input.geocodingProvider,
            latitude: input.latitude,
            longitude: input.longitude,
            name: input.name,
            service_area_id: input.serviceAreaId ?? null,
            town: input.town ?? null,
            updated_at: new Date(),
          })}
          where organization_id = ${organizationId}
            and id = ${siteId}
            and archived_at is null
          returning id
        `;

        if (rows[0] === undefined) {
          return Option.none<JobSiteOption>();
        }

        return yield* getOptionById(organizationId, siteId);
      });

      const listOptions = Effect.fn("SitesRepository.listOptions")(function* (
        organizationId: OrganizationId
      ) {
        const rows = yield* sql<JobSiteOptionRow>`
          select
            sites.access_notes,
            sites.address_line_1,
            sites.address_line_2,
            sites.country,
            sites.county,
            sites.eircode,
            sites.geocoded_at,
            sites.geocoding_provider,
            sites.id,
            sites.latitude,
            sites.longitude,
            sites.name,
            service_areas.id as service_area_id,
            service_areas.name as service_area_name,
            sites.town
          from sites
          left join service_areas on service_areas.id = sites.service_area_id
          where sites.organization_id = ${organizationId}
            and sites.archived_at is null
          order by sites.name asc nulls last, sites.created_at asc, sites.id asc
        `;

        return rows.map(mapJobSiteOptionRow);
      });

      const getOptionById = Effect.fn("SitesRepository.getOptionById")(
        function* (organizationId: OrganizationId, siteId: SiteId) {
          const rows = yield* sql<JobSiteOptionRow>`
            select
              sites.access_notes,
              sites.address_line_1,
              sites.address_line_2,
              sites.country,
              sites.county,
              sites.eircode,
              sites.geocoded_at,
              sites.geocoding_provider,
              sites.id,
              sites.latitude,
              sites.longitude,
              sites.name,
              service_areas.id as service_area_id,
              service_areas.name as service_area_name,
              sites.town
            from sites
            left join service_areas on service_areas.id = sites.service_area_id
            where sites.organization_id = ${organizationId}
              and sites.id = ${siteId}
              and sites.archived_at is null
            limit 1
          `;

          return Option.fromNullable(rows[0]).pipe(
            Option.map(mapJobSiteOptionRow)
          );
        }
      );

      const linkContact = Effect.fn("SitesRepository.linkContact")(function* (
        input: LinkSiteContactInput
      ) {
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
          limit 1
        `;

        const [ownership] = rows;

        if (ownership === undefined) {
          const siteExists = yield* sql<IdRow>`
            select id
            from sites
            where organization_id = ${input.organizationId}
              and id = ${input.siteId}
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
            site_id: input.siteId,
          })}
          on conflict do nothing
        `;
      });

      return {
        create,
        ensureServiceAreaInOrganization,
        findById,
        getOptionById,
        linkContact,
        listOptions,
        update,
      };
    }),
  }
) {}

export class ConfigurationRepository extends Effect.Service<ConfigurationRepository>()(
  "@task-tracker/domains/jobs/ConfigurationRepository",
  {
    accessors: true,
    effect: Effect.gen(function* ConfigurationRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const listServiceAreas = Effect.fn(
        "ConfigurationRepository.listServiceAreas"
      )(function* (organizationId: OrganizationId) {
        const rows = yield* sql<ServiceAreaRow>`
          select id, name, description
          from service_areas
          where organization_id = ${organizationId}
            and archived_at is null
          order by name asc, id asc
        `;

        return rows.map(mapServiceAreaRow);
      });

      const listServiceAreaOptions = Effect.fn(
        "ConfigurationRepository.listServiceAreaOptions"
      )(function* (organizationId: OrganizationId) {
        const rows = yield* sql<ServiceAreaOptionRow>`
          select id, name
          from service_areas
          where organization_id = ${organizationId}
            and archived_at is null
          order by name asc, id asc
        `;

        return rows.map(mapServiceAreaOptionRow);
      });

      const createServiceArea = Effect.fn(
        "ConfigurationRepository.createServiceArea"
      )(function* (input: CreateServiceAreaRecordInput) {
        const rows = yield* sql<ServiceAreaRow>`
          insert into service_areas ${sql
            .insert({
              description: input.description ?? null,
              id: generateServiceAreaId(),
              name: input.name,
              organization_id: input.organizationId,
              slug: slugifyName(input.name),
            })
            .returning("*")}
        `;

        const row = yield* getRequiredRow(rows, "inserted service area");

        return mapServiceAreaRow(row);
      });

      const updateServiceArea = Effect.fn(
        "ConfigurationRepository.updateServiceArea"
      )(function* (
        organizationId: OrganizationId,
        serviceAreaId: ServiceAreaId,
        input: UpdateServiceAreaRecordInput
      ) {
        const values: Record<string, unknown> = {
          updated_at: new Date(),
        };

        if (input.name !== undefined) {
          values.name = input.name;
          values.slug = slugifyName(input.name);
        }

        if (input.description !== undefined) {
          values.description = input.description;
        }

        const rows = yield* sql<ServiceAreaRow>`
          update service_areas
          set ${sql.update(values)}
          where organization_id = ${organizationId}
            and id = ${serviceAreaId}
            and archived_at is null
          returning *
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new ServiceAreaNotFoundError({
              message: "Service area does not exist in the organization",
              organizationId,
              serviceAreaId,
            })
          );
        }

        return mapServiceAreaRow(rows[0]);
      });

      return {
        createServiceArea,
        listServiceAreaOptions,
        listServiceAreas,
        updateServiceArea,
      };
    }),
  }
) {}

export class RateCardsRepository extends Effect.Service<RateCardsRepository>()(
  "@task-tracker/domains/jobs/RateCardsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* RateCardsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const list = Effect.fn("RateCardsRepository.list")(function* (
        organizationId: OrganizationId
      ) {
        const cards = yield* sql<RateCardRow>`
          select id, name, created_at, updated_at
          from rate_cards
          where organization_id = ${organizationId}
            and archived_at is null
          order by updated_at desc, id desc
        `;

        if (cards.length === 0) {
          return [];
        }

        const lines = yield* sql<RateCardLineRow>`
          select
            rate_card_lines.id,
            rate_card_lines.rate_card_id,
            rate_card_lines.kind,
            rate_card_lines.name,
            rate_card_lines.position,
            rate_card_lines.unit,
            rate_card_lines.value
          from rate_card_lines
          join rate_cards on rate_cards.id = rate_card_lines.rate_card_id
          where rate_cards.organization_id = ${organizationId}
            and rate_cards.archived_at is null
          order by rate_card_lines.position asc, rate_card_lines.id asc
        `;
        const linesByRateCardId = groupRateCardLinesByRateCardId(lines);

        return cards.map((card) =>
          mapRateCardRows(card, linesByRateCardId.get(card.id) ?? [])
        );
      });

      const create = Effect.fn("RateCardsRepository.create")(function* (
        input: CreateRateCardRecordInput
      ) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rateCardId = generateRateCardId();
            const rows = yield* sql<RateCardRow>`
              insert into rate_cards ${sql
                .insert({
                  id: rateCardId,
                  name: input.name,
                  organization_id: input.organizationId,
                })
                .returning("*")}
            `;
            yield* getRequiredRow(rows, "inserted rate card");

            yield* insertRateCardLines(rateCardId, input.lines);

            return yield* loadRateCard(input.organizationId, rateCardId).pipe(
              Effect.catchTag(RATE_CARD_NOT_FOUND_ERROR_TAG, (error) =>
                Effect.die(error)
              )
            );
          })
        );
      });

      const update = Effect.fn("RateCardsRepository.update")(function* (
        organizationId: OrganizationId,
        rateCardId: RateCardId,
        input: UpdateRateCardRecordInput
      ) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const values: Record<string, unknown> = {
              updated_at: new Date(),
            };

            if (input.name !== undefined) {
              values.name = input.name;
            }

            const rows = yield* sql<RateCardRow>`
              update rate_cards
              set ${sql.update(values)}
              where organization_id = ${organizationId}
                and id = ${rateCardId}
                and archived_at is null
              returning *
            `;

            if (rows[0] === undefined) {
              return yield* Effect.fail(
                new RateCardNotFoundError({
                  message: "Rate card does not exist in the organization",
                  organizationId,
                  rateCardId,
                })
              );
            }

            if (input.lines !== undefined) {
              yield* sql`
                delete from rate_card_lines
                where rate_card_id = ${rateCardId}
              `;
              yield* insertRateCardLines(rateCardId, input.lines);
            }

            return yield* loadRateCard(organizationId, rateCardId);
          })
        );
      });

      const loadRateCard = Effect.fn("RateCardsRepository.loadRateCard")(
        function* (organizationId: OrganizationId, rateCardId: RateCardId) {
          const cardRows = yield* sql<RateCardRow>`
            select id, name, created_at, updated_at
            from rate_cards
            where organization_id = ${organizationId}
              and id = ${rateCardId}
              and archived_at is null
            limit 1
          `;
          const [card] = cardRows;

          if (card === undefined) {
            return yield* Effect.fail(
              new RateCardNotFoundError({
                message: "Rate card does not exist in the organization",
                organizationId,
                rateCardId,
              })
            );
          }

          const lines = yield* sql<RateCardLineRow>`
            select id, rate_card_id, kind, name, position, unit, value
            from rate_card_lines
            where rate_card_id = ${rateCardId}
            order by position asc, id asc
          `;

          return mapRateCardRows(card, lines);
        }
      );

      const insertRateCardLines = Effect.fn(
        "RateCardsRepository.insertRateCardLines"
      )(function* (
        rateCardId: RateCardId,
        lines: readonly RateCardLineInput[]
      ) {
        if (lines.length === 0) {
          return;
        }

        yield* sql`
          insert into rate_card_lines ${sql.insert(
            lines.map((line) => ({
              id: generateRateCardLineId(),
              kind: line.kind,
              name: line.name,
              position: line.position,
              rate_card_id: rateCardId,
              unit: line.unit,
              value: line.value.toFixed(2),
            }))
          )}
        `;
      });

      return {
        create,
        list,
        update,
      };
    }),
  }
) {}

export class ContactsRepository extends Effect.Service<ContactsRepository>()(
  "@task-tracker/domains/jobs/ContactsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* ContactsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const findById = Effect.fn("ContactsRepository.findById")(function* (
        organizationId: OrganizationId,
        contactId: ContactId
      ) {
        const rows = yield* sql<IdRow>`
          select id
          from contacts
          where organization_id = ${organizationId}
            and id = ${contactId}
          limit 1
        `;

        return Option.fromNullable(rows[0]?.id).pipe(
          Option.map(decodeContactId)
        );
      });

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
          const rows = yield* sql<JobContactOptionRow>`
          select
            contacts.id,
            contacts.name,
            contacts.email,
            contacts.phone,
            site_contacts.site_id
          from contacts
          left join site_contacts on site_contacts.contact_id = contacts.id
          where contacts.organization_id = ${organizationId}
            and contacts.archived_at is null
          order by contacts.name asc, contacts.id asc, site_contacts.site_id asc
        `;

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
) {}

export class JobLabelsRepository extends Effect.Service<JobLabelsRepository>()(
  "@task-tracker/domains/jobs/JobLabelsRepository",
  {
    accessors: true,
    effect: Effect.gen(function* JobLabelsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const lookupWorkItemOrganization = Effect.fn(
        "JobLabelsRepository.lookupWorkItemOrganization"
      )(function* (workItemId: WorkItemId) {
        const rows = yield* sql<{ readonly organization_id: string }>`
          select organization_id
          from work_items
          where id = ${workItemId}
          limit 1
        `;

        return Option.fromNullable(rows[0]?.organization_id).pipe(
          Option.map(decodeOrganizationId)
        );
      });

      const ensureWorkItemOrganizationMatches = Effect.fn(
        "JobLabelsRepository.ensureWorkItemOrganizationMatches"
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

      const findById = Effect.fn("JobLabelsRepository.findById")(function* (
        organizationId: OrganizationId,
        labelId: JobLabelId
      ) {
        const rows = yield* sql<JobLabelRow>`
          select *
          from job_labels
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          limit 1
        `;

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobLabelRow));
      });

      const getActiveLabelOrFail = Effect.fn(
        "JobLabelsRepository.getActiveLabelOrFail"
      )(function* (organizationId: OrganizationId, labelId: JobLabelId) {
        const label = yield* findById(organizationId, labelId).pipe(
          Effect.map(Option.getOrUndefined)
        );

        if (label === undefined) {
          return yield* Effect.fail(
            new JobLabelNotFoundError({
              labelId,
              message: "Job label does not exist in the organization",
            })
          );
        }

        return label;
      });

      const list = Effect.fn("JobLabelsRepository.list")(function* (
        organizationId: OrganizationId
      ) {
        const rows = yield* sql<JobLabelRow>`
          select *
          from job_labels
          where organization_id = ${organizationId}
            and archived_at is null
          order by name asc, id asc
        `;

        return decodeJobLabelsResponse({
          labels: rows.map(mapJobLabelRow),
        }).labels;
      });

      const create = Effect.fn("JobLabelsRepository.create")(function* (
        input: CreateJobLabelRecordInput
      ) {
        const name = decodeJobLabelName(input.name);
        const insertLabel = sql<JobLabelRow>`
          insert into job_labels ${sql
            .insert({
              id: generateJobLabelId(),
              name,
              normalized_name: normalizeJobLabelName(name),
              organization_id: input.organizationId,
            })
            .returning("*")}
        `;
        const rows = yield* Effect.catchAll(insertLabel, (error) =>
          mapJobLabelNameConflict(error, name)
        );

        const row = yield* getRequiredRow(rows, "inserted job label");

        return mapJobLabelRow(row);
      });

      const update = Effect.fn("JobLabelsRepository.update")(function* (
        organizationId: OrganizationId,
        labelId: JobLabelId,
        input: UpdateJobLabelRecordInput
      ) {
        const name = decodeJobLabelName(input.name);
        const updateLabel = sql<JobLabelRow>`
          update job_labels
          set ${sql.update({
            name,
            normalized_name: normalizeJobLabelName(name),
            updated_at: new Date(),
          })}
          where organization_id = ${organizationId}
            and id = ${labelId}
            and archived_at is null
          returning *
        `;
        const rows = yield* Effect.catchAll(updateLabel, (error) =>
          mapJobLabelNameConflict(error, name)
        );

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobLabelRow));
      });

      const archive = Effect.fn("JobLabelsRepository.archive")(function* (
        organizationId: OrganizationId,
        labelId: JobLabelId
      ) {
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<JobLabelRow>`
              update job_labels
              set archived_at = now(), updated_at = now()
              where organization_id = ${organizationId}
                and id = ${labelId}
                and archived_at is null
              returning *
            `;

            const label = Option.fromNullable(rows[0]).pipe(
              Option.map(mapJobLabelRow)
            );

            if (Option.isNone(label)) {
              return Option.none<ArchivedJobLabel>();
            }

            const removedRows = yield* sql<IdRow>`
              delete from work_item_labels
              where organization_id = ${organizationId}
                and label_id = ${labelId}
              returning work_item_id as id
            `;

            return Option.some({
              label: label.value,
              removedWorkItemIds: removedRows.map((row) =>
                decodeWorkItemId(row.id)
              ),
            });
          })
        );
      });

      const assignToJob = Effect.fn("JobLabelsRepository.assignToJob")(
        function* (input: AssignJobLabelRecordInput) {
          const rows = yield* sql<JobLabelAssignmentRow>`
            with active_label as (
              select *
              from job_labels
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
              new JobLabelNotFoundError({
                labelId: input.labelId,
                message: "Job label does not exist in the organization",
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
            label: mapJobLabelRow(row),
          };
        }
      );

      const removeFromJob = Effect.fn("JobLabelsRepository.removeFromJob")(
        function* (input: AssignJobLabelRecordInput) {
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
            using job_labels, work_items
            where work_item_labels.label_id = job_labels.id
              and work_item_labels.work_item_id = work_items.id
              and job_labels.organization_id = ${input.organizationId}
              and job_labels.id = ${input.labelId}
              and work_items.organization_id = ${input.organizationId}
              and work_items.id = ${input.workItemId}
            returning work_item_labels.label_id as id
          `;

          return {
            changed: rows.length > 0,
            label,
          };
        }
      );

      return {
        archive,
        assignToJob,
        create,
        findById,
        list,
        removeFromJob,
        update,
      };
    }),
  }
) {}

export const JobsRepositoriesLive = Layer.mergeAll(
  ConfigurationRepository.Default,
  JobsRepository.Default,
  SitesRepository.Default,
  ContactsRepository.Default,
  JobLabelsRepository.Default,
  RateCardsRepository.Default
);

export const withJobsTransaction = <Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>
) =>
  Effect.gen(function* () {
    const repository = yield* JobsRepository;

    return yield* repository.withTransaction(effect);
  });

function mapJobRow(row: WorkItemRow, labels: readonly JobLabel[] = []): Job {
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
    externalReference: nullableToUndefined(row.external_reference),
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

function mapJobListItemRow(row: WorkItemRow, labels: readonly JobLabel[] = []) {
  return decodeJobListItem({
    assigneeId: nullableToUndefined(row.assignee_id),
    contactId: nullableToUndefined(row.contact_id),
    coordinatorId: nullableToUndefined(row.coordinator_id),
    createdAt: row.created_at.toISOString(),
    externalReference: nullableToUndefined(row.external_reference),
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

function mapJobLabelRow(row: JobLabelRow): JobLabel {
  return decodeJobLabel({
    createdAt: row.created_at.toISOString(),
    id: decodeJobLabelId(row.id),
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

function mapServiceAreaRow(row: ServiceAreaRow): ServiceArea {
  return decodeServiceArea({
    description: nullableToUndefined(row.description),
    id: row.id,
    name: row.name,
  });
}

function mapServiceAreaOptionRow(row: ServiceAreaOptionRow): ServiceAreaOption {
  return decodeServiceAreaOption({
    id: row.id,
    name: row.name,
  });
}

function mapRateCardRows(
  card: RateCardRow,
  lines: readonly RateCardLineRow[]
): RateCard {
  return decodeRateCard({
    createdAt: card.created_at.toISOString(),
    id: card.id,
    lines: lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      name: line.name,
      position: line.position,
      rateCardId: line.rate_card_id,
      unit: line.unit,
      value: typeof line.value === "number" ? line.value : Number(line.value),
    })),
    name: card.name,
    updatedAt: card.updated_at.toISOString(),
  });
}

function groupRateCardLinesByRateCardId(lines: readonly RateCardLineRow[]) {
  const linesByRateCardId = new Map<string, RateCardLineRow[]>();

  for (const line of lines) {
    const current = linesByRateCardId.get(line.rate_card_id);

    if (current === undefined) {
      linesByRateCardId.set(line.rate_card_id, [line]);
    } else {
      current.push(line);
    }
  }

  return linesByRateCardId;
}

function mapJobSiteOptionRow(row: JobSiteOptionRow): JobSiteOption {
  return decodeJobSiteOption({
    accessNotes: nullableToUndefined(row.access_notes),
    addressLine1: row.address_line_1,
    addressLine2: nullableToUndefined(row.address_line_2),
    country: row.country,
    county: row.county,
    eircode: nullableToUndefined(row.eircode),
    geocodedAt: dateToIsoString(row.geocoded_at),
    geocodingProvider: row.geocoding_provider,
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    serviceAreaId: nullableToUndefined(row.service_area_id),
    serviceAreaName: nullableToUndefined(row.service_area_name),
    town: nullableToUndefined(row.town),
  });
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

  return Array.from(contacts.values(), (contact) =>
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

function mapJobCommentRow(row: WorkItemCommentRow): JobComment {
  return decodeJobComment({
    authorUserId: row.author_user_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    workItemId: row.work_item_id,
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
    actor:
      row.actor_user_id === null
        ? undefined
        : {
            email: row.actor_email ?? "",
            id: row.actor_user_id,
            name: normalizeOptionName(
              row.actor_name,
              row.actor_email ?? "Team member"
            ),
          },
    createdAt: row.created_at.toISOString(),
    eventType: row.event_type,
    id: row.id,
    jobTitle: row.job_title,
    payload: decodeJobActivityPayload(row.payload),
    workItemId: row.work_item_id,
  });
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

function mapJobCostLineRow(row: WorkItemCostLineRow): JobCostLine {
  const quantity = Number(row.quantity);
  const unitPriceMinor = row.unit_price_minor;

  return decodeJobCostLine({
    authorUserId: row.author_user_id,
    createdAt: row.created_at.toISOString(),
    description: row.description,
    id: row.id,
    lineTotalMinor: calculateJobCostLineTotalMinor({
      quantity,
      unitPriceMinor,
    }),
    quantity,
    taxRateBasisPoints: nullableToUndefined(row.tax_rate_basis_points),
    type: row.type,
    unitPriceMinor,
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

function encodeJsonCursor<Cursor extends string>(
  value: unknown,
  decodeCursorValue: (value: string) => Cursor
): Cursor {
  return decodeCursorValue(
    Buffer.from(JSON.stringify(value)).toString("base64url")
  );
}

function decodeJsonCursor<State>(
  cursor: string,
  decodeState: (value: unknown) => State
): State {
  return decodeState(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
  );
}

function nullableToUndefined<Value>(value: Value | null): Value | undefined {
  return value === null ? undefined : value;
}

function dateToIsoString(value: Date): string {
  return value.toISOString();
}

function isoDateTimeStringToDate(value: IsoDateTimeString): Date {
  return new Date(decodeIsoDateTimeString(value));
}

function normalizeOptionName(value: string | null, fallback: string): string {
  if (value !== null && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

function mapJobLabelNameConflict(
  error: SqlError.SqlError,
  name: JobLabelName
): Effect.Effect<never, JobLabelNameConflictError | SqlError.SqlError> {
  if (
    isUniqueConstraintError(
      error,
      "job_labels_organization_normalized_active_idx"
    )
  ) {
    return Effect.fail(
      new JobLabelNameConflictError({
        message: "Job label name already exists in the organization",
        name,
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

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return slug.length === 0 ? "service-area" : slug;
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
