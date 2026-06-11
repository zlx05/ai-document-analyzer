import { readFile } from 'node:fs/promises';

const supportedExtensions = new Set(['.txt', '.md', '.csv', '.json']);

export function isSupportedFile(filename) {
  const dotIndex = filename.lastIndexOf('.');
  const extension = dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';
  return supportedExtensions.has(extension);
}

export async function extractText(file) {
  if (!isSupportedFile(file.originalname)) {
    throw new Error('Only .txt, .md, .csv, and .json files are supported in this demo');
  }

  const raw = await readFile(file.path, 'utf8');
  if (file.originalname.toLowerCase().endsWith('.json')) {
    return JSON.stringify(JSON.parse(raw), null, 2);
  }

  return raw;
}

export function chunkText(text, size = 900, overlap = 140) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) {
    return [];
  }

  const chunks = [];
  let index = 0;

  while (index < clean.length) {
    chunks.push(clean.slice(index, index + size));
    index += size - overlap;
  }

  return chunks;
}

function tokenize(text) {
  const lower = text.toLowerCase();
  const latin = lower.match(/[a-z0-9]+/g) || [];
  const chinese = lower.match(/[\u4e00-\u9fff]/g) || [];
  return new Set([...latin, ...chinese]);
}

function scoreChunk(queryTokens, content) {
  const contentTokens = tokenize(content);
  let score = 0;

  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

export async function retrieveRelevantChunks(pool, userId, projectId, question, limit = 5) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.content, c.chunk_index, d.file_name
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.user_id = ? AND c.project_id = ?
     ORDER BY c.id DESC
     LIMIT 80`,
    [userId, projectId]
  );

  const queryTokens = tokenize(question);
  const ranked = rows
    .map((row) => ({
      ...row,
      score: scoreChunk(queryTokens, row.content)
    }))
    .sort((a, b) => b.score - a.score || b.id - a.id);

  return ranked.slice(0, limit);
}
