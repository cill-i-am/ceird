import { Route } from "#/routes/__root";

describe("root route head", () => {
  it(
    "uses the product title",
    {
      timeout: 10_000,
    },
    async () => {
      const head = await Route.options.head?.({} as never);
      const title = head?.meta?.find(
        (meta): meta is { title: string } =>
          Boolean(meta) &&
          typeof meta === "object" &&
          "title" in meta &&
          typeof (meta as Record<string, unknown>).title === "string"
      )?.title;

      expect(title).toBe("Ceird");
    }
  );
});
