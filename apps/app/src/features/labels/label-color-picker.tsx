"use client";

import type { LabelColor } from "@ceird/labels-core";
import {
  DEFAULT_LABEL_COLOR,
  LabelColorSchema,
  LABEL_COLOR_OPTIONS,
} from "@ceird/labels-core";
import { Schema } from "effect";
import { Check, Palette, Pipette } from "lucide-react";
import * as React from "react";

import { Button } from "#/components/ui/button";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
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
const PICKER_CHROMA_MAX = 0.28;
const PICKER_LIGHTNESS_MIN = 40;
const PICKER_LIGHTNESS_MAX = 96;
const PICKER_LIGHTNESS_RANGE = PICKER_LIGHTNESS_MAX - PICKER_LIGHTNESS_MIN;
const PICKER_CANVAS_LIGHTNESS = 70;
const HUE_MIN = 0;
const HUE_MAX = 359;
const KEYBOARD_LIGHTNESS_STEP = 2;
const KEYBOARD_CHROMA_STEP = 0.01;
const OKLCH_LIGHTNESS_DIGITS = 3;
const OKLCH_CHROMA_DIGITS = 4;
const OKLCH_HUE_DIGITS = 3;

export function LabelColorPicker({
  className,
  disabled = false,
  label = "Label color",
  value,
  onChange,
}: {
  readonly className?: string | undefined;
  readonly disabled?: boolean;
  readonly label?: string | undefined;
  readonly onChange: (color: LabelColor) => void;
  readonly value: LabelColor;
}) {
  const selectedOption = getLabelColorOption(value);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"advanced" | "bank">("bank");

  React.useEffect(() => {
    if (!open) {
      setMode("bank");
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={className}
                  disabled={disabled}
                  aria-label={`Choose ${label.toLowerCase()}`}
                />
              }
            />
          }
        >
          <span
            className="size-5 rounded-full border border-black/15 shadow-inner"
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
        </TooltipTrigger>
        <TooltipContent>
          {selectedOption?.name ?? "Custom color"}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className={cn(
          "gap-3",
          mode === "advanced"
            ? "w-[min(calc(100vw-2rem),31rem)]"
            : "w-[min(calc(100vw-2rem),22rem)]"
        )}
      >
        {mode === "bank" ? (
          <div className="grid gap-2.5">
            <p className="text-sm font-medium">{label}</p>
            <LabelColorBank
              disabled={disabled}
              value={value}
              onChange={(color) => {
                onChange(color);
                setOpen(false);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              onClick={() => {
                setMode("advanced");
              }}
            >
              <Palette data-icon="inline-start" aria-hidden="true" />
              Advanced
            </Button>
          </div>
        ) : (
          <div className="animate-in duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] fade-in-0 slide-in-from-right-1 motion-reduce:animate-none">
            <AdvancedLabelColorPicker value={value} onChange={onChange} />
          </div>
        )}
      </PopoverContent>
    </Popover>
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
  onChange,
  value,
}: {
  readonly onChange: (color: LabelColor) => void;
  readonly value: LabelColor;
}) {
  const picker = parseLabelColor(value);
  const [textValue, setTextValue] = React.useState(oklchToHex(value));
  const [error, setError] = React.useState<string | null>(null);
  const visualPickerRef = React.useRef<HTMLDivElement>(null);
  const hueInputId = React.useId();
  const textInputId = React.useId();
  const canUseEyeDropper = useCanUseEyeDropper();

  React.useEffect(() => {
    setTextValue(oklchToHex(value));
    setError(null);
  }, [value]);

  const commitPickerState = React.useCallback(
    (state: OklchPickerState) => {
      onChange(formatOklch(state));
    },
    [onChange]
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
        chroma: roundPickerNumber(x * PICKER_CHROMA_MAX, OKLCH_CHROMA_DIGITS),
        hue: picker.hue,
        lightness: roundPickerNumber(
          PICKER_LIGHTNESS_MAX - y * PICKER_LIGHTNESS_RANGE,
          OKLCH_LIGHTNESS_DIGITS
        ),
      });
    },
    [commitPickerState, picker.hue]
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <span
          className="size-6 shrink-0 rounded-full border border-black/10 shadow-inner"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <Field
          data-invalid={error !== null || undefined}
          className="min-w-0 flex-1 gap-1"
        >
          <FieldLabel className="sr-only" htmlFor={textInputId}>
            Label color value
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>HEX</InputGroupAddon>
            <InputGroupInput
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
                  onChange(normalized.color);
                } else {
                  setError(normalized.message);
                }
              }}
            />
            <InputGroupAddon align="inline-end">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canUseEyeDropper}
                      aria-label="Pick a label color from the screen"
                      onClick={() => {
                        void (async () => {
                          try {
                            const color = await pickScreenColor();

                            if (color) {
                              onChange(color);
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
            </InputGroupAddon>
          </InputGroup>
          {error ? <FieldError className="text-xs">{error}</FieldError> : null}
        </Field>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_1.75rem] gap-3">
        <div
          ref={visualPickerRef}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- This 2D picker exposes keyboard slider semantics over a custom pointer surface.
          role="slider"
          tabIndex={0}
          aria-label="Adjust label color lightness and strength"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(picker.lightness)}
          className="relative h-28 touch-none rounded-md border border-border outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          style={{
            background: `linear-gradient(to top, oklch(${PICKER_LIGHTNESS_MIN}% 0 ${picker.hue}), oklch(${PICKER_LIGHTNESS_MAX}% 0 ${picker.hue})), linear-gradient(to right, oklch(${PICKER_CANVAS_LIGHTNESS}% 0 ${picker.hue}), oklch(${PICKER_CANVAS_LIGHTNESS}% ${PICKER_CHROMA_MAX} ${picker.hue}))`,
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
                clamp(picker.chroma + chromaDelta, 0, PICKER_CHROMA_MAX),
                OKLCH_CHROMA_DIGITS
              ),
              hue: picker.hue,
              lightness: roundPickerNumber(
                clamp(picker.lightness + lightnessDelta, 0, 100),
                OKLCH_LIGHTNESS_DIGITS
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
            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--foreground),0_1px_4px_rgb(0_0_0/0.25)]"
            style={{
              backgroundColor: value,
              left: `${clamp((picker.chroma / PICKER_CHROMA_MAX) * 100, 0, 100)}%`,
              top: `${clamp(
                ((PICKER_LIGHTNESS_MAX - picker.lightness) /
                  PICKER_LIGHTNESS_RANGE) *
                  100,
                0,
                100
              )}%`,
            }}
          />
        </div>

        <label className="grid justify-items-center gap-1" htmlFor={hueInputId}>
          <span className="sr-only">Hue</span>
          <input
            id={hueInputId}
            type="range"
            min={HUE_MIN}
            max={HUE_MAX}
            value={Math.round(picker.hue)}
            aria-label="Label color hue"
            className="h-28 w-6 accent-primary"
            style={{
              background:
                "linear-gradient(to top, red, yellow, lime, cyan, blue, magenta, red)",
              direction: "rtl",
              writingMode: "vertical-lr",
            }}
            onChange={(event) =>
              commitPickerState({
                ...picker,
                hue: Number(event.currentTarget.value),
              })
            }
          />
        </label>
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
    return KEYBOARD_LIGHTNESS_STEP;
  }

  if (key === "ArrowDown") {
    return -KEYBOARD_LIGHTNESS_STEP;
  }

  return 0;
}

