import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login }               = useAuth();
  const { theme, toggleTheme }  = useTheme();
  const navigate                = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    const ok = await login(username, password);
    if (ok) navigate('/');
    else { setError('Invalid username or password'); setLoading(false); }
  };

  return (
    <div className="login-page" style={{ position:'relative' }}>
      {/* Theme toggle — top right corner */}
      <button
        onClick={toggleTheme}
        style={{
          position:'absolute', top:20, right:20,
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:8, padding:'7px 12px', cursor:'pointer',
          color:'var(--text2)', fontSize:13, fontWeight:600,
          display:'flex', alignItems:'center', gap:6, fontFamily:'inherit',
        }}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
      </button>

      <div className="login-card">
        <div className="login-logo">
          <div style={{ fontSize:36, marginBottom:8 }}>⚡</div>
          <h1>RentalFlow</h1>
          <p>Equipment Management System</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div style={{
              color:'var(--red)', fontSize:13, marginBottom:12,
              padding:'8px 12px', background:'var(--red-dim)', borderRadius:6,
            }}>{error}</div>
          )}
          <button
            className="btn btn-primary"
            style={{ width:'100%', justifyContent:'center', marginTop:4 }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={{ textAlign:'center', color:'var(--text2)', fontSize:12, marginTop:20 }}>
          Default: admin / admin123
        </p>
      </div>
    </div>
  );
}
