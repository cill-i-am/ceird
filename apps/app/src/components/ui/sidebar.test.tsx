import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SidebarProvider, useSidebar } from "./sidebar";

function SidebarStateProbe() {
  const { state } = useSidebar();

  return <output aria-label="Sidebar state">{state}</output>;
}

describe("sidebar provider", () => {
  beforeEach(() => {
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
    vi.restoreAllMocks();
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

    await user.keyboard("{Control>}b{/Control}");

    expect(screen.getByLabelText("Sidebar state")).toHaveTextContent(
      "collapsed"
    );
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

    await user.keyboard("{Control>}b{/Control}");

    expect(screen.getByLabelText("Sidebar state")).toHaveTextContent(
      "collapsed"
    );
    expect(documentListener).toHaveBeenCalledWith(
      expect.objectContaining({
        ctrlKey: true,
        key: "b",
      })
    );

    document.removeEventListener("keydown", documentListener);
  }, 1000);
});
