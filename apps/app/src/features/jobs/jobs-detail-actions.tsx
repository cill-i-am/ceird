import { Button } from "#/components/ui/button";

import type { JobDetailActionPanel } from "./jobs-detail-types";

export interface JobDetailActionCapabilities {
  readonly addComment: boolean;
  readonly addCostLine: boolean;
  readonly addVisit: boolean;
  readonly manageCollaborators: boolean;
  readonly manageSite: boolean;
  readonly manageWorkflow: boolean;
}

export function JobDetailActionRail({
  activePanel,
  collaboratorsCount,
  commentsCount,
  capabilities,
  costLinesCount,
  onPanelChange,
  visitsCount,
}: {
  readonly activePanel: JobDetailActionPanel | null;
  readonly collaboratorsCount: number;
  readonly commentsCount: number;
  readonly capabilities: JobDetailActionCapabilities;
  readonly costLinesCount: number;
  readonly onPanelChange: (panel: JobDetailActionPanel | null) => void;
  readonly visitsCount: number;
}) {
  const actions: {
    readonly label: string;
    readonly panel: JobDetailActionPanel;
    readonly value: number | undefined;
  }[] = [];

  if (capabilities.manageWorkflow) {
    actions.push({ label: "Status", panel: "workflow", value: undefined });
  }

  if (capabilities.manageSite) {
    actions.push({ label: "Site", panel: "site", value: undefined });
  }

  if (capabilities.addComment || commentsCount > 0) {
    actions.push({ label: "Comment", panel: "comments", value: commentsCount });
  }

  if (capabilities.addCostLine || costLinesCount > 0) {
    actions.push({ label: "Cost", panel: "costs", value: costLinesCount });
  }

  if (capabilities.addVisit || visitsCount > 0) {
    actions.push({ label: "Visit", panel: "visits", value: visitsCount });
  }

  if (capabilities.manageCollaborators || collaboratorsCount > 0) {
    actions.push({
      label: "Collaborator",
      panel: "collaborators",
      value: collaboratorsCount,
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isActive = activePanel === action.panel;

          return (
            <Button
              key={action.panel}
              type="button"
              size="sm"
              aria-label={
                action.value && action.value > 0
                  ? `${action.label} ${action.value}`
                  : action.label
              }
              variant={isActive ? "secondary" : "outline"}
              onClick={() => onPanelChange(isActive ? null : action.panel)}
            >
              {action.label}
              {action.value && action.value > 0 ? (
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                  {action.value}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
