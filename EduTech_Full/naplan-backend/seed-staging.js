// seed-staging.js
//
// Reads MONGODB_URI from your .env and FORCES the database name to
// "naplan_staging", then inserts one throwaway doc. This means you never paste
// a connection string by hand, and the drill can only ever touch naplan_staging
// — never your real "eduTech" database.

require("dotenv").config();
const { MongoClient } = require("mongodb");

// Take the prod URI but rewrite the db segment to naplan_staging.
function toStagingUri(uri) {
  const [base, query] = uri.split("?");
  const schemeSep = base.indexOf("://");
  const afterScheme = base.slice(schemeSep + 3);
  const slashIdx = afterScheme.indexOf("/");
  const authority = slashIdx === -1 ? afterScheme : afterScheme.slice(0, slashIdx);
  const rebuilt = base.slice(0, schemeSep + 3) + authority + "/naplan_staging";
  return query ? rebuilt + "?" + query : rebuilt;
}

(async () => {
  const src = process.env.MONGODB_URI;
  if (!src) {
    console.error("SAFETY STOP: MONGODB_URI not found in .env.");
    process.exit(1);
  }

  const URI = toStagingUri(src);

  // Belt-and-braces guards.
  if (!URI.includes("/naplan_staging")) {
    console.error("SAFETY STOP: derived URI does not target naplan_staging.");
    process.exit(1);
  }
  if (/\/eduTech(\?|$)/.test(URI)) {
    console.error("SAFETY STOP: URI still targets the prod eduTech database. Aborting.");
    process.exit(1);
  }

  const client = new MongoClient(URI);
  try {
    await client.connect();
    const db = client.db(); // naplan_staging
    const r = await db.collection("drill_test").insertOne({
      note: "rollback drill seed",
      createdAt: new Date(),
    });
    console.log("Inserted test doc:", r.insertedId, "into db:", db.databaseName);
  } catch (e) {
    console.error("Connection/insert failed:", e.message);
    process.exit(1);
  } finally {
    await client.close();
  }
})();