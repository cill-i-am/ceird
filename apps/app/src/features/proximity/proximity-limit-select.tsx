"use client";

import type { ProximityLimit } from "@ceird/proximity-core";

import { Select } from "#/components/ui/select";

import {
  PROXIMITY_RESULT_LIMIT_OPTIONS,
  type ProximityResultLimitOption,
  normalizeProximityResultLimit,
} from "./proximity-state";

export function ProximityLimitSelect({
  disabled,
  id = "proximity-route-limit",
  onLimitChange,
  value,
}: {
  readonly disabled?: boolean;
  readonly id?: string;
  readonly onLimitChange: (limit: ProximityResultLimitOption) => void;
  readonly value: ProximityLimit;
}) {
  return (
    <label
      htmlFor={id}
      className="flex h-8 items-center gap-2 text-sm text-foreground"
    >
      <span className="text-muted-foreground">Limit</span>
      <Select
        aria-label="Route result limit"
        className="h-8 w-24 bg-background text-sm"
        disabled={disabled}
        id={id}
        value={String(value)}
        onChange={(event) =>
          onLimitChange(
            normalizeProximityResultLimit(
              event.currentTarget.value
            ) as ProximityResultLimitOption
          )
        }
      >
        {PROXIMITY_RESULT_LIMIT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 25 ? "25 (max)" : option}
          </option>
        ))}
      </Select>
    </label>
  );
}
