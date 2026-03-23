import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';

const ACTION_LABELS = {
  checkout:      { label: 'Check Out',        color: 'var(--green)',  bg: 'var(--green-dim)',  icon: '📤' },
  checkin:       { label: 'Check In',         color: 'var(--accent)', bg: 'var(--accent-dim)', icon: '📥' },
  global_checkin:{ label: 'Global Check-In',  color: 'var(--blue)',   bg: 'rgba(59,130,246,.15)', icon: '📥' },
};

const RESULT_LABELS = {
  success:   { label: 'Success',   color: 'var(--green)',  icon: '✅' },
  not_found: { label: 'Not Found', color: 'var(--red)',    icon: '❌' },
  duplicate: { label: 'Duplicate', color: 'var(--amber)',  icon: '⚠️' },
  error:     { label: 'Error',     color: 'var(--red)',    icon: '❌' },
};

function StatCard({ value, label, color }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={{ color }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ActionBadge({ action }) {
  const meta = ACTION_LABELS[action] || { label: action, color: 'var(--text2)', bg: 'var(--surface2)', icon: '•' };
  return (
    <span style={{
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.color}40`,
      borderRadius: 6, padding: '2px 8px',
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {meta.icon} {meta.label}
    </span>
  );
}

function ResultBadge({ result }) {
  const meta = RESULT_LABELS[result] || { label: result, color: 'var(--text2)', icon: '•' };
  return (
    <span style={{ color: meta.color, fontSize: 12, fontWeight: 600 }}>
      {meta.icon} {meta.label}
    </span>
  );
}

export default function ActivityPage() {
  const [logs, setLogs]       = useState([]);
  const [stats, setStats]     = useState(null);
  const [users, setUsers]     = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterUser,    setFilterUser]    = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterAction,  setFilterAction]  = useState('');
  const [filterResult,  setFilterResult]  = useState('success');
  const [filterFrom,    setFilterFrom]    = useState('');
  const [filterTo,      setFilterTo]      = useState('');
  const [activeTab,     setActiveTab]     = useState('log'); // 'log' | 'stats'

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterUser)    params.set('user_id',    filterUser);
    if (filterProject) params.set('project_id', filterProject);
    if (filterAction)  params.set('action',     filterAction);
    if (filterResult)  params.set('result',     filterResult);
    if (filterFrom)    params.set('from',       filterFrom);
    if (filterTo)      params.set('to',         filterTo);
    params.set('limit', '500');
    const data = await api.get(`/scan/log?${params}`);
    setLogs(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterUser, filterProject, filterAction, filterResult, filterFrom, filterTo]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    api.get('/scan/log/stats').then(setStats);
    api.get('/auth/users').then(setUsers);
    api.get('/projects').then(setProjects);
  }, []);

  const clearFilters = () => {
    setFilterUser(''); setFilterProject(''); setFilterAction('');
    setFilterResult('success'); setFilterFrom(''); setFilterTo('');
  };

  const totalCheckouts = stats?.by_action?.find(r => r.action === 'checkout' && r.result === 'success')?.count || 0;
  const totalCheckins  = (stats?.by_action?.find(r => r.action === 'checkin'        && r.result === 'success')?.count || 0)
                       + (stats?.by_action?.find(r => r.action === 'global_checkin' && r.result === 'success')?.count || 0);
  const totalFailed    = stats?.by_action?.filter(r => r.result !== 'success').reduce((s, r) => s + r.count, 0) || 0;

  const exportCSV = () => {
    const headers = ['Date/Time','User','Action','Result','Barcode','Model','Project','Message'];
    const rows = logs.map(l => [
      new Date(l.created_at).toLocaleString(),
      l.user_name || l.username || '—',
      l.action,
      l.result,
      l.barcode || '—',
      l.model_name || '—',
      l.project_name || '—',
      (l.message || '').replace(/,/g, ';'),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Activity Log</div>
          <div className="page-subtitle">Full history of every check-out and check-in</div>
        </div>
        <button className="btn btn-ghost" onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      {/* Summary stats */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <StatCard value={totalCheckouts} label="Total Check-Outs"  color="var(--green)"  />
        <StatCard value={totalCheckins}  label="Total Check-Ins"   color="var(--accent)" />
        <StatCard value={totalFailed}    label="Failed Scans"      color="var(--amber)"  />
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:20 }}>
        {[['log','📋 Scan Log'],['stats','📊 By User']].map(([t,l]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            background:'none', border:'none', padding:'10px 18px', cursor:'pointer',
            fontSize:14, fontWeight: activeTab===t ? 700 : 500,
            color: activeTab===t ? 'var(--accent)' : 'var(--text2)',
            borderBottom: activeTab===t ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom:-1, fontFamily:'inherit',
          }}>{l}</button>
        ))}
      </div>

      {/* ── BY USER STATS ── */}
      {activeTab === 'stats' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card">
            <div className="card-title">Activity by User</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th style={{textAlign:'right'}}>Check-Outs</th>
                    <th style={{textAlign:'right'}}>Check-Ins</th>
                    <th style={{textAlign:'right'}}>Total Scans</th>
                    <th>Filter</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.by_user || []).length === 0 ? (
                    <tr><td colSpan={5} style={{textAlign:'center',padding:'40px',color:'var(--text2)'}}>No activity yet</td></tr>
                  ) : (stats?.by_user || []).map(u => (
                    <tr key={u.user_id || u.username}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{
                            width:30, height:30, borderRadius:'50%', background:'var(--accent)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'white', fontWeight:700, fontSize:12, flexShrink:0,
                          }}>
                            {(u.full_name || u.username || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight:600 }}>{u.full_name || u.username}</div>
                            {u.full_name && <div style={{ fontSize:11, color:'var(--text2)' }}>@{u.username}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{textAlign:'right'}}>
                        <span style={{color:'var(--green)', fontWeight:700}}>{u.checkouts}</span>
                      </td>
                      <td style={{textAlign:'right'}}>
                        <span style={{color:'var(--accent)', fontWeight:700}}>{u.checkins}</span>
                      </td>
                      <td style={{textAlign:'right', fontWeight:600}}>{u.total}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setFilterUser(u.user_id); setActiveTab('log'); setFilterResult(''); }}
                        >
                          View Log →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity by day */}
          {stats?.recent_days?.length > 0 && (
            <div className="card">
              <div className="card-title">Last 14 Days</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th style={{textAlign:'right'}}>Successful Scans</th><th style={{textAlign:'right'}}>Total Scans</th></tr></thead>
                  <tbody>
                    {stats.recent_days.map(d => (
                      <tr key={d.day}>
                        <td style={{fontWeight:500}}>{new Date(d.day + 'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</td>
                        <td style={{textAlign:'right',color:'var(--green)',fontWeight:600}}>{d.successes}</td>
                        <td style={{textAlign:'right',color:'var(--text2)'}}>{d.scans}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SCAN LOG ── */}
      {activeTab === 'log' && (
        <div className="card">
          {/* Filters */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16, alignItems:'flex-end' }}>
            <div style={{ flex:'1 1 160px' }}>
              <div className="form-label">User</div>
              <select className="form-select" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="">All Users</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </select>
            </div>
            <div style={{ flex:'1 1 180px' }}>
              <div className="form-label">Project</div>
              <select className="form-select" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ flex:'1 1 140px' }}>
              <div className="form-label">Action</div>
              <select className="form-select" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                <option value="">All Actions</option>
                <option value="checkout">Check Out</option>
                <option value="checkin">Check In</option>
                <option value="global_checkin">Global Check-In</option>
              </select>
            </div>
            <div style={{ flex:'1 1 130px' }}>
              <div className="form-label">Result</div>
              <select className="form-select" value={filterResult} onChange={e => setFilterResult(e.target.value)}>
                <option value="">All Results</option>
                <option value="success">Success</option>
                <option value="not_found">Not Found</option>
                <option value="duplicate">Duplicate</option>
              </select>
            </div>
            <div style={{ flex:'1 1 130px' }}>
              <div className="form-label">From Date</div>
              <input className="form-input" type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div style={{ flex:'1 1 130px' }}>
              <div className="form-label">To Date</div>
              <input className="form-input" type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            </div>
            <button className="btn btn-ghost" onClick={clearFilters} style={{ flexShrink:0 }}>Clear</button>
          </div>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:13, color:'var(--text2)' }}>
              {loading ? 'Loading...' : `${logs.length} entries`}
            </span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Result</th>
                  <th>Equipment</th>
                  <th>Barcode</th>
                  <th>Project</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{textAlign:'center',padding:'40px',color:'var(--text2)'}}>Loading...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={7} style={{textAlign:'center',padding:'40px',color:'var(--text2)'}}>No activity matches the current filters</td></tr>
                ) : logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize:12, whiteSpace:'nowrap', color:'var(--text2)' }}>
                      {new Date(log.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                      <br/>
                      <span style={{ fontWeight:600, color:'var(--text)' }}>
                        {new Date(log.created_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })}
                      </span>
                    </td>
                    <td>
                      {log.user_name || log.username ? (
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{
                            width:26, height:26, borderRadius:'50%', background:'var(--accent)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color:'white', fontWeight:700, fontSize:11, flexShrink:0,
                          }}>
                            {(log.user_name || log.username || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>{log.user_name || log.username}</div>
                          </div>
                        </div>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td><ActionBadge action={log.action} /></td>
                    <td><ResultBadge result={log.result} /></td>
                    <td>
                      <div style={{ fontWeight:500, fontSize:13 }}>{log.model_name || '—'}</div>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize:12 }}>{log.barcode || '—'}</span>
                    </td>
                    <td style={{ fontSize:13 }}>
                      {log.project_name
                        ? <Link to={`/projects/${log.project_id}`} style={{ color:'var(--accent)', textDecoration:'none', fontWeight:500 }}>{log.project_name}</Link>
                        : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
