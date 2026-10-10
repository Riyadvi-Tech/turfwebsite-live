import { loadEnvFile } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, getMongoClient } from '../server/_lib/mongodb.js';

try {
  loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupFilePath = path.join(__dirname, 'backup-dashboard-data.json');

async function restoreDashboardData() {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at: ${backupFilePath}`);
  }
  const backup = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  const db = await getDb();
  console.log('Restoring dashboard data to MongoDB...');

  for (const [colName, docs] of Object.entries(backup)) {
    if (Array.isArray(docs) && docs.length > 0) {
      // Re-insert documents
      await db.collection(colName).deleteMany({});
      const result = await db.collection(colName).insertMany(docs);
      console.log(`- Restored ${colName}: inserted ${result.insertedCount} documents`);
    } else {
      console.log(`- Skipped ${colName}: 0 documents in backup`);
    }
  }

  const client = await getMongoClient();
  await client.close();
  console.log('Dashboard data restored successfully.');
}

restoreDashboardData().catch(err => {
  console.error('Error restoring data:', err);
  process.exit(1);
});
