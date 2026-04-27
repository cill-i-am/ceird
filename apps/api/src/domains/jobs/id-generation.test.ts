import { version } from "uuid";

import {
  generateActivityId,
  generateCommentId,
  generateContactId,
  generateJobDomainUuid,
  generateRegionId,
  generateSiteId,
  generateVisitId,
  generateWorkItemId,
} from "./id-generation.js";

describe("job id generation", () => {
  it("generates UUIDv7 identifiers for the jobs domain", () => {
    expect(version(generateJobDomainUuid())).toBe(7);
    expect(version(generateActivityId())).toBe(7);
    expect(version(generateCommentId())).toBe(7);
    expect(version(generateContactId())).toBe(7);
    expect(version(generateRegionId())).toBe(7);
    expect(version(generateSiteId())).toBe(7);
    expect(version(generateVisitId())).toBe(7);
    expect(version(generateWorkItemId())).toBe(7);
  }, 5000);
});
