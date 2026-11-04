const API_BASE_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? `${window.location.origin}/api/client-portal`
  : '/api/client-portal';

const clientApi = {
  BASE_URL: API_BASE_URL,

  async request(method, endpoint, body) {
    const token = localStorage.getItem('client_token');
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(`${this.BASE_URL}${endpoint}`, options);
      // 401 means "signed out" only when a session was sent. For the login call itself it is
      // just a wrong ID/password, which must reach the form instead of reloading the page.
      if (res.status === 401 && token && endpoint !== '/login') {
        localStorage.removeItem('client_token');
        localStorage.removeItem('client_info');
        window.location.href = 'login.html';
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || `HTTP error! Status: ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Client Error [${method} ${endpoint}]:`, err.message);
      throw err;
    }
  },

  get(endpoint) { return this.request('GET', endpoint); },
  post(endpoint, body) { return this.request('POST', endpoint, body); }
};

window.clientApi = clientApi;
