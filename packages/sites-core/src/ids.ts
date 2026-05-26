import { Schema } from "effect";

export const SiteId = Schema.String.check(Schema.isUUID()).pipe(
  Schema.brand("@ceird/sites-core/SiteId")
);
export type SiteId = Schema.Schema.Type<typeof SiteId>;
