"use client";

import { Briefcase01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  calculateJobCostLineTotalMinor,
  MAX_JOB_COST_LINE_QUANTITY,
  MAX_JOB_COST_LINE_UNIT_PRICE_MINOR,
} from "@task-tracker/jobs-core";
import type {
  AddJobCostLineInput,
  AddJobCostLineResponse,
  JobDetailResponse,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { Exit } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Separator } from "#/components/ui/separator";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";

import { DetailEmpty, DetailSection } from "./jobs-detail-section";

export const COST_LINE_TYPE_LABELS = {
  labour: "Labour",
  material: "Material",
} as const;

type CostLineType = NonNullable<
  JobDetailResponse["costs"]
>["lines"][number]["type"];

const COST_LINE_TYPE_SELECTION_GROUPS = [
  {
    label: "Cost type",
    options: [
      { label: "Labour", value: "labour" },
      { label: "Material", value: "material" },
    ],
  },
] satisfies readonly CommandSelectGroup[];

const MAX_COST_LINE_UNIT_PRICE_MAJOR = MAX_JOB_COST_LINE_UNIT_PRICE_MINOR / 100;

interface JobCostsSectionProps {
  readonly addJobCostLine: (
    input: AddJobCostLineInput
  ) => Promise<Exit.Exit<AddJobCostLineResponse, unknown>>;
  readonly canAddCostLine: boolean;
  readonly detail: JobDetailResponse;
  readonly mutationError: React.ReactNode;
  readonly waiting: boolean;
  readonly workItemId: WorkItemIdType;
}

