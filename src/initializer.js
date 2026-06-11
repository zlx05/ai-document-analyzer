import { chatCompletion, hasLlmConfig } from './llm.js';

function fallbackPlan(idea) {
  const cleanIdea = String(idea || '').trim();
  const brief = `# 项目初始化方案

## 用户想法

${cleanIdea}

## 项目定位

本项目定位为一个可持续推进的 AI 项目工作台。用户输入项目想法后，系统会生成项目方案、沉淀到知识库，并拆解成可执行任务。后续 Agent 会基于知识库和任务状态继续给出下一步计划。

## 核心流程

1. 用户输入项目想法。
2. Agent 生成项目方案。
3. 用户确认或提出修改意见。
4. 确认后项目方案写入知识库。
5. Agent 生成初始任务并写入数据库。
6. 用户完成任务后点击确认完成。
7. 后续 Agent 基于已完成和未完成任务继续生成计划。

## 技术架构

- 前端：项目初始化、任务列表、知识库、Agent 执行过程展示。
- 后端：鉴权、项目管理、文件解析、RAG 检索、Agent 工具调用。
- 数据库：用户、项目、任务、文档切片、Agent 运行记录。
- 大模型：根据项目想法生成方案，并结合知识库和任务状态拆解后续任务。

## 项目价值

项目价值不只是让 AI 输出建议，而是把建议转化成系统里的知识库和结构化任务，并在后续迭代中持续使用。`;

  return {
    brief,
    tasks: [
      { title: '确认项目定位和核心用户流程', description: '梳理用户输入、Agent 输出、任务推进和知识沉淀流程。', priority: 'high' },
      { title: '设计项目初始化数据结构', description: '明确初始化方案如何保存到知识库，以及初始任务如何写入数据库。', priority: 'high' },
      { title: '实现项目初始化前端页面', description: '支持用户输入想法、查看方案、反馈修改和确认保存。', priority: 'high' },
      { title: '实现 Agent 生成项目方案接口', description: '根据用户想法生成项目定位、技术路线、功能模块和开发阶段。', priority: 'high' },
      { title: '实现确认后写入知识库和任务表', description: '将方案保存为文档切片，将任务保存到 tasks 表。', priority: 'medium' },
      { title: '实现任务完成确认和置灰展示', description: '用户点击完成按钮后确认，确认后更新任务状态并在前端置灰。', priority: 'medium' }
    ]
  };
}

function extractJson(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('LLM did not return JSON');
  }
  return JSON.parse(match[0]);
}

export async function generateProjectPlan({ idea, feedback }) {
  if (!hasLlmConfig()) {
    return fallbackPlan(idea);
  }

  const message = await chatCompletion({
    tools: [],
    messages: [
      {
        role: 'system',
        content:
          '你是一个产品型全栈 Agent 项目规划助手。请只返回 JSON，不要 Markdown 代码块。JSON 格式：{"brief":"完整项目方案 markdown","tasks":[{"title":"任务标题","description":"任务说明","priority":"high|medium|low"}]}。任务数量 6-8 个，必须具体、可执行。'
      },
      {
        role: 'user',
        content: `用户想法：${idea}\n修改意见：${feedback || '无'}`
      }
    ]
  });

  const parsed = extractJson(message.content);
  if (!parsed.brief || !Array.isArray(parsed.tasks)) {
    return fallbackPlan(idea);
  }

  return {
    brief: parsed.brief,
    tasks: parsed.tasks.slice(0, 10).map((task) => ({
      title: String(task.title || '').trim(),
      description: String(task.description || '').trim(),
      priority: ['high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium'
    }))
  };
}
