# AI 知识库 Agent 平台

这是一个适合实习面试展示的全栈项目骨架，覆盖前端、后端、MySQL、RAG、文件上传、Agent 工具调用、权限控制、接口文档和接口测试。

## 功能

- 用户注册、登录、JWT 鉴权
- 项目管理
- 任务创建和状态流转
- 文档上传与文本解析
- 文档切片入库，形成简化版 RAG 知识库
- Agent 根据资料检索、查询任务、自动拆解任务、总结项目状态
- Agent 运行过程和工具调用轨迹可视化
- MySQL 持久化
- 接口测试

## 技术栈

- 前端：HTML、CSS、原生 JavaScript SPA
- 后端：Node.js、Express
- 数据库：MySQL、mysql2
- 鉴权：JWT、bcryptjs
- 上传：multer
- 测试：node:test、supertest

## 运行

复制 `.env.example` 为 `.env`，填入 MySQL 信息：

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

`LLM_API_KEY` 填真实密钥后，Agent 会调用 DeepSeek 的 OpenAI-compatible Chat Completions 接口进行 tool calling。保持占位符时，系统会使用本地规则版 Agent，方便离线演示和测试。

初始化数据库：

```bash
npm run db:init
```

启动：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

## 测试

```bash
npm test
```

测试会覆盖注册、创建项目、创建任务、上传资料、运行 Agent、查看工具调用。

## 面试讲法

这个项目不是单纯聊天页面，而是一个可读写业务系统的 Agent：

```text
前端负责工作台交互
后端负责鉴权、业务接口和 Agent 编排
MySQL 存储用户、项目、任务、文档切片、Agent 运行记录
Agent 通过工具调用读取知识库、查询任务、创建任务、总结进度
```

接口详情见 [docs/API.md](docs/API.md)。
