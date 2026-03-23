import { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';

// Release history — add a new entry here with each release
// Versioning: MAJOR.MINOR.PATCH
//   MAJOR — breaking changes, database migrations, major overhauls
//   MINOR — new features and modules
//   PATCH — bug fixes, tweaks, small improvements
const RELEASE_NOTES = [
  { version:'1.3.4', date:'2026-03-23', notes:'Build fix: ModelDetail transfer modal JSX placed outside component; docker build now succeeds' },
  { version:'1.3.3', date:'2026-03-23', notes:'Asset notes column in model detail; asset transfer between models; inventory/audit scan system' },
  { version:'1.3.2', date:'2026-03-23', notes:'Project notes section; dashboard overdue alert; equipment overview replaced with items-out panel' },
  { version:'1.3.1', date:'2026-03-23', notes:'Manual line items on projects with quantity; included in receipt print' },
  { version:'1.3.0', date:'2026-03-23', notes:'Activity log with full user attribution, per-user stats, filterable scan history' },
  { version:'1.2.4', date:'2026-03-23', notes:'Import feedback with skip reasons, warnings, and collapsible result sections' },
  { version:'1.2.3', date:'2026-03-23', notes:'Sortable table headers on Equipment and Projects; status filter pills on Projects' },
  { version:'1.2.2', date:'2026-03-23', notes:'Light/dark theme toggle, persisted in browser' },
  { version:'1.2.1', date:'2026-03-23', notes:'Contact checkout report (HTML + CSV); label logo in left column' },
  { version:'1.2.0', date:'2026-03-23', notes:'Edit/delete categories, manufacturers, locations; label logo checkbox; company logo on receipts and labels' },
  { version:'1.1.3', date:'2026-03-23', notes:'Scan hang fix (stale closure); API non-JSON error surfacing; build reliability improvements' },
  { version:'1.1.2', date:'2026-03-23', notes:'FOREIGN KEY constraint fix for project creation; auto-migration on startup' },
  { version:'1.1.1', date:'2026-03-23', notes:'Create Project button fix; loading state and error feedback on forms' },
  { version:'1.1.0', date:'2026-03-23', notes:'Transfer by re-scan; global check-in page; maintenance module; CSV import/export; label printing; print receipt token fix' },
  { version:'1.0.0', date:'2026-03-16', notes:'Initial release — projects, equipment catalog, barcode scan check-out/in, receipts, multi-user support' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings]       = useState({ company_name: '', eula_default: '' });
  const [users, setUsers]             = useState([]);
  const [saved, setSaved]             = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser]       = useState(null);
  const [userForm, setUserForm]       = useState({ username: '', full_name: '', password: '', role: 'operator' });
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);
  const logoRef = useRef(null);

  useEffect(() => {
    api.get('/settings').then(s => {
      setSettings(s);
      if (s.logo_path) setLogoPreview(s.logo_path);
    });
    api.get('/auth/users').then(setUsers);
    // Fetch live version from the server — always reflects what's actually deployed
    api.get('/settings/version').then(setVersionInfo).catch(() => {});
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    await api.put('/settings', { company_name: settings.company_name, eula_default: settings.eula_default });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoUploading(true);
    const fd = new FormData();
    fd.append('logo', file);
    const res = await api.postForm('/settings/logo', fd);
    if (res.logo_path) setLogoPreview(res.logo_path + '?t=' + Date.now());
    setLogoUploading(false);
  };

  const handleRemoveLogo = async () => {
    await api.delete('/settings/logo');
    setLogoPreview(null);
    if (logoRef.current) logoRef.current.value = '';
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (editUser) await api.put(`/auth/users/${editUser.id}`, userForm);
    else await api.post('/auth/users', userForm);
    setShowUserModal(false);
    api.get('/auth/users').then(setUsers);
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    await api.delete(`/auth/users/${id}`);
    api.get('/auth/users').then(setUsers);
  };

  const openEditUser = (u) => {
    setEditUser(u);
    setUserForm({ username: u.username, full_name: u.full_name || '', password: '', role: u.role });
    setShowUserModal(true);
  };
  const openNewUser = () => {
    setEditUser(null);
    setUserForm({ username: '', full_name: '', password: '', role: 'operator' });
    setShowUserModal(true);
  };

  // Find the matching release note entry for the live version
  const currentVersion = versionInfo?.version || '…';
  const currentRelease = RELEASE_NOTES.find(r => r.version === currentVersion);

  return (
    <div className="page" style={{ maxWidth: 800 }}>
      <div className="page-header">
        <div><div className="page-title">Settings</div></div>
      </div>

      {/* Company settings */}
      <form onSubmit={handleSaveSettings}>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Company Settings</div>

          {/* Logo */}
          <div className="form-group">
            <label className="form-label">Company Logo</label>
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:8 }}>
              {logoPreview ? (
                <div style={{ position:'relative' }}>
                  <img src={logoPreview} alt="Company logo" style={{ height:64, maxWidth:200, objectFit:'contain', background:'white', border:'1px solid var(--border)', borderRadius:8, padding:6 }} />
                  <button type="button" onClick={handleRemoveLogo} style={{ position:'absolute', top:-8, right:-8, background:'var(--red)', color:'white', border:'none', borderRadius:'50%', width:22, height:22, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }} title="Remove logo">✕</button>
                </div>
              ) : (
                <div style={{ height:64, width:140, border:'2px dashed var(--border)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text2)', fontSize:12 }}>No logo set</div>
              )}
              <div>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoChange} style={{ display:'none' }} id="logo-input" />
                <label htmlFor="logo-input" className="btn btn-ghost" style={{ cursor:'pointer' }}>{logoUploading ? 'Uploading...' : '📷 Upload Logo'}</label>
                <p style={{ fontSize:11, color:'var(--text2)', marginTop:6 }}>PNG, JPG, SVG — used on receipts and labels</p>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Company Name</label>
            <input className="form-input" value={settings.company_name || ''} onChange={e => setSettings({ ...settings, company_name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Default EULA / Agreement Text</label>
            <textarea className="form-textarea" style={{ minHeight:140 }} value={settings.eula_default || ''} onChange={e => setSettings({ ...settings, eula_default: e.target.value })} />
            <p style={{ fontSize:12, color:'var(--text2)', marginTop:6 }}>Used by default on all new projects. Can be overridden per-project.</p>
          </div>
          <button type="submit" className="btn btn-primary">{saved ? '✓ Saved!' : 'Save Settings'}</button>
        </div>
      </form>

      {/* Users */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="card-title" style={{ marginBottom:0 }}>Users</div>
          {user?.role === 'admin' && <button className="btn btn-primary btn-sm" onClick={openNewUser}>+ Add User</button>}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><div className="table-name">{u.full_name || '—'}</div></td>
                  <td><span className="mono">{u.username}</span></td>
                  <td><span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>{u.role}</span></td>
                  <td>
                    {user?.role === 'admin' && (
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditUser(u)}>Edit</button>
                        {u.id !== user?.id && <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id)}>Delete</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* About / Version — version number fetched live from server */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="card-title" style={{ marginBottom:0 }}>About RentalFlow</div>
          <span style={{
            background:'var(--accent-dim)', color:'var(--accent)',
            border:'1px solid rgba(108,99,255,.3)',
            borderRadius:8, padding:'4px 12px', fontSize:13, fontWeight:700,
          }}>
            {versionInfo ? `v${versionInfo.version}` : 'Loading…'}
          </span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:20 }}>
          {[
            { label:'Version',  value: versionInfo ? `v${versionInfo.version}` : '…' },
            { label:'Released', value: currentRelease?.date || versionInfo?.built_at || '…' },
            { label:'Stack',    value: 'Node.js + SQLite + React' },
          ].map(item => (
            <div key={item.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'12px 14px' }}>
              <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>{item.label}</div>
              <div style={{ fontWeight:600, fontSize:13 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {currentRelease && (
          <div style={{ background:'var(--accent-dim)', border:'1px solid rgba(108,99,255,.25)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>
            <span style={{ fontWeight:700, color:'var(--accent)' }}>v{currentRelease.version} — </span>
            <span style={{ color:'var(--text)' }}>{currentRelease.notes}</span>
          </div>
        )}

        <div style={{ fontSize:13, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>
          Release History
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:0, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
          {RELEASE_NOTES.map((r, i) => {
            const isCurrent = r.version === currentVersion;
            return (
              <div key={r.version} style={{
                display:'flex', alignItems:'baseline', gap:14, padding:'10px 14px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                background: isCurrent ? 'var(--accent-dim)' : 'transparent',
              }}>
                <span style={{ fontWeight:700, fontSize:12, fontFamily:'monospace', color: isCurrent ? 'var(--accent)' : 'var(--text2)', minWidth:36 }}>
                  v{r.version}
                </span>
                <span style={{ fontSize:11, color:'var(--text2)', minWidth:80, flexShrink:0 }}>{r.date}</span>
                <span style={{ fontSize:13, color: isCurrent ? 'var(--text)' : 'var(--text2)', flex:1 }}>{r.notes}</span>
                {isCurrent && (
                  <span style={{ fontSize:10, background:'var(--accent)', color:'white', borderRadius:4, padding:'2px 6px', fontWeight:700, flexShrink:0 }}>
                    CURRENT
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* User modal */}
      {showUserModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUserModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editUser ? 'Edit User' : 'Add User'}</div>
              <button className="modal-close" onClick={() => setShowUserModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveUser}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={userForm.full_name} onChange={e => setUserForm({ ...userForm, full_name: e.target.value })} autoFocus />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Username {!editUser && '*'}</label>
                  <input className="form-input mono" value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} required={!editUser} disabled={!!editUser} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password {!editUser && '*'}</label>
                  <input className="form-input" type="password" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} required={!editUser} placeholder={editUser ? 'Leave blank to keep' : ''} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowUserModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editUser ? 'Save' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
