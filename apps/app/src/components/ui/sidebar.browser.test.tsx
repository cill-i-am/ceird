import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { SidebarProvider, useSidebar } from "./sidebar";

function SidebarStateProbe() {
  const { state } = useSidebar();

  return <output aria-label="Sidebar state">{state}</output>;
}

function PersistSidebarCookieAfterHydration() {
  // react-doctor-disable-next-line
  React.useLayoutEffect(() => {
    setSidebarCookie("sidebar_state=false; path=/");
  }, []);

  return <SidebarStateProbe />;
}

function setSidebarCookie(value: string) {
  // eslint-disable-next-line unicorn/no-document-cookie -- Tests need jsdom cookie setup for the sidebar persistence path.
  document.cookie = value;
}

function getModBKeyboardInput() {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? "{Meta>}b{/Meta}"
    : "{Control>}b{/Control}";
}

function getModBEventExpectation() {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? { key: "b", metaKey: true }
    : { ctrlKey: true, key: "b" };
}

describe("sidebar provider", () => {
  beforeEach(() => {
    setSidebarCookie("sidebar_state=; path=/; max-age=0");

    if (!window.matchMedia) {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: () => {},
      });
    }

    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string): MediaQueryList => ({
        addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
        addListener: vi.fn<MediaQueryList["addListener"]>(),
        dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
        removeListener: vi.fn<MediaQueryList["removeListener"]>(),
      })
    );
  });

  afterEach(() => {
    setSidebarCookie("sidebar_state=; path=/; max-age=0");
    vi.restoreAllMocks();
  });

  it("uses the persisted sidebar state as the default state", () => {
    setSidebarCookie("sidebar_state=false; path=/");

    render(
      <HotkeysProvider>
        <SidebarProvider>
          <SidebarStateProbe />
        </SidebarProvider>
      </HotkeysProvider>
    );

    expect(screen.getByLabelText("Sidebar state")).toHaveTextContent(
      "collapsed"
    );
  });

  it("reconciles the persisted sidebar state after hydration", async () => {
    render(
      <HotkeysProvider>
        <SidebarProvider>
          <PersistSidebarCookieAfterHydration />
        </SidebarProvider>
      </HotkeysProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Sidebar state")).toHaveTextContent(
        "collapsed"
      );
    });
  });

  it("toggles sidebar state with Mod+B", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <SidebarProvider>
          <SidebarStateProbe />
        </SidebarProvider>
      </HotkeysProvider>
    );

    expect(screen.getByLabelText("Sidebar state")).toHaveTextContent(
      "expanded"
    );

    await user.keyboard(getModBKeyboardInput());

    expect(screen.getByLabelText("Sidebar state")).toHaveTextContent(
      "collapsed"
    );
  }, 1000);

  it("persists sidebar state when toggled", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <SidebarProvider>
          <SidebarStateProbe />
        </SidebarProvider>
      </HotkeysProvider>
    );

    await user.keyboard(getModBKeyboardInput());

    expect(document.cookie).toContain("sidebar_state=false");
  }, 1000);

  it("lets document listeners observe Mod+B while toggling", async () => {
    const user = userEvent.setup();
    const documentListener = vi.fn<(event: KeyboardEvent) => void>();
    document.addEventListener("keydown", documentListener);

    render(
      <HotkeysProvider>
        <SidebarProvider>
          <SidebarStateProbe />
        </SidebarProvider>
      </HotkeysProvider>
    );

    await user.keyboard(getModBKeyboardInput());

    expect(screen.getByLabelText("Sidebar state")).toHaveTextContent(
      "collapsed"
    );
    expect(documentListener).toHaveBeenCalledWith(
      expect.objectContaining(getModBEventExpectation())
    );

    document.removeEventListener("keydown", documentListener);
  }, 1000);
});
