import { pathToFileURL } from "node:url";

import {
  formatInstructionTopologyReport,
  validateInstructionTopology,
} from "./instruction-topology.mjs";

export function runInstructionTopologyCheck(cwd = process.cwd()) {
  const result = validateInstructionTopology(cwd);

  return {
    ...result,
    report: formatInstructionTopologyReport(result),
  };
}

function main() {
  const result = runInstructionTopologyCheck(process.cwd());

  console.log(result.report);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
