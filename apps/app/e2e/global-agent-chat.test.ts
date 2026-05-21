import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

import { createSignedInOrganization } from "./helpers/auth-session";
import { GlobalAgentChatPage } from "./pages/global-agent-chat";
import { JobsPage } from "./pages/jobs-page";
import { AGENT_ORIGIN, API_ORIGIN, APP_ORIGIN } from "./test-urls";

const GLOBAL_AGENT_CHAT_TIMEOUT_MS = 120_000;

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

function waitForAgentThreadList(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());

      return (
        url.origin === API_ORIGIN &&
        url.pathname === "/agent/threads" &&
        response.request().method() === "GET"
      );
    },
    { timeout: GLOBAL_AGENT_CHAT_TIMEOUT_MS }
  );
}

function waitForAgentThreadCreate(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());

      return (
        url.origin === API_ORIGIN &&
        url.pathname === "/agent/threads" &&
        response.request().method() === "POST"
      );
    },
    { timeout: GLOBAL_AGENT_CHAT_TIMEOUT_MS }
  );
}

function waitForAgentThreadAuthorize(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const url = new URL(response.url());

      return (
        url.origin === API_ORIGIN &&
        /^\/agent\/threads\/[0-9a-f-]{36}\/authorize$/.test(url.pathname) &&
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

    page.on("request", (request) => {
      const url = new URL(request.url());

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
    const threadListResponse = waitForAgentThreadList(page);
    const threadCreateResponse = waitForAgentThreadCreate(page);
    const threadAuthorizeResponse = waitForAgentThreadAuthorize(page);

    await agentChat.open();

    const listResponse = await threadListResponse;
    const createResponse = await threadCreateResponse;

    expect(listResponse.ok()).toBe(true);
    expect(createResponse.ok()).toBe(true);
    const authorizeResponse = await threadAuthorizeResponse;
    expect(authorizeResponse.ok()).toBe(true);
    const authorization = (await authorizeResponse.json()) as {
      readonly agentInstanceName?: unknown;
      readonly token?: unknown;
    };
    expect(authorization.agentInstanceName).toEqual(
      expect.stringMatching(/^org:.+:user:.+:thread:[0-9a-f-]{36}$/)
    );
    expect(authorization.token).toEqual(expect.any(String));
    await expect(page).toHaveURL(`${APP_ORIGIN}/jobs`);
    const issuedAgentInstanceName = String(authorization.agentInstanceName);
    const issuedToken = String(authorization.token);
    await expect
      .poll(() =>
        page.evaluate(
          (input) => {
            const expectedPath = new URL(
              `/agents/ceird-agent/${encodeURIComponent(input.issuedAgentInstanceName)}`,
              input.origin
            ).pathname;

            return (window.__CEIRD_AGENT_WS_URLS ?? []).some((rawUrl) => {
              const url = new URL(rawUrl);

              return (
                url.pathname === expectedPath &&
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
