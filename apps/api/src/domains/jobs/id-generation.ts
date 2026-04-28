import {
  ActivityId,
  CommentId,
  ContactId,
  JobLabelId,
  RegionId,
  SiteId,
  VisitId,
  WorkItemId,
} from "@task-tracker/jobs-core";
import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  JobLabelIdType,
  RegionIdType,
  SiteIdType,
  VisitIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeActivityId = Schema.decodeUnknownSync(ActivityId);
const decodeCommentId = Schema.decodeUnknownSync(CommentId);
const decodeContactId = Schema.decodeUnknownSync(ContactId);
const decodeJobLabelId = Schema.decodeUnknownSync(JobLabelId);
const decodeRegionId = Schema.decodeUnknownSync(RegionId);
const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeVisitId = Schema.decodeUnknownSync(VisitId);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);

export function generateJobDomainUuid(): string {
  return uuidv7();
}

export function generateActivityId(): ActivityIdType {
  return decodeActivityId(generateJobDomainUuid());
}

export function generateCommentId(): CommentIdType {
  return decodeCommentId(generateJobDomainUuid());
}

export function generateContactId(): ContactIdType {
  return decodeContactId(generateJobDomainUuid());
}

export function generateJobLabelId(): JobLabelIdType {
  return decodeJobLabelId(generateJobDomainUuid());
}

export function generateRegionId(): RegionIdType {
  return decodeRegionId(generateJobDomainUuid());
}

export function generateSiteId(): SiteIdType {
  return decodeSiteId(generateJobDomainUuid());
}

export function generateVisitId(): VisitIdType {
  return decodeVisitId(generateJobDomainUuid());
}

export function generateWorkItemId(): WorkItemIdType {
  return decodeWorkItemId(generateJobDomainUuid());
}
