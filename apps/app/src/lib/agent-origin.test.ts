import { resolveAgentHost, resolveAgentOrigin } from "./agent-origin";

describe("agent origin resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the configured Agent Worker host", () => {
    expect(resolveAgentHost(undefined, "https://agent.example.com")).toBe(
      "agent.example.com"
    );
  }, 1000);

  it("keeps local Agent Worker ports", () => {
    expect(resolveAgentHost(undefined, "http://127.0.0.1:3003")).toBe(
      "127.0.0.1:3003"
    );
  }, 1000);

  it("maps app hostnames to matching agent hostnames when no env is injected", () => {
    expect(resolveAgentOrigin("https://app.main.ceird.app")).toBe(
      "https://agent.main.ceird.app"
    );
  }, 1000);

  it("falls back to the current local browser origin only in tests", () => {
    expect(resolveAgentOrigin("http://127.0.0.1:4173")).toBe(
      "http://127.0.0.1:4173"
    );
  }, 1000);

  it("prefers VITE_AGENT_ORIGIN over host inference", () => {
    vi.stubEnv("VITE_AGENT_ORIGIN", "https://agent.configured.example.com");

    expect(resolveAgentOrigin("https://app.main.ceird.app")).toBe(
      "https://agent.configured.example.com"
    );
  }, 1000);

  it("returns undefined for invalid origins", () => {
    expect(resolveAgentHost(undefined, "not-a-url")).toBeUndefined();
    expect(resolveAgentOrigin("not-a-url")).toBeUndefined();
  }, 1000);
});
