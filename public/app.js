const appNode = document.querySelector('#app');

const state = {
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  projects: [],
  currentProjectId: Number(localStorage.getItem('currentProjectId') || 0),
  tasks: [],
  documents: [],
  runs: [],
  selectedRun: null,
  initProposal: null,
  notice: ''
};

function setNotice(message) {
  state.notice = message;
  render();
}

async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...options.headers
  };

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || '请求失败');
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function currentProject() {
  return state.projects.find((project) => project.id === state.currentProjectId) || state.projects[0];
}

async function loadWorkspace() {
  state.projects = await api('/api/projects');
  const project = currentProject();

  if (project) {
    state.currentProjectId = project.id;
    localStorage.setItem('currentProjectId', String(project.id));
    await loadProjectData(project.id);
  }

  render();
}

async function loadProjectData(projectId) {
  const [tasks, documents, runs] = await Promise.all([
    api(`/api/projects/${projectId}/tasks`),
    api(`/api/projects/${projectId}/documents`),
    api(`/api/projects/${projectId}/agent/runs`)
  ]);

  state.tasks = tasks;
  state.documents = documents;
  state.runs = runs;
  state.selectedRun = null;
}

async function selectProject(projectId) {
  state.currentProjectId = Number(projectId);
  localStorage.setItem('currentProjectId', String(projectId));
  await loadProjectData(projectId);
  render();
}

function renderAuth() {
  appNode.innerHTML = `
    <main class="authShell">
      <section class="authPanel">
        <p class="eyebrow">AI Knowledge Agent</p>
        <h1>知识库驱动的任务 Agent</h1>
        <form id="loginForm" class="stack">
          <input name="email" type="email" placeholder="邮箱" value="demo@example.com" required />
          <input name="password" type="password" placeholder="密码，至少 6 位" value="123456" required />
          <button type="submit">登录</button>
        </form>
        <form id="registerForm" class="stack compact">
          <input name="name" placeholder="昵称" value="Demo User" required />
          <input name="email" type="email" placeholder="邮箱" value="demo@example.com" required />
          <input name="password" type="password" placeholder="密码，至少 6 位" value="123456" required />
          <button type="submit" class="secondary">注册新用户</button>
        </form>
        ${state.notice ? `<p class="notice">${escapeHtml(state.notice)}</p>` : ''}
      </section>
    </main>
  `;

  document.querySelector('#loginForm').addEventListener('submit', handleLogin);
  document.querySelector('#registerForm').addEventListener('submit', handleRegister);
}

