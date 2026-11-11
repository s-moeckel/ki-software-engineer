import { setTimeout } from 'node:timers/promises';

const deadline = Date.now() + 30000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch('http://127.0.0.1:4730/health', { signal: AbortSignal.timeout(1000) });
    await response.body?.cancel();
    if (response.ok) {
      console.log('Backend ist bereit.');
      ready = true;
      break;
    }
  } catch {
    // The debugger may still be building or starting the backend.
  }
  await setTimeout(200);
}
if (!ready) {
  console.error(
    'Backend auf Port 4730 ist nicht bereit. Zuerst die Debug-Konfiguration „Backend + Frontend“ starten und die Backend-Debugkonsole prüfen.'
  );
  process.exitCode = 1;
}
