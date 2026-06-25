const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5000";

async function request(path, options = {}) {
  const token = localStorage.getItem("jananiai-token");
  const headers = { 
    "Content-Type": "application/json", 
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...(options.headers || {}) 
  };
  
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    if (response.status === 401 && token) {
      // Optional: Handle token expiry (e.g., clear token)
    }
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload.data ?? payload;
}

export const api = {
  generateStory: (body) => request("/generate-story", { method: "POST", body: JSON.stringify(body) }),
  completeStory: (body) => request("/complete-story", { method: "POST", body: JSON.stringify(body) }),
  translateStory: (body) => request("/translate-story", { method: "POST", body: JSON.stringify(body) }),
  chatRefine: (body) => request("/chat-refine", { method: "POST", body: JSON.stringify(body) }),
  saveStory: (body) => request("/save-story", { method: "POST", body: JSON.stringify(body) }),
  getStories: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined)).toString();
    return request(`/get-stories${qs ? `?${qs}` : ""}`);
  },
  updateStory: (id, body) => request(`/update-story/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteStory: (id) => request(`/delete-story/${id}`, { method: "DELETE" }),
  rateStory: (id, rating) => request("/rate-story", { method: "POST", body: JSON.stringify({ id, rating }) }),
  getAnalytics: () => request("/get-analytics"),
  health: () => request("/health"),
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  googleLogin: (body) => request("/auth/google", { method: "POST", body: JSON.stringify(body) }),
  forgotPassword: (body) => request("/auth/forgot-password", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: (body) => request("/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
  changePassword: (body) => request("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
  getProfile: () => request("/auth/profile")
};
