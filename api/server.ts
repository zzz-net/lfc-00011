/**
 * local server entry file, for local development
 */
import app from './app.js';
import { calculateAllAlertRules } from './services/inventoryAlertService.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);

  setTimeout(() => {
    try {
      const count = calculateAllAlertRules();
      console.log(`[AlertEngine] Initial calculation completed, ${count} alerts triggered`);
    } catch (err) {
      console.error('[AlertEngine] Initial calculation failed:', err);
    }
  }, 5000);

  const alertInterval = setInterval(() => {
    try {
      const count = calculateAllAlertRules();
      console.log(`[AlertEngine] Scheduled calculation completed, ${count} alerts triggered`);
    } catch (err) {
      console.error('[AlertEngine] Scheduled calculation failed:', err);
    }
  }, 60 * 60 * 1000);

  (globalThis as unknown as { alertInterval?: NodeJS.Timeout }).alertInterval = alertInterval;
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  const alertInterval = (globalThis as unknown as { alertInterval?: NodeJS.Timeout }).alertInterval;
  if (alertInterval) {
    clearInterval(alertInterval);
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  const alertInterval = (globalThis as unknown as { alertInterval?: NodeJS.Timeout }).alertInterval;
  if (alertInterval) {
    clearInterval(alertInterval);
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;