import { version } from "uuid";

import { generateLabelId } from "./id-generation.js";

describe("label id generation", () => {
  it("generates UUIDv7 identifiers for the labels domain", () => {
    expect(version(generateLabelId())).toBe(7);
  }, 5000);
});
