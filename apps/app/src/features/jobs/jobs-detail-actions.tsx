import { Button } from "#/components/ui/button";

import type { JobDetailActionPanel } from "./jobs-detail-types";

export function JobDetailActionRail({
  activePanel,
  canAddComment,
  canAddCostLine,
  canAddVisit,
  canManageCollaborators,
  canManageSite,
  canManageWorkflow,
  collaboratorsCount,
  commentsCount,
  costLinesCount,
  onPanelChange,
  visitsCount,
}: {
  readonly activePanel: JobDetailActionPanel | null;
  readonly canAddComment: boolean;
  readonly canAddCostLine: boolean;
  readonly canAddVisit: boolean;
  readonly canManageCollaborators: boolean;
  readonly canManageSite: boolean;
  readonly canManageWorkflow: boolean;
  readonly collaboratorsCount: number;
  readonly commentsCount: number;
  readonly costLinesCount: number;
  readonly onPanelChange: (panel: JobDetailActionPanel | null) => void;
  readonly visitsCount: number;
}) {
  const actions: {
    readonly label: string;
    readonly panel: JobDetailActionPanel;
    readonly value: number | undefined;
  }[] = [];

  if (canManageWorkflow) {
    actions.push({ label: "Status", panel: "workflow", value: undefined });
  }

  if (canManageSite) {
    actions.push({ label: "Site", panel: "site", value: undefined });
  }

  if (canAddComment || commentsCount > 0) {
    actions.push({ label: "Comment", panel: "comments", value: commentsCount });
  }

  if (canAddCostLine || costLinesCount > 0) {
    actions.push({ label: "Cost", panel: "costs", value: costLinesCount });
  }

  if (canAddVisit || visitsCount > 0) {
    actions.push({ label: "Visit", panel: "visits", value: visitsCount });
  }

  if (canManageCollaborators || collaboratorsCount > 0) {
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
