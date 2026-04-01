import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

function getDefaultStateDir() {
  return process.env.PORTLESS_STATE_DIR ?? path.join(os.homedir(), ".portless")
}

function isValidRoutesPayload(value) {
  return Array.isArray(value)
}

export function repairPortlessRoutesFile(options = {}) {
  const stateDir = options.stateDir ?? getDefaultStateDir()
  const log = options.log ?? console.warn
  const routesPath = path.join(stateDir, "routes.json")

  if (!existsSync(routesPath)) {
    return { repaired: false, routesPath }
  }

  try {
    const parsed = JSON.parse(readFileSync(routesPath, "utf8"))
    if (isValidRoutesPayload(parsed)) {
      return { repaired: false, routesPath }
    }

    throw new Error("routes file is not a JSON array")
  } catch (error) {
    mkdirSync(stateDir, { recursive: true })

    const backupPath = `${routesPath}.bak-${Date.now()}`
    renameSync(routesPath, backupPath)
    writeFileSync(routesPath, "[]\n")

    const reason = error instanceof Error ? error.message : "invalid routes file"
    log(
      `Repaired corrupted Portless routes file at ${routesPath}. ` +
        `Backed up the previous contents to ${backupPath}. Reason: ${reason}`
    )

    return { repaired: true, routesPath, backupPath, reason }
  }
}