function renderApp() {
  const project = currentProject();
  const todoCount = state.tasks.filter((task) => task.status === 'todo').length;
  const doingCount = state.tasks.filter((task) => task.status === 'doing').length;
  const doneCount = state.tasks.filter((task) => task.status === 'done').length;

  appNode.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">RAG Agent Workspace</p>
        <h1>AI 项目知识库</h1>
      </div>
      <div class="topActions">
        <span>${escapeHtml(state.user?.name || '')}</span>
        <button id="logoutButton" class="ghost" type="button">退出</button>
      </div>
    </header>

    <main class="layout">
      <aside class="sidebar">
        <form id="projectForm" class="stack">
          <input name="name" placeholder="新项目名称" required />
          <textarea name="description" rows="3" placeholder="项目说明"></textarea>
          <button type="submit">创建项目</button>
        </form>
        <nav class="projectList">
          ${state.projects
            .map(
              (item) => `
                <button class="${item.id === project?.id ? 'active' : ''}" data-project-id="${item.id}" type="button">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>${escapeHtml(item.description || '暂无说明')}</span>
                </button>
              `
            )
            .join('')}
        </nav>
      </aside>

      <section class="workspace">
        ${
          project
            ? renderWorkspace(project, { todoCount, doingCount, doneCount })
            : '<section class="panel empty">先创建一个项目。</section>'
        }
      </section>
    </main>
  `;

  document.querySelector('#logoutButton').addEventListener('click', logout);
  document.querySelector('#projectForm').addEventListener('submit', handleCreateProject);
  document.querySelectorAll('[data-project-id]').forEach((button) => {
    button.addEventListener('click', () => selectProject(button.dataset.projectId));
  });

  if (project) {
    document.querySelector('#taskForm').addEventListener('submit', handleCreateTask);
    document.querySelector('#taskImportForm').addEventListener('submit', handleImportTasks);
    document.querySelector('#initIdeaForm').addEventListener('submit', handleGenerateProposal);
    document.querySelector('#uploadForm').addEventListener('submit', handleUpload);
    document.querySelector('#agentForm').addEventListener('submit', handleRunAgent);
    document.querySelector('#generateTasksButton').addEventListener('click', handleGenerateTasksFromKnowledge);
    document.querySelector('#initFeedbackForm')?.addEventListener('submit', handleRegenerateProposal);
    document.querySelector('#approveProposalButton')?.addEventListener('click', handleApproveProposal);
    document.querySelectorAll('[data-task-status]').forEach((button) => {
      button.addEventListener('click', () => updateTaskStatus(button.dataset.taskId, button.dataset.taskStatus));
    });
    document.querySelectorAll('[data-run-id]').forEach((button) => {
      button.addEventListener('click', () => loadRunDetail(button.dataset.runId));
    });
  }
}

function renderWorkspace(project, stats) {
  return `
    <section class="projectHero">
      <div>
        <h2>${escapeHtml(project.name)}</h2>
        <p>${escapeHtml(project.description || '这个项目还没有说明。')}</p>
      </div>
      <div class="metrics">
        <span><strong>${stats.todoCount}</strong>待办</span>
        <span><strong>${stats.doingCount}</strong>进行中</span>
        <span><strong>${stats.doneCount}</strong>已完成</span>
      </div>
    </section>

    ${state.notice ? `<p class="notice">${escapeHtml(state.notice)}</p>` : ''}

    ${renderInitializer()}

    <section class="grid">
      <div class="panel">
        <h3>知识库</h3>
        <form id="uploadForm" class="inlineForm">
          <input name="file" type="file" accept=".txt,.md,.csv,.json" required />
          <button type="submit">上传解析</button>
        </form>
        <div class="list">
          ${
            state.documents.length
              ? state.documents
                  .map(
                    (doc) => `
                      <article class="listItem">
                        <strong>${escapeHtml(doc.file_name)}</strong>
                        <p>${escapeHtml(doc.content_preview || '').slice(0, 110)}</p>
                      </article>
                    `
                  )
                  .join('')
              : '<p class="muted">暂无资料。</p>'
          }
        </div>
      </div>

      <div class="panel">
        <h3>任务</h3>
        <form id="taskForm" class="inlineForm">
          <input name="title" placeholder="新增任务" required />
          <button type="submit">添加</button>
        </form>
        <form id="taskImportForm" class="importForm">
          <textarea name="text" rows="5" placeholder="粘贴 Markdown 编号或项目符号任务清单"></textarea>
          <button type="submit">批量导入任务</button>
        </form>
        <div class="taskList">
          ${renderTasks()}
        </div>
      </div>

      <div class="panel wide">
        <h3>Agent 执行</h3>
        <form id="agentForm" class="agentForm">
          <textarea name="prompt" rows="4" placeholder="例如：根据上传资料，把这个项目拆解成可执行任务，并总结风险点。" required></textarea>
          <button type="submit">运行 Agent</button>
        </form>
        <button id="generateTasksButton" class="secondary fullWidth" type="button">从知识库生成任务</button>
        <div class="agentResult">
          <div>
            <h4>运行记录</h4>
            <div class="runList">
              ${renderRuns()}
            </div>
          </div>
          <div>
            <h4>工具调用轨迹</h4>
            <div class="toolTrace">
              ${renderSelectedRun()}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderInitializer() {
  return `
    <section class="panel initializer">
      <h3>项目初始化</h3>
      <form id="initIdeaForm" class="stack">
        <textarea name="idea" rows="3" placeholder="输入你的项目想法，例如：我想做一个适合实习面试展示的全栈 Agent 项目。" required></textarea>
        <button type="submit">生成项目方案</button>
      </form>
      ${
        state.initProposal
          ? `
            <div class="proposal">
              <label>
                方案文档
                <textarea id="proposalBrief" rows="10">${escapeHtml(state.initProposal.brief)}</textarea>
              </label>
              <div class="proposalTasks">
                <strong>将创建的初始任务</strong>
                ${state.initProposal.tasks
                  .map(
                    (task) => `
                      <div class="proposalTask">
                        <span>${escapeHtml(task.title)}</span>
                        <small>${escapeHtml(task.priority || 'medium')}</small>
                      </div>
                    `
                  )
                  .join('')}
              </div>
              <form id="initFeedbackForm" class="inlineForm">
                <input name="feedback" placeholder="不符合要求的话，输入修改意见" />
                <button type="submit">修改方案</button>
              </form>
              <button id="approveProposalButton" class="fullWidth" type="button">确认并写入知识库</button>
            </div>
          `
          : ''
      }
    </section>
  `;
}

function renderTasks() {
  if (state.tasks.length === 0) {
    return '<p class="muted">暂无任务。</p>';
  }

  return state.tasks
    .map(
      (task) => `
        <article class="task ${task.status}">
          <div>
            <strong>${escapeHtml(task.title)}</strong>
            <span>${escapeHtml(task.priority)} / ${escapeHtml(task.status)}</span>
          </div>
          <div class="taskActions">
            ${
              task.status === 'done'
                ? '<span class="doneText">已完成</span>'
                : `<button data-task-id="${task.id}" data-task-status="done" title="确认完成" type="button">✓</button>`
            }
          </div>
        </article>
      `
    )
    .join('');
}

function renderRuns() {
  if (state.runs.length === 0) {
    return '<p class="muted">暂无 Agent 运行记录。</p>';
  }

  return state.runs
    .map(
      (run) => `
        <button data-run-id="${run.id}" type="button" class="runItem">
          <strong>#${run.id} ${escapeHtml(run.status)}</strong>
          <span>${escapeHtml(run.prompt).slice(0, 90)}</span>
        </button>
      `
    )
    .join('');
}

function safeJson(value) {
  if (typeof value === 'object' && value !== null) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function renderSelectedRun() {
  if (!state.selectedRun) {
    return '<p class="muted">选择一次运行查看工具调用。</p>';
  }

  return `
    <article class="runDetail">
      <p>${escapeHtml(state.selectedRun.response || '')}</p>
      ${(state.selectedRun.toolCalls || [])
        .map((call) => {
          const output = safeJson(call.output_json);
          const summary = Array.isArray(output) ? `${output.length} 条结果` : JSON.stringify(output).slice(0, 160);
          return `
            <div class="toolCall">
              <strong>${escapeHtml(call.tool_name)}</strong>
              <span>${escapeHtml(summary)}</span>
            </div>
          `;
        })
        .join('')}
    </article>
  `;
}

async function handleRegister(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    saveSession(data);
    await loadWorkspace();
  } catch (error) {
    setNotice(error.message);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    saveSession(data);
    await loadWorkspace();
  } catch (error) {
    setNotice(error.message);
  }
}

function saveSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
}

