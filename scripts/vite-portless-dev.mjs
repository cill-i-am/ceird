import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const ANSI_ESCAPE_PATTERN = new RegExp(
  String.raw`\u001B\[[0-9;?]*[ -/]*[@-~]`,
  "g"
);
const LOCAL_VITE_URL_PATTERN =
  /Local:\s+http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?/;

export function shouldHideViteLine(line) {
  const normalized = line.replace(ANSI_ESCAPE_PATTERN, "");
  return LOCAL_VITE_URL_PATTERN.test(normalized);
}

function pipeFilteredOutput(readable, writable) {
  let buffer = "";

  readable.on("data", (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!shouldHideViteLine(line)) {
        writable.write(`${line}\n`);
      }
    }
  });

  readable.on("end", () => {
    if (buffer.length > 0 && !shouldHideViteLine(buffer)) {
      writable.write(buffer);
    }
  });
}

export function runVitePortlessDev() {
  const viteCommand = process.platform === "win32" ? "vite.cmd" : "vite";
  const args = [
    "dev",
    "--port",
    process.env.PORT ?? "3000",
    "--strictPort",
    "--host",
    process.env.HOST ?? "127.0.0.1",
    "--clearScreen",
    "false",
  ];

  const child = spawn(viteCommand, args, {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });

  pipeFilteredOutput(child.stdout, process.stdout);
  pipeFilteredOutput(child.stderr, process.stderr);

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runVitePortlessDev();
}
