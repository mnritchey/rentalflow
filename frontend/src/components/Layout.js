import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { to: '/',           icon: '⬡',  label: 'Dashboard',      end: true },
  { to: '/projects',   icon: '📋', label: 'Projects' },
  { to: '/scan',       icon: '📷', label: 'Global Check-In' },
  { to: '/equipment',  icon: '🎛', label: 'Equipment' },
  { to: '/maintenance',icon: '🔧', label: 'Maintenance' },
  { to: '/contacts',   icon: '👤', label: 'Contacts' },
  { to: '/activity',   icon: '📊', label: 'Activity Log' },
  { to: '/inventory',  icon: '🔍', label: 'Inventory Audit' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };

  const isDark = theme === 'dark';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>⚡ RentalFlow</h1>
          <span>Equipment Management</span>
        </div>

        <div style={{ flex:1, overflow:'auto', paddingTop:8, paddingBottom:8 }}>
          <div className="nav-section">Main</div>
          {navItems.map(item => (
            <NavLink
              key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>{item.label}
            </NavLink>
          ))}

          <div className="nav-section" style={{ marginTop:8 }}>System</div>
          <NavLink to="/import-export" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="icon">↕️</span> Import / Export
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="icon">⚙️</span> Settings
          </NavLink>
        </div>

        <div className="sidebar-footer">
          {/* Theme toggle */}
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            <span style={{ fontSize:16 }}>{isDark ? '☀️' : '🌙'}</span>
            <span style={{ fontSize:12, fontWeight:600, marginLeft:6 }}>
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>

          {/* User chip */}
          <div className="user-chip">
            <div className="user-avatar">
              {(user?.full_name || user?.username || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.full_name || user?.username}
              </div>
              <div className="user-role">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              style={{ background:'none', border:'none', color:'var(--text2)', cursor:'pointer', fontSize:16 }}
              title="Logout"
            >↩</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
