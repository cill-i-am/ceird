import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ThemeToggle from "./ThemeToggle";

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function mockColorScheme(preferDark: boolean) {
  const addEventListener = vi.fn<MediaQueryList["addEventListener"]>();
  const addListener = vi.fn<MediaQueryList["addListener"]>();
  const removeEventListener = vi.fn<MediaQueryList["removeEventListener"]>();
  const removeListener = vi.fn<MediaQueryList["removeListener"]>();

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn<typeof window.matchMedia>().mockImplementation(
      (query) =>
        ({
          addEventListener,
          addListener,
          dispatchEvent: vi
            .fn<MediaQueryList["dispatchEvent"]>()
            .mockReturnValue(true),
          matches: preferDark,
          media: query,
          onchange: null,
          removeEventListener,
          removeListener,
        }) as MediaQueryList
    ),
  });
}

describe(ThemeToggle, () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createStorage(),
    });
    window.localStorage.clear();
    document.documentElement.classList.remove("dark", "light");
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = "";
    mockColorScheme(false);
  });

  it("opens theme choices from the trigger", async () => {
    const user = userEvent.setup();

    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", {
        name: "Theme mode: System. Choose theme mode.",
      })
    );

    await expect(
      screen.findByRole("menuitem", { name: /light/i })
    ).resolves.toBeVisible();
    expect(screen.getByRole("menuitem", { name: /dark/i })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /system/i })).toBeVisible();
  });

  it("stores and applies the selected theme", async () => {
    const user = userEvent.setup();

    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", {
        name: "Theme mode: System. Choose theme mode.",
      })
    );
    await user.click(await screen.findByRole("menuitem", { name: /dark/i }));

    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Theme mode: Dark. Choose theme mode.",
        })
      ).toBeVisible();
    });
  });
});
