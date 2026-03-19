import Database from "better-sqlite3-multiple-ciphers";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface ScopeDb {
  sqlite: Database.Database;
}

export interface DbInitOptions {
  encryptionKey?: string;
  requireEncryption?: boolean;
  cipher?: string;
}

export const initDb = (dbPath: string, options: DbInitOptions = {}): ScopeDb => {
  const dir = dirname(dbPath);
  if (dir) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  applyEncryption(sqlite, options);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  runMigrations(sqlite, dbPath);

  return { sqlite };
};

const applyEncryption = (sqlite: Database.Database, options: DbInitOptions) => {
  if (!options.encryptionKey) {
    return;
  }

  if (options.cipher) {
    sqlite.pragma(`cipher = '${escapeSqlLiteral(options.cipher)}'`);
  }

  sqlite.pragma(`key = '${escapeSqlLiteral(options.encryptionKey)}'`);

  const cipherName = sqlite.pragma("cipher", { simple: true }) as string | undefined;
  const kdfIter = sqlite.pragma("kdf_iter", { simple: true }) as number | undefined;
  const encryptionSupported = Boolean((cipherName && String(cipherName).trim()) || (kdfIter ?? 0) > 0);

  if (!encryptionSupported && options.requireEncryption) {
    throw new Error(
      "Database encryption is required but SQLCipher-compatible cipher support is unavailable in this SQLite build."
    );
  }

  if (!encryptionSupported) {
    console.warn(
      "Database encryption key provided, but SQLCipher-compatible cipher support is unavailable. Enable encryption-capable SQLite or run with SCOPE_DB_ENCRYPTION_REQUIRED=false."
    );
  }
};

const escapeSqlLiteral = (value: string) => value.replace(/'/g, "''");

const runMigrations = (sqlite: Database.Database, dbPath: string) => {
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
  const pending = files.filter((file) => !applied.has(file));

  if (pending.length > 0) {
    backupBeforeMigration(sqlite, dbPath, pending);
  }

  for (const file of pending) {
    const sql = readFileSync(join(migrationDir, file), "utf-8");
    sqlite.transaction(() => {
      sqlite.exec(sql);
      insert.run(file, new Date().toISOString());
    })();
  }
};

const backupBeforeMigration = (sqlite: Database.Database, dbPath: string, pendingMigrations: string[]) => {
  if (dbPath === ":memory:" || dbPath.trim().length === 0 || !existsSync(dbPath)) {
    return;
  }

  const backupEnabled = process.env.SCOPE_DB_BACKUP_BEFORE_MIGRATION !== "false";
  if (!backupEnabled) {
    return;
  }

  const backupDir = process.env.SCOPE_DB_BACKUP_DIR?.trim() || join(dirname(dbPath), "backups");
  mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `${basename(dbPath)}.${stamp}.premigration.bak`);
  const escapedBackup = backupPath.replace(/'/g, "''");
  sqlite.exec(`VACUUM INTO '${escapedBackup}'`);
  console.info(`Created pre-migration backup at ${backupPath} for migrations: ${pendingMigrations.join(", ")}`);
};
