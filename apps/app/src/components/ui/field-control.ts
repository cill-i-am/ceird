export const fieldSurfaceClassName =
  "rounded-lg border border-input bg-background";

export const fieldTransitionClassName =
  "transition-[color,box-shadow,background-color] outline-none";

export const fieldFocusClassName =
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export const fieldInvalidClassName =
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

export const fieldDisabledClassName =
  "disabled:cursor-not-allowed disabled:opacity-50";

export const fieldControlClassName = `${fieldSurfaceClassName} ${fieldTransitionClassName} ${fieldFocusClassName} ${fieldDisabledClassName} ${fieldInvalidClassName}`;

export const fieldGroupClassName = `${fieldSurfaceClassName} ${fieldTransitionClassName}`;
