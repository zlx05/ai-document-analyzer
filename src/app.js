import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { hashPassword, requireAuth, signToken, verifyPassword } from './auth.js';
import { chunkText, extractText } from './rag.js';
import { runAgent } from './agent.js';
import { generateProjectPlan } from './initializer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const uploadDir = join(rootDir, 'uploads');

await mkdir(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 2 * 1024 * 1024
  }
});

const app = express();

function parseTaskLines(text) {
  const seen = new Set();
  const tasks = [];

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^(?:[-*]\s+|\d+[.)]\s+)(.+)$/);

    if (!match) {
      continue;
    }

    const title = match[1].trim();
    if (title.length < 3 || seen.has(title)) {
      continue;
    }

    seen.add(title);
    tasks.push(title);
  }

  return tasks.slice(0, 50);
}

async function createProjectTasks({ userId, projectId, tasks, description = '项目初始化生成' }) {
  const [existingRows] = await pool.execute(
    `SELECT title FROM tasks WHERE user_id = ? AND project_id = ?`,
    [userId, projectId]
  );
  const existingTitles = new Set(existingRows.map((row) => row.title.trim().toLowerCase()));
  const created = [];
  const skipped = [];

  for (const task of tasks) {
    const title = String(task.title || task).trim();
    const key = title.toLowerCase();

    if (!title || existingTitles.has(key)) {
      skipped.push({ title, reason: 'already_exists' });
      continue;
    }

    const [result] = await pool.execute(
      `INSERT INTO tasks (user_id, project_id, title, description, priority, status)
       VALUES (?, ?, ?, ?, ?, 'todo')`,
      [
        userId,
        projectId,
        title,
        String(task.description || description).trim(),
        ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium'
      ]
    );
    existingTitles.add(key);
    created.push({ id: result.insertId, title });
  }

  return { created, skipped };
}

async function saveKnowledgeDocument({ userId, projectId, title, content }) {
  const chunks = chunkText(content);

  const [documentResult] = await pool.execute(
    `INSERT INTO documents (user_id, project_id, file_name, file_type, file_size, content_preview)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, projectId, title, 'text/markdown', Buffer.byteLength(content, 'utf8'), content.slice(0, 300)]
  );

  for (let index = 0; index < chunks.length; index += 1) {
    await pool.execute(
      `INSERT INTO document_chunks (document_id, user_id, project_id, chunk_index, content)
       VALUES (?, ?, ?, ?, ?)`,
      [documentResult.insertId, userId, projectId, index, chunks[index]]
    );
  }

  return { documentId: documentResult.insertId, chunkCount: chunks.length };
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(rootDir, 'public')));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: 'Name, email, and a 6+ character password are required' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash)
       VALUES (?, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), passwordHash]
    );
    const user = { id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), role: 'user' };
    res.status(201).json({ user, token: signToken(user) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email is already registered' });
    }
    throw error;
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email?.trim().toLowerCase()]);
  const user = rows[0];

  if (!user || !(await verifyPassword(password || '', user.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token: signToken(user)
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/projects', requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, name, description, status, created_at
     FROM projects
     WHERE user_id = ?
     ORDER BY id DESC`,
    [req.user.id]
  );
  res.json(rows);
});

app.post('/api/projects', requireAuth, async (req, res) => {
  const { name, description = '' } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Project name is required' });
  }

  const [result] = await pool.execute(
    `INSERT INTO projects (user_id, name, description)
     VALUES (?, ?, ?)`,
    [req.user.id, name.trim(), description.trim()]
  );

  res.status(201).json({ id: result.insertId, name, description, status: 'active' });
});

app.get('/api/projects/:projectId/tasks', requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, title, description, status, priority, due_date, created_at, updated_at
     FROM tasks
     WHERE user_id = ? AND project_id = ?
     ORDER BY FIELD(status, 'todo', 'doing', 'done'), id DESC`,
    [req.user.id, req.params.projectId]
  );
  res.json(rows);
});

app.post('/api/projects/:projectId/tasks', requireAuth, async (req, res) => {
  const { title, description = '', priority = 'medium', status = 'todo' } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Task title is required' });
  }

  const [result] = await pool.execute(
    `INSERT INTO tasks (user_id, project_id, title, description, priority, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, req.params.projectId, title.trim(), description.trim(), priority, status]
  );

  res.status(201).json({ id: result.insertId, title, description, priority, status });
});

app.post('/api/projects/:projectId/tasks/import', requireAuth, async (req, res) => {
  const titles = parseTaskLines(req.body.text);

  if (titles.length === 0) {
    return res.status(400).json({ message: 'No numbered or bulleted tasks found' });
  }

  const result = await createProjectTasks({
    userId: req.user.id,
    projectId: req.params.projectId,
    tasks: titles.map((title) => ({ title, priority: 'medium' })),
    description: '批量导入生成'
  });

  res.status(201).json({ count: result.created.length, tasks: result.created, skipped: result.skipped });
});

