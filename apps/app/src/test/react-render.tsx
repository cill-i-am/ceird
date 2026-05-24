import { act, render } from "@testing-library/react";
import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";

export async function renderAndFlushReact(ui: ReactNode, options?: RenderOptions) {
  const result = render(ui, options);
  await flushReactUpdates();
  return result;
}

export async function flushReactUpdates(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
    await Promise.resolve();
  });
}

export type { RenderResult };
