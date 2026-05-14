import {
  Briefcase01Icon,
  Location01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

export type EntryAtmosphereVariant = "quiet" | "standard" | "setup";

export function EntryAtmosphere({
  variant = "standard",
}: {
  readonly variant?: EntryAtmosphereVariant;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="entry-atmosphere"
      data-variant={variant}
      className={cn(
        "entry-atmosphere pointer-events-none absolute inset-0 z-0 overflow-hidden",
        variant === "quiet" && "entry-atmosphere-quiet",
        variant === "setup" && "entry-atmosphere-setup"
      )}
    >
      <div className="entry-atmosphere__glow" />
      <div className="entry-atmosphere__blueprint" />
      <div className="entry-atmosphere__grid" />
      <div className="entry-atmosphere__trace" />
    </div>
  );
}

export function CeirdEntryLogo({ className }: { readonly className?: string }) {
  return (
    <div
      aria-label="Ceird"
      data-slot="entry-logo"
      className={cn(
        "inline-flex items-center gap-2.5 text-base font-semibold tracking-normal text-foreground",
        className
      )}
    >
      <svg
        aria-hidden="true"
        className="h-8 w-9 text-primary"
        viewBox="0 0 36 32"
        fill="none"
      >
        <path
          d="M17.9 7.2A9.4 9.4 0 1 0 18 24.8"
          className="stroke-primary"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M25.2 9.2 19.1 16l6.1 6.8"
          className="stroke-primary"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="29.5" cy="10.2" r="2.3" className="fill-info/45" />
        <circle cx="29.5" cy="21.8" r="2.3" className="fill-success/70" />
      </svg>
      <span>Ceird</span>
    </div>
  );
}

export function EntryProductContext({
  className,
}: {
  readonly className?: string;
}) {
  return (
    <section
      data-slot="entry-product-context"
      className={cn(
        "hidden max-w-md flex-col gap-7 text-foreground lg:flex lg:max-w-sm xl:max-w-md",
        className
      )}
    >
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl leading-[1.08] font-medium tracking-normal text-balance sm:text-4xl">
          Run your work. <br />
          Together.
        </h1>
        <p className="max-w-[33ch] text-sm/7 text-muted-foreground sm:text-base/7">
          Ceird brings jobs, sites, and your team into one place so you can work
          with clarity and confidence.
        </p>
      </div>

      <div className="grid gap-4">
        <EntryProductPoint
          icon={<HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />}
          title="Jobs"
          description="Plan, track, and deliver work from start to finish."
        />
        <EntryProductPoint
          icon={<HugeiconsIcon icon={Location01Icon} strokeWidth={2} />}
          title="Sites"
          description="Keep site data accurate and easy to access."
        />
        <EntryProductPoint
          icon={<HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />}
          title="Team"
          description="Invite your team and manage access with ease."
        />
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        Secure. Reliable. Built for field teams.
      </p>
    </section>
  );
}

function EntryProductPoint({
  description,
  icon,
  title,
}: {
  readonly description: string;
  readonly icon: ReactNode;
  readonly title: string;
}) {
  return (
    <div className="grid grid-cols-[2.5rem_1fr] gap-3">
      <div className="flex size-9 items-center justify-center rounded-xl border border-border/70 bg-card/74 text-primary shadow-[0_1px_0_color-mix(in_oklab,var(--border)_55%,transparent)]">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="mt-0.5 max-w-[27ch] text-sm/5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
