import type { SiteIdType, SiteOption } from "@ceird/sites-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WorkspaceSheetEventsProvider,
  useNotifyWorkspaceSheetSiteCreated,
  useWorkspaceSheetSiteCreated,
} from "./workspace-sheet-events";

const SITE = {
  displayLocation: "Dublin",
  hasUsableCoordinates: false,
  id: "019e6b6f-03d3-73e3-9dc6-d303722eef9a" as SiteIdType,
  labels: [],
  locationStatus: "unverified",
  name: "Routing test site",
} as SiteOption;

describe("workspace sheet events", () => {
  it("notifies the targeted parent sheet when a site is created", async () => {
    const user = userEvent.setup();
    const onSiteCreated = vi.fn<(site: SiteOption) => void>();
    const onOtherSiteCreated = vi.fn<(site: SiteOption) => void>();

    render(
      <WorkspaceSheetEventsProvider>
        <SiteCreatedListener
          onSiteCreated={onSiteCreated}
          targetId="job-sheet-a"
        />
        <SiteCreatedListener
          onSiteCreated={onOtherSiteCreated}
          targetId="job-sheet-b"
        />
        <SiteCreatedButton targetId="job-sheet-a" />
      </WorkspaceSheetEventsProvider>
    );

    await user.click(screen.getByRole("button", { name: "Notify site" }));

    expect(onSiteCreated).toHaveBeenCalledExactlyOnceWith(SITE);
    expect(onOtherSiteCreated).not.toHaveBeenCalled();
  });
});

function SiteCreatedListener({
  onSiteCreated,
  targetId,
}: {
  readonly onSiteCreated: (site: SiteOption) => void;
  readonly targetId: string;
}) {
  useWorkspaceSheetSiteCreated(targetId, onSiteCreated);

  return null;
}

function SiteCreatedButton({ targetId }: { readonly targetId: string }) {
  const notifySiteCreated = useNotifyWorkspaceSheetSiteCreated();

  return (
    <button type="button" onClick={() => notifySiteCreated(SITE, targetId)}>
      Notify site
    </button>
  );
}
