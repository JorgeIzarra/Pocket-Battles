import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { connectDB } from './db';
import rooms from './routes/rooms';
import battle from './routes/battle';
import catalog from './routes/catalog';

const app = new Hono();

app.use('*', cors({ origin: '*' }));
app.get('/health', (c) => c.json({ ok: true }));
app.route('/rooms', rooms);
app.route('/battle', battle);
app.route('/catalog', catalog);

const PORT = parseInt(process.env.PORT ?? '3001');

connectDB()
  .then(() => {
    Bun.serve({ port: PORT, fetch: app.fetch, idleTimeout: 120 });
    console.log(`API running on http://localhost:${PORT}`);
  })
  .catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
