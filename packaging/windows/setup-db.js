/* ══════════════════════════════════════════════════════════════════
 *  Création de la base J.A.R.V.I.S. au premier démarrage.
 *
 *  Les binaires PostgreSQL embarqués sous Windows ne fournissent ni
 *  `psql` ni `createdb` : on utilise donc le client `pg` déjà présent
 *  dans node_modules, avec le schéma Drizzle généré (schema.sql).
 *
 *  USAGE :  node setup-db.js
 *  ENV   :  DATABASE_URL (pointe vers app_db ; la base est créée si besoin)
 *  EXIT  :  0 = base prête, 1 = échec
 * ══════════════════════════════════════════════════════════════════ */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const target = process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:55432/app_db";
const schemaPath = path.join(__dirname, "schema.sql");

function adminUrl(href) {
  try {
    const u = new URL(href);
    u.pathname = "/postgres";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return href.replace(/\/[^/?#]+(\?.*)?$/, "/postgres$1");
  }
}

async function main() {
  if (!fs.existsSync(schemaPath)) throw new Error(`schema.sql introuvable : ${schemaPath}`);

  // 1. Créer la base app_db si elle n'existe pas (connexion à « postgres »).
  const admin = new Client({ connectionString: adminUrl(target) });
  await admin.connect();
  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", ["app_db"]);
    if (!rows.length) {
      await admin.query("CREATE DATABASE app_db");
      console.log("[setup-db] base app_db créée");
    } else {
      console.log("[setup-db] base app_db déjà présente");
    }
  } finally {
    await admin.end();
  }

  // 2. Appliquer le schéma une seule fois.
  const db = new Client({ connectionString: target });
  await db.connect();
  try {
    const { rows } = await db.query("SELECT to_regclass('public.messages') AS t");
    if (rows[0] && rows[0].t) {
      console.log("[setup-db] schéma déjà appliqué");
    } else {
      const sql = fs.readFileSync(schemaPath, "utf8");
      await db.query(sql);
      console.log("[setup-db] schéma appliqué (11 tables)");
    }
    const check = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
    console.log(`[setup-db] tables publiques : ${check.rows[0].n}`);
  } finally {
    await db.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("[setup-db] ÉCHEC :", err.message);
    process.exit(1);
  });
