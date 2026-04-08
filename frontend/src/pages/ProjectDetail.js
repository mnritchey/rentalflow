import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useRole } from '../hooks/useRole';

const STATUS_OPTS  = ['draft','active','completed','cancelled'];
const STATUS_CLASS = { draft:'badge-gray', active:'badge-green', completed:'badge-blue', cancelled:'badge-red' };
const ITEM_STATUS_CLASS = { booked:'badge-amber', checked_out:'badge-green', checked_in:'badge-gray' };

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject]   = useState(null);
  const [contacts, setContacts] = useState([]);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [showDelete, setShowDelete]   = useState(false);
  const { can } = useRole();

  // Inline notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft]     = useState('');
  const [notesSaving, setNotesSaving]   = useState(false);

  const openNotes = () => { setNotesDraft(project.notes || ''); setEditingNotes(true); };
  const saveNotes = async () => {
    setNotesSaving(true);
    await api.put(`/projects/${id}`, { ...project, notes: notesDraft });
    await load();
    setEditingNotes(false);
    setNotesSaving(false);
  };

  // Line items state
  const [showLineModal, setShowLineModal]   = useState(false);
  const [editLineItem, setEditLineItem]     = useState(null); // null = new
  const [lineForm, setLineForm]             = useState({ description:'', quantity:1, unit_price:'', notes:'' });
  const [lineSaving, setLineSaving]         = useState(false);

  const load = () => api.get(`/projects/${id}`).then(p => { setProject(p); setForm(p); });
  useEffect(() => { load(); api.get('/contacts').then(setContacts); }, [id]);

  const handleSave = async () => {
    await api.put(`/projects/${id}`, form);
    await load(); setEditing(false);
  };
  const handleDelete = async () => {
    await api.delete(`/projects/${id}`);
    navigate('/projects');
  };
  const handleRemoveItem = async (itemId) => {
    await api.delete(`/projects/${id}/items/${itemId}`);
    load();
  };

  // ── Line item handlers ────────────────────────────────────────────────────
  const openNewLine = () => {
    setEditLineItem(null);
    setLineForm({ description:'', quantity:1, unit_price:'', notes:'' });
    setShowLineModal(true);
  };
  const openEditLine = (li) => {
    setEditLineItem(li);
    setLineForm({ description:li.description, quantity:li.quantity, unit_price:li.unit_price||'', notes:li.notes||'' });
    setShowLineModal(true);
  };
  const handleSaveLine = async (e) => {
    e.preventDefault();
    setLineSaving(true);
    try {
      if (editLineItem) {
        await api.put(`/projects/${id}/line-items/${editLineItem.id}`, lineForm);
      } else {
        await api.post(`/projects/${id}/line-items`, lineForm);
      }
      setShowLineModal(false);
      load();
    } finally { setLineSaving(false); }
  };
  const handleDeleteLine = async (lineId) => {
    await api.delete(`/projects/${id}/line-items/${lineId}`);
    load();
  };

  if (!project) return <div className="page"><p className="text-muted">Loading...</p></div>;

  const scannedItems = project.items || [];
  const lineItems    = project.line_items || [];
  const totalValue   = scannedItems.reduce((s, i) => s + (i.replacement_value || 0), 0);

  const groupedItems = {};
  scannedItems.forEach(i => {
    const cat = i.category_name || 'Other';
    if (!groupedItems[cat]) groupedItems[cat] = [];
    groupedItems[cat].push(i);
  });

  const totalScannedCount = scannedItems.length;
  const totalLineCount    = lineItems.reduce((s, li) => s + (li.quantity || 1), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link to="/projects" className="btn btn-ghost btn-sm">← Back</Link>
          <div>
            {editing
              ? <input className="form-input" value={form.name} onChange={e => setForm({...form, name:e.target.value})} style={{ fontSize:20, fontWeight:700, padding:'4px 8px' }} />
              : <div className="page-title">{project.name}</div>}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
              <span className={`badge ${STATUS_CLASS[project.status]||'badge-gray'}`}>{project.status}</span>
              {project.contact_name && <span className="text-muted" style={{ fontSize:13 }}>👤 {project.contact_name}{project.contact_company ? ` · ${project.contact_company}` : ''}</span>}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <select
              id="receipt-pricing"
              className="form-select"
              defaultValue="value"
              style={{width:'auto',fontSize:12,padding:'6px 8px'}}
            >
              <option value="value">Show Repl. Value</option>
              <option value="rate">Show Day Rate</option>
              <option value="none">No Pricing</option>
            </select>
            <button className="btn btn-ghost" onClick={() => {
              const token = localStorage.getItem('token');
              const show = document.getElementById('receipt-pricing').value;
              window.open(`/api/reports/project/${id}/print/${token}/${show}`, '_blank');
            }}>🖨 Print Receipt</button>
          </div>
          <Link to={`/scan/${id}`} className="btn btn-primary">📷 Scan</Link>
          {editing
            ? <><button className="btn btn-success" onClick={handleSave}>Save</button><button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button></>
            : <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>}
          {can.deleteProjects && <button className="btn btn-danger" onClick={() => setShowDelete(true)}>Delete</button>}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom:24 }}>
        <div className="card">
          <div className="card-title">Project Details</div>
          {editing ? (
            <>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={e => setForm({...form, status:e.target.value})}>
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Contact</label>
                  <select className="form-select" value={form.contact_id||''} onChange={e => setForm({...form, contact_id:e.target.value})}>
                    <option value="">No contact</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input className="form-input" type="date" value={form.start_date||''} onChange={e => setForm({...form, start_date:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date</label>
                  <input className="form-input" type="date" value={form.end_date||''} onChange={e => setForm({...form, end_date:e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Venue</label>
                <input className="form-input" value={form.venue||''} onChange={e => setForm({...form, venue:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={form.description||''} onChange={e => setForm({...form, description:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">EULA / Agreement Text</label>
                <textarea className="form-textarea" style={{ minHeight:100 }} value={form.eula_text||''} onChange={e => setForm({...form, eula_text:e.target.value})} />
              </div>
            </>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {project.venue       && <InfoRow icon="📍" label="Venue" value={project.venue} />}
              {(project.start_date || project.end_date) && <InfoRow icon="📅" label="Dates" value={`${project.start_date||'—'} → ${project.end_date||'—'}`} />}
              {project.description && <InfoRow icon="📝" label="Description" value={project.description} />}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Contact Info</div>
          {project.contact_name ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <InfoRow icon="👤" label="Name"    value={project.contact_name} />
              {project.contact_company && <InfoRow icon="🏢" label="Company" value={project.contact_company} />}
              {project.contact_email   && <InfoRow icon="✉️"  label="Email"   value={project.contact_email} />}
              {project.contact_phone   && <InfoRow icon="📞" label="Phone"   value={project.contact_phone} />}
            </div>
          ) : (
            <div className="empty-state" style={{ padding:'20px' }}><p>No contact assigned</p></div>
          )}
          <hr className="divider" />
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span className="text-muted">Scanned Items</span>
              <strong>{totalScannedCount}</strong>
            </div>
            {lineItems.length > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span className="text-muted">Manual Line Items</span>
                <strong>{lineItems.length} entries ({totalLineCount} units)</strong>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span className="text-muted">Replacement Value</span>
              <strong>${totalValue.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── Notes ── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: editingNotes ? 12 : (project.notes ? 12 : 0) }}>
          <div className="card-title" style={{ marginBottom:0 }}>Project Notes</div>
          {!editingNotes && (
            <button className="btn btn-ghost btn-sm" onClick={openNotes}>
              {project.notes ? '✏️ Edit' : '+ Add Notes'}
            </button>
          )}
        </div>
        {editingNotes ? (
          <div>
            <textarea
              className="form-textarea"
              style={{ minHeight:120, fontSize:14 }}
              placeholder="Add notes, reminders, special instructions..."
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              autoFocus
            />
            <div style={{ display:'flex', gap:8, marginTop:10, justifyContent:'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingNotes(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveNotes} disabled={notesSaving}>
                {notesSaving ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        ) : project.notes ? (
          <div style={{
            fontSize:14, color:'var(--text)', lineHeight:1.7,
            whiteSpace:'pre-wrap', background:'var(--surface2)',
            borderRadius:8, padding:'12px 14px',
          }}>
            {project.notes}
          </div>
        ) : (
          <div style={{ color:'var(--text2)', fontSize:13, fontStyle:'italic' }}>
            No notes yet — click "Add Notes" to get started.
          </div>
        )}
      </div>

      {/* ── Scanned Equipment ── */}
      <div className="card" style={{ marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div className="card-title" style={{ marginBottom:0 }}>
            Scanned Equipment
            <span style={{ fontSize:13, fontWeight:400, color:'var(--text2)', marginLeft:8 }}>({totalScannedCount} items)</span>
          </div>
          <Link to={`/scan/${id}`} className="btn btn-primary btn-sm">📷 Scan In/Out</Link>
        </div>
        {scannedItems.length === 0 ? (
          <div className="empty-state"><div className="icon">📦</div><p>No scanned equipment yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Equipment</th><th>Barcode</th><th>Status</th><th>Checked Out</th><th>Checked In</th><th></th></tr>
              </thead>
              <tbody>
                {Object.entries(groupedItems).map(([cat, items]) => (
                  <>
                    <tr key={`cat-${cat}`}>
                      <td colSpan={6} style={{ background:'var(--surface2)', padding:'6px 14px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px', color:'var(--text2)' }}>
                        {cat}
                      </td>
                    </tr>
                    {items.map(item => (
                      <tr key={item.id}>
                        <td><div className="table-name">{item.model_name}</div></td>
                        <td><span className="mono" style={{ fontSize:13 }}>{item.barcode}</span></td>
                        <td><span className={`badge ${ITEM_STATUS_CLASS[item.status]||'badge-gray'}`}>{item.status.replace('_',' ')}</span></td>
                        <td style={{ fontSize:12, color:'var(--text2)' }}>
                          {item.checked_out_at ? new Date(item.checked_out_at).toLocaleString() : '—'}
                          {item.checked_out_by_name && <span style={{ display:'block' }}>{item.checked_out_by_name}</span>}
                        </td>
                        <td style={{ fontSize:12, color:'var(--text2)' }}>
                          {item.checked_in_at ? new Date(item.checked_in_at).toLocaleString() : '—'}
                          {item.checked_in_by_name && <span style={{ display:'block' }}>{item.checked_in_by_name}</span>}
                        </td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => handleRemoveItem(item.id)}>✕</button></td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Manual Line Items ── */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div className="card-title" style={{ marginBottom:0 }}>
              Manual Items &amp; Notes
              <span style={{ fontSize:13, fontWeight:400, color:'var(--text2)', marginLeft:8 }}>({lineItems.length} entries)</span>
            </div>
            <div style={{ fontSize:12, color:'var(--text2)', marginTop:3 }}>
              Add temporary equipment, external rentals, consumables, or notes
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openNewLine}>+ Add Item</button>
        </div>

        {lineItems.length === 0 ? (
          <div className="empty-state" style={{ padding:'24px' }}>
            <div className="icon">📝</div>
            <p>No manual items yet.</p>
            <button className="btn btn-ghost" style={{ marginTop:12 }} onClick={openNewLine}>+ Add first item</button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ textAlign:'center', width:60 }}>Qty</th>
                  <th>Notes</th>
                  <th style={{ width:100 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map(li => (
                  <tr key={li.id}>
                    <td>
                      <div className="table-name" style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{
                          fontSize:10, background:'var(--amber-dim)', color:'var(--amber)',
                          border:'1px solid rgba(245,158,11,.3)', borderRadius:4,
                          padding:'2px 6px', fontWeight:700, textTransform:'uppercase',
                          letterSpacing:'.3px', flexShrink:0,
                        }}>Manual</span>
                        {li.description}
                      </div>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <span style={{
                        fontWeight:700, fontSize:15, color:'var(--text)',
                        background:'var(--surface2)', borderRadius:6,
                        padding:'2px 10px', display:'inline-block',
                      }}>{li.quantity}</span>
                    </td>
                    <td style={{ fontSize:13, color:'var(--text2)' }}>{li.notes || '—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditLine(li)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLine(li.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Line Item Modal ── */}
      {showLineModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowLineModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editLineItem ? 'Edit Item' : 'Add Manual Item'}</div>
              <button className="modal-close" onClick={() => setShowLineModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveLine}>
              <div className="form-group">
                <label className="form-label">Description *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Gennie rental, Gaffer tape (black), Note: client to provide stands..."
                  value={lineForm.description}
                  onChange={e => setLineForm({...lineForm, description:e.target.value})}
                  required autoFocus
                />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input
                    className="form-input"
                    type="number" min={1} step={1}
                    value={lineForm.quantity}
                    onChange={e => setLineForm({...lineForm, quantity:parseInt(e.target.value)||1})}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit Price ($) <span style={{color:'var(--text2)',fontWeight:400}}>(optional)</span></label>
                  <input
                    className="form-input"
                    type="number" min={0} step="0.01"
                    placeholder="0.00"
                    value={lineForm.unit_price}
                    onChange={e => setLineForm({...lineForm, unit_price:e.target.value})}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes <span style={{color:'var(--text2)',fontWeight:400}}>(optional)</span></label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight:60 }}
                  placeholder="Any additional details..."
                  value={lineForm.notes}
                  onChange={e => setLineForm({...lineForm, notes:e.target.value})}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowLineModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={lineSaving}>
                  {lineSaving ? 'Saving...' : (editLineItem ? 'Save Changes' : 'Add Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Project ── */}
      {showDelete && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowDelete(false)}>
          <div className="modal">
            <div className="modal-header"><div className="modal-title">Delete Project?</div></div>
            <p style={{ color:'var(--text2)' }}>
              This will permanently delete "{project.name}" and all its equipment assignments. This cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete Project</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value, color }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
      <span style={{ fontSize:16, flexShrink:0 }}>{icon}</span>
      <div>
        <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:700 }}>{label}</div>
        <div style={{ fontSize:14, marginTop:1, color: color||'var(--text)' }}>{value}</div>
      </div>
    </div>
  );
}
