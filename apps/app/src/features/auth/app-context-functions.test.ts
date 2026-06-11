interface CapturedServerFunction {
  readonly inputValidators: ((input: unknown) => unknown)[];
  readonly middlewareCalls: (readonly unknown[])[];
  readonly options: { readonly method: string };
}

interface MockServerFnBuilder {
  readonly handler: (handler: (input: unknown) => unknown) => MockServerFn;
  readonly inputValidator: (
    validator: (input: unknown) => unknown
  ) => MockServerFnBuilder;
  readonly middleware: (middlewares: readonly unknown[]) => MockServerFnBuilder;
  readonly validator: (
    validator: (input: unknown) => unknown
  ) => MockServerFnBuilder;
}

type MockServerFn = ReturnType<typeof vi.fn<() => void>>;

function readMockServerFnBuilder(reference: {
  readonly current?: MockServerFnBuilder;
}) {
  if (reference.current === undefined) {
    throw new Error("Mock server function builder was read before assignment.");
  }

  return reference.current;
}

const { capturedCreateServerFns, mockedCreateServerFn } = vi.hoisted(() => ({
  capturedCreateServerFns: [] as CapturedServerFunction[],
  mockedCreateServerFn: vi.fn<
    (options: { readonly method: string }) => MockServerFnBuilder
  >((options) => {
    const record = {
      inputValidators: [] as ((input: unknown) => unknown)[],
      middlewareCalls: [] as (readonly unknown[])[],
      options,
    };
    capturedCreateServerFns.push(record);

    const serverFunction = vi.fn<() => void>();
    const builderReference: { current?: MockServerFnBuilder } = {};
    const builder = Object.assign(serverFunction, {
      handler: vi.fn<(handler: (input: unknown) => unknown) => MockServerFn>(
        (handler) => {
          void handler;
          return serverFunction;
        }
      ),
      inputValidator: vi.fn<
        (validator: (input: unknown) => unknown) => MockServerFnBuilder
      >((validator) => {
        record.inputValidators.push(validator);
        return readMockServerFnBuilder(builderReference);
      }),
      middleware: vi.fn<
        (middlewares: readonly unknown[]) => MockServerFnBuilder
      >((middlewares) => {
        record.middlewareCalls.push(middlewares);
        return readMockServerFnBuilder(builderReference);
      }),
      validator: vi.fn<
        (validator: (input: unknown) => unknown) => MockServerFnBuilder
      >((validator) => {
        record.inputValidators.push(validator);
        return readMockServerFnBuilder(builderReference);
      }),
    });
    builderReference.current = builder;

    return builder;
  }),
}));

vi.mock(import("@tanstack/react-start"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    createServerFn:
      mockedCreateServerFn as unknown as typeof actual.createServerFn,
  };
});

describe("app context server function", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedCreateServerFns.length = 0;
  });

  it("validates the app context hydration input at the server-function boundary", async () => {
    const { getCurrentAppContext } = await import("./app-context-functions");
    const { optionalAuthFunctionMiddleware } =
      await import("./app-context-middleware");
    const [record] = capturedCreateServerFns;
    const [validator] = record?.inputValidators ?? [];

    expect(getCurrentAppContext).toStrictEqual(expect.any(Function));
    expect(record?.options).toStrictEqual({ method: "GET" });
    expect(record?.middlewareCalls).toContainEqual([
      optionalAuthFunctionMiddleware,
    ]);
    const missingInput = undefined;
    expect(validator?.(missingInput)).toStrictEqual({});
    expect(validator?.({ hydrateOrganizationContext: true })).toStrictEqual({
      hydrateOrganizationContext: true,
    });
    expect(() => validator?.({ hydrateOrganizationContext: "yes" })).toThrow(
      /Expected/
    );
  });
});
