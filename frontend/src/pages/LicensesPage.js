import { useState, useEffect } from 'react';
import { api } from '../utils/api';

const LICENSE_TYPES = ['perpetual','subscription','oem','trial','open_source','site'];
const TYPE_LABELS = { perpetual:'Perpetual', subscription:'Subscription', oem:'OEM', trial:'Trial', open_source:'Open Source', site:'Site License' };

function isExpiringSoon(date) {
  if (!date) return false;
  const days = (new Date(date) - new Date()) / 86400000;
  return days >= 0 && days <= 30;
}
function isExpired(date) {
  if (!date) return false;
  return new Date(date) < new Date();
}

export default function LicensesPage() {
  const [licenses, setLicenses]         = useState([]);
  const [assets, setAssets]             = useState([]);
  const [selected, setSelected]         = useState(null);
  const [detail, setDetail]             = useState(null);
  const [showModal, setShowModal]       = useState(false);
  const [editLicense, setEditLicense]   = useState(null);
  const [showAssign, setShowAssign]     = useState(false);
  const [assignAssetId, setAssignAssetId] = useState('');
  const [assignNotes, setAssignNotes]   = useState('');
  const [assetSearch, setAssetSearch]   = useState('');
  const [saving, setSaving]             = useState(false);

  const emptyForm = { software_name:'', version:'', license_key:'', license_type:'perpetual', vendor:'', seat_count:'', purchase_date:'', expiry_date:'', cost:'', notes:'' };
  const [form, setForm] = useState(emptyForm);

  const load = () => api.get('/licenses').then(setLicenses);
  useEffect(() => { load(); api.get('/assets').then(setAssets); }, []);

  const openDetail = async (lic) => {
    setSelected(lic);
    const d = await api.get(`/licenses/${lic.id}`);
    setDetail(d);
  };

  const openNew = () => { setEditLicense(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (lic) => { setEditLicense(lic); setForm({...lic, seat_count:lic.seat_count||'', cost:lic.cost||'', expiry_date:lic.expiry_date||'', purchase_date:lic.purchase_date||''}); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editLicense) await api.put(`/licenses/${editLicense.id}`, form);
      else await api.post('/licenses', form);
      setShowModal(false);
      load();
      if (selected) { const d = await api.get(`/licenses/${selected.id}`); setDetail(d); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this license and all assignments?')) return;
    await api.delete(`/licenses/${id}`);
    setSelected(null); setDetail(null); load();
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    const res = await api.post(`/licenses/${selected.id}/assign`, { asset_id: assignAssetId, notes: assignNotes });
    if (res.error) { alert(res.error); return; }
    setShowAssign(false); setAssignAssetId(''); setAssignNotes('');
    const d = await api.get(`/licenses/${selected.id}`); setDetail(d);
    load();
  };

  const handleUnassign = async (assignId) => {
    await api.delete(`/licenses/${selected.id}/assign/${assignId}`);
    const d = await api.get(`/licenses/${selected.id}`); setDetail(d); load();
  };

  const filteredAssets = assets.filter(a => {
    const q = assetSearch.toLowerCase();
    return !q || a.barcode.toLowerCase().includes(q) || a.model_name.toLowerCase().includes(q) || (a.serial_number||'').toLowerCase().includes(q);
  });

  const usedSeats = detail?.assignments?.length || 0;
  const totalSeats = detail?.seat_count || null;
  const seatPct = totalSeats ? Math.round(usedSeats/totalSeats*100) : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Software Licenses</div>
          <div className="page-subtitle">{licenses.length} licenses · {licenses.reduce((s,l)=>s+(l.assigned_count||0),0)} total assignments</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Add License</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 400px' : '1fr', gap:20, alignItems:'start' }}>
        {/* License list */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {licenses.length === 0 ? (
            <div className="empty-state" style={{padding:40}}>
              <div className="icon">🔑</div>
              <p>No licenses yet.</p>
              <button className="btn btn-ghost" style={{marginTop:12}} onClick={openNew}>+ Add first license</button>
            </div>
          ) : licenses.map((lic, i) => {
            const exp = isExpired(lic.expiry_date);
            const soon = isExpiringSoon(lic.expiry_date);
            const isSelected = selected?.id === lic.id;
            return (
              <div key={lic.id} onClick={() => openDetail(lic)} style={{
                padding:'14px 20px', cursor:'pointer',
                borderBottom: i<licenses.length-1 ? '1px solid var(--border)' : 'none',
                background: isSelected ? 'var(--accent-dim)' : exp ? 'rgba(239,68,68,.04)' : 'transparent',
                borderLeft: isSelected ? '3px solid var(--accent)' : exp ? '3px solid var(--red)' : soon ? '3px solid var(--amber)' : '3px solid transparent',
              }}
                onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.background='var(--surface2)'; }}
                onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background= exp?'rgba(239,68,68,.04)':'transparent'; }}
              >
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}}>
                      <span style={{fontWeight:700,fontSize:14}}>🔑 {lic.software_name}</span>
                      {lic.version && <span style={{fontSize:12,color:'var(--text2)'}}>v{lic.version}</span>}
                      <span style={{fontSize:11,background:'var(--surface2)',borderRadius:4,padding:'1px 6px',color:'var(--text2)'}}>
                        {TYPE_LABELS[lic.license_type]||lic.license_type}
                      </span>
                      {exp && <span style={{fontSize:11,color:'var(--red)',fontWeight:700}}>EXPIRED</span>}
                      {soon && !exp && <span style={{fontSize:11,color:'var(--amber)',fontWeight:700}}>EXPIRING SOON</span>}
                    </div>
                    <div style={{fontSize:12,color:'var(--text2)',display:'flex',gap:12,flexWrap:'wrap'}}>
                      {lic.vendor && <span>🏢 {lic.vendor}</span>}
                      {lic.seat_count && <span>💺 {lic.assigned_count}/{lic.seat_count} seats</span>}
                      {!lic.seat_count && <span>💺 {lic.assigned_count} assigned</span>}
                      {lic.expiry_date && <span style={{color:exp?'var(--red)':soon?'var(--amber)':undefined}}>📅 Expires {lic.expiry_date}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && detail && (
          <div className="card" style={{position:'sticky',top:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
              <div>
                <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>{detail.software_name}</div>
                <span style={{fontSize:12,background:'var(--surface2)',borderRadius:4,padding:'2px 8px',color:'var(--text2)'}}>
                  {TYPE_LABELS[detail.license_type]||detail.license_type}
                </span>
              </div>
              <button onClick={()=>{setSelected(null);setDetail(null);}} style={{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)'}}>✕</button>
            </div>

            {/* Info grid */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
              {[
                {label:'Vendor',   value:detail.vendor||'—'},
                {label:'Version',  value:detail.version||'—'},
                {label:'Purchase', value:detail.purchase_date||'—'},
                {label:'Expires',  value:detail.expiry_date||(detail.license_type==='perpetual'?'Never (perpetual)':'—'),
                  color:isExpired(detail.expiry_date)?'var(--red)':isExpiringSoon(detail.expiry_date)?'var(--amber)':undefined},
                {label:'Cost',     value:detail.cost?`$${parseFloat(detail.cost).toLocaleString()}`:'—'},
                {label:'Seats',    value:totalSeats?`${usedSeats}/${totalSeats} used`:`${usedSeats} assigned`},
              ].map(({label,value,color})=>(
                <div key={label} style={{background:'var(--surface2)',borderRadius:6,padding:'8px 10px'}}>
                  <div style={{fontSize:10,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:2}}>{label}</div>
                  <div style={{fontWeight:600,fontSize:12,color:color||'var(--text)'}}>{value}</div>
                </div>
              ))}
            </div>

            {/* Seat bar */}
            {seatPct !== null && (
              <div style={{marginBottom:16}}>
                <div style={{height:6,background:'var(--surface2)',borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${Math.min(seatPct,100)}%`,background:seatPct>=90?'var(--red)':seatPct>=70?'var(--amber)':'var(--green)',borderRadius:3,transition:'width .3s'}} />
                </div>
                <div style={{fontSize:11,color:'var(--text2)',marginTop:4}}>{seatPct}% of seats used</div>
              </div>
            )}

            {detail.license_key && (
              <div style={{background:'var(--surface2)',borderRadius:8,padding:'8px 12px',marginBottom:16,fontFamily:'monospace',fontSize:12,wordBreak:'break-all',color:'var(--text2)'}}>
                🔑 {detail.license_key}
              </div>
            )}
            {detail.notes && (
              <div style={{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.6,whiteSpace:'pre-wrap'}}>{detail.notes}</div>
            )}

            <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
              <button className="btn btn-primary btn-sm" onClick={()=>setShowAssign(true)}>+ Assign to Asset</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(detail)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={()=>handleDelete(detail.id)}>Delete</button>
            </div>

            <hr className="divider" />

            <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>
              Assigned to {detail.assignments?.length||0} asset{detail.assignments?.length!==1?'s':''}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:260,overflowY:'auto'}}>
              {(!detail.assignments||detail.assignments.length===0) && (
                <div style={{fontSize:12,color:'var(--text2)',fontStyle:'italic'}}>Not assigned to any assets.</div>
              )}
              {(detail.assignments||[]).map(a=>(
                <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'var(--surface2)',borderRadius:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{a.model_name}</div>
                    <div style={{fontSize:11,color:'var(--text2)'}}>
                      <span className="mono">{a.barcode}</span>
                      {a.serial_number && <span> · {a.serial_number}</span>}
                    </div>
                    {a.notes && <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>{a.notes}</div>}
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={()=>handleUnassign(a.id)}>Remove</button>
                </div>
              ))}
            </div>

            {/* Assign modal */}
            {showAssign && (
              <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAssign(false)}>
                <div className="modal">
                  <div className="modal-header">
                    <div className="modal-title">Assign License</div>
                    <button className="modal-close" onClick={()=>setShowAssign(false)}>✕</button>
                  </div>
                  <p style={{fontSize:13,color:'var(--text2)',marginBottom:16}}>
                    Assigning: <strong>{detail.software_name}</strong>
                    {totalSeats && <span> · {totalSeats - usedSeats} seats remaining</span>}
                  </p>
                  <form onSubmit={handleAssign}>
                    <div className="form-group">
                      <label className="form-label">Search Asset</label>
                      <input className="form-input" placeholder="Search barcode, model, serial..." value={assetSearch} onChange={e=>setAssetSearch(e.target.value)} autoFocus />
                    </div>
                    <div style={{maxHeight:200,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,marginBottom:12}}>
                      {filteredAssets.slice(0,50).map(a=>(
                        <label key={a.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid var(--border)'}}>
                          <input type="radio" name="asset" value={a.id} checked={assignAssetId===a.id} onChange={()=>setAssignAssetId(a.id)} />
                          <div>
                            <div style={{fontWeight:600,fontSize:13}}>{a.model_name}</div>
                            <div style={{fontSize:11,color:'var(--text2)'}}>
                              <span className="mono">{a.barcode}</span>
                              {a.serial_number&&<span> · {a.serial_number}</span>}
                            </div>
                          </div>
                        </label>
                      ))}
                      {filteredAssets.length===0 && <div style={{padding:16,color:'var(--text2)',fontSize:13,textAlign:'center'}}>No assets found</div>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Notes (optional)</label>
                      <input className="form-input" value={assignNotes} onChange={e=>setAssignNotes(e.target.value)} placeholder="e.g. Install key, seat number..." />
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-ghost" onClick={()=>setShowAssign(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={!assignAssetId}>Assign</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">{editLicense?'Edit License':'Add License'}</div>
              <button className="modal-close" onClick={()=>setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Software Name *</label>
                  <input className="form-input" value={form.software_name} onChange={e=>setForm({...form,software_name:e.target.value})} required autoFocus placeholder="e.g. Adobe Premiere Pro" />
                </div>
                <div className="form-group">
                  <label className="form-label">Version</label>
                  <input className="form-input" value={form.version} onChange={e=>setForm({...form,version:e.target.value})} placeholder="e.g. 2024" />
                </div>
                <div className="form-group">
                  <label className="form-label">License Type</label>
                  <select className="form-select" value={form.license_type} onChange={e=>setForm({...form,license_type:e.target.value})}>
                    {LICENSE_TYPES.map(t=><option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vendor</label>
                  <input className="form-input" value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Seat Count (leave blank = unlimited)</label>
                  <input className="form-input" type="number" min={1} value={form.seat_count} onChange={e=>setForm({...form,seat_count:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost ($)</label>
                  <input className="form-input" type="number" step="0.01" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Date</label>
                  <input className="form-input" type="date" value={form.purchase_date} onChange={e=>setForm({...form,purchase_date:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Expiry Date</label>
                  <input className="form-input" type="date" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">License Key</label>
                <input className="form-input mono" value={form.license_key} onChange={e=>setForm({...form,license_key:e.target.value})} placeholder="XXXX-XXXX-XXXX-XXXX" />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{minHeight:60}} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving...':editLicense?'Save Changes':'Add License'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
