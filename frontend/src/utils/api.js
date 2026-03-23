const BASE = '/api';

export const getToken = () => localStorage.getItem('token');

async function req(method, path, body, isFormData = false) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${getToken()}` }
  };
  if (body && !isFormData) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (isFormData) {
    opts.body = body;
  }

  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch (networkErr) {
    throw new Error('Network error — is the server running?');
  }

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Server returned HTML or something unexpected — surface a useful error
    const text = await res.text();
    console.error(`API ${method} ${path} returned non-JSON (${res.status}):`, text.slice(0, 200));
    throw new Error(`Server error ${res.status} — check Docker logs`);
  }

  const data = await res.json();
  return data;
}

export const api = {
  get:      (p)    => req('GET',    p),
  post:     (p, b) => req('POST',   p, b),
  put:      (p, b) => req('PUT',    p, b),
  delete:   (p)    => req('DELETE', p),
  postForm: (p, b) => req('POST',   p, b, true),
  putForm:  (p, b) => req('PUT',    p, b, true),
};
