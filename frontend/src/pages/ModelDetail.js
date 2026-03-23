import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

const CONDITIONS = ['excellent','good','fair','poor','damaged'];
const COND_CLASS = { excellent:'badge-green', good:'badge-green', fair:'badge-amber', poor:'badge-red', damaged:'badge-red' };

export default function ModelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [model, setModel] = useState(null);
  const [categories, setCategories] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [assetForm, setAssetForm] = useState({ barcode:'', serial_number:'', storage_location_id:'', condition:'excellent', notes:'', purchase_date:'', purchase_price:'' });
  const [bulkText, setBulkText] = useState('');
  const [bulkLocation, setBulkLocation] = useState('');
  const [editAsset, setEditAsset] = useState(null);
  const [transferAsset, setTransferAsset] = useState(null);
  const [transferModelId, setTransferModelId] = useState('');
  const [allModels, setAllModels] = useState([]);

  const load = () => api.get(`/equipment/models/${id}`).then(m => { setModel(m); setForm(m); });

  const openTransfer = (asset) => {
    setTransferAsset(asset);
    setTransferModelId('');
    if (allModels.length === 0) api.get('/equipment/models').then(setAllModels);
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferModelId) return;
    await api.put(`/assets/${transferAsset.id}/transfer`, { new_model_id: transferModelId });
    setTransferAsset(null);
    load();
  };
  useEffect(() => {
    load();
    api.get('/equipment/categories').then(setCategories);
    api.get('/equipment/manufacturers').then(setManufacturers);
    api.get('/equipment/locations').then(setLocations);
  }, [id]);

  const handleSave = async () => {
    const fd = new FormData();
    Object.entries(form).forEach(([k,v]) => v !== null && v !== undefined && fd.append(k, v));
    if (form.newImage) fd.append('image', form.newImage);
    await api.putForm(`/equipment/models/${id}`, fd);
    load(); setEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this model and all its assets?')) return;
    await api.delete(`/equipment/models/${id}`);
    navigate('/equipment');
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();
    const res = await api.post('/assets', { ...assetForm, model_id: id });
    if (res.id) { setShowAddAsset(false); setAssetForm({ barcode:'', serial_number:'', storage_location_id:'', condition:'excellent', notes:'', purchase_date:'', purchase_price:'' }); load(); }
    else alert(res.error || 'Failed to add asset');
  };

  const handleBulk = async (e) => {
    e.preventDefault();
    const barcodes = bulkText.split('\n').map(s => s.trim()).filter(Boolean);
    await api.post('/assets/bulk', { model_id: id, barcodes, storage_location_id: bulkLocation||null });
    setShowBulk(false); setBulkText(''); load();
  };

  const handleDeleteAsset = async (assetId) => {
    if (!confirm('Delete this asset?')) return;
    await api.delete(`/assets/${assetId}`);
    load();
  };

  const handleSaveAsset = async (e) => {
    e.preventDefault();
    await api.put(`/assets/${editAsset.id}`, editAsset);
    setEditAsset(null); load();
  };

  if (!model) return <div className="page"><p className="text-muted">Loading...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link to="/equipment" className="btn btn-ghost btn-sm">← Equipment</Link>
          <div>
            {editing ? <input className="form-input" value={form.name} onChange={e => setForm({...form, name:e.target.value})} style={{fontSize:20,fontWeight:700}} />
              : <div className="page-title">{model.name}</div>}
            <div style={{color:'var(--text2)',fontSize:13,marginTop:2}}>
              {model.category_name && <><span className="color-dot" style={{background:model.category_color}}/>{model.category_name} · </>}
              {model.manufacturer_name}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {editing ? (
            <><button className="btn btn-success" onClick={handleSave}>Save</button><button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button></>
          ) : (
            <><Link to={`/equipment/${id}/labels`} className="btn btn-ghost">🏷 Print Labels</Link><button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button><button className="btn btn-danger" onClick={handleDelete}>Delete</button></>
          )}
        </div>
      </div>

      <div className="grid-2" style={{marginBottom:24}}>
        <div className="card">
          <div className="card-title">Model Info</div>
          {editing ? (
            <>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Category</label>
                  <select className="form-select" value={form.category_id||''} onChange={e => setForm({...form,category_id:e.target.value})}>
                    <option value="">None</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Manufacturer</label>
                  <select className="form-select" value={form.manufacturer_id||''} onChange={e => setForm({...form,manufacturer_id:e.target.value})}>
                    <option value="">None</option>{manufacturers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Weight (kg)</label><input className="form-input" type="number" step="0.1" value={form.weight_kg||''} onChange={e=>setForm({...form,weight_kg:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">Day Rate ($)</label><input className="form-input" type="number" step="0.01" value={form.rental_price_day||''} onChange={e=>setForm({...form,rental_price_day:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">Replacement Value ($)</label><input className="form-input" type="number" step="0.01" value={form.replacement_value||''} onChange={e=>setForm({...form,replacement_value:e.target.value})}/></div>
              </div>
              <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></div>
              <div className="form-group"><label className="form-label">Image</label><input className="form-input" type="file" accept="image/*" onChange={e=>setForm({...form,newImage:e.target.files[0]})}/></div>
            </>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {model.image_path && <img src={model.image_path} alt={model.name} style={{width:'100%',maxHeight:180,objectFit:'contain',borderRadius:8,background:'var(--surface2)',marginBottom:8}} />}
              {model.description && <p style={{color:'var(--text2)',fontSize:13}}>{model.description}</p>}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:4}}>
                {model.weight_kg && <Stat label="Weight" value={`${model.weight_kg}kg`} />}
                {model.rental_price_day > 0 && <Stat label="Day Rate" value={`$${model.rental_price_day}`} />}
                {model.replacement_value > 0 && <Stat label="Replacement Value" value={`$${(model.replacement_value).toLocaleString()}`} />}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Asset Summary</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <div style={{textAlign:'center',padding:16,background:'var(--surface2)',borderRadius:8}}>
              <div style={{fontSize:28,fontWeight:700,color:'var(--green)'}}>{(model.assets||[]).filter(a=>a.status==='available').length}</div>
              <div style={{fontSize:11,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Available</div>
            </div>
            <div style={{textAlign:'center',padding:16,background:'var(--surface2)',borderRadius:8}}>
              <div style={{fontSize:28,fontWeight:700}}>{(model.assets||[]).length}</div>
              <div style={{fontSize:11,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Total Assets</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-primary" style={{flex:1}} onClick={() => setShowAddAsset(true)}>+ Add Asset</button>
            <button className="btn btn-ghost" onClick={() => setShowBulk(true)}>Bulk Add</button>
          </div>
        </div>
      </div>

      {/* Assets table */}
      <div className="card">
        <div className="card-title">Assets / Barcodes ({(model.assets||[]).length})</div>
        {(model.assets||[]).length === 0 ? (
          <div className="empty-state"><div className="icon">📦</div><p>No assets yet. Add individual assets or use bulk add.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Barcode</th><th>Serial #</th><th>Condition</th><th>Location</th><th>Status</th><th>Notes</th><th>Actions</th></tr></thead>
              <tbody>
                {(model.assets||[]).map(a => (
                  <tr key={a.id}>
                    <td><span className="mono" style={{fontWeight:600}}>{a.barcode}</span></td>
                    <td>{a.serial_number || <span className="text-muted">—</span>}</td>
                    <td><span className={`badge ${COND_CLASS[a.condition]||'badge-gray'}`}>{a.condition}</span></td>
                    <td>{a.location_name || <span className="text-muted">—</span>}</td>
                    <td><span className={`badge ${a.status==='available'?'badge-green':a.status==='checked_out'?'badge-amber':'badge-gray'}`}>{a.status}</span></td>
                    <td style={{fontSize:12,color:'var(--text2)',maxWidth:160}}>
                      {a.notes ? (
                        <span title={a.notes} style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.notes}</span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditAsset({...a})}>Edit</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openTransfer(a)} title="Move to a different model">↔ Transfer</button>
                        <Link to={`/maintenance?asset=${a.id}`} className="btn btn-ghost btn-sm">🔧</Link>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAsset(a.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      {showAddAsset && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddAsset(false)}>
          <div className="modal">
            <div className="modal-header"><div className="modal-title">Add Asset</div><button className="modal-close" onClick={()=>setShowAddAsset(false)}>✕</button></div>
            <form onSubmit={handleAddAsset}>
              <div className="form-group"><label className="form-label">Barcode *</label><input className="form-input mono" value={assetForm.barcode} onChange={e=>setAssetForm({...assetForm,barcode:e.target.value})} required autoFocus /></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Serial Number</label><input className="form-input" value={assetForm.serial_number} onChange={e=>setAssetForm({...assetForm,serial_number:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">Condition</label>
                  <select className="form-select" value={assetForm.condition} onChange={e=>setAssetForm({...assetForm,condition:e.target.value})}>
                    {CONDITIONS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Location</label>
                  <select className="form-select" value={assetForm.storage_location_id} onChange={e=>setAssetForm({...assetForm,storage_location_id:e.target.value})}>
                    <option value="">No location</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Purchase Price ($)</label><input className="form-input" type="number" step="0.01" value={assetForm.purchase_price} onChange={e=>setAssetForm({...assetForm,purchase_price:e.target.value})}/></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={()=>setShowAddAsset(false)}>Cancel</button><button type="submit" className="btn btn-primary">Add Asset</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Add Modal */}
      {showBulk && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowBulk(false)}>
          <div className="modal">
            <div className="modal-header"><div className="modal-title">Bulk Add Assets</div><button className="modal-close" onClick={()=>setShowBulk(false)}>✕</button></div>
            <form onSubmit={handleBulk}>
              <div className="form-group"><label className="form-label">Barcodes (one per line)</label><textarea className="form-textarea mono" style={{minHeight:120}} value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder="ABC001&#10;ABC002&#10;ABC003" required /></div>
              <div className="form-group"><label className="form-label">Storage Location</label>
                <select className="form-select" value={bulkLocation} onChange={e=>setBulkLocation(e.target.value)}>
                  <option value="">No location</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <p style={{color:'var(--text2)',fontSize:12,marginBottom:12}}>{bulkText.split('\n').filter(s=>s.trim()).length} barcodes to add</p>
              <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={()=>setShowBulk(false)}>Cancel</button><button type="submit" className="btn btn-primary">Add Assets</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Asset Modal */}
      {editAsset && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditAsset(null)}>
          <div className="modal">
            <div className="modal-header"><div className="modal-title">Edit Asset</div><button className="modal-close" onClick={()=>setEditAsset(null)}>✕</button></div>
            <form onSubmit={handleSaveAsset}>
              <div className="form-group"><label className="form-label">Barcode *</label><input className="form-input mono" value={editAsset.barcode} onChange={e=>setEditAsset({...editAsset,barcode:e.target.value})} required /></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Serial Number</label><input className="form-input" value={editAsset.serial_number||''} onChange={e=>setEditAsset({...editAsset,serial_number:e.target.value})}/></div>
                <div className="form-group"><label className="form-label">Condition</label>
                  <select className="form-select" value={editAsset.condition} onChange={e=>setEditAsset({...editAsset,condition:e.target.value})}>
                    {CONDITIONS.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Location</label>
                  <select className="form-select" value={editAsset.storage_location_id||''} onChange={e=>setEditAsset({...editAsset,storage_location_id:e.target.value})}>
                    <option value="">No location</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={editAsset.notes||''} onChange={e=>setEditAsset({...editAsset,notes:e.target.value})}/></div>
              <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={()=>setEditAsset(null)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

      {/* Transfer Asset Modal */}
      {transferAsset && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setTransferAsset(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Transfer Asset to Another Model</div>
              <button className="modal-close" onClick={()=>setTransferAsset(null)}>✕</button>
            </div>
            <p style={{color:'var(--text2)',fontSize:13,marginBottom:16}}>
              Moving <strong className="mono">{transferAsset.barcode}</strong> away from <strong>{model?.name}</strong>.
              This does not affect any active project assignments.
            </p>
            <form onSubmit={handleTransfer}>
              <div className="form-group">
                <label className="form-label">Destination Model *</label>
                <select className="form-select" value={transferModelId} onChange={e=>setTransferModelId(e.target.value)} required autoFocus>
                  <option value="">Select a model...</option>
                  {allModels.filter(m=>m.id!==id).map(m=>(
                    <option key={m.id} value={m.id}>{m.name}{m.category_name?` — ${m.category_name}`:''}</option>
                  ))}
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={()=>setTransferAsset(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!transferModelId}>Transfer Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{background:'var(--surface2)',borderRadius:8,padding:'10px 12px'}}>
      <div style={{fontSize:11,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</div>
      <div style={{fontWeight:700,marginTop:2}}>{value}</div>
    </div>
  );
}
