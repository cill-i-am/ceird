"use client";

import type { LabelColor } from "@ceird/labels-core";
import {
  DEFAULT_LABEL_COLOR,
  LabelColorSchema,
  LABEL_COLOR_OPTIONS,
} from "@ceird/labels-core";
import { Schema } from "effect";
import { Check, Palette, Pipette, SlidersHorizontal } from "lucide-react";
import * as React from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";

const decodeLabelColor = Schema.decodeUnknownSync(LabelColorSchema);
const DEFAULT_PICKER_STATE = parseLabelColor(DEFAULT_LABEL_COLOR);
const MAX_CHROMA = 0.28;

export function LabelColorPicker({
  disabled = false,
  id,
  label = "Label color",
  value,
  onChange,
}: {
  readonly disabled?: boolean;
  readonly id?: string | undefined;
  readonly label?: string | undefined;
  readonly onChange: (color: LabelColor) => void;
  readonly value: LabelColor;
}) {
  const selectedOption = getLabelColorOption(value);
  const [open, setOpen] = React.useState(false);
  const [draftColor, setDraftColor] = React.useState<LabelColor>(value);

  React.useEffect(() => {
    if (!open) {
      setDraftColor(value);
    }
  }, [open, value]);

  return (
    <div className="grid gap-2" id={id}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {selectedOption?.name ?? "Custom color"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <LabelColorBank disabled={disabled} value={value} onChange={onChange} />
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      aria-label="Open advanced label color picker"
                    />
                  }
                />
              }
            >
              <Palette aria-hidden="true" />
              Advanced
            </TooltipTrigger>
            <TooltipContent>Choose a custom label color</TooltipContent>
          </Tooltip>
          <PopoverContent
            align="start"
            className="w-[min(calc(100vw-2rem),22rem)] gap-3"
          >
            <AdvancedLabelColorPicker
              value={draftColor}
              onCancel={() => {
                setDraftColor(value);
                setOpen(false);
              }}
              onCommit={(color) => {
                onChange(color);
                setOpen(false);
              }}
              onDraftChange={setDraftColor}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function LabelColorBank({
  disabled,
  value,
  onChange,
}: {
  readonly disabled: boolean;
  readonly onChange: (color: LabelColor) => void;
  readonly value: LabelColor;
}) {
  return (
    <div
      className="grid grid-cols-9 gap-1.5"
      role="radiogroup"
      aria-label="Curated label colors"
    >
      {LABEL_COLOR_OPTIONS.map((option) => {
        const selected = option.color === value;

        return (
          <Tooltip key={option.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Swatches are touch-friendly buttons with radiogroup semantics.
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${option.name}: ${option.role}`}
                  disabled={disabled}
                  className={cn(
                    "group/color relative flex size-9 touch-manipulation items-center justify-center rounded-lg border bg-background transition-[border-color,box-shadow,transform,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
                    selected
                      ? "border-foreground shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]"
                      : "border-border hover:border-foreground/50"
                  )}
                  onClick={() => onChange(option.color)}
                >
                  <span
                    className="size-5 rounded-full border border-black/15 shadow-inner"
                    style={{ backgroundColor: option.color }}
                  />
                  {selected ? (
                    <Check
                      className="absolute right-0.5 bottom-0.5 size-3 rounded-full bg-background text-foreground"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              }
            />
            <TooltipContent>{`${option.name}: ${option.role}`}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function AdvancedLabelColorPicker({
  value,
  onCancel,
  onCommit,
  onDraftChange,
}: {
  readonly onCancel: () => void;
  readonly onCommit: (color: LabelColor) => void;
  readonly onDraftChange: (color: LabelColor) => void;
  readonly value: LabelColor;
}) {
  const picker = parseLabelColor(value);
  const [textValue, setTextValue] = React.useState(value);
  const [error, setError] = React.useState<string | null>(null);
  const visualPickerRef = React.useRef<HTMLDivElement>(null);
  const hueInputId = React.useId();
  const textInputId = React.useId();
  const canUseEyeDropper = useCanUseEyeDropper();

  React.useEffect(() => {
    setTextValue(value);
    setError(null);
  }, [value]);

  const commitPickerState = React.useCallback(
    (state: OklchPickerState) => {
      onDraftChange(formatOklch(state));
    },
    [onDraftChange]
  );

  const setFromVisualPoint = React.useCallback(
    (clientX: number, clientY: number) => {
      const element = visualPickerRef.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const x = clamp((clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((clientY - rect.top) / rect.height, 0, 1);

      commitPickerState({
        chroma: roundPickerNumber(x * MAX_CHROMA, 4),
        hue: picker.hue,
        lightness: roundPickerNumber(96 - y * 56, 3),
      });
    },
    [commitPickerState, picker.hue]
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <div
          className="size-12 rounded-lg border border-border shadow-inner"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">Custom label color</p>
          <p className="truncate text-xs text-muted-foreground">{value}</p>
        </div>
      </div>

      <div
        ref={visualPickerRef}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- This 2D picker exposes keyboard slider semantics over a custom pointer surface.
        role="slider"
        tabIndex={0}
        aria-label="Adjust label color lightness and strength"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(picker.lightness)}
        className="relative h-40 touch-none rounded-lg border border-border outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        style={{
          background: `linear-gradient(to top, oklch(40% 0 ${picker.hue}), oklch(96% 0 ${picker.hue})), linear-gradient(to right, oklch(70% 0 ${picker.hue}), oklch(70% ${MAX_CHROMA} ${picker.hue}))`,
          backgroundBlendMode: "multiply",
        }}
        onKeyDown={(event) => {
          const lightnessDelta = getKeyboardLightnessDelta(event.key);
          const chromaDelta = getKeyboardChromaDelta(event.key);

          if (lightnessDelta === 0 && chromaDelta === 0) {
            return;
          }

          event.preventDefault();
          commitPickerState({
            chroma: roundPickerNumber(
              clamp(picker.chroma + chromaDelta, 0, MAX_CHROMA),
              4
            ),
            hue: picker.hue,
            lightness: roundPickerNumber(
              clamp(picker.lightness + lightnessDelta, 0, 100),
              3
            ),
          });
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setFromVisualPoint(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }

          setFromVisualPoint(event.clientX, event.clientY);
        }}
      >
        <span
          className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--foreground),0_1px_4px_rgb(0_0_0/0.25)]"
          style={{
            backgroundColor: value,
            left: `${clamp((picker.chroma / MAX_CHROMA) * 100, 0, 100)}%`,
            top: `${clamp(((96 - picker.lightness) / 56) * 100, 0, 100)}%`,
          }}
        />
      </div>

      <label
        className="grid gap-1.5 text-xs font-medium text-muted-foreground"
        htmlFor={hueInputId}
      >
        Hue
        <input
          id={hueInputId}
          type="range"
          min={0}
          max={359}
          value={Math.round(picker.hue)}
          aria-label="Label color hue"
          className="h-8 w-full accent-primary"
          style={{
            background:
              "linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)",
          }}
          onChange={(event) =>
            commitPickerState({
              ...picker,
              hue: Number(event.currentTarget.value),
            })
          }
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label
          className="grid gap-1.5 text-xs font-medium text-muted-foreground"
          htmlFor={textInputId}
        >
          OKLCH or hex
          <Input
            id={textInputId}
            value={textValue}
            spellCheck={false}
            aria-invalid={error !== null}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;
              setTextValue(nextValue);
              const normalized = normalizeLabelColorInput(nextValue);

              if (normalized.kind === "valid") {
                setError(null);
                onDraftChange(normalized.color);
              } else {
                setError(normalized.message);
              }
            }}
          />
        </label>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                className="self-end"
                disabled={!canUseEyeDropper}
                aria-label="Pick a label color from the screen"
                onClick={() => {
                  void (async () => {
                    try {
                      const color = await pickScreenColor();

                      if (color) {
                        onDraftChange(color);
                      }
                    } catch {
                      // Canceling the browser picker should leave the draft unchanged.
                    }
                  })();
                }}
              />
            }
          >
            <Pipette aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>
            {canUseEyeDropper
              ? "Pick a color from the screen"
              : "Screen color picker is unavailable in this browser"}
          </TooltipContent>
        </Tooltip>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={error !== null}
          onClick={() => onCommit(value)}
        >
          <SlidersHorizontal aria-hidden="true" />
          Apply color
        </Button>
      </div>
    </div>
  );
}

export function normalizeLabelColorInput(
  input: string
):
  | { readonly color: LabelColor; readonly kind: "valid" }
  | { readonly kind: "invalid"; readonly message: string } {
  const value = input.trim();

  if (value.length === 0) {
    return {
      kind: "invalid",
      message: "Choose a color before saving the label.",
    };
  }

  try {
    return { color: decodeLabelColor(value), kind: "valid" };
  } catch {
    const hex = normalizeHexColor(value);

    if (hex) {
      return { color: hexToOklch(hex), kind: "valid" };
    }

    return {
      kind: "invalid",
      message: "Use canonical OKLCH like oklch(64% 0.19 28) or a hex color.",
    };
  }
}

export function getLabelColorOption(color: LabelColor) {
  return LABEL_COLOR_OPTIONS.find((option) => option.color === color) ?? null;
}

function useCanUseEyeDropper() {
  const [canUseEyeDropper, setCanUseEyeDropper] = React.useState(false);

  React.useEffect(() => {
    setCanUseEyeDropper(
      typeof window !== "undefined" && "EyeDropper" in window
    );
  }, []);

  return canUseEyeDropper;
}

async function pickScreenColor(): Promise<LabelColor | null> {
  if (typeof window === "undefined" || !("EyeDropper" in window)) {
    return null;
  }

  const eyeDropper = new (
    window as unknown as {
      readonly EyeDropper: new () => {
        open: () => Promise<{ readonly sRGBHex: string }>;
      };
    }
  ).EyeDropper();
  const result = await eyeDropper.open();

  return hexToOklch(result.sRGBHex);
}

interface OklchPickerState {
  readonly chroma: number;
  readonly hue: number;
  readonly lightness: number;
}

function parseLabelColor(color: LabelColor): OklchPickerState {
  const match =
    /^oklch\((\d{1,3}(?:\.\d{1,3})?)% (0(?:\.\d{1,4})?|[1-9]\d*(?:\.\d{1,4})?) (\d{1,3}(?:\.\d{1,3})?)\)$/.exec(
      color
    );

  if (!match) {
    return DEFAULT_PICKER_STATE;
  }

  return {
    chroma: Number(match[2]),
    hue: Number(match[3]),
    lightness: Number(match[1]),
  };
}

function getKeyboardLightnessDelta(key: string) {
  if (key === "ArrowUp") {
    return 2;
  }

  if (key === "ArrowDown") {
    return -2;
  }

  return 0;
}

function getKeyboardChromaDelta(key: string) {
  if (key === "ArrowRight") {
    return 0.01;
  }

  if (key === "ArrowLeft") {
    return -0.01;
  }

  return 0;
}

function formatOklch(state: OklchPickerState): LabelColor {
  return decodeLabelColor(
    `oklch(${formatNumber(state.lightness, 3)}% ${formatNumber(
      state.chroma,
      4
    )} ${formatNumber(moduloHue(state.hue), 3)})`
  );
}

function normalizeHexColor(value: string) {
  const shortMatch = /^#?([0-9a-f]{3})$/i.exec(value);

  if (shortMatch?.[1]) {
    return `#${[...shortMatch[1]]
      .map((character) => `${character}${character}`)
      .join("")}`.toLowerCase();
  }

  const longMatch = /^#?([0-9a-f]{6})$/i.exec(value);

  return longMatch?.[1] ? `#${longMatch[1].toLowerCase()}` : null;
}

function hexToOklch(hex: string): LabelColor {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const linearRed = srgbToLinear(red);
  const linearGreen = srgbToLinear(green);
  const linearBlue = srgbToLinear(blue);
  const lmsL = Math.cbrt(
    0.412_221_470_8 * linearRed +
      0.536_332_536_3 * linearGreen +
      0.051_445_992_9 * linearBlue
  );
  const lmsM = Math.cbrt(
    0.211_903_498_2 * linearRed +
      0.680_699_545_1 * linearGreen +
      0.107_396_956_6 * linearBlue
  );
  const lmsS = Math.cbrt(
    0.088_302_461_9 * linearRed +
      0.281_718_837_6 * linearGreen +
      0.629_978_700_5 * linearBlue
  );
  const lightness =
    0.210_454_255_3 * lmsL + 0.793_617_785 * lmsM - 0.004_072_046_8 * lmsS;
  const a =
    1.977_998_495_1 * lmsL - 2.428_592_205 * lmsM + 0.450_593_709_9 * lmsS;
  const b =
    0.025_904_037_1 * lmsL + 0.782_771_766_2 * lmsM - 0.808_675_766 * lmsS;
  const chroma = Math.hypot(a, b);
  const hue = moduloHue((Math.atan2(b, a) * 180) / Math.PI);

  return formatOklch({
    chroma: roundPickerNumber(chroma, 4),
    hue: roundPickerNumber(hue, 3),
    lightness: roundPickerNumber(lightness * 100, 3),
  });
}

function srgbToLinear(value: number) {
  return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function moduloHue(hue: number) {
  return ((hue % 360) + 360) % 360;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundPickerNumber(value: number, digits: number) {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

function formatNumber(value: number, digits: number) {
  const rounded = roundPickerNumber(value, digits);

  return rounded.toFixed(digits).replace(/\.?0+$/, "");
}