app.post('/api/projects/:projectId/initialize/proposal', requireAuth, async (req, res) => {
  const { idea, feedback = '' } = req.body;

  if (!idea) {
    return res.status(400).json({ message: 'Project idea is required' });
  }

  const plan = await generateProjectPlan({ idea: idea.trim(), feedback: feedback.trim() });
  res.json(plan);
});

app.post('/api/projects/:projectId/initialize/approve', requireAuth, async (req, res) => {
  const { brief, tasks = [] } = req.body;

  if (!brief || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ message: 'Brief and tasks are required' });
  }

  const document = await saveKnowledgeDocument({
    userId: req.user.id,
    projectId: req.params.projectId,
    title: '项目初始化方案.md',
    content: brief
  });
  const taskResult = await createProjectTasks({
    userId: req.user.id,
    projectId: req.params.projectId,
    tasks,
    description: '项目初始化生成'
  });

  res.status(201).json({
    document,
    taskCount: taskResult.created.length,
    tasks: taskResult.created,
    skipped: taskResult.skipped
  });
});

app.patch('/api/tasks/:taskId', requireAuth, async (req, res) => {
  const { title, description, priority, status } = req.body;
  const fields = [];
  const values = [];

  for (const [field, value] of Object.entries({ title, description, priority, status })) {
    if (value !== undefined) {
      fields.push(`${field} = ?`);
      values.push(String(value).trim());
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  values.push(req.user.id, req.params.taskId);
  await pool.execute(
    `UPDATE tasks SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND id = ?`,
    values
  );
  res.json({ ok: true });
});

app.get('/api/projects/:projectId/documents', requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, file_name, file_type, file_size, content_preview, created_at
     FROM documents
     WHERE user_id = ? AND project_id = ?
     ORDER BY id DESC`,
    [req.user.id, req.params.projectId]
  );
  res.json(rows);
});

app.post('/api/projects/:projectId/documents', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File is required' });
  }

  try {
    const text = await extractText(req.file);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return res.status(400).json({ message: 'File has no readable text' });
    }

    const [documentResult] = await pool.execute(
      `INSERT INTO documents (user_id, project_id, file_name, file_type, file_size, content_preview)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.params.projectId,
        req.file.originalname,
        req.file.mimetype || 'text/plain',
        req.file.size,
        text.slice(0, 300)
      ]
    );

    for (let index = 0; index < chunks.length; index += 1) {
      await pool.execute(
        `INSERT INTO document_chunks (document_id, user_id, project_id, chunk_index, content)
         VALUES (?, ?, ?, ?, ?)`,
        [documentResult.insertId, req.user.id, req.params.projectId, index, chunks[index]]
      );
    }

    res.status(201).json({
      id: documentResult.insertId,
      fileName: req.file.originalname,
      chunkCount: chunks.length
    });
  } finally {
    await unlink(req.file.path).catch(() => {});
  }
});

app.get('/api/projects/:projectId/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();

  if (!q) {
    return res.status(400).json({ message: 'Search query is required' });
  }

  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT c.id, c.content, c.chunk_index, d.file_name
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.user_id = ? AND c.project_id = ? AND c.content LIKE ?
     ORDER BY c.id DESC
     LIMIT 10`,
    [req.user.id, req.params.projectId, like]
  );
  res.json(rows);
});

app.post('/api/projects/:projectId/agent/runs', requireAuth, async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ message: 'Prompt is required' });
  }

  const result = await runAgent({
    pool,
    userId: req.user.id,
    projectId: Number(req.params.projectId),
    prompt: prompt.trim()
  });

  res.status(201).json(result);
});

app.get('/api/projects/:projectId/agent/runs', requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, prompt, response, status, created_at, completed_at
     FROM agent_runs
     WHERE user_id = ? AND project_id = ?
     ORDER BY id DESC
     LIMIT 20`,
    [req.user.id, req.params.projectId]
  );
  res.json(rows);
});

app.get('/api/agent/runs/:runId', requireAuth, async (req, res) => {
  const [runs] = await pool.execute(
    `SELECT id, project_id, prompt, response, status, created_at, completed_at
     FROM agent_runs
     WHERE user_id = ? AND id = ?`,
    [req.user.id, req.params.runId]
  );

  if (!runs[0]) {
    return res.status(404).json({ message: 'Run not found' });
  }

  const [toolCalls] = await pool.execute(
    `SELECT id, tool_name, input_json, output_json, status, created_at
     FROM agent_tool_calls
     WHERE run_id = ?
     ORDER BY id ASC`,
    [req.params.runId]
  );

  res.json({ ...runs[0], toolCalls });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || 'Server error' });
});

export default app;
