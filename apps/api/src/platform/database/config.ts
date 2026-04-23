import { Config } from "effect";

export const DEFAULT_APP_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5439/task_tracker";

export const appDatabaseUrlConfig = Config.string("DATABASE_URL").pipe(
  Config.withDefault(DEFAULT_APP_DATABASE_URL)
);
