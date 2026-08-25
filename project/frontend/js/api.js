const api = {
  BASE: '/api',
  BASE_URL: '/api', // Alias for compatibility

  async request(method, endpoint, body, isFormData = false) {
    const headers = {};
    const token = auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const options = { method, headers };
    if (body) {
      options.body = isFormData ? body : JSON.stringify(body);
    }

    try {
      const res = await fetch(this.BASE + endpoint, options);
      if (res.status === 401) { auth.logout(); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      return data;
    } catch (error) {
      console.error(`API Error [${method} ${endpoint}]:`, error.message);
      throw error;
    }
  },

  get(endpoint)              { return this.request('GET',    endpoint); },
  post(endpoint, body)       { return this.request('POST',   endpoint, body); },
  put(endpoint, body)        { return this.request('PUT',    endpoint, body); },
  delete(endpoint)           { return this.request('DELETE', endpoint); },
  del(endpoint)              { return this.request('DELETE', endpoint); },
  upload(endpoint, formData) { return this.request('POST',   endpoint, formData, true); },
};
window.api = api;
