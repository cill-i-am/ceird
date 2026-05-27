import { INTERNAL_ORGANIZATION_ROLES } from "@ceird/identity-core";
/* oxlint-disable eslint/max-classes-per-file */
import {
  ActivityId as ActivityIdSchema,
  ContactId as ContactIdSchema,
  ContactNotFoundError,
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
  JobListQuery,
  JobMemberOption,
  JobPriority,
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
import { SiteId as SiteIdSchema, SiteNotFoundError } from "@ceird/sites-core";
import type { SiteIdType as SiteId, SiteOption } from "@ceird/sites-core";
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

import { CommentsRepository } from "../comments/repository.js";
import { decodeJsonCursor, encodeJsonCursor } from "../json-cursor.js";
import { listSiteLabelsForSites } from "../sites/site-label-queries.js";
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

interface LabelRow {
  readonly archived_at: Date | null;
  readonly created_at: Date;
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
  readonly created_at: Date;
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

export class JobsRepository extends Context.Service<JobsRepository>()(
  "@ceird/domains/jobs/JobsRepository",
  {
    make: Effect.gen(function* JobsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;
      const commentsRepository = yield* CommentsRepository;
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
          return new Map<WorkItemId, Label[]>();
        }

        const rows = yield* sql<WorkItemLabelRow>`
          select
            work_item_labels.work_item_id,
            work_item_labels.label_id,
            labels.created_at,
            labels.name,
            labels.updated_at
          from work_item_labels
          join labels
            on labels.id = work_item_labels.label_id
            and labels.organization_id = work_item_labels.organization_id
          join work_items
            on work_items.id = work_item_labels.work_item_id
            and work_items.organization_id = work_item_labels.organization_id
          where work_item_labels.organization_id = ${organizationId}
            and labels.organization_id = ${organizationId}
            and work_items.organization_id = ${organizationId}
            and work_item_labels.work_item_id in ${sql.in(workItemIds)}
            and labels.archived_at is null
          order by labels.name asc, labels.id asc
        `;

        const labelsByWorkItemId = new Map<WorkItemId, Label[]>();

        for (const row of rows) {
          const workItemId = decodeWorkItemId(row.work_item_id);
          const labels = labelsByWorkItemId.get(workItemId) ?? [];
          labels.push(
            decodeLabel({
              createdAt: row.created_at.toISOString(),
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
          join work_items
            on work_items.id = work_item_activity.work_item_id
            and work_items.organization_id = work_item_activity.organization_id
          left join "user" on "user".id = work_item_activity.actor_user_id
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
          const rows = yield* sql<JobMemberOptionRow>`
          select
            "user".id,
            "user".name,
            "user".email
          from member
          join "user" on "user".id = member.user_id
          where member.organization_id = ${organizationId}
            and member.role in ${sql.in(INTERNAL_ORGANIZATION_ROLES)}
          order by "user".name asc, "user".email asc
        `;

          return rows.map(mapJobMemberOptionRow);
        }
      );

      const listExternalMemberOptions = Effect.fn(
        "JobsRepository.listExternalMemberOptions"
      )(function* (organizationId: OrganizationId) {
        const rows = yield* sql<JobMemberOptionRow>`
          select
            "user".id,
            "user".name,
            "user".email
          from member
          join "user" on "user".id = member.user_id
          where member.organization_id = ${organizationId}
            and member.role = ${EXTERNAL_ORGANIZATION_ROLE}
          order by "user".name asc, "user".email asc
        `;

        return rows.map(mapJobExternalMemberOptionRow);
      });

      const listCollaborators = Effect.fn("JobsRepository.listCollaborators")(
        function* (organizationId: OrganizationId, workItemId: WorkItemId) {
          yield* ensureWorkItemOrganizationMatches(organizationId, workItemId);

          const rows = yield* sql<WorkItemCollaboratorRow>`
          select *
          from work_item_collaborators
          where organization_id = ${organizationId}
            and work_item_id = ${workItemId}
          order by created_at asc, id asc
        `;

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
        const rows = yield* sql<WorkItemCollaboratorRow>`
          select *
          from work_item_collaborators
          where organization_id = ${organizationId}
            and work_item_id = ${workItemId}
            and subject_type = 'user'
            and user_id = ${userId}
          limit 1
        `;

        return Option.fromNullishOr(rows[0]).pipe(
          Option.map(mapJobCollaboratorRow)
        );
      });

      const listAccessibleWorkItemIdsForUser = Effect.fn(
        "JobsRepository.listAccessibleWorkItemIdsForUser"
      )(function* (organizationId: OrganizationId, userId: UserId) {
        const rows = yield* sql<IdRow>`
          select work_items.id
          from work_item_collaborators
          join work_items on work_items.id = work_item_collaborators.work_item_id
            and work_items.organization_id = work_item_collaborators.organization_id
          where work_item_collaborators.organization_id = ${organizationId}
            and work_item_collaborators.subject_type = 'user'
            and work_item_collaborators.user_id = ${userId}
          order by work_items.updated_at desc, work_items.id desc
        `;

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
            : sql<WorkItemActivityRow>`
                select *
                from work_item_activity
                where work_item_id = ${workItemId}
                  and organization_id = ${organizationId}
                order by created_at desc, id desc
              `;
        const visitsEffect =
          resolvedAccess.visibility === "external"
            ? Effect.succeed<WorkItemVisitRow[]>([])
            : sql<WorkItemVisitRow>`
                select *
                from work_item_visits
                where work_item_id = ${workItemId}
                  and organization_id = ${organizationId}
                order by visit_date desc, id desc
              `;
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
          const rows = yield* sql<SiteOptionRow>`
          select
            sites.access_notes,
            sites.address_components,
            sites.address_line_1,
            sites.address_line_2,
            sites.country,
            sites.county,
            sites.display_location,
            sites.eircode,
            sites.formatted_address,
            sites.google_place_id,
            sites.id,
            sites.latitude,
            sites.location_provider,
            sites.location_resolved_at,
            sites.location_status,
            sites.longitude,
            sites.name,
            sites.raw_location_input,
            sites.town
          from sites
          where sites.organization_id = ${organizationId}
            and sites.id = ${siteId}
            and sites.archived_at is null
          limit 1
        `;

          const [row] = rows;

          if (row === undefined) {
            return Option.none<SiteOption>();
          }

          const labelsBySiteId = includeLabels
            ? yield* listSiteLabelsForSites(sql, organizationId, [siteId])
            : new Map<SiteId, Label[]>();

          return Option.some(
            mapSiteOptionRow(row, labelsBySiteId.get(siteId) ?? [])
          );
        }
      );

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
            and archived_at is null
          limit 1
        `;

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
        list,
        listAccessibleWorkItemIdsForUser,
        listCollaborators,
        listExternalMemberOptions,
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
  static readonly linkSiteContact = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["linkSiteContact"]
    >
  ) => JobsRepository.use((service) => service.linkSiteContact(...args));
  static readonly list = (
    ...args: Parameters<Context.Service.Shape<typeof JobsRepository>["list"]>
  ) => JobsRepository.use((service) => service.list(...args));
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
  static readonly listOrganizationActivity = (
    ...args: Parameters<
      Context.Service.Shape<typeof JobsRepository>["listOrganizationActivity"]
    >
  ) =>
    JobsRepository.use((service) => service.listOrganizationActivity(...args));
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
    Layer.provide(CommentsRepository.Default)
  );
}

export class ContactsRepository extends Context.Service<ContactsRepository>()(
  "@ceird/domains/jobs/ContactsRepository",
  {
    make: Effect.gen(function* ContactsRepositoryLive() {
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
            and archived_at is null
          limit 1
        `;

        return Option.fromNullishOr(rows[0]?.id).pipe(
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
            and site_contacts.organization_id = contacts.organization_id
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
    createdAt: row.created_at.toISOString(),
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