export function JobCostsSection({
  addJobCostLine,
  canAddCostLine,
  detail,
  mutationError,
  waiting,
  workItemId,
}: JobCostsSectionProps) {
  const { costs } = detail;
  const costDescriptionRef = React.useRef<HTMLInputElement>(null);
  const [costLineType, setCostLineType] =
    React.useState<CostLineType>("labour");
  const [costDescription, setCostDescription] = React.useState("");
  const [costQuantity, setCostQuantity] = React.useState("1");
  const [costUnitPrice, setCostUnitPrice] = React.useState("");
  const [costError, setCostError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCostLineType("labour");
    setCostDescription("");
    setCostQuantity("1");
    setCostUnitPrice("");
    setCostError(null);
  }, [workItemId]);

  useAppHotkey(
    "jobDetailCost",
    () => {
      costDescriptionRef.current?.focus();
    },
    {
      enabled: canAddCostLine,
    }
  );

  async function handleAddCostLine(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (costDescription.trim().length === 0) {
      setCostError("Add a short cost description.");
      return;
    }

    const quantityResult = parseCostLineQuantity(costQuantity);

    if (!quantityResult.ok) {
      setCostError(quantityResult.error);
      return;
    }

    const unitPriceResult = parseCostLineUnitPriceMinor(costUnitPrice);

    if (!unitPriceResult.ok) {
      setCostError(unitPriceResult.error);
      return;
    }

    const lineTotalMinor = calculateJobCostLineTotalMinor({
      quantity: quantityResult.quantity,
      unitPriceMinor: unitPriceResult.unitPriceMinor,
    });

    if (!Number.isSafeInteger(lineTotalMinor)) {
      setCostError("Line total is too large to submit safely.");
      return;
    }

    setCostError(null);
    const exit = await addJobCostLine({
      description: costDescription.trim(),
      quantity: quantityResult.quantity,
      type: costLineType,
      unitPriceMinor: unitPriceResult.unitPriceMinor,
    });

    if (Exit.isSuccess(exit)) {
      setCostLineType("labour");
      setCostDescription("");
      setCostQuantity("1");
      setCostUnitPrice("");
    }
  }

  return (
    <DetailSection
      title="Costs"
      description="Track labour and materials without mixing them into the job narrative."
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            Cost total
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatMoneyMinor(costs?.summary.subtotalMinor ?? 0)}
          </span>
        </div>

        <CostControls
          canAddCostLine={canAddCostLine}
          costsAvailable={costs !== undefined}
        >
          {mutationError}
          <form
            className="flex flex-col gap-4"
            method="post"
            noValidate
            onSubmit={handleAddCostLine}
          >
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="job-cost-type">Cost type</FieldLabel>
                  <FieldContent>
                    <CommandSelect
                      id="job-cost-type"
                      value={costLineType}
                      placeholder="Pick type"
                      emptyText="No cost types found."
                      groups={COST_LINE_TYPE_SELECTION_GROUPS}
                      onValueChange={(nextValue) => {
                        const decoded = decodeCostLineType(nextValue);

                        if (decoded) {
                          setCostLineType(decoded);
                        }
                      }}
                    />
                  </FieldContent>
                </Field>

                <Field
                  data-invalid={
                    Boolean(costError) &&
                    !parseCostLineQuantity(costQuantity).ok
                  }
                >
                  <FieldLabel htmlFor="job-cost-quantity">Quantity</FieldLabel>
                  <FieldContent>
                    <Input
                      id="job-cost-quantity"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={costQuantity}
                      aria-invalid={
                        Boolean(costError) &&
                        !parseCostLineQuantity(costQuantity).ok
                          ? true
                          : undefined
                      }
                      onChange={(event) => setCostQuantity(event.target.value)}
                    />
                  </FieldContent>
                </Field>

                <Field
                  data-invalid={
                    Boolean(costError) &&
                    !parseCostLineUnitPriceMinor(costUnitPrice).ok
                  }
                >
                  <FieldLabel htmlFor="job-cost-unit-price">
                    Unit price
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="job-cost-unit-price"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      type="number"
                      value={costUnitPrice}
                      aria-invalid={
                        Boolean(costError) &&
                        !parseCostLineUnitPriceMinor(costUnitPrice).ok
                          ? true
                          : undefined
                      }
                      onChange={(event) => setCostUnitPrice(event.target.value)}
                    />
                  </FieldContent>
                </Field>
              </div>

              <Field
                data-invalid={
                  Boolean(costError) && costDescription.trim().length === 0
                }
              >
                <FieldLabel htmlFor="job-cost-description">
                  Cost description
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="job-cost-description"
                    ref={costDescriptionRef}
                    value={costDescription}
                    aria-invalid={
                      Boolean(costError) && costDescription.trim().length === 0
                        ? true
                        : undefined
                    }
                    onChange={(event) => setCostDescription(event.target.value)}
                  />
                  <FieldDescription>
                    Keep it short: what was used or what work was carried out.
                  </FieldDescription>
                  <FieldError>{costError}</FieldError>
                </FieldContent>
              </Field>
            </FieldGroup>

            <div className="flex">
              <Button
                type="submit"
                loading={waiting}
                className="w-full sm:w-fit"
              >
                {waiting ? (
                  "Adding..."
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={Briefcase01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Add cost line
                  </>
                )}
              </Button>
            </div>
          </form>
        </CostControls>

        <Separator />

        <CostLines costs={costs} />
      </div>
    </DetailSection>
  );
}

function CostControls({
  canAddCostLine,
  children,
  costsAvailable,
}: {
  readonly canAddCostLine: boolean;
  readonly children: React.ReactNode;
  readonly costsAvailable: boolean;
}) {
  if (!costsAvailable) {
    return (
      <Alert>
        <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
        <AlertTitle>Cost details are not available here.</AlertTitle>
        <AlertDescription>
          This view does not include job cost information.
        </AlertDescription>
      </Alert>
    );
  }

  if (!canAddCostLine) {
    return (
      <Alert>
        <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
        <AlertTitle>Cost tracking is limited here.</AlertTitle>
        <AlertDescription>
          Members can only add costs on jobs assigned to them.
        </AlertDescription>
      </Alert>
    );
  }

  return children;
}

