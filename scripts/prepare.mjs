import { spawnSync } from "node:child_process";

if (process.env.CEIRD_SANDBOX === "1") {
  console.log("Skipping lefthook install inside sandbox containers.");
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "lefthook", "install"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
