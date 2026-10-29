import dotenv from 'dotenv';
import { DB_PATH, UPLOADS_DIR, db, initializeDatabase, runDatabaseMigrations } from './db.ts';

dotenv.config();

try {
  const migrationResult = runDatabaseMigrations();
  initializeDatabase();

  const appliedList = db
    .prepare('SELECT version, description, applied_at FROM schema_migrations ORDER BY version ASC')
    .all() as { version: string; description: string; applied_at: string }[];

  console.log(`[db:migrate] Database path: ${DB_PATH}`);
  console.log(`[db:migrate] Uploads path:  ${UPLOADS_DIR}`);
  console.log(
    `[db:migrate] Newly applied migrations: ${
      migrationResult.applied.length > 0 ? migrationResult.applied.join(', ') : 'none (already up to date)'
    }`
  );
  console.log(`[db:migrate] Active schema versions (${appliedList.length}):`);
  for (const row of appliedList) {
    console.log(`  - ${row.version} (${row.applied_at}): ${row.description}`);
  }
  db.close();
} catch (error) {
  console.error('[db:migrate] Migration failed:', error);
  process.exit(1);
}