function CostLines({ costs }: { readonly costs: JobDetailResponse["costs"] }) {
  if (costs === undefined) {
    return null;
  }

  if (costs.lines.length === 0) {
    return (
      <DetailEmpty
        title="No costs added yet."
        description="Add labour or materials once the work creates a real cost."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {costs.lines.map((costLine) => (
        <li
          key={costLine.id}
          className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">
                  {COST_LINE_TYPE_LABELS[costLine.type]}
                </Badge>
                <span>
                  {formatQuantity(costLine.quantity)} x{" "}
                  {formatMoneyMinor(costLine.unitPriceMinor)}
                </span>
              </div>
              <span className="text-sm font-semibold text-foreground">
                Line total {formatMoneyMinor(costLine.lineTotalMinor)}
              </span>
            </div>
            <p className="text-sm leading-7 whitespace-pre-wrap">
              {costLine.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function decodeCostLineType(value: string): CostLineType | null {
  return value === "labour" || value === "material" ? value : null;
}

function parseCostLineQuantity(
  value: string
):
  | { readonly ok: true; readonly quantity: number }
  | { readonly ok: false; readonly error: string } {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return { error: "Enter a quantity.", ok: false };
  }

  const quantity = Number(trimmedValue);

  if (Number.isFinite(quantity) && quantity <= 0) {
    return { error: "Quantity must be greater than zero.", ok: false };
  }

  const decimalParts = getDecimalParts(trimmedValue);

  if (!decimalParts) {
    return { error: "Enter a valid quantity.", ok: false };
  }

  if (decimalParts.fractional.length > 2) {
    return {
      error: "Quantity can use at most 2 decimal places.",
      ok: false,
    };
  }

  if (!Number.isFinite(quantity)) {
    return { error: "Enter a valid quantity.", ok: false };
  }

  if (quantity > MAX_JOB_COST_LINE_QUANTITY) {
    return {
      error: "Quantity must be no more than 9,999,999,999.99.",
      ok: false,
    };
  }

  return { ok: true, quantity };
}

function parseCostLineUnitPriceMinor(
  value: string
):
  | { readonly ok: true; readonly unitPriceMinor: number }
  | { readonly ok: false; readonly error: string } {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return { error: "Enter a unit price.", ok: false };
  }

  const unitPriceMajor = Number(trimmedValue);

  if (Number.isFinite(unitPriceMajor) && unitPriceMajor < 0) {
    return { error: "Unit price must be zero or more.", ok: false };
  }

  const decimalParts = getDecimalParts(trimmedValue);

  if (!decimalParts) {
    return { error: "Enter a valid unit price.", ok: false };
  }

  if (decimalParts.fractional.length > 2) {
    return {
      error: "Unit price can use at most 2 decimal places.",
      ok: false,
    };
  }

  if (!Number.isFinite(unitPriceMajor)) {
    return { error: "Enter a valid unit price.", ok: false };
  }

  if (unitPriceMajor > MAX_COST_LINE_UNIT_PRICE_MAJOR) {
    return {
      error: "Unit price must be no more than €21,474,836.47.",
      ok: false,
    };
  }

  const unitPriceMinor =
    Number(decimalParts.whole) * 100 +
    Number(decimalParts.fractional.padEnd(2, "0"));

  if (
    !Number.isSafeInteger(unitPriceMinor) ||
    unitPriceMinor > MAX_JOB_COST_LINE_UNIT_PRICE_MINOR
  ) {
    return {
      error: "Unit price must be no more than €21,474,836.47.",
      ok: false,
    };
  }

  return { ok: true, unitPriceMinor };
}

function getDecimalParts(value: string) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);

  if (!match) {
    return null;
  }

  return {
    fractional: match[2] ?? "",
    whole: match[1],
  };
}

function formatMoneyMinor(value: number) {
  return new Intl.NumberFormat("en-IE", {
    currency: "EUR",
    style: "currency",
  }).format(value / 100);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}
