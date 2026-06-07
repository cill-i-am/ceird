import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

import { readPlaywrightDatabaseUrl } from "../test-urls";

const apiRequire = createRequire(
  new URL("../../../api/package.json", import.meta.url)
);

interface PgQueryResult<T> {
  readonly rows: T[];
}

interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PgQueryResult<T>>;
}

type PgClientConstructor = new (options: {
  readonly connectionString: string;
}) => PgClient;

const { Client: PgClient } = apiRequire("pg") as {
  readonly Client: PgClientConstructor;
};
const EMAIL_VERIFICATION_UPDATE_TIMEOUT_MS = 10_000;
const EMAIL_VERIFICATION_UPDATE_POLL_MS = 100;

export async function markUserEmailVerified(email: string) {
  await setUserEmailVerified(email, true, {
    waitForUser: true,
  });
}

export async function markUserEmailUnverified(email: string) {
  await setUserEmailVerified(email, false, {
    waitForUser: false,
  });
}

async function setUserEmailVerified(
  email: string,
  verified: boolean,
  options: {
    readonly waitForUser: boolean;
  }
) {
  const client = new PgClient({
    connectionString: readPlaywrightDatabaseUrl(),
  });

  await client.connect();

  try {
    await updateUserEmailVerifiedWithRetry(client, email, verified, options);
  } finally {
    await client.end();
  }
}

async function updateUserEmailVerifiedWithRetry(
  client: PgClient,
  email: string,
  verified: boolean,
  options: {
    readonly waitForUser: boolean;
  }
) {
  const deadline = Date.now() + EMAIL_VERIFICATION_UPDATE_TIMEOUT_MS;

  do {
    const result = await client.query<{ readonly id: string }>(
      `update "user"
       set email_verified = $2
       where email = $1
       returning id`,
      [email, verified]
    );

    if (result.rows[0]) {
      return;
    }

    if (!options.waitForUser) {
      break;
    }

    await delay(EMAIL_VERIFICATION_UPDATE_POLL_MS);
  } while (Date.now() < deadline);

  throw new Error(`Expected to update test user ${email}`);
}
