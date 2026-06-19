import { useAuthStore } from "./auth-store";
import { toast } from "sonner";

const BASE_URL = "/api";

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function getAuthHeaders(hasBody: boolean): HeadersInit {
  const token = useAuthStore.getState().token;
  const headers: HeadersInit = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  // Only set Content-Type when a JSON body is being sent
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function handleUnauthorized() {
  const { logout, isAuthenticated } = useAuthStore.getState();
  if (isAuthenticated) {
    // Show a brief message before redirecting
    toast.error('Sessão expirada. Faça login novamente.');
  }
  logout();
  // Small delay so the user sees the toast
  setTimeout(() => window.location.reload(), 500);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const hasBody = body !== undefined;
  const options: RequestInit = {
    method,
    headers: getAuthHeaders(hasBody),
  };

  if (hasBody) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    handleUnauthorized();
    throw new ApiError("Sessão expirada", 401);
  }

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }
    let message = `Erro ${response.status}`;
    if (typeof errorData === "object" && errorData !== null) {
      if ("error" in errorData) {
        message = (errorData as { error: string }).error;
      } else if ("message" in errorData) {
        message = (errorData as { message: string }).message;
      }
    }
    throw new ApiError(message, response.status, errorData);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),

  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),

  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),

  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),

  /**
   * Upload a file to the given API path. Returns parsed JSON response.
   * Optional `fields` allows appending extra string form fields alongside
   * the file (e.g. school_id for bulk imports).
   */
  upload: async <T>(
    path: string,
    file: File,
    fields?: Record<string, string>
  ): Promise<T> => {
    const token = useAuthStore.getState().token;
    const formData = new FormData();
    formData.append("file", file);
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        formData.append(key, value);
      }
    }

    const url = `${BASE_URL}${path}`;
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData,
    });

    if (response.status === 401) {
      handleUnauthorized();
      throw new ApiError("Sessão expirada", 401);
    }

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      const message =
        typeof errorData === "object" && errorData !== null && "error" in errorData
          ? (errorData as { error: string }).error
          : `Erro ${response.status}`;
      throw new ApiError(message, response.status, errorData);
    }

    return response.json();
  },

  /** Download a file (blob) from the given API path. */
  download: async (path: string, filename: string): Promise<void> => {
    const token = useAuthStore.getState().token;
    const url = `${BASE_URL}${path}`;
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });

    if (response.status === 401) {
      handleUnauthorized();
      throw new ApiError("Sessão expirada", 401);
    }

    if (!response.ok) {
      throw new ApiError(`Erro ${response.status}`, response.status);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  },
};

export { ApiError };
