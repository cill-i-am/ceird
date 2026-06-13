import type { CSSProperties } from "react";

import { cn } from "#/lib/utils";

import "#/components/dotmatrix-loader.css";

const DOT_MATRIX_SIZE = 5;
const DOT_MATRIX_SPEED = 1.35;
const DOT_MATRIX_SPIRAL_ORDER = [
  0, 1, 2, 3, 4, 15, 16, 17, 18, 5, 14, 23, 24, 19, 6, 13, 22, 21, 20, 7, 12,
  11, 10, 9, 8,
] as const;

function DotMatrixGlyph({
  animated = true,
  className,
  dotSize,
  size,
}: {
  readonly animated?: boolean;
  readonly className?: string;
  readonly dotSize: number;
  readonly size: number;
}) {
  const gap = (size - dotSize * DOT_MATRIX_SIZE) / (DOT_MATRIX_SIZE - 1);
  const rootStyle = {
    width: size,
    height: size,
    "--dmx-speed": 1 / DOT_MATRIX_SPEED,
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={cn("dmx-root", className)}
      style={rootStyle}
    >
      <span className="dmx-grid" style={{ gap }}>
        {DOT_MATRIX_SPIRAL_ORDER.map((order) => (
          <span
            key={order}
            aria-hidden="true"
            className={cn("dmx-dot", animated && "dmx-spiral-snake")}
            style={
              {
                width: dotSize,
                height: dotSize,
                "--dmx-spiral-order": order,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </span>
  );
}

export function DotMatrixButtonLoader({
  className,
  visible = true,
}: {
  readonly className?: string;
  readonly visible?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-dot-matrix-button-loader=""
      data-icon="inline-start"
      data-loading-slot=""
      className={cn(
        "inline-flex h-4 shrink-0 items-center justify-center overflow-hidden transition-[width,opacity,transform] duration-150 ease-out motion-reduce:transition-none",
        visible ? "w-4 scale-100 opacity-100" : "w-0 scale-75 opacity-0",
        className
      )}
    >
      <DotMatrixGlyph animated={visible} size={18} dotSize={2.5} />
    </span>
  );
}

export function DotMatrixLoadingState({
  className,
  label,
}: {
  readonly className?: string;
  readonly label: string;
}) {
  return (
    <output
      aria-label={label}
      className={cn(
        "flex min-w-0 animate-in items-center justify-center gap-3 text-sm text-muted-foreground duration-200 fade-in-0 zoom-in-95 motion-reduce:animate-none",
        className
      )}
    >
      <DotMatrixGlyph size={28} dotSize={4} />
      <span>{label}</span>
    </output>
  );
}
