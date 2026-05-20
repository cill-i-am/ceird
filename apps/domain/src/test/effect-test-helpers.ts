import { ConfigProvider, Effect, Result } from "effect";

export interface Left<E> {
  readonly _tag: "Left";
  readonly left: E;
}

export interface Right<A> {
  readonly _tag: "Right";
  readonly right: A;
}

export type EitherLike<E, A> = Left<E> | Right<A>;

export const effectEither = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<EitherLike<E, A>, never, R> =>
  Effect.result(effect).pipe(
    Effect.map((result) =>
      Result.isFailure(result)
        ? ({ _tag: "Left", left: result.failure } as const)
        : ({ _tag: "Right", right: result.success } as const)
    )
  );

export const configProviderFromMap = (
  values: ReadonlyMap<string, string>
): ConfigProvider.ConfigProvider =>
  ConfigProvider.fromEnv({ env: Object.fromEntries(values) });

export const withConfigProvider =
  (provider: ConfigProvider.ConfigProvider) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider));
