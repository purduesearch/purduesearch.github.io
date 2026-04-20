const BASE_URL = process.env.REACT_APP_API_URL || '';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function handleResponse(response) {
  if (response.status === 401) {
    window.location.href = '/clubpm/login';
    throw new ApiError(401, 'Not authenticated');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, body.error ?? 'Request failed');
  }
  return response.json();
}

export async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return handleResponse(response);
}

export async function post(path, data) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function patch(path, data) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function del(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401) {
    window.location.href = '/clubpm/login';
    throw new ApiError(401, 'Not authenticated');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, body.error ?? 'Delete failed');
  }
}
