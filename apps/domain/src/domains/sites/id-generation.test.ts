import { version } from "uuid";

import { generateSiteId } from "./id-generation.js";

describe("site id generation", () => {
  it("generates UUIDv7 identifiers for the sites domain", () => {
    expect(version(generateSiteId())).toBe(7);
  }, 5000);
});
