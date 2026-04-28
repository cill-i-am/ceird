/* oxlint-disable eslint/max-classes-per-file */

import { SqlClient } from "@effect/sql";
import {
  ContactId as ContactIdSchema,
  ContactNotFoundError,
  IsoDateTimeString as IsoDateTimeStringSchema,
  JobActivityPayloadSchema,
  JobActivitySchema,
  JobCommentSchema,
  JobContactOptionSchema,
  JobDetailSchema,
  JobListCursor as JobListCursorSchema,
  JobListCursorInvalidError,
  JobListItemSchema,
  JobMemberOptionSchema,
  JobRegionOptionSchema,
  JobListResponseSchema,
  JobNotFoundError,
  JobSchema,
  JobSiteOptionSchema,
  JobVisitSchema,
  OrganizationId as OrganizationIdSchema,
  OrganizationMemberNotFoundError,
  RegionNotFoundError,
  SiteNotFoundError,
  SiteId as SiteIdSchema,
  WorkItemId as WorkItemIdSchema,
} from "@task-tracker/jobs-core";
import type {
  ContactIdType as ContactId,
  Job,
  JobActivity,
  JobActivityPayload,
  JobComment,
  JobContactOption,
  JobDetail,
  JobKind,
  JobListCursorType as JobListCursor,
  JobListQuery,
  JobMemberOption,
  JobPriority,
  JobRegionOption,
  JobStatus,
  JobSiteOption,
  JobTitle,
  JobVisit,
  IsoDateTimeStringType as IsoDateTimeString,
  OrganizationIdType as OrganizationId,
  RegionIdType as RegionId,
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

interface IdRow {
  readonly id: string;
}

interface JobMemberOptionRow {
  readonly email: string;
  readonly id: string;
  readonly name: string | null;
}

interface JobRegionOptionRow {
  readonly id: string;
  readonly name: string;
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
  readonly region_id: string | null;
  readonly region_name: string | null;
  readonly town: string | null;
}

interface JobContactOptionRow {
  readonly id: string;
  readonly name: string;
  readonly site_id: string | null;
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
  readonly regionId?: RegionId;
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
  readonly regionId?: RegionId;
  readonly town?: string;
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

const decodeJob = Schema.decodeUnknownSync(JobSchema);
const decodeJobActivity = Schema.decodeUnknownSync(JobActivitySchema);
const decodeJobActivityPayload = Schema.decodeUnknownSync(
  JobActivityPayloadSchema
);
const decodeContactId = Schema.decodeUnknownSync(ContactIdSchema);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationIdSchema);
const decodeJobComment = Schema.decodeUnknownSync(JobCommentSchema);
const decodeJobDetail = Schema.decodeUnknownSync(JobDetailSchema);
const decodeJobListCursor = Schema.decodeUnknownSync(JobListCursorSchema);
const decodeJobListItem = Schema.decodeUnknownSync(JobListItemSchema);
const decodeJobMemberOption = Schema.decodeUnknownSync(JobMemberOptionSchema);
const decodeJobContactOption = Schema.decodeUnknownSync(JobContactOptionSchema);
const decodeJobRegionOption = Schema.decodeUnknownSync(JobRegionOptionSchema);
const decodeJobListResponse = Schema.decodeUnknownSync(JobListResponseSchema);
const decodeJobSiteOption = Schema.decodeUnknownSync(JobSiteOptionSchema);
const decodeJobVisit = Schema.decodeUnknownSync(JobVisitSchema);
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
        "JobsRepository.ensureWorkItemOrganizationMatches"
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

      const list = Effect.fn("JobsRepository.list")(function* (
        organizationId: OrganizationId,
        query: JobListQuery
      ) {
        const limit = clampJobListLimit(query.limit ?? boundedDefaultListLimit);
        const clauses = [sql`work_items.organization_id = ${organizationId}`];
        const sitesJoin =
          query.regionId === undefined
            ? sql``
            : sql`left join sites on sites.id = work_items.site_id`;

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

        if (query.regionId !== undefined) {
          clauses.push(sql`sites.region_id = ${query.regionId}`);
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
          ${sitesJoin}
          where ${sql.and(clauses)}
          order by work_items.updated_at desc, work_items.id desc
          limit ${limit + 1}
        `;

        const items = rows.slice(0, limit).map(mapJobListItemRow);
        const nextCursorRow = rows.length > limit ? rows[limit - 1] : undefined;
        const nextCursor =
          nextCursorRow === undefined ? undefined : encodeCursor(nextCursorRow);

        return decodeJobListResponse({ items, nextCursor });
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

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobRow));
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

        const [comments, activity, visits] = yield* Effect.all([
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
        ]);

        return Option.some(
          decodeJobDetail({
            activity: activity.map(mapJobActivityRow),
            comments: comments.map(mapJobCommentRow),
            costLines: [],
            costSummary: {
              subtotalMinor: 0,
            },
            job,
            visits: visits.map(mapJobVisitRow),
          })
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

        return mapJobRow(getRequiredRow(rows, "inserted work item"));
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

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobRow));
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

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobRow));
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

        return Option.fromNullable(rows[0]).pipe(Option.map(mapJobRow));
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

        return mapJobCommentRow(
          getRequiredRow(rows, "inserted work item comment")
        );
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

        return mapJobActivityRow(
          getRequiredRow(rows, "inserted work item activity")
        );
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

        return mapJobVisitRow(getRequiredRow(rows, "inserted work item visit"));
      });

      return {
        addActivity,
        addComment,
        addVisit,
        create,
        findById,
        findByIdForUpdate,
        getDetail,
        list,
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

      const ensureRegionInOrganization = Effect.fn(
        "SitesRepository.ensureRegionInOrganization"
      )(function* (organizationId: OrganizationId, regionId: RegionId) {
        const rows = yield* sql<IdRow>`
          select id
          from service_regions
          where organization_id = ${organizationId}
            and id = ${regionId}
            and archived_at is null
          limit 1
        `;

        if (rows[0] === undefined) {
          return yield* Effect.fail(
            new RegionNotFoundError({
              message: "Region does not exist in the organization",
              organizationId,
              regionId,
            })
          );
        }

        return regionId;
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
        if (input.regionId !== undefined) {
          yield* ensureRegionInOrganization(
            input.organizationId,
            input.regionId
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

        if (input.regionId !== undefined) {
          values.region_id = input.regionId;
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

        return decodeSiteId(getRequiredRow(rows, "inserted site id").id);
      });

      const update = Effect.fn("SitesRepository.update")(function* (
        organizationId: OrganizationId,
        siteId: SiteId,
        input: UpdateSiteRecordInput
      ) {
        if (input.regionId !== undefined) {
          yield* ensureRegionInOrganization(organizationId, input.regionId);
        }

        const rows = yield* sql<JobSiteOptionRow>`
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
            region_id: input.regionId ?? null,
            town: input.town ?? null,
            updated_at: new Date(),
          })}
          where organization_id = ${organizationId}
            and id = ${siteId}
            and archived_at is null
          returning
            access_notes,
            address_line_1,
            address_line_2,
            county,
            eircode,
            id,
            latitude,
            longitude,
            name,
            region_id,
            null::text as region_name,
            town
        `;

        if (rows[0] === undefined) {
          return Option.none<JobSiteOption>();
        }

        return yield* getOptionById(organizationId, siteId);
      });

      const listRegions = Effect.fn("SitesRepository.listRegions")(function* (
        organizationId: OrganizationId
      ) {
        const rows = yield* sql<JobRegionOptionRow>`
          select id, name
          from service_regions
          where organization_id = ${organizationId}
            and archived_at is null
          order by name asc, id asc
        `;

        return rows.map(mapJobRegionOptionRow);
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
            service_regions.id as region_id,
            service_regions.name as region_name,
            sites.town
          from sites
          left join service_regions on service_regions.id = sites.region_id
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
              service_regions.id as region_id,
              service_regions.name as region_name,
              sites.town
            from sites
            left join service_regions on service_regions.id = sites.region_id
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
        ensureRegionInOrganization,
        findById,
        getOptionById,
        linkContact,
        listOptions,
        listRegions,
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

        return decodeContactId(getRequiredRow(rows, "inserted contact id").id);
      });

      const listOptions = Effect.fn("ContactsRepository.listOptions")(
        function* (organizationId: OrganizationId) {
          const rows = yield* sql<JobContactOptionRow>`
          select
            contacts.id,
            contacts.name,
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

export const JobsRepositoriesLive = Layer.mergeAll(
  JobsRepository.Default,
  SitesRepository.Default,
  ContactsRepository.Default
);

export const withJobsTransaction = <Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>
) =>
  Effect.gen(function* () {
    const repository = yield* JobsRepository;

    return yield* repository.withTransaction(effect);
  });

