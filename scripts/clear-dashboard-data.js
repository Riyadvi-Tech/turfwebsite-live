import { loadEnvFile } from 'node:process';
import { getDb, getMongoClient } from '../server/_lib/mongodb.js';

try {
  loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const collectionsToClear = [
  'bookings',
  'customers',
  'extended_enquiries',
  'whatsapp_enquiries',
  'chatbot_conversations',
  'payment_sessions',
  'payments',
  'notifications',
];

async function clearDashboardData() {
  const db = await getDb();
  console.log('Clearing dashboard data from MongoDB...');
  for (const c of collectionsToClear) {
    const result = await db.collection(c).deleteMany({});
    console.log(`- Cleared ${c}: removed ${result.deletedCount} documents`);
  }
  const client = await getMongoClient();
  await client.close();
  console.log('All dashboard data cleared successfully. Admin accounts and sessions preserved.');
}

clearDashboardData().catch(err => {
  console.error('Error clearing data:', err);
  process.exit(1);
});
