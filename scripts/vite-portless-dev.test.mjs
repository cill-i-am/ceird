import test from "node:test"
import assert from "node:assert/strict"
import { shouldHideViteLine } from "./vite-portless-dev.mjs"

test("hides Vite local loopback URLs", () => {
  assert.equal(shouldHideViteLine("  ➜  Local:   http://127.0.0.1:4767/"), true)
  assert.equal(shouldHideViteLine("  ➜  Local:   http://localhost:3000/"), true)
})

test("hides Vite local loopback URLs even with ANSI color codes", () => {
  const line = "\u001B[35m  ➜  Local:   http://127.0.0.1:4767/\u001B[39m"
  assert.equal(shouldHideViteLine(line), true)
})

test("keeps non-local lines", () => {
  assert.equal(shouldHideViteLine("  ➜  Network: use --host to expose"), false)
  assert.equal(
    shouldHideViteLine("Running: PORTLESS_URL=https://app.task-tracker.localhost:1355 vite dev"),
    false
  )
})
