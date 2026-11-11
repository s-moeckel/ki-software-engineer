import { openDatabase } from './database.js';
import { initializeDatabase } from './initialize.js';

const database = openDatabase();
try {
  console.log(`Initialisierung abgeschlossen: ${await initializeDatabase(database)} Bücher ergänzt.`);
} finally {
  database.close();
}