function getKeyboardChromaDelta(key: string) {
  if (key === "ArrowRight") {
    return KEYBOARD_CHROMA_STEP;
  }

  if (key === "ArrowLeft") {
    return -KEYBOARD_CHROMA_STEP;
  }

  return 0;
}

function formatOklch(state: OklchPickerState): LabelColor {
  return decodeLabelColor(
    `oklch(${formatNumber(state.lightness, OKLCH_LIGHTNESS_DIGITS)}% ${formatNumber(
      state.chroma,
      OKLCH_CHROMA_DIGITS
    )} ${formatNumber(moduloHue(state.hue), OKLCH_HUE_DIGITS)})`
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
    chroma: roundPickerNumber(chroma, OKLCH_CHROMA_DIGITS),
    hue: roundPickerNumber(hue, OKLCH_HUE_DIGITS),
    lightness: roundPickerNumber(lightness * 100, OKLCH_LIGHTNESS_DIGITS),
  });
}

function oklchToHex(color: LabelColor) {
  const { chroma, hue, lightness } = parseLabelColor(color);
  const lightnessRatio = lightness / 100;
  const hueRadians = (moduloHue(hue) * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const lmsL = lightnessRatio + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const lmsM = lightnessRatio - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const lmsS = lightnessRatio - 0.089_484_177_5 * a - 1.291_485_548 * b;
  const linearL = lmsL ** 3;
  const linearM = lmsM ** 3;
  const linearS = lmsS ** 3;
  const red =
    4.076_741_662_1 * linearL -
    3.307_711_591_3 * linearM +
    0.230_969_929_2 * linearS;
  const green =
    -1.268_438_004_6 * linearL +
    2.609_757_401_1 * linearM -
    0.341_319_396_5 * linearS;
  const blue =
    -0.004_196_086_3 * linearL -
    0.703_418_614_7 * linearM +
    1.707_614_701 * linearS;

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round(clamp(linearToSrgb(channel), 0, 1) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function srgbToLinear(value: number) {
  return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number) {
  return value <= 0.003_130_8
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;
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
