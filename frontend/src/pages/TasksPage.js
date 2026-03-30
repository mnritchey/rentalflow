import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useRole } from '../hooks/useRole';
import { useAuth } from '../context/AuthContext';

const PRIORITY_META = {
  urgent: { label:'Urgent', color:'var(--red)',    bg:'var(--red-dim)',    icon:'🔴' },
  high:   { label:'High',   color:'var(--amber)',  bg:'var(--amber-dim)', icon:'🟠' },
  normal: { label:'Normal', color:'var(--accent)', bg:'var(--accent-dim)',icon:'🔵' },
  low:    { label:'Low',    color:'var(--text2)',  bg:'rgba(139,144,180,.12)', icon:'⚪' },
};

const STATUS_META = {
  open:        { label:'Open',        color:'var(--green)',  badge:'badge-green' },
  in_progress: { label:'In Progress', color:'var(--amber)',  badge:'badge-amber' },
  completed:   { label:'Completed',   color:'var(--text2)',  badge:'badge-gray'  },
  cancelled:   { label:'Cancelled',   color:'var(--red)',    badge:'badge-red'   },
};

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.normal;
  return (
    <span style={{ background:m.bg, color:m.color, border:`1px solid ${m.color}40`,
      borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700,
      display:'inline-flex', alignItems:'center', gap:4 }}>
      {m.icon} {m.label}
    </span>
  );
}

function isOverdue(task) {
  return task.status !== 'completed' && task.status !== 'cancelled'
    && task.due_date && task.due_date < new Date().toISOString().slice(0,10);
}

