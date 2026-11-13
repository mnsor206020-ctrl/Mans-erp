/**
 * Disposable local PostgreSQL only: never consumes the project's DATABASE_URL.
 * Requires existing PostgreSQL binaries on PATH, pnpm and generated Prisma client.
 * Run from anywhere: node artifacts/api-server/scripts/test-organization-isolation.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporary = join(workspace, ".local");
mkdirSync(temporary, { recursive: true });
const root = mkdtempSync(join(temporary, "organization-isolation-"));
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket);
// No TCP listener. Separate Unix socket directory prevents sharing any existing DB.
const url = `postgresql://test_isolation@localhost:5432/mans_erp_isolation?host=${encodeURIComponent(socket)}`;
// Do not forward any project database or Clerk secrets to the test processes.
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LANG: "C.UTF-8",
  NODE_ENV: "test",
  DATABASE_URL: url,
  MANS_ISOLATION_PGROOT: root,
};
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: workspace, env, stdio: "pipe", ...options });
let running = false;
try {
  run("initdb", ["-D", data, "-U", "test_isolation", "-A", "trust", "--no-locale"]);
  run("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-o",
    `-h '' -k ${socket} -p 5432 -F`, "-w", "start"]);
  running = true;
  run("createdb", ["-h", socket, "-U", "test_isolation", "mans_erp_isolation"]);
  console.log("Initialized disposable local PostgreSQL; project databases and secrets are not used.");
  run("pnpm", ["--filter", "@workspace/prisma", "exec", "prisma", "db", "push",
    "--schema", "prisma/schema.prisma", "--skip-generate"], { stdio: "inherit" });
  run("pnpm", ["--filter", "@workspace/api-server", "exec", "vitest", "run",
    ...(process.argv.slice(2).length ? process.argv.slice(2) : [
    "src/__tests__/organization-isolation.postgres.test.ts",
    "src/__tests__/organization-isolation.audit.test.ts",
    "src/__tests__/reports-reversals.integration.test.ts",
    "src/__tests__/authorize.unit.test.ts"])], { stdio: "inherit" });
} catch (error) {
  process.exitCode = 1;
  console.error("Isolated API tests failed:", error.message);
} finally {
  if (running) {
    try { run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]); }
    catch { console.error("Could not stop temporary PostgreSQL; preserving its directory."); process.exitCode = 1; }
  }
  // Never remove a directory if its PostgreSQL server may still be running.
  if (!running || process.exitCode !== 1) {
    rmSync(root, { recursive: true, force: true });
    console.log("Removed the disposable database and all synthetic fixtures.");
  } else {
    // A failed test still permits cleanup after a confirmed server stop.
    try {
      run("pg_ctl", ["-D", data, "status"]);
    } catch {
      rmSync(root, { recursive: true, force: true });
      console.log("Removed the stopped disposable database after test failure.");
    }
  }
}
