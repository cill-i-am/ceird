import { PreparedAgentSessionSchema } from "@ceird/agents-core";
import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";
import { Schema } from "effect";

import { createSignedInOrganization } from "./helpers/auth-session";
import { GlobalAgentChatPage } from "./pages/global-agent-chat";
import { JobsPage } from "./pages/jobs-page";
import { AGENT_ORIGIN, API_ORIGIN } from "./test-urls";

const GLOBAL_AGENT_CHAT_TIMEOUT_MS = 120_000;
const decodePreparedAgentSession = Schema.decodeUnknownSync(
  PreparedAgentSessionSchema
);

declare global {
  interface Window {
    __CEIRD_AGENT_WS_SENT?: string[];
    __CEIRD_AGENT_WS_URLS?: string[];
  }
}

async function installFakeAgentWebSocket(page: Page) {
  await page.evaluate(() => {
    window.__CEIRD_AGENT_WS_SENT = [];
    window.__CEIRD_AGENT_WS_URLS = [];

    class FakeAgentWebSocket extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly url: string;
      binaryType: BinaryType = "blob";
      bufferedAmount = 0;
      extensions = "";
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      protocol = "";
      readyState = FakeAgentWebSocket.CONNECTING;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        window.__CEIRD_AGENT_WS_URLS?.push(this.url);

        window.setTimeout(() => {
          this.readyState = FakeAgentWebSocket.OPEN;
          const event = new Event("open");
          this.onopen?.(event);
          this.dispatchEvent(event);
        }, 0);
      }

      close() {
        this.readyState = FakeAgentWebSocket.CLOSED;
        const event = new CloseEvent("close");
        this.onclose?.(event);
        this.dispatchEvent(event);
      }

      send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
        this.bufferedAmount = 0;
        window.__CEIRD_AGENT_WS_SENT?.push(String(data));
      };
    }

    window.WebSocket = FakeAgentWebSocket as unknown as typeof window.WebSocket;
  });
}

function waitForAgentSessionPrepare(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());

      return (
        url.origin === API_ORIGIN &&
        url.pathname === "/agent/session/prepare" &&
        response.request().method() === "POST"
      );
    },
    { timeout: GLOBAL_AGENT_CHAT_TIMEOUT_MS }
  );
}

test.describe("global agent chat", () => {
  test.setTimeout(GLOBAL_AGENT_CHAT_TIMEOUT_MS);

  test("opens from jobs without route coupling and sends through the Agent Worker socket", async ({
    page,
  }) => {
    const agentHttpMessageRequests: string[] = [];
    const agentSessionPrepareRequests: string[] = [];
    const legacyAgentThreadRequests: string[] = [];

    page.on("request", (request) => {
      const url = new URL(request.url());

      if (
        url.origin === API_ORIGIN &&
        url.pathname === "/agent/session/prepare" &&
        request.method() === "POST"
      ) {
        agentSessionPrepareRequests.push(request.url());
      }

      if (
        url.origin === API_ORIGIN &&
        url.pathname.startsWith("/agent/threads")
      ) {
        legacyAgentThreadRequests.push(request.url());
      }

      if (
        url.origin === AGENT_ORIGIN &&
        url.pathname.endsWith("/get-messages")
      ) {
        agentHttpMessageRequests.push(request.url());
      }
    });

    await createSignedInOrganization(page, {
      organizationName: "Ceird Agent E2E",
      userName: "Taylor Example",
    });

    const jobsPage = new JobsPage(page);
    await jobsPage.openFromHome();

    const agentChat = new GlobalAgentChatPage(page);
    await agentChat.expectLauncherReady();
    await installFakeAgentWebSocket(page);
    const sessionPrepareResponse = waitForAgentSessionPrepare(page);

    await agentChat.open();

    const prepareResponse = await sessionPrepareResponse;
    expect(prepareResponse.ok()).toBe(true);
    expect(agentSessionPrepareRequests).toHaveLength(1);
    expect(legacyAgentThreadRequests).toStrictEqual([]);
    const preparedSession = decodePreparedAgentSession(
      await prepareResponse.json()
    );
    expect(preparedSession.authorization.agentInstanceName).toEqual(
      expect.stringMatching(/^org:.+:user:.+:thread:[0-9a-f-]{36}$/)
    );
    expect(preparedSession.authorization.token).toEqual(expect.any(String));
    expect(preparedSession.thread.id).toEqual(
      expect.stringMatching(/^[0-9a-f-]{36}$/)
    );
    expect(preparedSession.manifest.actions.length).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/jobs$/);
    const issuedAgentInstanceName =
      preparedSession.authorization.agentInstanceName;
    const issuedToken = preparedSession.authorization.token;
    await expect
      .poll(() =>
        page.evaluate(
          (input) => {
            const expectedPath = `/agents/ceird-agent/${input.issuedAgentInstanceName}`;

            return (window.__CEIRD_AGENT_WS_URLS ?? []).some((rawUrl) => {
              const url = new URL(rawUrl);

              return (
                url.origin === input.origin &&
                decodeURIComponent(url.pathname) === expectedPath &&
                url.searchParams.get("token") === input.issuedToken
              );
            });
          },
          {
            issuedAgentInstanceName,
            issuedToken,
            origin: AGENT_ORIGIN,
          }
        )
      )
      .toBe(true);
    await expect
      .poll(() =>
        agentHttpMessageRequests.some((rawUrl) => {
          const url = new URL(rawUrl);

          return (
            url.pathname.endsWith("/get-messages") &&
            url.searchParams.get("token") === issuedToken
          );
        })
      )
      .toBe(true);

    await agentChat.message.fill("Add an urgent label to the boiler job");
    await agentChat.send.click();

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window.__CEIRD_AGENT_WS_SENT ?? []).some((payload) =>
            payload.includes("Add an urgent label to the boiler job")
          )
        )
      )
      .toBe(true);
  });
});
