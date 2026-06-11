# ai-document-analyzer

AI 需求任务文档分析工具 / An AI-powered tool for analyzing and parsing task requirement documents.

这是一个全栈 AI Agent 项目工作台。用户先输入项目想法，Agent 生成项目方案和初始任务；用户确认后，方案会写入私有知识库，任务会写入数据库。后续 Agent 会基于知识库、任务状态和执行记录继续分析项目缺口、生成下一步计划，并记录完整工具调用过程。

## 功能

- 用户注册、登录、JWT 鉴权
- 项目创建和项目初始化
- Agent 根据项目想法生成方案和初始任务
- 用户确认后将方案写入知识库
- 任务创建、批量导入、完成确认和状态更新
- 文件上传、文本解析、知识切片入库
- 简化版 RAG 检索
- DeepSeek / OpenAI-compatible tool calling
- Agent 运行记录和工具调用轨迹
- MySQL 持久化
- 接口文档和接口测试

## 技术栈

- 前端：HTML、CSS、原生 JavaScript SPA
- 后端：Node.js、Express
- 数据库：MySQL、mysql2
- 鉴权：JWT、bcryptjs
- 上传：multer
- 测试：node:test、supertest
- LLM：DeepSeek OpenAI-compatible API

## 运行

复制 `.env.example` 为 `.env`，填入 MySQL 和 LLM 配置：

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的MySQL密码
DB_NAME=frontend_demo
PORT=3000
JWT_SECRET=换成一个随机长字符串
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
LLM_API_KEY=your_deepseek_api_key
```

初始化数据库：

```bash
npm run db:init
```

启动项目：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

## 使用流程

```text
创建项目
  ↓
输入项目想法
  ↓
Agent 生成项目方案和初始任务
  ↓
用户反馈修改或确认
  ↓
确认后方案写入知识库，任务写入数据库
  ↓
用户完成任务并确认
  ↓
Agent 基于知识库和任务状态继续生成下一步计划
```

## 数据库存储逻辑

- `users`：用户账号
- `projects`：项目
- `documents`：知识库文档记录
- `document_chunks`：文档切片，供 RAG 检索
- `tasks`：结构化任务和完成状态
- `agent_runs`：Agent 每次运行的输入、输出和状态
- `agent_tool_calls`：每次工具调用的输入输出记录

## 测试

```bash
npm test
```

测试覆盖注册、创建项目、项目初始化、创建任务、批量导入任务、上传资料、运行 Agent 和查看工具调用。

## API 文档

接口详情见 [docs/API.md](docs/API.md)。

## 面试讲法

这个项目不是普通聊天页面，而是一个能读写业务系统的 Agent 工作台：

```text
前端负责项目初始化、任务操作和执行过程展示
后端负责鉴权、业务接口、RAG 检索和 Agent 编排
MySQL 存储用户、项目、任务、知识库切片和 Agent 执行日志
Agent 通过工具调用读取知识库、查询任务、创建任务并总结状态
```
