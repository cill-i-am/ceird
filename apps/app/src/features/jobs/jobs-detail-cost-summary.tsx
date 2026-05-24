import type { JobDetailResponse } from "@ceird/jobs-core";

import { formatJobMoneyMinor } from "./jobs-detail-costs-section";
import { DetailSection } from "./jobs-detail-section";

export function JobCostSummary({
  costs,
}: {
  readonly costs: NonNullable<JobDetailResponse["costs"]>;
}) {
  return (
    <DetailSection title="Costs">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            Cost total
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatJobMoneyMinor(costs.summary.subtotalMinor)}
          </span>
        </div>
        <ul className="flex flex-col gap-3">
          {costs.lines.map((costLine) => (
            <li
              key={costLine.id}
              className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {costLine.description}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatJobMoneyMinor(costLine.lineTotalMinor)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DetailSection>
  );
}
