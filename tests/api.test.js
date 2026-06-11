import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db.js';

process.env.NODE_ENV = 'test';

const email = `demo-${Date.now()}@example.com`;
let token;
let projectId;
let taskId;

test('health check', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.ok, true);
});

test('register user', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: '123456' })
    .expect(201);

  assert.ok(response.body.token);
  token = response.body.token;
});

test('create project', async () => {
  const response = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'API Test Project', description: 'Created by node:test' })
    .expect(201);

  assert.ok(response.body.id);
  projectId = response.body.id;
});

test('generate and approve project initialization plan', async () => {
  const proposalResponse = await request(app)
    .post(`/api/projects/${projectId}/initialize/proposal`)
    .set('Authorization', `Bearer ${token}`)
    .send({ idea: '我想做一个全栈 RAG Agent 实习项目' })
    .expect(200);

  assert.ok(proposalResponse.body.brief);
  assert.ok(proposalResponse.body.tasks.length > 0);

  const approveResponse = await request(app)
    .post(`/api/projects/${projectId}/initialize/approve`)
    .set('Authorization', `Bearer ${token}`)
    .send({ brief: proposalResponse.body.brief, tasks: proposalResponse.body.tasks })
    .expect(201);

  assert.ok(approveResponse.body.document.documentId);
  assert.ok(approveResponse.body.taskCount > 0);
});

test('create task', async () => {
  const response = await request(app)
    .post(`/api/projects/${projectId}/tasks`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Write API tests', priority: 'high' })
    .expect(201);

  assert.equal(response.body.title, 'Write API tests');
  taskId = response.body.id;
});

test('update task status', async () => {
  await request(app)
    .patch(`/api/tasks/${taskId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'done' })
    .expect(200);
});

test('import tasks from markdown list', async () => {
  const response = await request(app)
    .post(`/api/projects/${projectId}/tasks/import`)
    .set('Authorization', `Bearer ${token}`)
    .send({ text: '1. 接入真实 LLM\n2. React 前端重构\n- Docker 部署' })
    .expect(201);

  assert.equal(response.body.count, 3);
});

test('upload document and run agent', async () => {
  await request(app)
    .post(`/api/projects/${projectId}/documents`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', Buffer.from('项目需要完成 RAG 知识库、Agent 工具调用、权限控制和部署说明。'), 'plan.md')
    .expect(201);

  const runResponse = await request(app)
    .post(`/api/projects/${projectId}/agent/runs`)
    .set('Authorization', `Bearer ${token}`)
    .send({ prompt: '根据资料拆解任务，并总结项目状态。' })
    .expect(201);

  assert.ok(runResponse.body.id);

  const detailResponse = await request(app)
    .get(`/api/agent/runs/${runResponse.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.ok(detailResponse.body.toolCalls.length >= 3);
});

test('close database pool', async () => {
  await pool.end();
});
