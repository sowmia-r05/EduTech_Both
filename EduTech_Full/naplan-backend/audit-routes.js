/**
 * audit-routes.js
 * ===============
 * Lists EVERY route in src/routes/ and what guards it.
 *
 * Run from naplan-backend:
 *     node audit-routes.js
 *
 * Reads files as text — does NOT start the server, does NOT touch the DB.
 * Safe to run any time.
 *
 * It flags:
 *   [!] routes with NO auth middleware at all
 *   [?] authed routes that take a user-supplied ID but show no ownership check
 *   [ ] routes that look fine
 *
 * It is a HINT generator, not gospel. Router-level guards (router.use(...))
 * are detected and applied to every route in that file. Anything it flags
 * still needs a human eye.
 */

const fs = require("fs");
const path = require("path");

const ROUTES_DIR = path.join(process.cwd(), "src", "routes");

if (!fs.existsSync(ROUTES_DIR)) {
  console.error("✗ No src/routes/ here. Run this from naplan-backend/");
  process.exit(1);
}

// Middleware that actually authenticates.
const AUTH_MW = [
  "verifyToken", "requireAuth", "requireParent", "requireChild",
  "requireAdmin", "adminOnly",
];

// Helpers that prove an ownership check is happening.
const OWNERSHIP = [
  "canAccessChild", "ownsAttempt", "ownsChild", "resolveActingChild",
  "parent_id:", "parentId,", "parent_id :",
  "req.user.childId", "req.user.parentId", "req.admin.adminId",
];

// Params that are user-supplied object identifiers -> need an ownership check.
const ID_PARAMS = /:(\w*[Ii]d|\w*_id)\b/;

let totalRoutes = 0;
let noAuth = 0;
let maybeIdor = 0;

const files = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".js"));

for (const file of files) {
  const full = path.join(ROUTES_DIR, file);
  const src = fs.readFileSync(full, "utf8");
  const lines = src.split(/\r?\n/);

  // Router-level guards: router.use(verifyToken, requireAuth) etc.
  const routerGuards = [];
  for (const m of src.matchAll(/router\.use\(([^)]*)\)/g)) {
    for (const mw of AUTH_MW) {
      if (m[1].includes(mw) && !routerGuards.includes(mw)) routerGuards.push(mw);
    }
  }

  const routes = [];
  lines.forEach((line, i) => {
    const m = line.match(/router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]([^)]*)/);
    if (!m) return;

    const [, method, routePath, rest] = m;

    // Inline middleware on this route line.
    const inline = AUTH_MW.filter((mw) => rest.includes(mw));

    // The handler body — next ~40 lines, enough to spot an ownership check.
    const body = lines.slice(i, i + 40).join("\n");
    const hasOwnership = OWNERSHIP.some((o) => body.includes(o));

    const guards = [...new Set([...routerGuards, ...inline])];
    const takesId = ID_PARAMS.test(routePath);

    routes.push({ method, routePath, guards, takesId, hasOwnership });
  });

  if (!routes.length) continue;

  console.log("\n" + "═".repeat(78));
  console.log(`FILE: ${file}`);
  if (routerGuards.length) {
    console.log(`  router.use guards: ${routerGuards.join(", ")}`);
  } else {
    console.log(`  router.use guards: (none — every route must guard itself)`);
  }
  console.log("─".repeat(78));

  for (const r of routes) {
    totalRoutes++;
    const m = r.method.toUpperCase().padEnd(6);
    const p = r.routePath.padEnd(42);
    const g = r.guards.length ? r.guards.join("+") : "NONE";

    let flag = " ";
    let note = "";

    if (!r.guards.length) {
      // Genuinely public routes are fine — but you must have MEANT them to be.
      flag = "!";
      note = "  <-- NO AUTH. Is this deliberately public?";
      noAuth++;
    } else if (r.takesId && !r.hasOwnership) {
      flag = "?";
      note = "  <-- takes an :id but no ownership check found";
      maybeIdor++;
    }

    console.log(` [${flag}] ${m} ${p} ${g}${note}`);
  }
}

console.log("\n" + "═".repeat(78));
console.log("SUMMARY");
console.log("═".repeat(78));
console.log(`  Routes scanned:                 ${totalRoutes}`);
console.log(`  [!] No auth middleware:         ${noAuth}`);
console.log(`  [?] :id without ownership check: ${maybeIdor}`);
console.log("");
console.log("  [!] = confirm each one is MEANT to be public (login, webhook,");
console.log("        health, template downloads are legitimately public).");
console.log("  [?] = open the handler and confirm the caller can only reach");
console.log("        their OWN record. Default-deny, not default-allow.");
console.log("═".repeat(78));