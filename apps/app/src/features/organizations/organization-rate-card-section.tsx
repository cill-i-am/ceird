"use client";

import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import type { Result } from "@effect-atom/atom-react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { RATE_CARD_LINE_KINDS } from "@task-tracker/jobs-core";
import type {
  RateCard,
  RateCardLine,
  RateCardLineInput,
  RateCardLineKind,
} from "@task-tracker/jobs-core";
import { Exit } from "effect";
import * as React from "react";

import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button } from "#/components/ui/button";
import { FieldError } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";

import { OrganizationAsyncResultError } from "./organization-async-result-error";
import {
  createRateCardMutationAtom,
  listRateCardsAtom,
  organizationRateCardsStateAtom,
  updateRateCardMutationAtomFamily,
} from "./organization-configuration-state";

const STANDARD_RATE_CARD_NAME = "Standard";

const RATE_CARD_KIND_LABELS = {
  callout: "Callout",
  custom: "Custom",
  labour: "Labour",
  material_markup: "Material markup",
} satisfies Record<RateCardLineKind, string>;

const RATE_CARD_KIND_OPTIONS: readonly {
  readonly label: string;
  readonly value: RateCardLineKind;
}[] = RATE_CARD_LINE_KINDS.map((kind) => ({
  label: RATE_CARD_KIND_LABELS[kind],
  value: kind,
}));

interface EditableRateCardLine {
  readonly id: string;
  readonly kind: RateCardLineKind;
  readonly name: string;
  readonly unit: string;
  readonly value: string;
}

interface RateCardLineErrors {
  name?: string;
  unit?: string;
  value?: string;
}

