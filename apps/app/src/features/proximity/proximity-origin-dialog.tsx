"use client";

import type { ProximityOriginSuggestion } from "@ceird/proximity-core";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
import { cn } from "#/lib/utils";

export function ProximityOriginDialog({
  error,
  loading = false,
  onConfirm,
  onOpenChange,
  onQueryChange,
  onSuggestionSelect,
  open,
  query,
  selectedSuggestion,
  suggestions,
}: {
  readonly error?: string | null | undefined;
  readonly loading?: boolean;
  readonly onConfirm: (suggestion: ProximityOriginSuggestion) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onQueryChange: (query: string) => void;
  readonly onSuggestionSelect: (suggestion: ProximityOriginSuggestion) => void;
  readonly open: boolean;
  readonly query: string;
  readonly selectedSuggestion: ProximityOriginSuggestion | null;
  readonly suggestions: readonly ProximityOriginSuggestion[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose route origin</DialogTitle>
          <DialogDescription>
            Select an address, Eircode, or place to calculate traffic-aware
            routes from. Ceird does not save this origin.
          </DialogDescription>
        </DialogHeader>

        <InputGroup>
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search address, Eircode or place"
            placeholder="Search address, Eircode or place"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </InputGroup>

        <ul
          aria-label="Origin suggestions"
          className="m-0 grid max-h-72 list-none gap-1 overflow-y-auto p-0"
        >
          {suggestions.length === 0 ? (
            <li className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
              Search and select a result before running Near me.
            </li>
          ) : null}
          {suggestions.map((suggestion) => {
            const selected = suggestion.placeId === selectedSuggestion?.placeId;

            return (
              <li key={suggestion.placeId}>
                <button
                  aria-label={formatOriginSuggestionLabel(suggestion)}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full min-w-0 flex-col rounded-lg border px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
                    selected
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-background text-foreground"
                  )}
                  type="button"
                  onClick={() => onSuggestionSelect(suggestion)}
                >
                  <span className="truncate font-medium">
                    {suggestion.displayText}
                  </span>
                  {suggestion.secondaryText ? (
                    <span className="mt-0.5 truncate text-xs text-muted-foreground">
                      {suggestion.secondaryText}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            disabled={selectedSuggestion === null}
            loading={loading}
            onClick={() => {
              if (selectedSuggestion !== null) {
                onConfirm(selectedSuggestion);
              }
            }}
          >
            Use selected origin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatOriginSuggestionLabel(suggestion: ProximityOriginSuggestion) {
  return suggestion.secondaryText
    ? `${suggestion.displayText}, ${suggestion.secondaryText}`
    : suggestion.displayText;
}