export default function TasksPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, can } = useRole();

  const [tasks, setTasks]             = useState([]);
  const [users, setUsers]             = useState([]);
  const [projects, setProjects]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filterStatus, setFilterStatus] = useState('open');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showNew, setShowNew]         = useState(false);
  const [noteText, setNoteText]       = useState('');
  const [submitting, setSubmitting]   = useState(false);

  const emptyForm = { title:'', description:'', priority:'normal', due_date:'', assigned_to:'', project_id:'' };
  const [form, setForm] = useState(emptyForm);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const params = filterStatus ? `?status=${filterStatus}` : '';
    const data = await api.get(`/tasks${params}`);
    setTasks(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (isAdmin) {
      api.get('/auth/users').then(setUsers);
      api.get('/projects').then(setProjects);
    } else {
      api.get('/projects').then(setProjects);
    }
  }, [isAdmin]);

  // If a task ID is in the URL, open it
  useEffect(() => {
    if (routeId) {
      api.get(`/tasks/${routeId}`).then(t => setSelectedTask(t));
    }
  }, [routeId]);

  const openTask = async (task) => {
    const full = await api.get(`/tasks/${task.id}`);
    setSelectedTask(full);
    navigate(`/tasks/${task.id}`, { replace: true });
  };

  const closeTask = () => {
    setSelectedTask(null);
    navigate('/tasks', { replace: true });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await api.post('/tasks', form);
    if (res.id) {
      setShowNew(false);
      setForm(emptyForm);
      loadTasks();
    }
    setSubmitting(false);
  };

  const handleStatusChange = async (taskId, status) => {
    await api.put(`/tasks/${taskId}`, { status });
    loadTasks();
    if (selectedTask?.id === taskId) {
      const updated = await api.get(`/tasks/${taskId}`);
      setSelectedTask(updated);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim() || !selectedTask) return;
    setSubmitting(true);
    await api.post(`/tasks/${selectedTask.id}/notes`, { content: noteText });
    setNoteText('');
    const updated = await api.get(`/tasks/${selectedTask.id}`);
    setSelectedTask(updated);
    setSubmitting(false);
  };

  const handleDeleteNote = async (noteId) => {
    await api.delete(`/tasks/${selectedTask.id}/notes/${noteId}`);
    const updated = await api.get(`/tasks/${selectedTask.id}`);
    setSelectedTask(updated);
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Delete this task?')) return;
    await api.delete(`/tasks/${taskId}`);
    closeTask();
    loadTasks();
  };

  const handleReassign = async (taskId, userId) => {
    await api.put(`/tasks/${taskId}`, { assigned_to: userId || null });
    const updated = await api.get(`/tasks/${taskId}`);
    setSelectedTask(updated);
    loadTasks();
  };

  const openCount     = tasks.filter(t => t.status === 'open').length;
  const progressCount = tasks.filter(t => t.status === 'in_progress').length;
  const overdueCount  = tasks.filter(t => isOverdue(t)).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Tasks</div>
          <div className="page-subtitle">
            {openCount} open · {progressCount} in progress
            {overdueCount > 0 && <span style={{color:'var(--red)',marginLeft:8}}>· {overdueCount} overdue</span>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Task</button>
      </div>

      {/* Status filter tabs */}
      <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:20 }}>
        {[['open','Open'],['in_progress','In Progress'],['completed','Completed'],['','All']].map(([s,l]) => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{
            background:'none', border:'none', padding:'10px 18px', cursor:'pointer',
            fontSize:14, fontWeight: filterStatus===s ? 700 : 500,
            color: filterStatus===s ? 'var(--accent)' : 'var(--text2)',
            borderBottom: filterStatus===s ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom:-1, fontFamily:'inherit',
          }}>{l}</button>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selectedTask ? '1fr 400px' : '1fr', gap:20, alignItems:'start' }}>
        {/* Task list */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {loading ? (
            <div style={{textAlign:'center',padding:40,color:'var(--text2)'}}>Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="empty-state" style={{padding:40}}>
              <div className="icon">✅</div>
              <p>{filterStatus === 'open' ? 'No open tasks — you\'re all caught up!' : 'No tasks found.'}</p>
              <button className="btn btn-ghost" style={{marginTop:12}} onClick={() => setShowNew(true)}>+ Create one</button>
            </div>
          ) : (
            <div>
              {tasks.map((task, i) => {
                const over = isOverdue(task);
                const isSelected = selectedTask?.id === task.id;
                return (
                  <div key={task.id} onClick={() => openTask(task)} style={{
                    padding:'14px 20px', cursor:'pointer',
                    borderBottom: i < tasks.length-1 ? '1px solid var(--border)' : 'none',
                    background: isSelected ? 'var(--accent-dim)' : over ? 'rgba(239,68,68,.04)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent)' : over ? '3px solid var(--red)' : '3px solid transparent',
                    transition:'background .15s',
                  }}
                    onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background = 'var(--surface2)'; }}
                    onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background = over ? 'rgba(239,68,68,.04)' : 'transparent'; }}
                  >
                    <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12}}>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
                          <span style={{fontWeight:700, fontSize:14, color: task.status==='completed' ? 'var(--text2)' : 'var(--text)',
                            textDecoration: task.status==='completed' ? 'line-through' : 'none'}}>
                            {task.title}
                          </span>
                          <PriorityBadge priority={task.priority} />
                          {over && <span style={{fontSize:11,color:'var(--red)',fontWeight:700}}>OVERDUE</span>}
                        </div>
                        <div style={{fontSize:12, color:'var(--text2)', display:'flex', gap:12, flexWrap:'wrap'}}>
                          {task.assigned_to_name
                            ? <span>👤 {task.assigned_to_name}</span>
                            : <span style={{fontStyle:'italic'}}>🌐 Global</span>}
                          {task.project_name && <span>📋 {task.project_name}</span>}
                          {task.due_date && <span style={{color: over ? 'var(--red)' : undefined}}>
                            📅 {task.due_date}
                          </span>}
                          {task.note_count > 0 && <span>💬 {task.note_count}</span>}
                        </div>
                      </div>
                      <div style={{display:'flex', gap:6, flexShrink:0}}>
                        <span className={`badge ${STATUS_META[task.status]?.badge||'badge-gray'}`}>
                          {STATUS_META[task.status]?.label || task.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Task detail panel */}
        {selectedTask && (
          <div className="card" style={{position:'sticky', top:20}}>
            <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700, fontSize:16, marginBottom:6}}>{selectedTask.title}</div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  <PriorityBadge priority={selectedTask.priority} />
                  <span className={`badge ${STATUS_META[selectedTask.status]?.badge||'badge-gray'}`}>
                    {STATUS_META[selectedTask.status]?.label}
                  </span>
                </div>
              </div>
              <button onClick={closeTask} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)',padding:4}}>✕</button>
            </div>

            {/* Details */}
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16,fontSize:13}}>
              {selectedTask.description && (
                <div style={{background:'var(--surface2)',borderRadius:8,padding:'10px 12px',color:'var(--text)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>
                  {selectedTask.description}
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {[
                  {label:'Assigned To', value: selectedTask.assigned_to_name || 'Global (everyone)'},
                  {label:'Created By', value: selectedTask.created_by_name || '—'},
                  {label:'Due Date', value: selectedTask.due_date || 'No due date', color: isOverdue(selectedTask) ? 'var(--red)' : undefined},
                  {label:'Project', value: selectedTask.project_name || '—'},
                ].map(({label,value,color}) => (
                  <div key={label} style={{background:'var(--surface2)',borderRadius:6,padding:'8px 10px'}}>
                    <div style={{fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:2}}>{label}</div>
                    <div style={{fontWeight:600,fontSize:12,color:color||'var(--text)'}}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin: reassign */}
            {isAdmin && (
              <div style={{marginBottom:16}}>
                <div className="form-label">Assign To</div>
                <select className="form-select" value={selectedTask.assigned_to||''} onChange={e=>handleReassign(selectedTask.id,e.target.value)}>
                  <option value="">🌐 Global (everyone)</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.full_name||u.username}</option>)}
                </select>
              </div>
            )}

            {/* Status actions */}
            <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
              {selectedTask.status !== 'open' && (
                <button className="btn btn-ghost btn-sm" onClick={()=>handleStatusChange(selectedTask.id,'open')}>↩ Reopen</button>
              )}
              {selectedTask.status === 'open' && (
                <button className="btn btn-ghost btn-sm" onClick={()=>handleStatusChange(selectedTask.id,'in_progress')}>▶ Start</button>
              )}
              {selectedTask.status !== 'completed' && selectedTask.status !== 'cancelled' && (
                <button className="btn btn-success btn-sm" onClick={()=>handleStatusChange(selectedTask.id,'completed')}>✓ Complete</button>
              )}
              {selectedTask.status !== 'cancelled' && selectedTask.status !== 'completed' && (
                <button className="btn btn-ghost btn-sm" onClick={()=>handleStatusChange(selectedTask.id,'cancelled')}>✕ Cancel</button>
              )}
              {can.deleteTask && (
                <button className="btn btn-danger btn-sm" onClick={()=>handleDeleteTask(selectedTask.id)}>Delete</button>
              )}
            </div>

            <hr className="divider" />

            {/* Notes */}
            <div style={{marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>
                Notes {selectedTask.notes?.length > 0 && `(${selectedTask.notes.length})`}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:280,overflowY:'auto',marginBottom:10}}>
                {(!selectedTask.notes || selectedTask.notes.length === 0) && (
                  <div style={{fontSize:12,color:'var(--text2)',fontStyle:'italic'}}>No notes yet.</div>
                )}
                {(selectedTask.notes||[]).map(note => (
                  <div key={note.id} style={{
                    background:'var(--surface2)',borderRadius:8,padding:'10px 12px',
                    borderLeft:'3px solid var(--border)',
                  }}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:700}}>
                        {note.author_name||note.author_username||'Unknown'}
                      </span>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:11,color:'var(--text2)'}}>
                          {new Date(note.created_at).toLocaleString()}
                        </span>
                        {(can.deleteTask || note.user_id === user?.id) && (
                          <button onClick={()=>handleDeleteNote(note.id)}
                            style={{background:'none',border:'none',color:'var(--text2)',cursor:'pointer',fontSize:13,padding:0}}>✕</button>
                        )}
                      </div>
                    </div>
                    <div style={{fontSize:13,color:'var(--text)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{note.content}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddNote}>
                <textarea
                  className="form-textarea"
                  style={{minHeight:64,fontSize:13,marginBottom:6}}
                  placeholder="Add a note..."
                  value={noteText}
                  onChange={e=>setNoteText(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'&&e.metaKey) handleAddNote(e); }}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!noteText.trim()||submitting}>
                  {submitting ? '...' : 'Add Note'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* New Task Modal */}
      {showNew && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowNew(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">New Task</div>
              <button className="modal-close" onClick={()=>setShowNew(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="form-input" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required autoFocus placeholder="What needs to be done?" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Optional details..." style={{minHeight:80}} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-select" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>
                    {Object.entries(PRIORITY_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input className="form-input" type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} />
                </div>
              </div>
              {isAdmin && (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Assign To</label>
                    <select className="form-select" value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})}>
                      <option value="">🌐 Global (everyone)</option>
                      {users.map(u=><option key={u.id} value={u.id}>{u.full_name||u.username}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Link to Project</label>
                    <select className="form-select" value={form.project_id} onChange={e=>setForm({...form,project_id:e.target.value})}>
                      <option value="">No project</option>
                      {projects.filter(p=>p.status!=='completed'&&p.status!=='cancelled').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={()=>setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting?'Creating...':'Create Task'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
