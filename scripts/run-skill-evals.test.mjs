import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  formatTextReport,
  parseCliArgs,
  runSkillEvals,
} from "./run-skill-evals.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

test("skill evals pass the current Linear agent workflow suite", async () => {
  const result = await runSkillEvals({ cwd: repoRoot });
  const report = formatTextReport(result);

  assert.equal(result.ok, true, report);
  assert.ok(result.scenarioResults.length >= 6);
  assert.ok(result.staticCheckResults.length >= 5);
  assert.ok(result.forwardPackResults.length >= 5);
  assert.match(report, /Skill evals PASS/);
});

test("skill evals render isolated forward-test prompts", async () => {
  const result = await runSkillEvals({
    cwd: repoRoot,
    includeForwardPrompts: true,
  });
  const report = formatTextReport(result);
  const ciWatchPack = result.forwardPackResults.find(
    (pack) => pack.id === "ci-watch-failure-loop"
  );

  assert.equal(result.ok, true, report);
  assert.ok(ciWatchPack, "expected ci-watch forward pack");
  assert.match(ciWatchPack.forwardPrompt, /Use \$ci-watch/);
  assert.match(ciWatchPack.forwardPrompt, /Do not modify live Linear/);
  assert.match(ciWatchPack.forwardPrompt, /evals\/skills\/forward\/fixtures/);
  assert.match(ciWatchPack.forwardPrompt, /Rubric criteria/);
  assert.match(report, /Forward prompt/);
  assert.match(report, /Use \$ci-watch/);
});

test("skill evals report missing contract snippets", async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "skill-evals-"));
  t.after(() => rm(tempDir, { force: true, recursive: true }));
  await mkdir(path.join(tempDir, "evals/skills/scenarios"), {
    recursive: true,
  });
  await writeFile(path.join(tempDir, "artifact.md"), "hello\n", "utf8");
  await writeFile(
    path.join(tempDir, "evals/skills/scenarios/missing-contract.json"),
    JSON.stringify(
      {
        id: "missing-contract",
        title: "Missing contract fixture",
        prompt: "Check that a missing phrase fails clearly.",
        expectedSkills: [],
        artifacts: [
          {
            path: "artifact.md",
            mustContain: ["required phrase"],
          },
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  const result = await runSkillEvals({
    cwd: tempDir,
    includeStaticChecks: false,
  });
  const report = formatTextReport(result);

  assert.equal(result.ok, false);
  assert.equal(result.staticCheckResults.length, 0);
  assert.match(report, /Skill evals FAIL/);
  assert.match(report, /artifact\.md should contain "required phrase"/);
});

test("skill eval CLI ignores pnpm argument separator", () => {
  assert.deepEqual(parseCliArgs(["--forward-prompts", "--", "--json"]), {
    json: true,
    help: false,
    forwardPrompts: true,
    scenarioPaths: [],
  });
});
