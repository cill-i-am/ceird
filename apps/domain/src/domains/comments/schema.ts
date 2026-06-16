import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { productActivityActor } from "../activity/schema.js";
import { organization, user } from "../identity/authentication/schema.js";
import { workItem } from "../jobs/schema.js";
import { site } from "../sites/schema.js";
import { generateCommentId } from "./id-generation.js";

const commentsTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const comment = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().$defaultFn(generateCommentId),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    actorId: uuid("actor_id"),
    body: text("body").notNull(),
    createdAt: commentsTimestamp("created_at"),
    updatedAt: commentsTimestamp("updated_at"),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("comments_id_organization_idx").on(
      table.id,
      table.organizationId
    ),
    index("comments_organization_id_idx").on(table.organizationId),
    index("comments_author_user_id_idx").on(table.authorUserId),
    foreignKey({
      columns: [table.actorId, table.organizationId],
      foreignColumns: [
        productActivityActor.id,
        productActivityActor.organizationId,
      ],
      name: "comments_actor_org_fk",
    }),
    index("comments_actor_id_idx").on(table.organizationId, table.actorId),
    index("comments_updated_by_user_id_idx").on(table.updatedByUserId),
  ]
);

export const workItemComment = pgTable(
  "work_item_comments",
  {
    commentId: uuid("comment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    workItemId: uuid("work_item_id").notNull(),
    createdAt: commentsTimestamp("created_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.commentId, table.organizationId],
      foreignColumns: [comment.id, comment.organizationId],
      name: "work_item_comments_comment_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workItemId, table.organizationId],
      foreignColumns: [workItem.id, workItem.organizationId],
      name: "work_item_comments_work_item_org_fk",
    }).onDelete("cascade"),
    index("work_item_comments_work_item_created_at_idx").on(
      table.workItemId,
      table.createdAt.asc(),
      table.commentId.asc()
    ),
    index("work_item_comments_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt.asc(),
      table.commentId.asc()
    ),
  ]
);

export const siteComment = pgTable(
  "site_comments",
  {
    commentId: uuid("comment_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    siteId: uuid("site_id").notNull(),
    createdAt: commentsTimestamp("created_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.commentId, table.organizationId],
      foreignColumns: [comment.id, comment.organizationId],
      name: "site_comments_comment_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.siteId, table.organizationId],
      foreignColumns: [site.id, site.organizationId],
      name: "site_comments_site_org_fk",
    }).onDelete("cascade"),
    index("site_comments_site_created_at_idx").on(
      table.siteId,
      table.createdAt.asc(),
      table.commentId.asc()
    ),
    index("site_comments_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt.asc(),
      table.commentId.asc()
    ),
  ]
);

export const siteCommentBody = pgTable(
  "site_comment_bodies",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").notNull(),
    body: text("body").notNull(),
    createdAt: commentsTimestamp("created_at"),
    updatedAt: commentsTimestamp("updated_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.id, table.organizationId],
      foreignColumns: [comment.id, comment.organizationId],
      name: "site_comment_bodies_comment_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId, table.organizationId],
      foreignColumns: [
        productActivityActor.id,
        productActivityActor.organizationId,
      ],
      name: "site_comment_bodies_actor_org_fk",
    }),
    index("site_comment_bodies_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt.asc(),
      table.id.asc()
    ),
    index("site_comment_bodies_actor_id_idx").on(
      table.organizationId,
      table.actorId
    ),
  ]
);

export const workItemCommentBody = pgTable(
  "work_item_comment_bodies",
  {
    id: uuid("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").notNull(),
    body: text("body").notNull(),
    createdAt: commentsTimestamp("created_at"),
    updatedAt: commentsTimestamp("updated_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.id, table.organizationId],
      foreignColumns: [comment.id, comment.organizationId],
      name: "work_item_comment_bodies_comment_org_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId, table.organizationId],
      foreignColumns: [
        productActivityActor.id,
        productActivityActor.organizationId,
      ],
      name: "work_item_comment_bodies_actor_org_fk",
    }),
    index("work_item_comment_bodies_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt.asc(),
      table.id.asc()
    ),
    index("work_item_comment_bodies_actor_id_idx").on(
      table.organizationId,
      table.actorId
    ),
  ]
);

export const commentsSchema = {
  comment,
  siteCommentBody,
  siteComment,
  workItemCommentBody,
  workItemComment,
};
