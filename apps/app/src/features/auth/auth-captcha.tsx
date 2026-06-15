import { useEffect, useReducer, useRef } from "react";

import { FieldError } from "#/components/ui/field";

export const AUTH_CAPTCHA_RESPONSE_HEADER = "x-captcha-response";

const TURNSTILE_SCRIPT_ID = "ceird-turnstile-script";
const TURNSTILE_SCRIPT_SELECTOR = `#${TURNSTILE_SCRIPT_ID}`;
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SCRIPT_LOAD_TIMEOUT_MS = 10_000;

interface TurnstileRenderOptions {
  readonly action: string;
  readonly callback: (token: string) => void;
  readonly "error-callback": () => void;
  readonly sitekey: string;
  readonly theme: "auto";
  readonly "expired-callback": () => void;
}

interface TurnstileApi {
  readonly render: (
    container: HTMLElement,
    options: TurnstileRenderOptions
  ) => string;
  readonly remove?: (widgetId: string) => void;
  readonly reset?: (widgetId: string) => void;
}
interface AuthCaptchaState {
  readonly errorText?: string | undefined;
}
type AuthCaptchaAction =
  | {
      readonly type: "clear-error";
    }
  | {
      readonly message: string;
      readonly type: "error";
    };

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<void> | undefined;

function authCaptchaReducer(
  _state: AuthCaptchaState,
  action: AuthCaptchaAction
): AuthCaptchaState {
  switch (action.type) {
    case "clear-error": {
      return { errorText: undefined };
    }
    case "error": {
      return { errorText: action.message };
    }
    default: {
      return assertNeverAuthCaptchaAction(action);
    }
  }
}

function assertNeverAuthCaptchaAction(action: never): never {
  throw new Error(`Unhandled auth captcha action: ${JSON.stringify(action)}`);
}

export function isAuthCaptchaChallengeRequired() {
  return import.meta.env.VITE_AUTH_CAPTCHA_ENABLED === "true";
}

export function readAuthCaptchaTurnstileSiteKey() {
  if (!isAuthCaptchaChallengeRequired()) {
    return;
  }

  const siteKey = import.meta.env.VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY?.trim();

  return siteKey && siteKey.length > 0 ? siteKey : undefined;
}

export function makeAuthCaptchaFetchOptions(token?: string) {
  return token
    ? {
        fetchOptions: {
          headers: {
            [AUTH_CAPTCHA_RESPONSE_HEADER]: token,
          },
        },
      }
    : undefined;
}

function loadTurnstileScript() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Turnstile requires a browser runtime."));
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  const resetFailedScript = (script: HTMLScriptElement) => {
    script.remove();
    turnstileScriptPromise = undefined;
  };

  // oxlint-disable-next-line promise/avoid-new -- DOM script loading is callback-based.
  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(TURNSTILE_SCRIPT_SELECTOR);

    if (existingScript instanceof HTMLScriptElement) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    const timeoutId = window.setTimeout(() => {
      resetFailedScript(script);
      reject(new Error("Turnstile script timed out."));
    }, TURNSTILE_SCRIPT_LOAD_TIMEOUT_MS);
    script.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeoutId);
        resetFailedScript(script);
        reject(new Error("Turnstile script failed to load."));
      },
      { once: true }
    );

    (document.head as ParentNode).append(script);
  });

  return turnstileScriptPromise;
}

export function AuthCaptchaChallenge({
  action,
  onTokenChange,
  resetKey,
}: {
  readonly action: string;
  readonly onTokenChange: (token?: string) => void;
  readonly resetKey: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [state, dispatch] = useReducer(authCaptchaReducer, {});
  const siteKey = readAuthCaptchaTurnstileSiteKey();

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (!isAuthCaptchaChallengeRequired() || !siteKey) {
      return;
    }

    let disposed = false;
    let widgetId: string | undefined;

    dispatch({ type: "clear-error" });
    onTokenChangeRef.current();

    void (async () => {
      try {
        await loadTurnstileScript();

        if (disposed || !containerRef.current || !window.turnstile) {
          return;
        }

        widgetId = window.turnstile.render(containerRef.current, {
          action,
          callback: (token) => {
            onTokenChangeRef.current(
              token.trim().length > 0 ? token : undefined
            );
            dispatch({ type: "clear-error" });
          },
          "error-callback": () => {
            onTokenChangeRef.current();
            dispatch({
              message: "The security check failed. Try again.",
              type: "error",
            });
          },
          sitekey: siteKey,
          theme: "auto",
          "expired-callback": () => {
            onTokenChangeRef.current();
            dispatch({
              message: "The security check expired. Try again.",
              type: "error",
            });
          },
        });
      } catch {
        if (!disposed) {
          onTokenChangeRef.current();
          dispatch({
            message:
              "We couldn't load the security check. Refresh and try again.",
            type: "error",
          });
        }
      }
    })();

    return () => {
      disposed = true;

      if (widgetId && window.turnstile?.remove) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [action, resetKey, siteKey]);

  if (!isAuthCaptchaChallengeRequired()) {
    return null;
  }

  if (!siteKey) {
    return (
      <FieldError>
        The security check is not configured. Try again later.
      </FieldError>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="min-h-16"
        aria-label="Security check"
      />
      {state.errorText ? <FieldError>{state.errorText}</FieldError> : null}
    </div>
  );
}
