"use client";

import type {
  GooglePlacesSessionTokenType,
  ProximityOriginAutocompleteInput,
  ProximityOriginAutocompleteResponse,
  ProximityOriginPlaceDetailsInput,
  ProximityOriginPlaceDetailsResponse,
  ProximityOriginSuggestion,
  TypedOrigin,
} from "@ceird/proximity-core";
import { Effect, Exit, Fiber } from "effect";
import * as React from "react";

import {
  autocompleteProximityOrigin,
  resolveProximityOriginPlace,
} from "./proximity-api";
import { createProximityOriginSessionToken } from "./proximity-origin";

export interface ProximityOriginControllerServices {
  readonly autocompleteOrigin?: (
    input: ProximityOriginAutocompleteInput
  ) => Effect.Effect<ProximityOriginAutocompleteResponse, unknown>;
  readonly createSessionToken?: () => GooglePlacesSessionTokenType;
  readonly resolveOriginPlace?: (
    input: ProximityOriginPlaceDetailsInput
  ) => Effect.Effect<ProximityOriginPlaceDetailsResponse, unknown>;
}

export type ProximityOriginResolutionResult = "keep-open" | "reset";

export interface UseProximityOriginDialogControllerOptions {
  readonly autocompleteDebounceMs?: number;
  readonly autocompleteFailureMessage?: string | null | undefined;
  readonly autocompleteMinLength?: number;
  readonly resolveFailureMessage?: string | undefined;
  readonly services?: ProximityOriginControllerServices | undefined;
  readonly onOriginResolved: (input: {
    readonly origin: TypedOrigin;
    readonly suggestion: ProximityOriginSuggestion;
  }) =>
    | Promise<ProximityOriginResolutionResult>
    | ProximityOriginResolutionResult;
}

export interface UseProximityOriginDialogControllerResult {
  readonly confirmSelectedOrigin: (
    suggestion: ProximityOriginSuggestion
  ) => void;
  readonly error: string | null;
  readonly handleOpenChange: (open: boolean) => void;
  readonly handleQueryChange: (query: string) => void;
  readonly handleSuggestionSelect: (
    suggestion: ProximityOriginSuggestion
  ) => void;
  readonly loading: boolean;
  readonly open: boolean;
  readonly query: string;
  readonly reset: () => void;
  readonly selectedSuggestion: ProximityOriginSuggestion | null;
  readonly suggestions: readonly ProximityOriginSuggestion[];
}

const DEFAULT_AUTOCOMPLETE_MIN_LENGTH = 3;
const DEFAULT_AUTOCOMPLETE_DEBOUNCE_MS = 250;
const DEFAULT_RESOLVE_FAILURE_MESSAGE =
  "Ceird could not use that origin. Select another result or try again.";

