# API 文档

默认地址：

```text
http://127.0.0.1:3000
```

除注册、登录、健康检查外，其余接口都需要请求头：

```text
Authorization: Bearer <token>
```

## 健康检查

```http
GET /api/health
```

返回：

```json
{
  "ok": true,
  "database": "connected"
}
```

## 注册

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "name": "Demo User",
  "email": "demo@example.com",
  "password": "123456"
}
```

## 登录

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "demo@example.com",
  "password": "123456"
}
```

## 创建项目

```http
POST /api/projects
Content-Type: application/json
```

```json
{
  "name": "实习面试 Agent 项目",
  "description": "RAG 知识库与任务拆解 Agent"
}
```

## 获取项目列表

```http
GET /api/projects
```

## 生成项目初始化方案

```http
POST /api/projects/:projectId/initialize/proposal
Content-Type: application/json
```

```json
{
  "idea": "我想做一个适合实习面试展示的全栈 Agent 项目",
  "feedback": "希望更偏前端和数据库"
}
```

返回项目方案文档和初始任务预览。此时不会写入知识库，也不会创建任务。

## 确认初始化方案

```http
POST /api/projects/:projectId/initialize/approve
Content-Type: application/json
```

```json
{
  "brief": "# 项目初始化方案...",
  "tasks": [
    {
      "title": "确认项目定位和核心用户流程",
      "description": "梳理用户输入、Agent 输出、任务推进和知识沉淀流程。",
      "priority": "high"
    }
  ]
}
```

确认后，方案会写入知识库，任务会写入 `tasks` 表。

## 创建任务

```http
POST /api/projects/:projectId/tasks
Content-Type: application/json
```

```json
{
  "title": "完成数据库表设计",
  "description": "设计用户、项目、任务和文档切片表",
  "priority": "high"
}
```

## 更新任务状态

```http
PATCH /api/tasks/:taskId
Content-Type: application/json
```

```json
{
  "status": "done"
}
```

## 批量导入任务

```http
POST /api/projects/:projectId/tasks/import
Content-Type: application/json
```

后端会解析 Markdown 编号列表或项目符号列表。

```json
{
  "text": "1. 接入真实 LLM\n2. React 前端重构\n- Docker 部署"
}
```

## 上传资料

支持 `.txt`、`.md`、`.csv`、`.json`。

```http
POST /api/projects/:projectId/documents
Content-Type: multipart/form-data
```

字段：

```text
file=<本地文件>
```

后端会解析文本，切分成知识片段，并写入 `documents` 和 `document_chunks`。

## 搜索知识库

```http
GET /api/projects/:projectId/search?q=数据库
```

## 运行 Agent

```http
POST /api/projects/:projectId/agent/runs
Content-Type: application/json
```

```json
{
  "prompt": "根据上传资料，把项目拆解成可执行任务，并总结当前进度。"
}
```

Agent 会执行：

```text
retrieve_knowledge
list_tasks
create_tasks
summarize_project
```

执行记录会写入：

```text
agent_runs
agent_tool_calls
```

当 `.env` 中的 `LLM_API_KEY` 是真实密钥时，Agent 会调用 `LLM_BASE_URL` 的 Chat Completions 接口，并让模型决定工具调用顺序。密钥为空或保持占位符时，后端会使用本地规则版 Agent。

## 查看 Agent 运行详情

```http
GET /api/agent/runs/:runId
```
