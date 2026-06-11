import { act, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

import { ResponsiveDrawer, ResponsiveNestedDrawer } from "./responsive-drawer";

interface DrawerRootMockProps {
  readonly children?: ReactNode;
  readonly direction?: string;
}

type ResponsiveDrawerRuntimeProps = ComponentProps<typeof ResponsiveDrawer> & {
  readonly direction?: string;
};

vi.mock(import("#/components/ui/drawer"), () => ({
  Drawer: ({ children, direction }: DrawerRootMockProps) => (
    <div data-direction={direction} data-kind="root" data-testid="drawer-root">
      {children}
    </div>
  ),
  DrawerNestedRoot: ({ children, direction }: DrawerRootMockProps) => (
    <div
      data-direction={direction}
      data-kind="nested"
      data-testid="drawer-root"
    >
      {children}
    </div>
  ),
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("responsive drawer", () => {
  it("uses a right-side drawer on desktop", () => {
    setViewportWidth(1024);

    render(
      <ResponsiveDrawer open>
        <p>Drawer body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "right"
    );
    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-kind",
      "root"
    );
  }, 1000);

  it("uses a bottom drawer on mobile", () => {
    setViewportWidth(390);

    render(
      <ResponsiveDrawer open>
        <p>Drawer body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "bottom"
    );
  }, 1000);

  it("uses the nested Vaul root for nested drawers", () => {
    setViewportWidth(1024);

    render(
      <ResponsiveNestedDrawer open>
        <p>Nested body</p>
      </ResponsiveNestedDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-kind",
      "nested"
    );
    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "right"
    );
  }, 1000);

  it("uses custom responsive directions", () => {
    setViewportWidth(1024);

    const { unmount } = render(
      <ResponsiveDrawer desktopDirection="left" mobileDirection="top" open>
        <p>Custom body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "left"
    );

    unmount();
    setViewportWidth(390);

    render(
      <ResponsiveDrawer desktopDirection="left" mobileDirection="top" open>
        <p>Custom body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "top"
    );
  }, 1000);

  it("updates the direction after a mounted viewport resize", () => {
    setViewportWidth(1024);

    render(
      <ResponsiveDrawer open>
        <p>Drawer body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "right"
    );

    act(() => {
      setViewportWidth(390);
    });

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "bottom"
    );
  }, 1000);

  it("keeps the computed direction ahead of passthrough direction props", () => {
    setViewportWidth(1024);

    render(
      <ResponsiveDrawer
        {...({ direction: "bottom" } as ResponsiveDrawerRuntimeProps)}
        open
      >
        <p>Drawer body</p>
      </ResponsiveDrawer>
    );

    expect(screen.getByTestId("drawer-root")).toHaveAttribute(
      "data-direction",
      "right"
    );
  }, 1000);
});
