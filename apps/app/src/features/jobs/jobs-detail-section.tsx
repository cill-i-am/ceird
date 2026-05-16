"use client";
import * as React from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";

export function DetailSection({
  children,
  description,
  title,
}: {
  readonly children: React.ReactNode;
  readonly description?: string;
  readonly title: string;
}) {
  return (
    <section className="rounded-lg border bg-background">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="p-4">
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function DetailEmpty({
  description,
  title,
}: {
  readonly description?: string;
  readonly title: string;
}) {
  return (
    <Empty className="min-h-0 items-start border-0 bg-transparent p-0 text-left">
      <EmptyHeader className="items-start text-left">
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}
