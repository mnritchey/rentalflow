import { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';

const TYPES = ['repair','damage','cleaning','inspection','calibration','other'];
const CONDITIONS = ['excellent','good','fair','poor'];
const TYPE_ICONS = { repair:'🔧', damage:'💥', cleaning:'🧹', inspection:'🔍', calibration:'📐', other:'📝' };
const STATUS_CLASS = { open:'badge-red', in_progress:'badge-amber', resolved:'badge-green' };

export default function MaintenancePage() {
  const [records, setRecords] = useState([]);
  const [assetLookup, setAssetLookup] = useState(null);
  const [assetQuery, setAssetQuery] = useState('');
  const [assetError, setAssetError] = useState('');
  const barcodeRef = useRef(null);
  const [showNew, setShowNew] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [resolveRecord, setResolveRecord] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm] = useState({ asset_id:'', type:'repair', description:'', cost:'', vendor:'', notes:'' });
  const [resolveForm, setResolveForm] = useState({ resolution_notes:'', condition_after:'good' });

  const load = () => api.get('/maintenance').then(setRecords);
  useEffect(() => { load(); }, []);

  const lookupAsset = async (barcode) => {
    const q = barcode.trim();
    if (!q) return;
    setAssetError('');
    try {
      const res = await api.get(`/assets/lookup/${encodeURIComponent(q)}`);
      if (res.id) {
        setAssetLookup(res);
        setForm(f => ({ ...f, asset_id: res.id }));
      } else {
        setAssetError(`No asset found for barcode: ${q}`);
        setAssetLookup(null);
      }
    } catch {
      setAssetError('Lookup failed');
    }
  };

  const filtered = filterStatus ? records.filter(r => r.status === filterStatus) : records;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.asset_id) { setAssetError('Please look up an asset first'); return; }
    const res = await api.post('/maintenance', form);
    if (res.id) { setShowNew(false); setForm({ asset_id:'', type:'repair', description:'', cost:'', vendor:'', notes:'' }); setAssetLookup(null); setAssetQuery(''); setAssetError(''); load(); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    await api.put(`/maintenance/${editRecord.id}`, editRecord);
    setEditRecord(null); load();
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    await api.put(`/maintenance/${resolveRecord.id}`, { ...resolveRecord, ...resolveForm, status:'resolved' });
    setResolveRecord(null); load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this maintenance record?')) return;
    await api.delete(`/maintenance/${id}`); load();
  };

  const openCount = records.filter(r => r.status === 'open').length;
  const inProgressCount = records.filter(r => r.status === 'in_progress').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Maintenance</div>
          <div className="page-subtitle">{openCount} open · {inProgressCount} in progress</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Log Issue</button>
      </div>

      <div className="grid-3" style={{ marginBottom:20 }}>
        {[
          { label:'Open Issues', value:openCount, color:'var(--red)', status:'open' },
          { label:'In Progress', value:inProgressCount, color:'var(--amber)', status:'in_progress' },
          { label:'Resolved', value:records.filter(r=>r.status==='resolved').length, color:'var(--green)', status:'resolved' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ cursor:'pointer', border:`1px solid ${filterStatus===s.status?s.color:'var(--border)'}` }} onClick={() => setFilterStatus(filterStatus===s.status?'':s.status)}>
            <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Asset</th><th>Type</th><th>Description</th><th>Vendor</th><th>Cost</th><th>Status</th><th>Reported</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:'40px', color:'var(--text2)' }}>No maintenance records{filterStatus ? ` with status "${filterStatus}"` : ''}</td></tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="table-name">{r.model_name}</div>
                    <div className="table-sub mono">{r.barcode}</div>
                    {r.category_name && <div className="table-sub"><span className="color-dot" style={{background:r.category_color}}/>{r.category_name}</div>}
                  </td>
                  <td><span style={{ fontSize:18 }}>{TYPE_ICONS[r.type]||'📝'}</span> <span style={{ fontSize:12, color:'var(--text2)' }}>{r.type}</span></td>
                  <td style={{ maxWidth:220 }}>
                    <div style={{ fontSize:13 }}>{r.description}</div>
                    {r.resolution_notes && <div style={{ fontSize:12, color:'var(--green)', marginTop:4 }}>✓ {r.resolution_notes}</div>}
                  </td>
                  <td style={{ fontSize:13 }}>{r.vendor || '—'}</td>
                  <td style={{ fontSize:13 }}>{r.cost ? `$${parseFloat(r.cost).toLocaleString()}` : '—'}</td>
                  <td><span className={`badge ${STATUS_CLASS[r.status]||'badge-gray'}`}>{r.status.replace('_',' ')}</span></td>
                  <td style={{ fontSize:12, color:'var(--text2)' }}>
                    <div>{r.reported_by_name || '—'}</div>
                    <div>{new Date(r.created_at).toLocaleDateString()}</div>
                    {r.resolved_at && <div style={{ color:'var(--green)' }}>Resolved {new Date(r.resolved_at).toLocaleDateString()}</div>}
                  </td>
                  <td>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      {r.status !== 'resolved' && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditRecord({...r})}>Edit</button>
                          <button className="btn btn-success btn-sm" onClick={() => { setResolveRecord(r); setResolveForm({ resolution_notes:'', condition_after:'good' }); }}>Resolve</button>
                        </>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Record Modal */}
      {showNew && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowNew(false)}>
          <div className="modal modal-lg">
            <div className="modal-header"><div className="modal-title">Log Maintenance Issue</div><button className="modal-close" onClick={()=>{setShowNew(false);setAssetLookup(null);setAssetQuery('');setAssetError('');setForm({asset_id:'',type:'repair',description:'',cost:'',vendor:'',notes:''});}}>✕</button></div>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Asset Barcode *</label>
                <div style={{display:'flex',gap:8}}>
                  <input
                    ref={barcodeRef}
                    className="form-input mono"
                    placeholder="Scan or type barcode..."
                    value={assetQuery}
                    onChange={e => setAssetQuery(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && (e.preventDefault(), lookupAsset(assetQuery))}
                    autoFocus
                  />
                  <button type="button" className="btn btn-ghost" onClick={() => lookupAsset(assetQuery)}>Look Up</button>
                </div>
                {assetError && <div style={{color:'var(--red)',fontSize:12,marginTop:4}}>{assetError}</div>}
                {assetLookup && (
                  <div style={{marginTop:8,padding:'8px 12px',background:'var(--green-dim)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:8,fontSize:13}}>
                    ✅ <strong>{assetLookup.model_name}</strong> — {assetLookup.barcode}
                    {assetLookup.serial_number && <span style={{color:'var(--text2)'}}> · {assetLookup.serial_number}</span>}
                    {assetLookup.location_name && <span style={{color:'var(--text2)'}}> · 📍 {assetLookup.location_name}</span>}
                  </div>
                )}
                <input type="hidden" value={form.asset_id} required />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                    {TYPES.map(t=><option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor / Shop</label>
                  <input className="form-input" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} placeholder="Optional" />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost ($)</label>
                  <input className="form-input" type="number" step="0.01" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description of Issue *</label>
                <textarea className="form-textarea" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required placeholder="Describe the damage or issue..." />
              </div>
              <div className="form-group">
                <label className="form-label">Internal Notes</label>
                <textarea className="form-textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{minHeight:60}} />
              </div>
              <p style={{fontSize:12,color:'var(--amber)',marginBottom:12}}>⚠ This will mark the asset as damaged and set its status to "In Maintenance"</p>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={()=>setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Log Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editRecord && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditRecord(null)}>
          <div className="modal modal-lg">
            <div className="modal-header"><div className="modal-title">Edit Maintenance Record</div><button className="modal-close" onClick={()=>setEditRecord(null)}>✕</button></div>
            <form onSubmit={handleUpdate}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={editRecord.type} onChange={e=>setEditRecord({...editRecord,type:e.target.value})}>
                    {TYPES.map(t=><option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={editRecord.status} onChange={e=>setEditRecord({...editRecord,status:e.target.value})}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor / Shop</label>
                  <input className="form-input" value={editRecord.vendor||''} onChange={e=>setEditRecord({...editRecord,vendor:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost ($)</label>
                  <input className="form-input" type="number" step="0.01" value={editRecord.cost||''} onChange={e=>setEditRecord({...editRecord,cost:e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={editRecord.description} onChange={e=>setEditRecord({...editRecord,description:e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={editRecord.notes||''} onChange={e=>setEditRecord({...editRecord,notes:e.target.value})} style={{minHeight:60}} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={()=>setEditRecord(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {resolveRecord && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setResolveRecord(null)}>
          <div className="modal">
            <div className="modal-header"><div className="modal-title">Resolve Issue</div><button className="modal-close" onClick={()=>setResolveRecord(null)}>✕</button></div>
            <p style={{color:'var(--text2)',marginBottom:16,fontSize:13}}>Resolving: <strong>{resolveRecord.model_name}</strong> ({resolveRecord.barcode})</p>
            <form onSubmit={handleResolve}>
              <div className="form-group">
                <label className="form-label">Resolution Notes</label>
                <textarea className="form-textarea" value={resolveForm.resolution_notes} onChange={e=>setResolveForm({...resolveForm,resolution_notes:e.target.value})} placeholder="Describe what was done..." />
              </div>
              <div className="form-group">
                <label className="form-label">Condition After Repair</label>
                <select className="form-select" value={resolveForm.condition_after} onChange={e=>setResolveForm({...resolveForm,condition_after:e.target.value})}>
                  {CONDITIONS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <p style={{fontSize:12,color:'var(--green)',marginBottom:12}}>✓ This will mark the asset as available and update its condition.</p>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={()=>setResolveRecord(null)}>Cancel</button>
                <button type="submit" className="btn btn-success">Mark Resolved</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
