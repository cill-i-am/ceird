import { DEFAULT_APP_DATABASE_URL } from "./config.js";
import {
  isTestDatabaseRequired,
  resolveAdminDatabaseUrl,
  resolveTestDatabaseBaseUrl,
} from "./test-database.js";

describe("test database base URL resolution", () => {
  it("uses an explicit base URL before environment defaults", () => {
    expect(
      resolveTestDatabaseBaseUrl(
        {
          baseUrl:
            "postgresql://postgres:postgres@127.0.0.1:5444/explicit_test",
        },
        {
          API_TEST_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:5443/api_test",
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5442/runtime",
          TEST_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:5441/shared_test",
        }
      )
    ).toBe("postgresql://postgres:postgres@127.0.0.1:5444/explicit_test");
  });

  it("uses API_TEST_DATABASE_URL for integration database creation", () => {
    expect(
      resolveTestDatabaseBaseUrl(
        {},
        {
          API_TEST_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:5443/api_test",
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5442/runtime",
          TEST_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:5441/shared_test",
        }
      )
    ).toBe("postgresql://postgres:postgres@127.0.0.1:5443/api_test");
  });

  it("falls back to TEST_DATABASE_URL, DATABASE_URL, then the local default", () => {
    expect(
      resolveTestDatabaseBaseUrl(
        {},
        {
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5442/runtime",
          TEST_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:5441/shared_test",
        }
      )
    ).toBe("postgresql://postgres:postgres@127.0.0.1:5441/shared_test");

    expect(
      resolveTestDatabaseBaseUrl(
        {},
        {
          DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5442/runtime",
        }
      )
    ).toBe("postgresql://postgres:postgres@127.0.0.1:5442/runtime");

    expect(resolveTestDatabaseBaseUrl({}, {})).toBe(DEFAULT_APP_DATABASE_URL);
  });

  it("detects when integration database availability is required", () => {
    expect(isTestDatabaseRequired({ CEIRD_REQUIRE_TEST_DATABASE: "1" })).toBe(
      true
    );
    expect(
      isTestDatabaseRequired({ CEIRD_REQUIRE_TEST_DATABASE: "true" })
    ).toBe(true);
    expect(isTestDatabaseRequired({ CEIRD_REQUIRE_TEST_DATABASE: "0" })).toBe(
      false
    );
  });

  it("uses the configured base database for test database administration", () => {
    expect(
      resolveAdminDatabaseUrl(
        "postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require"
      )
    ).toBe("postgresql://ceird:secret@example.neon.tech/ceird?sslmode=require");
  });
});