export function useProximityOriginDialogController({
  autocompleteDebounceMs = DEFAULT_AUTOCOMPLETE_DEBOUNCE_MS,
  autocompleteFailureMessage = null,
  autocompleteMinLength = DEFAULT_AUTOCOMPLETE_MIN_LENGTH,
  resolveFailureMessage = DEFAULT_RESOLVE_FAILURE_MESSAGE,
  services,
  onOriginResolved,
}: UseProximityOriginDialogControllerOptions): UseProximityOriginDialogControllerResult {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedSuggestion, setSelectedSuggestion] =
    React.useState<ProximityOriginSuggestion | null>(null);
  const [suggestions, setSuggestions] = React.useState<
    readonly ProximityOriginSuggestion[]
  >([]);

  const autocompleteFiberRef = React.useRef<Fiber.Fiber<
    ProximityOriginAutocompleteResponse,
    unknown
  > | null>(null);
  const mountedRef = React.useRef(true);
  const openRef = React.useRef(open);
  const removeAutocompleteObserverRef = React.useRef<(() => void) | null>(null);
  const removeResolveObserverRef = React.useRef<(() => void) | null>(null);
  const resolveFiberRef = React.useRef<Fiber.Fiber<
    ProximityOriginPlaceDetailsResponse,
    unknown
  > | null>(null);
  const resolveRequestIdRef = React.useRef(0);
  const sessionTokenRef = React.useRef<GooglePlacesSessionTokenType | null>(
    null
  );

  openRef.current = open;

  const autocompleteOrigin =
    services?.autocompleteOrigin ?? autocompleteProximityOrigin;
  const makeSessionToken =
    services?.createSessionToken ?? createProximityOriginSessionToken;
  const resolveOriginPlace =
    services?.resolveOriginPlace ?? resolveProximityOriginPlace;

  const getSessionToken = React.useCallback(() => {
    sessionTokenRef.current ??= makeSessionToken();

    return sessionTokenRef.current;
  }, [makeSessionToken]);

  const cancelAutocomplete = React.useCallback(() => {
    removeAutocompleteObserverRef.current?.();
    removeAutocompleteObserverRef.current = null;
    if (autocompleteFiberRef.current !== null) {
      void Effect.runFork(Fiber.interrupt(autocompleteFiberRef.current));
      autocompleteFiberRef.current = null;
    }
  }, []);

  const cancelResolution = React.useCallback(() => {
    removeResolveObserverRef.current?.();
    removeResolveObserverRef.current = null;
    if (resolveFiberRef.current !== null) {
      void Effect.runFork(Fiber.interrupt(resolveFiberRef.current));
      resolveFiberRef.current = null;
    }
  }, []);

  const reset = React.useCallback(() => {
    resolveRequestIdRef.current += 1;
    cancelAutocomplete();
    cancelResolution();
    sessionTokenRef.current = null;
    setError(null);
    setLoading(false);
    setOpen(false);
    setQuery("");
    setSelectedSuggestion(null);
    setSuggestions([]);
  }, [cancelAutocomplete, cancelResolution]);

  React.useEffect(
    () => () => {
      mountedRef.current = false;
      resolveRequestIdRef.current += 1;
      cancelAutocomplete();
      cancelResolution();
    },
    [cancelAutocomplete, cancelResolution]
  );

  const trimmedQuery = query.trim();

  React.useEffect(() => {
    if (!open || trimmedQuery.length < autocompleteMinLength) {
      cancelAutocomplete();
      setSuggestions([]);
      return;
    }

    let requestActive = true;
    const timeoutId = window.setTimeout(() => {
      runAutocompleteRequest();
    }, autocompleteDebounceMs);

    function runAutocompleteRequest() {
      if (!requestActive) {
        return;
      }

      const autocompleteFiber = Effect.runFork(
        autocompleteOrigin({
          country: "IE",
          input: trimmedQuery,
          sessionToken: getSessionToken(),
        })
      );
      autocompleteFiberRef.current = autocompleteFiber;
      removeAutocompleteObserverRef.current = autocompleteFiber.addObserver(
        (exit) => {
          if (autocompleteFiberRef.current === autocompleteFiber) {
            removeAutocompleteObserverRef.current = null;
            autocompleteFiberRef.current = null;
          }

          if (!requestActive || !mountedRef.current) {
            return;
          }

          if (Exit.isSuccess(exit)) {
            setError(null);
            setSuggestions(exit.value.suggestions);
            return;
          }

          if (autocompleteFailureMessage !== null) {
            setError(autocompleteFailureMessage);
          }
          setSuggestions([]);
        }
      );
    }

    return () => {
      requestActive = false;
      window.clearTimeout(timeoutId);
      cancelAutocomplete();
    };
  }, [
    autocompleteDebounceMs,
    autocompleteFailureMessage,
    autocompleteMinLength,
    autocompleteOrigin,
    cancelAutocomplete,
    getSessionToken,
    open,
    trimmedQuery,
  ]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        reset();
        return;
      }

      setOpen(true);
    },
    [reset]
  );

  const handleQueryChange = React.useCallback(
    (nextQuery: string) => {
      if (query.trim().length > 0 && nextQuery.trim().length === 0) {
        sessionTokenRef.current = null;
      }

      setError(null);
      setQuery(nextQuery);
      setSelectedSuggestion(null);
      setSuggestions([]);
    },
    [query]
  );

  const handleSuggestionSelect = React.useCallback(
    (suggestion: ProximityOriginSuggestion) => {
      setSelectedSuggestion(suggestion);
    },
    []
  );

  const confirmSelectedOrigin = React.useCallback(
    (suggestion: ProximityOriginSuggestion) => {
      cancelResolution();
      const requestId = resolveRequestIdRef.current + 1;
      resolveRequestIdRef.current = requestId;
      setError(null);
      setLoading(true);

      const resolveFiber = Effect.runFork(
        resolveOriginPlace({
          placeId: suggestion.placeId,
          rawInput: query.trim() || suggestion.displayText,
          sessionToken: getSessionToken(),
        })
      );
      resolveFiberRef.current = resolveFiber;
      removeResolveObserverRef.current = resolveFiber.addObserver((exit) => {
        if (resolveFiberRef.current === resolveFiber) {
          removeResolveObserverRef.current = null;
          resolveFiberRef.current = null;
        }

        if (
          resolveRequestIdRef.current !== requestId ||
          !mountedRef.current ||
          !openRef.current
        ) {
          return;
        }

        if (Exit.isFailure(exit)) {
          setError(resolveFailureMessage);
          setLoading(false);
          return;
        }

        void settleResolvedOrigin(exit.value.origin, suggestion, requestId);
      });

      async function settleResolvedOrigin(
        origin: TypedOrigin,
        selectedOriginSuggestion: ProximityOriginSuggestion,
        selectedRequestId: number
      ) {
        try {
          const resolutionResult = await onOriginResolved({
            origin,
            suggestion: selectedOriginSuggestion,
          });

          if (
            resolveRequestIdRef.current !== selectedRequestId ||
            !mountedRef.current
          ) {
            return;
          }

          if (resolutionResult === "reset") {
            reset();
            return;
          }

          setLoading(false);
        } catch {
          if (
            resolveRequestIdRef.current !== selectedRequestId ||
            !mountedRef.current
          ) {
            return;
          }

          setError(resolveFailureMessage);
          setLoading(false);
        }
      }
    },
    [
      cancelResolution,
      onOriginResolved,
      query,
      reset,
      resolveFailureMessage,
      getSessionToken,
      resolveOriginPlace,
    ]
  );

  return {
    confirmSelectedOrigin,
    error,
    handleOpenChange,
    handleQueryChange,
    handleSuggestionSelect,
    loading,
    open,
    query,
    reset,
    selectedSuggestion,
    suggestions,
  };
}
