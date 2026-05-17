import { Hono } from 'hono';
import { connectDB } from './db';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

const PORT = parseInt(process.env.PORT ?? '3001');

connectDB()
  .then(() => {
    Bun.serve({ port: PORT, fetch: app.fetch });
    console.log(`API running on http://localhost:${PORT}`);
  })
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