function mapJobRow(row: WorkItemRow): Job {
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
    priority: row.priority,
    siteId: nullableToUndefined(row.site_id),
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapJobListItemRow(row: WorkItemRow) {
  return decodeJobListItem({
    assigneeId: nullableToUndefined(row.assignee_id),
    contactId: nullableToUndefined(row.contact_id),
    coordinatorId: nullableToUndefined(row.coordinator_id),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    kind: row.kind,
    priority: row.priority,
    siteId: nullableToUndefined(row.site_id),
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  });
}

function mapJobMemberOptionRow(row: JobMemberOptionRow): JobMemberOption {
  return decodeJobMemberOption({
    id: row.id,
    name: normalizeOptionName(row.name, row.email),
  });
}

function mapJobRegionOptionRow(row: JobRegionOptionRow): JobRegionOption {
  return decodeJobRegionOption({
    id: row.id,
    name: row.name,
  });
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
    regionId: nullableToUndefined(row.region_id),
    regionName: nullableToUndefined(row.region_name),
    town: nullableToUndefined(row.town),
  });
}

function mapJobContactOptions(
  rows: readonly JobContactOptionRow[]
): readonly JobContactOption[] {
  const contacts = new Map<
    string,
    {
      readonly id: string;
      readonly name: string;
      readonly siteIds: SiteId[];
    }
  >();

  for (const row of rows) {
    const existing = contacts.get(row.id);

    if (existing === undefined) {
      contacts.set(row.id, {
        id: row.id,
        name: row.name,
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
  return decodeJobListCursor(
    Buffer.from(
      JSON.stringify({
        id: decodeWorkItemId(row.id),
        updatedAt: row.updated_at.toISOString(),
      } satisfies JobCursorState)
    ).toString("base64url")
  );
}

function decodeCursor(cursor: JobListCursor): {
  readonly id: WorkItemId;
  readonly updatedAt: Date;
} {
  const value = decodeJobCursorState(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
  ) as JobCursorState;

  return {
    id: value.id,
    updatedAt: new Date(value.updatedAt),
  };
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

function getRequiredRow<Value>(rows: readonly Value[], label: string): Value {
  const [row] = rows;

  if (row === undefined) {
    throw new Error(`Expected ${label} row to be returned`);
  }

  return row;
}

function parseIsoDateTime(value: string): Date {
  return new Date(value);
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
