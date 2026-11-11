import { createApp } from './app.js';
import { openDatabase } from './database.js';
import { initializeDatabase } from './initialize.js';

const port = Number(process.env['PORT'] ?? 4730);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ungültiger PORT.');
const database = openDatabase();
try {
  console.log(`${await initializeDatabase(database)} Bücher ergänzt.`);
} catch (error) {
  database.close();
  throw error;
}
const origins = process.env['CORS_ORIGINS']
  ?.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const server = createApp(database, origins).listen(port, '0.0.0.0', () => {
  console.log(`BookMonkey API läuft auf Port ${port}.`);
});
server.on('error', error => {
  console.error(error);
  database.close();
  process.exitCode = 1;
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => {
    database.close();
    clearTimeout(deadline);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
