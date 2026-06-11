import { retrieveRelevantChunks } from './rag.js';
import { chatCompletion, hasLlmConfig } from './llm.js';

async function recordToolCall(pool, runId, toolName, input, output, status = 'success') {
  await pool.execute(
    `INSERT INTO agent_tool_calls (run_id, tool_name, input_json, output_json, status)
     VALUES (?, ?, ?, ?, ?)`,
    [runId, toolName, JSON.stringify(input), JSON.stringify(output), status]
  );
}

function shouldCreateTasks(prompt) {
  return /拆解|计划|任务|待办|todo|行动项|安排/i.test(prompt);
}

function buildTaskTitles(prompt, chunks) {
  const source = [prompt, ...chunks.map((chunk) => chunk.content)].join(' ');
  const sentences = source
    .split(/[。.!?\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8 && item.length <= 60);

  const extracted = sentences.slice(0, 5).map((sentence) => `处理：${sentence}`);

  if (extracted.length >= 3) {
    return extracted;
  }

  return [
    '梳理需求和资料范围',
    '设计数据库表和接口契约',
    '实现前端核心页面',
    '实现后端业务接口和权限校验',
    '完成接口测试与部署说明'
  ];
}

async function listTasks(pool, userId, projectId) {
  const [tasks] = await pool.execute(
    `SELECT id, title, status, priority
     FROM tasks
     WHERE user_id = ? AND project_id = ?
     ORDER BY FIELD(status, 'todo', 'doing', 'done'), id DESC
     LIMIT 20`,
    [userId, projectId]
  );
  return tasks;
}

async function createTasks(pool, userId, projectId, titles) {
  const [existingRows] = await pool.execute(
    `SELECT title
     FROM tasks
     WHERE user_id = ? AND project_id = ?`,
    [userId, projectId]
  );
  const existingTitles = new Set(existingRows.map((row) => row.title.trim().toLowerCase()));
  const created = [];
  const skipped = [];

  for (const title of titles) {
    const normalizedTitle = String(title).trim();
    const key = normalizedTitle.toLowerCase();

    if (!normalizedTitle || existingTitles.has(key)) {
      skipped.push({ title: normalizedTitle, reason: 'already_exists' });
      continue;
    }

    const [result] = await pool.execute(
      `INSERT INTO tasks (user_id, project_id, title, description, priority, status)
       VALUES (?, ?, ?, ?, 'medium', 'todo')`,
      [userId, projectId, normalizedTitle, 'Agent 自动拆解生成']
    );
    existingTitles.add(key);
    created.push({ id: result.insertId, title: normalizedTitle });
  }

  return { created, skipped };
}

async function summarizeProject(pool, userId, projectId) {
  const [statsRows] = await pool.execute(
    `SELECT
      SUM(status = 'todo') AS todo_count,
      SUM(status = 'doing') AS doing_count,
      SUM(status = 'done') AS done_count
     FROM tasks
     WHERE user_id = ? AND project_id = ?`,
    [userId, projectId]
  );

  return statsRows[0] || { todo_count: 0, doing_count: 0, done_count: 0 };
}

const llmTools = [
  {
    type: 'function',
    function: {
      name: 'retrieve_knowledge',
      description: '检索当前项目私有知识库里的相关资料片段。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索问题或关键词' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: '查询当前项目最近任务。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_tasks',
      description: '为当前项目创建多个待办任务。',
      parameters: {
        type: 'object',
        properties: {
          titles: {
            type: 'array',
            items: { type: 'string' },
            description: '任务标题列表'
          }
        },
        required: ['titles']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'summarize_project',
      description: '统计当前项目任务状态。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];

function safeParseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch (_error) {
    return {};
  }
}

async function executeTool({ pool, userId, projectId, runId, toolName, args, prompt }) {
  if (toolName === 'retrieve_knowledge') {
    const output = await retrieveRelevantChunks(pool, userId, projectId, args.query || prompt);
    await recordToolCall(pool, runId, toolName, args, output);
    return output;
  }

  if (toolName === 'list_tasks') {
    const output = await listTasks(pool, userId, projectId);
    await recordToolCall(pool, runId, toolName, args, output);
    return output;
  }

  if (toolName === 'create_tasks') {
    const titles = Array.isArray(args.titles) ? args.titles.slice(0, 8) : [];
    const output = await createTasks(pool, userId, projectId, titles);
    await recordToolCall(pool, runId, toolName, args, output);
    return output;
  }

  if (toolName === 'summarize_project') {
    const output = await summarizeProject(pool, userId, projectId);
    await recordToolCall(pool, runId, toolName, args, output);
    return output;
  }

  const output = { message: `Unknown tool: ${toolName}` };
  await recordToolCall(pool, runId, toolName, args, output, 'failed');
  return output;
}

async function runLlmAgent({ pool, userId, projectId, prompt, runId }) {
  const messages = [
    {
      role: 'system',
      content:
        '你是一个项目管理 Agent。你必须先按需调用工具读取项目知识库和任务，再生成简洁、可执行的中文结果。涉及拆解任务时，调用 create_tasks。不要编造数据库里没有的资料。'
    },
    {
      role: 'user',
      content: prompt
    }
  ];

  for (let round = 0; round < 5; round += 1) {
    const message = await chatCompletion({ messages, tools: llmTools });
    const toolCalls = message.tool_calls || [];

    if (toolCalls.length === 0) {
      return message.content || 'Agent 已完成，但模型没有返回文本。';
    }

    messages.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      const args = safeParseJson(toolCall.function?.arguments);
      const output = await executeTool({ pool, userId, projectId, runId, toolName, args, prompt });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(output).slice(0, 6000)
      });
    }
  }

  const finalMessage = await chatCompletion({ messages, tools: [] });
  return finalMessage.content || 'Agent 工具调用已完成。';
}

export async function runAgent({ pool, userId, projectId, prompt }) {
  const [runResult] = await pool.execute(
    `INSERT INTO agent_runs (user_id, project_id, prompt, status)
     VALUES (?, ?, ?, 'running')`,
    [userId, projectId, prompt]
  );
  const runId = runResult.insertId;

  try {
    if (hasLlmConfig()) {
      const response = await runLlmAgent({ pool, userId, projectId, prompt, runId });
      await pool.execute(
        `UPDATE agent_runs
         SET response = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [response, runId]
      );

      return { id: runId, response };
    }

    const chunks = await retrieveRelevantChunks(pool, userId, projectId, prompt);
    await recordToolCall(pool, runId, 'retrieve_knowledge', { projectId, prompt }, chunks);

    const tasks = await listTasks(pool, userId, projectId);
    await recordToolCall(pool, runId, 'list_tasks', { projectId }, tasks);

    const createdTasks = [];
    if (shouldCreateTasks(prompt)) {
      const titles = buildTaskTitles(prompt, chunks);
      const createResult = await createTasks(pool, userId, projectId, titles);
      createdTasks.push(...createResult.created);

      await recordToolCall(pool, runId, 'create_tasks', { count: titles.length }, createResult);
    }

    const stats = await summarizeProject(pool, userId, projectId);
    await recordToolCall(pool, runId, 'summarize_project', { projectId }, stats);

    const knowledgeLine =
      chunks.length > 0
        ? `我检索到 ${chunks.length} 个相关知识片段，主要来自：${[...new Set(chunks.map((chunk) => chunk.file_name))].join('、')}。`
        : '当前项目还没有可用知识片段，建议先上传需求文档、笔记或资料。';

    const taskLine =
      createdTasks.length > 0
        ? `我已自动拆解并创建 ${createdTasks.length} 个任务。`
        : `当前项目已有 ${tasks.length} 个最近任务，本次没有创建新任务。`;

    const response = [
      knowledgeLine,
      taskLine,
      `任务状态：待办 ${Number(stats.todo_count || 0)}，进行中 ${Number(stats.doing_count || 0)}，已完成 ${Number(stats.done_count || 0)}。`
    ].join('\n');

    await pool.execute(
      `UPDATE agent_runs
       SET response = ?, status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [response, runId]
    );

    return { id: runId, response };
  } catch (error) {
    await pool.execute(
      `UPDATE agent_runs
       SET response = ?, status = 'failed', completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [error.message, runId]
    );
    throw error;
  }
}
