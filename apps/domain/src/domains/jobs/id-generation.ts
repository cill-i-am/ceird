import {
  ActivityId,
  CommentId,
  ContactId,
  CostLineId,
  JobCollaboratorId,
  RateCardId,
  RateCardLineId,
  VisitId,
  WorkItemId,
} from "@ceird/jobs-core";
import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  CostLineIdType,
  JobCollaboratorIdType,
  RateCardIdType,
  RateCardLineIdType,
  VisitIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import { Schema } from "effect";
import { v7 as uuidv7 } from "uuid";

const decodeActivityId = Schema.decodeUnknownSync(ActivityId);
const decodeCommentId = Schema.decodeUnknownSync(CommentId);
const decodeContactId = Schema.decodeUnknownSync(ContactId);
const decodeCostLineId = Schema.decodeUnknownSync(CostLineId);
const decodeJobCollaboratorId = Schema.decodeUnknownSync(JobCollaboratorId);
const decodeRateCardId = Schema.decodeUnknownSync(RateCardId);
const decodeRateCardLineId = Schema.decodeUnknownSync(RateCardLineId);
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

export function generateCostLineId(): CostLineIdType {
  return decodeCostLineId(generateJobDomainUuid());
}

export function generateJobCollaboratorId(): JobCollaboratorIdType {
  return decodeJobCollaboratorId(generateJobDomainUuid());
}

export function generateRateCardId(): RateCardIdType {
  return decodeRateCardId(generateJobDomainUuid());
}

export function generateRateCardLineId(): RateCardLineIdType {
  return decodeRateCardLineId(generateJobDomainUuid());
}

export function generateVisitId(): VisitIdType {
  return decodeVisitId(generateJobDomainUuid());
}

export function generateWorkItemId(): WorkItemIdType {
  return decodeWorkItemId(generateJobDomainUuid());
}
