import { act, render } from "@testing-library/react";
import type { RenderOptions } from "@testing-library/react";
import type { ReactNode } from "react";

export async function renderAndFlushReact(
  ui: ReactNode,
  options?: RenderOptions
) {
  const result = render(ui, options);
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}
