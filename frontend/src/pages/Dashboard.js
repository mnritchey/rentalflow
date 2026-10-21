import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';

const STATUS_CLASS = { draft:'badge-gray', active:'badge-green', completed:'badge-blue', cancelled:'badge-red' };

export default function Dashboard() {
  const [projects, setProjects]   = useState([]);
  const [assets, setAssets]       = useState({ total: 0, available: 0 });
  const [loading, setLoading]     = useState(true);
  const [taskSummary, setTaskSummary] = useState({ open:0, urgent:0, overdue:0 });

  useEffect(() => {
    Promise.all([
      api.get('/projects'),
      api.get('/scan/log/stats'),
    ]).then(([p, stats]) => {
      setProjects(p);
      setLoading(false);
    });

    // Task summary
    api.get('/tasks/summary').then(setTaskSummary).catch(() => {});

    // Asset counts from equipment models
    api.get('/equipment/models').then(models => {
      setAssets({
        total:     models.reduce((s, m) => s + (m.total_assets     || 0), 0),
        available: models.reduce((s, m) => s + (m.available_assets || 0), 0),
      });
    });
  }, []);

  const activeProjects  = projects.filter(p => p.status === 'active');
  const checkedOut      = projects.reduce((s, p) => s + (p.checked_out_count || 0), 0);
  const draftProjects   = projects.filter(p => p.status === 'draft');

  // Recent = last 6 non-completed, non-cancelled
  const recentProjects = projects
    .filter(p => p.status !== 'completed' && p.status !== 'cancelled')
    .slice(0, 6);

  if (loading) return <div className="page"><p className="text-muted">Loading...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">
            {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
          </div>
        </div>
        <Link to="/projects" className="btn btn-primary">+ New Project</Link>
      </div>

      {/* ── Stats row ── */}
      <div className="grid-4" style={{ marginBottom: 28 }}>
        {[
          { label:'Active Projects', value: activeProjects.length, icon:'📋', color:'var(--accent)', to:'/projects' },
          { label:'Items Out',       value: checkedOut,            icon:'📦', color:'var(--amber)',  to:'/scan'     },
          { label:'Open Tasks',      value: taskSummary.open,      icon:'✅', color: taskSummary.urgent > 0 ? 'var(--amber)' : 'var(--green)', to:'/tasks' },
          { label:'Total Assets',    value: assets.total,          icon:'🗄️', color:'var(--text)',   to:'/equipment' },
        ].map(s => (
          <Link key={s.label} to={s.to} style={{ textDecoration:'none' }}>
            <div className="stat-card" style={{ cursor:'pointer', transition:'border-color .15s' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='var(--accent)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
              <div style={{ fontSize:22, marginBottom:8 }}>{s.icon}</div>
              <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="grid-2">
        {/* Recent projects */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div className="card-title" style={{ marginBottom:0 }}>Active &amp; Draft Projects</div>
            <Link to="/projects" style={{ fontSize:12, color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>
              View all →
            </Link>
          </div>
          {recentProjects.length === 0 ? (
            <div className="empty-state" style={{ padding:'20px' }}>
              <p>No active projects. <Link to="/projects" className="text-accent">Create one →</Link></p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {recentProjects.map(p => (
                <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration:'none' }}>
                  <div style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'10px 12px', background:'var(--surface2)', borderRadius:8, transition:'background .15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}
                  >
                    <div>
                      <div style={{ fontWeight:600, color:'var(--text)', fontSize:14 }}>{p.name}</div>
                      <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                        {p.contact_name || 'No contact'}
                        {p.end_date && <span> · Due {p.end_date}</span>}
                        {' '}· {p.total_items || 0} items
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0, marginLeft:12 }}>
                      <span className={`badge ${STATUS_CLASS[p.status]||'badge-gray'}`}>{p.status}</span>
                      {p.checked_out_count > 0 &&
                        <span style={{ fontSize:11, color:'var(--amber)' }}>{p.checked_out_count} out</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming / all items out */}
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div className="card-title" style={{ marginBottom:0 }}>Items Currently Out</div>
            <Link to="/scan" style={{ fontSize:12, color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>
              Global check-in →
            </Link>
          </div>
          {checkedOut === 0 ? (
            <div className="empty-state" style={{ padding:'20px' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              <p style={{ fontWeight:600 }}>All clear — nothing is checked out.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {projects
                .filter(p => p.checked_out_count > 0)
                .sort((a, b) => (a.end_date || '9999') > (b.end_date || '9999') ? 1 : -1)
                .map(p => {
                  const isOverdue = p.end_date && p.end_date < new Date().toISOString().slice(0,10);
                  const days = p.end_date ? Math.floor((new Date() - new Date(p.end_date + 'T00:00:00')) / 86400000) : null;
                  return (
                    <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration:'none' }}>
                      <div style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'10px 12px', borderRadius:8, transition:'background .15s',
                        background: isOverdue ? 'rgba(239,68,68,.07)' : 'var(--surface2)',
                        border: isOverdue ? '1px solid rgba(239,68,68,.2)' : '1px solid transparent',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = isOverdue ? 'rgba(239,68,68,.12)' : 'var(--border)'}
                        onMouseLeave={e => e.currentTarget.style.background = isOverdue ? 'rgba(239,68,68,.07)' : 'var(--surface2)'}
                      >
                        <div>
                          <div style={{ fontWeight:600, color:'var(--text)', fontSize:14 }}>{p.name}</div>
                          <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>
                            {p.contact_name || 'No contact'}
                          </div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
                          <div style={{ fontWeight:700, color: isOverdue ? 'var(--red)' : 'var(--amber)', fontSize:14 }}>
                            {p.checked_out_count} out
                          </div>
                          <div style={{ fontSize:11, color: isOverdue ? 'var(--red)' : 'var(--text2)', marginTop:2 }}>
                            {isOverdue
                              ? `${days}d overdue`
                              : p.end_date
                                ? `Due ${p.end_date}`
                                : 'No due date'}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Open tasks widget */}
      {taskSummary.open > 0 && (
        <div className="card" style={{ marginTop:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div className="card-title" style={{ marginBottom:0 }}>
              ✅ My Tasks
              {taskSummary.overdue > 0 && <span style={{ fontSize:12, color:'var(--red)', fontWeight:600, marginLeft:8 }}>{taskSummary.overdue} overdue</span>}
              {taskSummary.urgent > 0 && <span style={{ fontSize:12, color:'var(--amber)', fontWeight:600, marginLeft:8 }}>{taskSummary.urgent} urgent</span>}
            </div>
            <Link to="/tasks" style={{ fontSize:12, color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>View all →</Link>
          </div>
          <TaskWidget />
        </div>
      )}
    </div>
  );
}

function TaskWidget() {
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    api.get('/tasks?status=open').then(data => setTasks(Array.isArray(data) ? data.slice(0,5) : []));
  }, []);

  const isOverdue = (t) => t.due_date && t.due_date < new Date().toISOString().slice(0,10);
  const PICONS = { urgent:'🔴', high:'🟠', normal:'🔵', low:'⚪' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {tasks.map(t => (
        <Link key={t.id} to={`/tasks/${t.id}`} style={{ textDecoration:'none' }}>
          <div style={{
            display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
            background:'var(--surface2)', borderRadius:8, transition:'background .15s',
            borderLeft: isOverdue(t) ? '3px solid var(--red)' : '3px solid transparent',
          }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--border)'}
            onMouseLeave={e=>e.currentTarget.style.background='var(--surface2)'}
          >
            <span style={{ fontSize:14, flexShrink:0 }}>{PICONS[t.priority]||'🔵'}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:13, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
              <div style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>
                {t.assigned_to_name ? `👤 ${t.assigned_to_name}` : '🌐 Global'}
                {t.due_date && <span style={{ marginLeft:8, color: isOverdue(t)?'var(--red)':undefined }}>📅 {t.due_date}</span>}
              </div>
            </div>
            {isOverdue(t) && <span style={{ fontSize:10, color:'var(--red)', fontWeight:700, flexShrink:0 }}>OVERDUE</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
