import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import SortableHeader, { useSortedData } from '../components/SortableHeader';

const ALL_STATUSES = ['draft', 'active', 'completed', 'cancelled'];
const STATUS_CLASS = { draft:'badge-gray', active:'badge-green', completed:'badge-blue', cancelled:'badge-red' };
const STATUS_LABEL = { draft:'Draft', active:'Active', completed:'Completed', cancelled:'Cancelled' };
const STATUS_COLORS = { draft:'var(--text2)', active:'var(--green)', completed:'var(--blue)', cancelled:'var(--red)' };

// Quick status filter pill button
function StatusPill({ status, active, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', border: '1px solid',
        background: active ? STATUS_COLORS[status] : 'transparent',
        color: active ? 'white' : STATUS_COLORS[status],
        borderColor: active ? STATUS_COLORS[status] : STATUS_COLORS[status],
        opacity: active ? 1 : 0.65,
        transition: 'all 0.15s',
        fontFamily: 'inherit',
      }}
    >
      {STATUS_LABEL[status]}
      <span style={{
        background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
        borderRadius: 10, padding: '1px 6px', fontSize: 11,
      }}>{count}</span>
    </button>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects]     = useState([]);
  const [contacts, setContacts]     = useState([]);
  const [showModal, setShowModal]   = useState(false);
  const [search, setSearch]         = useState('');
  const [hiddenStatuses, setHiddenStatuses] = useState(() => {
    // Persist filter preference in localStorage
    try { return JSON.parse(localStorage.getItem('projectHiddenStatuses') || '[]'); }
    catch { return []; }
  });
  const [form, setForm] = useState({ name:'', contact_id:'', start_date:'', end_date:'', venue:'', description:'', notes:'' });
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState('');
  const navigate = useNavigate();

  const load = () => api.get('/projects').then(setProjects);
  useEffect(() => { load(); api.get('/contacts').then(setContacts); }, []);

  // Persist filter
  useEffect(() => {
    localStorage.setItem('projectHiddenStatuses', JSON.stringify(hiddenStatuses));
  }, [hiddenStatuses]);

  const toggleStatus = (status) => {
    setHiddenStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  // Count per status (before search filter, for pill badges)
  const countByStatus = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = projects.filter(p => p.status === s).length;
    return acc;
  }, {});

  // Apply search + status filter
  const afterFilter = projects.filter(p => {
    if (hiddenStatuses.includes(p.status)) return false;
    const q = search.toLowerCase();
    return !q ||
      p.name.toLowerCase().includes(q) ||
      (p.contact_name || '').toLowerCase().includes(q) ||
      (p.venue || '').toLowerCase().includes(q);
  });

  // Apply sort
  const { sort, onSort, sorted: displayed } = useSortedData(afterFilter, { col: 'created_at', dir: 'desc' });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setCreateError('Project name is required'); return; }
    setCreating(true); setCreateError('');
    try {
      const res = await api.post('/projects', form);
      if (res.id) {
        setShowModal(false);
        setForm({ name:'', contact_id:'', start_date:'', end_date:'', venue:'', description:'', notes:'' });
        navigate(`/projects/${res.id}`);
      } else {
        setCreateError(res.error || 'Failed to create project');
      }
    } catch { setCreateError('Network error — please try again'); }
    finally  { setCreating(false); }
  };

  const visibleCount = displayed.length;
  const hiddenCount  = projects.length - afterFilter.length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-subtitle">
            {visibleCount} of {projects.length} projects
            {hiddenCount > 0 && <span style={{ color:'var(--text2)' }}> · {hiddenCount} hidden by filter</span>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowModal(true); setCreateError(''); }}>
          + New Project
        </button>
      </div>

      <div className="card">
        {/* Search + status filter row */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <div className="search-bar" style={{ flex:1 }}>
              <span className="search-icon">🔍</span>
              <input
                className="form-input"
                placeholder="Search by name, contact, or venue..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {hiddenStatuses.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setHiddenStatuses([])}
                title="Show all statuses"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Status filter pills */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:11, color:'var(--text2)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginRight:2 }}>
              Show:
            </span>
            {ALL_STATUSES.map(s => (
              <StatusPill
                key={s}
                status={s}
                active={!hiddenStatuses.includes(s)}
                count={countByStatus[s]}
                onClick={() => toggleStatus(s)}
              />
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortableHeader col="name"          label="Project"  sort={sort} onSort={onSort} />
                <SortableHeader col="contact_name"  label="Contact"  sort={sort} onSort={onSort} />
                <SortableHeader col="start_date"    label="Start"    sort={sort} onSort={onSort} />
                <SortableHeader col="end_date"      label="End"      sort={sort} onSort={onSort} />
                <SortableHeader col="status"        label="Status"   sort={sort} onSort={onSort} />
                <SortableHeader col="total_items"   label="Items"    sort={sort} onSort={onSort} style={{ textAlign:'right' }} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign:'center', padding:'40px', color:'var(--text2)' }}>
                    {projects.length === 0 ? 'No projects yet' : 'No projects match the current filters'}
                  </td>
                </tr>
              ) : displayed.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="table-name">{p.name}</div>
                    {p.venue && <div className="table-sub">📍 {p.venue}</div>}
                  </td>
                  <td>
                    {p.contact_name
                      ? <><div style={{ fontWeight:500 }}>{p.contact_name}</div><div className="table-sub">{p.contact_company}</div></>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td style={{ fontSize:13 }}>{p.start_date || <span className="text-muted">—</span>}</td>
                  <td style={{ fontSize:13 }}>{p.end_date   || <span className="text-muted">—</span>}</td>
                  <td><span className={`badge ${STATUS_CLASS[p.status] || 'badge-gray'}`}>{p.status}</span></td>
                  <td style={{ textAlign:'right' }}>
                    <span style={{ fontWeight:600 }}>{p.total_items || 0}</span>
                    {p.checked_out_count > 0 &&
                      <span style={{ color:'var(--amber)', fontSize:12, marginLeft:6 }}>({p.checked_out_count} out)</span>}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm">View</Link>
                      <Link to={`/scan/${p.id}`} className="btn btn-primary btn-sm">📷 Scan</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Project Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">New Project</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Project Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Contact</label>
                <select className="form-select" value={form.contact_id} onChange={e => setForm({...form, contact_id:e.target.value})}>
                  <option value="">No contact</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>)}
                </select>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input className="form-input" type="date" value={form.start_date} onChange={e => setForm({...form, start_date:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date</label>
                  <input className="form-input" type="date" value={form.end_date} onChange={e => setForm({...form, end_date:e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Venue / Location</label>
                <input className="form-input" value={form.venue} onChange={e => setForm({...form, venue:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm({...form, description:e.target.value})} />
              </div>
              {createError && (
                <div style={{ color:'var(--red)', fontSize:13, padding:'8px 12px', background:'var(--red-dim)', borderRadius:6, marginBottom:4 }}>
                  {createError}
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); setCreateError(''); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
