import { act, render, screen } from "@testing-library/react";
import * as React from "react";
import type { ReactElement, ReactNode } from "react";

import type * as DialogModule from "#/components/ui/dialog";
import type * as DrawerModule from "#/components/ui/drawer";

import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "./responsive-dialog";

interface RootMockProps {
  readonly children?: ReactNode;
  readonly direction?: string;
}

interface RenderMockProps {
  readonly children?: ReactNode;
  readonly render?: ReactElement<Record<string, unknown>>;
}

vi.mock(
  import("#/components/ui/dialog"),
  () =>
    ({
      Dialog: ({ children }: RootMockProps) => (
        <div data-surface="dialog" data-testid="responsive-root">
          {children}
        </div>
      ),
      DialogClose: ({ children, render: renderElement }: RenderMockProps) =>
        renderElement && React.isValidElement(renderElement) ? (
          React.cloneElement(
            renderElement,
            { "data-slot": "dialog-close" },
            children
          )
        ) : (
          <button data-slot="dialog-close" type="button">
            {children}
          </button>
        ),
      DialogContent: ({ children }: { readonly children?: ReactNode }) => (
        <div data-slot="dialog-content">{children}</div>
      ),
      DialogDescription: ({ children }: { readonly children?: ReactNode }) => (
        <p data-slot="dialog-description">{children}</p>
      ),
      DialogFooter: ({ children }: { readonly children?: ReactNode }) => (
        <div data-slot="dialog-footer">{children}</div>
      ),
      DialogHeader: ({ children }: { readonly children?: ReactNode }) => (
        <div data-slot="dialog-header">{children}</div>
      ),
      DialogTitle: ({ children }: { readonly children?: ReactNode }) => (
        <h2 data-slot="dialog-title">{children}</h2>
      ),
    }) as unknown as Partial<typeof DialogModule>
);

vi.mock(
  import("#/components/ui/drawer"),
  () =>
    ({
      Drawer: ({ children, direction }: RootMockProps) => (
        <div
          data-direction={direction}
          data-surface="drawer"
          data-testid="responsive-root"
        >
          {children}
        </div>
      ),
      DrawerClose: ({ children }: RenderMockProps) =>
        React.isValidElement(children) ? (
          React.cloneElement(
            children as ReactElement<Record<string, unknown>>,
            {
              "data-slot": "drawer-close",
            }
          )
        ) : (
          <button data-slot="drawer-close" type="button">
            {children}
          </button>
        ),
      DrawerContent: ({ children }: { readonly children?: ReactNode }) => (
        <div data-slot="drawer-content">{children}</div>
      ),
      DrawerDescription: ({ children }: { readonly children?: ReactNode }) => (
        <p data-slot="drawer-description">{children}</p>
      ),
      DrawerFooter: ({ children }: { readonly children?: ReactNode }) => (
        <div data-slot="drawer-footer">{children}</div>
      ),
      DrawerHeader: ({ children }: { readonly children?: ReactNode }) => (
        <div data-slot="drawer-header">{children}</div>
      ),
      DrawerTitle: ({ children }: { readonly children?: ReactNode }) => (
        <h2 data-slot="drawer-title">{children}</h2>
      ),
    }) as unknown as Partial<typeof DrawerModule>
);

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

function renderResponsiveDialog() {
  render(
    <ResponsiveDialog open>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Invite teammate</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Send an invitation.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <ResponsiveDialogClose render={<button type="button" />}>
            Cancel
          </ResponsiveDialogClose>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

describe("responsive dialog", () => {
  it("uses a dialog surface on desktop", () => {
    setViewportWidth(1024);

    renderResponsiveDialog();

    expect(screen.getByTestId("responsive-root")).toHaveAttribute(
      "data-surface",
      "dialog"
    );
    expect(screen.getByText("Invite teammate")).toHaveAttribute(
      "data-slot",
      "dialog-title"
    );
    expect(screen.getByText("Cancel")).toHaveAttribute(
      "data-slot",
      "dialog-close"
    );
  }, 1000);

  it("uses a bottom drawer surface on mobile", () => {
    setViewportWidth(390);

    renderResponsiveDialog();

    expect(screen.getByTestId("responsive-root")).toHaveAttribute(
      "data-surface",
      "drawer"
    );
    expect(screen.getByTestId("responsive-root")).toHaveAttribute(
      "data-direction",
      "bottom"
    );
    expect(screen.getByText("Invite teammate")).toHaveAttribute(
      "data-slot",
      "drawer-title"
    );
    expect(screen.getByText("Cancel")).toHaveAttribute(
      "data-slot",
      "drawer-close"
    );
  }, 1000);

  it("switches surface after a mounted viewport resize", () => {
    setViewportWidth(1024);

    renderResponsiveDialog();

    expect(screen.getByTestId("responsive-root")).toHaveAttribute(
      "data-surface",
      "dialog"
    );

    act(() => {
      setViewportWidth(390);
    });

    expect(screen.getByTestId("responsive-root")).toHaveAttribute(
      "data-surface",
      "drawer"
    );
  }, 1000);
});
