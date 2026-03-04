import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ScopeDb {
  sqlite: Database.Database;
}

export const initDb = (dbPath: string): ScopeDb => {
  const dir = dbPath.split("/").slice(0, -1).join("/");
  if (dir) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  runMigrations(sqlite);

  return { sqlite };
};

const runMigrations = (sqlite: Database.Database) => {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )`
  );

  const migrationDir = join(import.meta.dirname, "..", "migrations");
  const files = readdirSync(migrationDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const select = sqlite.prepare("SELECT name FROM migrations");
  const insert = sqlite.prepare("INSERT INTO migrations(name, applied_at) VALUES (?, ?)");
  const applied = new Set<string>(
    (select.all() as Array<{ name: string }>).map((row) => row.name)
  );

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = readFileSync(join(migrationDir, file), "utf-8");
    sqlite.exec(sql);
    insert.run(file, new Date().toISOString());
  }
};
