import { relations } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
  ]
);

export const commentRelations = relations(comment, ({ many, one }) => ({
  author: one(user, {
    fields: [comment.authorUserId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [comment.organizationId],
    references: [organization.id],
  }),
  siteComments: many(siteComment),
  updatedBy: one(user, {
    fields: [comment.updatedByUserId],
    references: [user.id],
  }),
  workItemComments: many(workItemComment),
}));

export const workItemCommentRelations = relations(
  workItemComment,
  ({ one }) => ({
    comment: one(comment, {
      fields: [workItemComment.commentId],
      references: [comment.id],
    }),
    workItem: one(workItem, {
      fields: [workItemComment.workItemId],
      references: [workItem.id],
    }),
  })
);

export const siteCommentRelations = relations(siteComment, ({ one }) => ({
  comment: one(comment, {
    fields: [siteComment.commentId],
    references: [comment.id],
  }),
  site: one(site, {
    fields: [siteComment.siteId],
    references: [site.id],
  }),
}));

export const commentsSchema = {
  comment,
  commentRelations,
  siteComment,
  siteCommentRelations,
  workItemComment,
  workItemCommentRelations,
};
