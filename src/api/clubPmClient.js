const BASE_URL = process.env.REACT_APP_API_URL || "";

const TOKEN_KEY = "clubpm_auth_token";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse(response) {
  if (response.status === 401) {
    // Throw without redirecting. AppShell already redirects via React Router's
    // <Navigate> when member is null — a hard window.location redirect would
    // hit a GitHub Pages 404 for any /clubpm/* route, and would also fire on
    // 401s from non-auth endpoints (e.g. Slack integration) even when the user's
    // own token is valid.
    throw new ApiError(401, "Not authenticated");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(
      response.status,
      body.error ?? "Request failed"
    );
  }

  return response.json();
}

export async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  return handleResponse(response);
}

export async function post(path, data) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function patch(path, data) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function del(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json", ...authHeaders() },
  });
  
  if (response.status === 401) {
    throw new ApiError(401, "Not authenticated");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(
      response.status,
      body.error ?? "Delete failed"
    );
  }
}
