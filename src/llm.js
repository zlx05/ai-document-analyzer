const placeholderKeys = new Set(['', 'your_deepseek_api_key', 'replace-me']);

export function hasLlmConfig() {
  const apiKey = process.env.LLM_API_KEY || '';
  return process.env.NODE_ENV !== 'test' && !placeholderKeys.has(apiKey.trim());
}

export async function chatCompletion({ messages, tools }) {
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'deepseek-v4-flash';
  const apiKey = process.env.LLM_API_KEY;
  const payload = {
    model,
    messages,
    temperature: 0.2
  };

  if (tools?.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `LLM request failed: ${response.status}`);
  }

  return data.choices?.[0]?.message || { role: 'assistant', content: '' };
}
