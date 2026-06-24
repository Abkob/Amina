import express from 'express';
import cors from 'cors';
import { seedIfEmpty } from './seed.js';
import { goalsRouter } from './routes/goals.js';
import { tasksRouter } from './routes/tasks.js';
import { notesRouter } from './routes/notes.js';
import { eventsRouter } from './routes/events.js';
import { resourcesRouter } from './routes/resources.js';
import { edgesRouter } from './routes/edges.js';
import { filesRouter } from './routes/files.js';

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

seedIfEmpty();

app.use('/api/goals', goalsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notes', notesRouter);
app.use('/api/events', eventsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/edges', edgesRouter);
app.use('/api/task-note-files', filesRouter);

// Reset endpoint (for Settings → Factory Reset)
app.post('/api/reset', async (_req, res) => {
  const { resetAndSeed } = await import('./seed.js');
  resetAndSeed();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[server] Marina API running on http://localhost:${PORT}`);
  console.log(`[server] Database: marina.db`);
});
