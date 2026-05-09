const API = '/api';

function headers() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(), ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(email, password) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getTasks(params = {}) {
  const q = new URLSearchParams(params).toString();
  return request(`/tasks${q ? `?${q}` : ''}`);
}

export function getTask(id) {
  return request(`/tasks/${id}`);
}

export function createTask(title, inputText, operation) {
  return request('/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, inputText, operation }),
  });
}

export function subscribeToTasks(onUpdate) {
  const token = localStorage.getItem('token');
  if (!token) return () => {};

  const url = `${API}/tasks/stream`;
  const controller = new AbortController();

  fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  }).then(async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type !== 'connected') onUpdate(data);
          } catch {}
        }
      }
    }
  }).catch(() => {});

  return () => controller.abort();
}