export function OrganizationRateCardSection() {
  const rateCards = useAtomValue(organizationRateCardsStateAtom).items;
  const listResult = useAtomValue(listRateCardsAtom);
  const loadRateCards = useAtomSet(listRateCardsAtom, {
    mode: "promiseExit",
  });
  const [rateCardsLoaded, setRateCardsLoaded] = React.useState(false);
  const standardRateCard =
    rateCards.find((rateCard) => rateCard.name === STANDARD_RATE_CARD_NAME) ??
    null;

  React.useEffect(() => {
    let active = true;
    setRateCardsLoaded(false);

    void (async () => {
      const exit = await loadRateCards();

      if (active && Exit.isSuccess(exit)) {
        setRateCardsLoaded(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadRateCards]);

  return (
    <AppUtilityPanel
      title="Rate card"
      description="Maintain a standard reference list for admin and quoting conversations."
      className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5"
    >
      <div className="flex flex-col gap-1 border-y border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            {STANDARD_RATE_CARD_NAME}
          </h3>
          <p className="text-sm text-muted-foreground">
            One editable standard card for organization reference rates.
          </p>
        </div>
        {listResult.waiting ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : null}
      </div>

      <OrganizationAsyncResultError result={listResult} />

      <RateCardEditorSlot
        listFailed={listResult._tag === "Failure"}
        rateCardsLoaded={rateCardsLoaded}
        standardRateCard={standardRateCard}
      />
    </AppUtilityPanel>
  );
}

function RateCardEditorSlot({
  listFailed,
  rateCardsLoaded,
  standardRateCard,
}: {
  readonly listFailed: boolean;
  readonly rateCardsLoaded: boolean;
  readonly standardRateCard: RateCard | null;
}) {
  if (standardRateCard) {
    return <ExistingStandardRateCardEditor rateCard={standardRateCard} />;
  }

  if (rateCardsLoaded) {
    return <DraftStandardRateCardEditor />;
  }

  if (listFailed) {
    return null;
  }

  return <p className="text-sm text-muted-foreground">Loading rate card...</p>;
}

function ExistingStandardRateCardEditor({
  rateCard,
}: {
  readonly rateCard: RateCard;
}) {
  const updateResult = useAtomValue(
    updateRateCardMutationAtomFamily(rateCard.id)
  );
  const updateRateCard = useAtomSet(
    updateRateCardMutationAtomFamily(rateCard.id),
    {
      mode: "promiseExit",
    }
  );

  return (
    <RateCardForm
      initialLines={rateCard.lines}
      mutationResult={updateResult}
      onSave={(lines) => {
        if (areRateCardLinesEqual(lines, rateCard.lines)) {
          return Promise.resolve(Exit.succeed(null));
        }

        return updateRateCard({
          lines,
          name: STANDARD_RATE_CARD_NAME,
        });
      }}
    />
  );
}

function DraftStandardRateCardEditor() {
  const createResult = useAtomValue(createRateCardMutationAtom);
  const createRateCard = useAtomSet(createRateCardMutationAtom, {
    mode: "promiseExit",
  });

  return (
    <RateCardForm
      initialLines={[]}
      mutationResult={createResult}
      onSave={(lines) =>
        createRateCard({
          lines,
          name: STANDARD_RATE_CARD_NAME,
        })
      }
    />
  );
}

function RateCardForm({
  initialLines,
  mutationResult,
  onSave,
}: {
  readonly initialLines: readonly RateCardLine[];
  readonly mutationResult: Result.Result<unknown, { readonly message: string }>;
  readonly onSave: (
    lines: readonly RateCardLineInput[]
  ) => Promise<Exit.Exit<unknown, unknown>>;
}) {
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const nextLineIdRef = React.useRef(0);
  const [lines, setLines] = React.useState<readonly EditableRateCardLine[]>(
    () => initialLines.map(toEditableLine)
  );
  const [lineErrors, setLineErrors] = React.useState<
    Readonly<Record<string, RateCardLineErrors>>
  >({});

  React.useEffect(() => {
    setLines(initialLines.map(toEditableLine));
    setLineErrors({});
  }, [initialLines]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mutationResult.waiting) {
      return;
    }

    const result = buildRateCardLinePayload(lines);
    setLineErrors(result.errors);

    if (Object.keys(result.errors).length > 0) {
      return;
    }

    const exit = await onSave(result.lines);

    if (Exit.isSuccess(exit)) {
      setLineErrors({});
    }
  }

  function addLine() {
    nextLineIdRef.current += 1;
    setLines((current) => [
      ...current,
      {
        id: `draft-${nextLineIdRef.current}`,
        kind: "labour",
        name: "",
        unit: "",
        value: "0",
      },
    ]);
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
    setLineErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => id !== lineId)
      )
    );
  }

  const commandActions = React.useMemo<readonly CommandAction[]>(
    () => [
      {
        disabled: mutationResult.waiting,
        group: "Current page",
        id: "rate-card-add-line",
        run: addLine,
        scope: "route",
        title: "Add rate-card line",
      },
      {
        disabled: mutationResult.waiting,
        group: "Current page",
        id: "rate-card-save",
        run: () => formRef.current?.requestSubmit(),
        scope: "route",
        title: "Save rate card",
      },
    ],
    [mutationResult.waiting]
  );
  useRegisterCommandActions(commandActions);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit}
    >
      {lines.length > 0 ? (
        <div className="flex flex-col divide-y divide-border/60 border-y border-border/60">
          {lines.map((line, index) => (
            <RateCardLineRow
              key={line.id}
              index={index}
              line={line}
              errors={lineErrors[line.id] ?? {}}
              onChange={(nextLine) =>
                setLines((current) =>
                  current.map((item) => (item.id === line.id ? nextLine : item))
                )
              }
              onRemove={() => removeLine(line.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No lines have been added yet.
        </p>
      )}

      <OrganizationAsyncResultError result={mutationResult} />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={mutationResult.waiting}
          onClick={addLine}
        >
          Add line
        </Button>
        <Button type="submit" loading={mutationResult.waiting}>
          Save rate card
          <span aria-hidden="true">
            <ShortcutHint
              className="ml-1"
              hotkey={HOTKEYS.settingsSubmit.hotkey}
              label="Save rate card"
            />
          </span>
        </Button>
      </div>
    </form>
  );
}

function RateCardLineRow({
  errors,
  index,
  line,
  onChange,
  onRemove,
}: {
  readonly errors: RateCardLineErrors;
  readonly index: number;
  readonly line: EditableRateCardLine;
  readonly onChange: (line: EditableRateCardLine) => void;
  readonly onRemove: () => void;
}) {
  const lineNumber = index + 1;
  const kindId = React.useId();
  const nameId = React.useId();
  const valueId = React.useId();
  const unitId = React.useId();
  const commandActions = React.useMemo<readonly CommandAction[]>(
    () => [
      {
        group: "Current page",
        id: `rate-card-remove-line-${line.id}`,
        run: onRemove,
        scope: "route",
        title: `Remove rate-card line ${lineNumber}: ${line.name || "Untitled"}`,
      },
    ],
    [line.id, line.name, lineNumber, onRemove]
  );
  useRegisterCommandActions(commandActions);

  return (
    <div className="grid gap-3 py-3 md:grid-cols-[minmax(8rem,0.85fr)_minmax(9rem,1fr)_minmax(7rem,0.55fr)_minmax(7rem,0.6fr)_auto]">
      <label
        className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
        htmlFor={kindId}
      >
        Kind for line {lineNumber}
        <select
          id={kindId}
          className="h-9 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          value={line.kind}
          onChange={(event) => {
            const kind = resolveRateCardLineKind(event.target.value);

            if (!kind) {
              return;
            }

            onChange({
              ...line,
              kind,
            });
          }}
        >
          {RATE_CARD_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label
        className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
        htmlFor={nameId}
      >
        Name for line {lineNumber}
        <Input
          id={nameId}
          value={line.name}
          aria-invalid={Boolean(errors.name) || undefined}
          onChange={(event) =>
            onChange({
              ...line,
              name: event.target.value,
            })
          }
        />
        <FieldError>{errors.name}</FieldError>
      </label>
      <label
        className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
        htmlFor={valueId}
      >
        Value for line {lineNumber}
        <Input
          id={valueId}
          type="number"
          min="0"
          step="0.01"
          value={line.value}
          aria-invalid={Boolean(errors.value) || undefined}
          onChange={(event) =>
            onChange({
              ...line,
              value: event.target.value,
            })
          }
        />
        <FieldError>{errors.value}</FieldError>
      </label>
      <label
        className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
        htmlFor={unitId}
      >
        Unit for line {lineNumber}
        <Input
          id={unitId}
          value={line.unit}
          aria-invalid={Boolean(errors.unit) || undefined}
          onChange={(event) =>
            onChange({
              ...line,
              unit: event.target.value,
            })
          }
        />
        <FieldError>{errors.unit}</FieldError>
      </label>
      <div className="flex items-end">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label={`Remove line ${lineNumber}`}
                onClick={onRemove}
              />
            }
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </TooltipTrigger>
          <TooltipContent>Remove line {lineNumber}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function toEditableLine(line: RateCardLine): EditableRateCardLine {
  return {
    id: line.id,
    kind: line.kind,
    name: line.name,
    unit: line.unit,
    value: String(line.value),
  };
}

function buildRateCardLinePayload(lines: readonly EditableRateCardLine[]) {
  const errors: Record<string, RateCardLineErrors> = {};
  const payload: RateCardLineInput[] = [];

  for (const [index, line] of lines.entries()) {
    const lineErrors: RateCardLineErrors = {};
    const name = line.name.trim();
    const unit = line.unit.trim();
    const rawValue = line.value.trim();

    if (!name) {
      lineErrors.name = "Add a line name.";
    }

    if (!unit) {
      lineErrors.unit = "Add a unit.";
    }

    if (rawValue) {
      const value = Number(rawValue);

      if (!Number.isFinite(value)) {
        lineErrors.value = "Add a value.";
      } else if (value < 0) {
        lineErrors.value = "Use zero or a positive value.";
      }
    } else {
      lineErrors.value = "Add a value.";
    }

    if (Object.keys(lineErrors).length > 0) {
      errors[line.id] = lineErrors;
      continue;
    }

    const value = Number(rawValue);

    payload.push({
      kind: line.kind,
      name,
      position: index + 1,
      unit,
      value,
    });
  }

  return {
    errors,
    lines: payload,
  };
}

function resolveRateCardLineKind(value: string): RateCardLineKind | null {
  return (
    RATE_CARD_KIND_OPTIONS.find((option) => option.value === value)?.value ??
    null
  );
}

function areRateCardLinesEqual(
  input: readonly RateCardLineInput[],
  current: readonly RateCardLine[]
) {
  return (
    input.length === current.length &&
    input.every((line, index) => {
      const currentLine = current[index];

      return (
        currentLine !== undefined &&
        line.kind === currentLine.kind &&
        line.name === currentLine.name &&
        line.position === currentLine.position &&
        line.unit === currentLine.unit &&
        line.value === currentLine.value
      );
    })
  );
}
