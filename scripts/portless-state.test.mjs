import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import assert from "node:assert/strict"
import { repairPortlessRoutesFile } from "./portless-state.mjs"

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "task-tracker-portless-"))

  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("leaves a valid routes file untouched", () => {
  withTempDir((dir) => {
    const routesPath = path.join(dir, "routes.json")
    writeFileSync(routesPath, '[{"hostname":"app.localhost","port":4321,"pid":1234}]\n')

    const messages = []
    const result = repairPortlessRoutesFile({ stateDir: dir, log: (message) => messages.push(message) })

    assert.equal(result.repaired, false)
    assert.equal(readFileSync(routesPath, "utf8"), '[{"hostname":"app.localhost","port":4321,"pid":1234}]\n')
    assert.deepEqual(messages, [])
  })
})

test("repairs invalid JSON routes files", () => {
  withTempDir((dir) => {
    const routesPath = path.join(dir, "routes.json")
    writeFileSync(routesPath, "{")

    const messages = []
    const result = repairPortlessRoutesFile({ stateDir: dir, log: (message) => messages.push(message) })

    assert.equal(result.repaired, true)
    assert.match(result.backupPath, /\.bak-\d+$/)
    assert.equal(readFileSync(routesPath, "utf8"), "[]\n")
    assert.equal(readFileSync(result.backupPath, "utf8"), "{")
    assert.equal(messages.length, 1)
    assert.match(messages[0], /Repaired corrupted Portless routes file/)
  })
})

test("repairs non-array JSON routes files", () => {
  withTempDir((dir) => {
    const routesPath = path.join(dir, "routes.json")
    writeFileSync(routesPath, '{"hostname":"not-an-array"}\n')

    const result = repairPortlessRoutesFile({ stateDir: dir, log: () => {} })

    assert.equal(result.repaired, true)
    assert.equal(readFileSync(routesPath, "utf8"), "[]\n")
    assert.equal(readFileSync(result.backupPath, "utf8"), '{"hostname":"not-an-array"}\n')
    assert.equal(result.reason, "routes file is not a JSON array")
  })
})
