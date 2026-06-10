import { fireEvent, render, screen } from "@testing-library/react";

import {
  WorkspaceSheetSkeleton,
  WorkspaceSheetUnavailable,
} from "./workspace-sheet-loading";

describe("workspace sheet loading states", () => {
  it("composes sheet loading states with skeleton rows", () => {
    render(<WorkspaceSheetSkeleton title="Loading job" />);

    expect(screen.getByRole("dialog", { name: "Loading job" })).toBeVisible();
    expect(screen.getAllByTestId("workspace-sheet-skeleton-row")).toHaveLength(
      4
    );
  });

  it("keeps inactive loading states out of the drawer tree", () => {
    render(<WorkspaceSheetSkeleton active={false} title="Loading job" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders an unavailable sheet with a close action", () => {
    const onClose = vi.fn<() => void>();

    render(
      <WorkspaceSheetUnavailable
        title="Job unavailable"
        description="This job is no longer available."
        actionLabel="Close job"
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Close job" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
