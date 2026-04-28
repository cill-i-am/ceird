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
  readonly description: string;
  readonly title: string;
}) {
  return (
    <section className="border-b py-5 last:border-b-0">
      <div className="grid gap-4 md:grid-cols-[9.5rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function DetailEmpty({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <Empty className="min-h-0 items-start border-0 bg-transparent p-0 text-left">
      <EmptyHeader className="items-start text-left">
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