function logout() {
  localStorage.clear();
  state.token = null;
  state.user = null;
  state.projects = [];
  state.currentProjectId = 0;
  render();
}

async function handleCreateProject(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

  await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  setNotice('项目已创建。');
  await loadWorkspace();
}

async function handleCreateTask(event) {
  event.preventDefault();
  const project = currentProject();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

  await api(`/api/projects/${project.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  await loadProjectData(project.id);
  setNotice('任务已添加。');
}

async function handleGenerateProposal(event) {
  event.preventDefault();
  const project = currentProject();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

  state.initProposal = await api(`/api/projects/${project.id}/initialize/proposal`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  setNotice('项目方案已生成，请确认是否符合要求。');
}

async function handleRegenerateProposal(event) {
  event.preventDefault();
  const project = currentProject();
  const feedback = Object.fromEntries(new FormData(event.currentTarget).entries()).feedback;
  const idea = document.querySelector('#initIdeaForm textarea[name="idea"]').value;

  state.initProposal = await api(`/api/projects/${project.id}/initialize/proposal`, {
    method: 'POST',
    body: JSON.stringify({ idea, feedback })
  });
  setNotice('项目方案已根据反馈修改。');
}

async function handleApproveProposal() {
  const project = currentProject();
  const brief = document.querySelector('#proposalBrief').value;

  const result = await api(`/api/projects/${project.id}/initialize/approve`, {
    method: 'POST',
    body: JSON.stringify({ brief, tasks: state.initProposal.tasks })
  });

  state.initProposal = null;
  await loadProjectData(project.id);
  setNotice(`初始化完成：方案已写入知识库，创建 ${result.taskCount} 个任务。`);
}

async function handleImportTasks(event) {
  event.preventDefault();
  const project = currentProject();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

  const result = await api(`/api/projects/${project.id}/tasks/import`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  event.currentTarget.reset();
  await loadProjectData(project.id);
  setNotice(`已批量导入 ${result.count} 个任务。`);
}

async function updateTaskStatus(taskId, status) {
  if (status === 'done' && !confirm('确认完成这个任务吗？')) {
    return;
  }

  await api(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  await loadProjectData(currentProject().id);
  setNotice('任务状态已更新。');
}

async function handleUpload(event) {
  event.preventDefault();
  const project = currentProject();
  const formData = new FormData(event.currentTarget);

  const result = await api(`/api/projects/${project.id}/documents`, {
    method: 'POST',
    body: formData
  });

  await loadProjectData(project.id);
  setNotice(`资料已解析，生成 ${result.chunkCount} 个知识片段。`);
}

async function handleRunAgent(event) {
  event.preventDefault();
  const project = currentProject();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

  const result = await api(`/api/projects/${project.id}/agent/runs`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  await loadProjectData(project.id);
  await loadRunDetail(result.id);
  setNotice('Agent 已完成执行。');
}

async function handleGenerateTasksFromKnowledge() {
  const project = currentProject();
  const result = await api(`/api/projects/${project.id}/agent/runs`, {
    method: 'POST',
    body: JSON.stringify({
      prompt:
        '请先检索当前项目知识库，再查看已有任务，找出缺失工作并创建具体可执行任务。创建任务前要避免重复，最后总结你创建了什么。'
    })
  });

  await loadProjectData(project.id);
  await loadRunDetail(result.id);
  setNotice('Agent 已根据知识库生成任务。');
}

async function loadRunDetail(runId) {
  state.selectedRun = await api(`/api/agent/runs/${runId}`);
  render();
}

function render() {
  if (!state.token) {
    renderAuth();
  } else {
    renderApp();
  }
}

if (state.token) {
  loadWorkspace().catch((error) => {
    localStorage.clear();
    state.token = null;
    setNotice(error.message);
  });
} else {
  render();
}
