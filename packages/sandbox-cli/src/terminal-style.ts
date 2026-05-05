import { Match } from "effect";

export interface SandboxTerminalStyle {
  readonly color: boolean;
  readonly unicode: boolean;
}

export interface DetectSandboxTerminalStyleOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly stdoutIsTTY: boolean;
}

export const PLAIN_SANDBOX_TERMINAL_STYLE: SandboxTerminalStyle = {
  color: false,
  unicode: true,
};

const DEFAULT_DETECT_SANDBOX_TERMINAL_STYLE_OPTIONS: DetectSandboxTerminalStyleOptions =
  {
    env: process.env,
    stdoutIsTTY: process.stdout.isTTY ?? false,
  };

const ANSI_RESET = "\u001B[0m";
const ANSI_BOLD = "\u001B[1m";
const ANSI_CYAN = "\u001B[36m";
const ANSI_GREEN = "\u001B[32m";
const ANSI_YELLOW = "\u001B[33m";
const ANSI_RED = "\u001B[31m";
const ANSI_DIM = "\u001B[2m";

export function detectSandboxTerminalStyle(
  options: DetectSandboxTerminalStyleOptions = DEFAULT_DETECT_SANDBOX_TERMINAL_STYLE_OPTIONS
): SandboxTerminalStyle {
  const color = detectColorSupport(options);
  const unicode = detectUnicodeSupport(options);

  return {
    color,
    unicode,
  };
}

export function colorizeSandboxStatus(
  status: "running" | "done" | "warning" | "failed",
  text: string,
  style: SandboxTerminalStyle
): string {
  if (!style.color) {
    return text;
  }

  return Match.value(status).pipe(
    Match.when("running", () => `${ANSI_CYAN}${text}${ANSI_RESET}`),
    Match.when("done", () => `${ANSI_GREEN}${text}${ANSI_RESET}`),
    Match.when("warning", () => `${ANSI_YELLOW}${text}${ANSI_RESET}`),
    Match.when("failed", () => `${ANSI_RED}${text}${ANSI_RESET}`),
    Match.exhaustive
  );
}

export function colorizeSandboxLabel(
  text: string,
  style: SandboxTerminalStyle
): string {
  return style.color ? `${ANSI_BOLD}${text}${ANSI_RESET}` : text;
}

export function colorizeSandboxDetail(
  text: string,
  style: SandboxTerminalStyle
): string {
  return style.color ? `${ANSI_DIM}${text}${ANSI_RESET}` : text;
}

function detectColorSupport(
  options: DetectSandboxTerminalStyleOptions
): boolean {
  if (options.env.CEIRD_SANDBOX_ASCII === "1") {
    return false;
  }

  if ("NO_COLOR" in options.env) {
    return false;
  }

  if (options.env.FORCE_COLOR !== undefined) {
    return options.env.FORCE_COLOR !== "0";
  }

  return options.stdoutIsTTY && options.env.TERM !== "dumb";
}

function detectUnicodeSupport(
  options: DetectSandboxTerminalStyleOptions
): boolean {
  return options.env.CEIRD_SANDBOX_ASCII !== "1";
}
