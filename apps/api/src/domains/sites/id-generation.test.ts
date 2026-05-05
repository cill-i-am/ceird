import { version } from "uuid";

import { generateServiceAreaId, generateSiteId } from "./id-generation.js";

describe("site id generation", () => {
  it("generates UUIDv7 identifiers for the sites domain", () => {
    expect(version(generateServiceAreaId())).toBe(7);
    expect(version(generateSiteId())).toBe(7);
  }, 5000);
});
