import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import SortableHeader, { useSortedData } from '../components/SortableHeader';

function ConfirmDialog({ msg, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth:400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><div className="modal-title">Confirm Delete</div></div>
        <p style={{ color:'var(--text2)' }}>{msg}</p>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', marginBottom:20 }}>
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          background:'none', border:'none', padding:'10px 18px', cursor:'pointer',
          fontSize:14, fontWeight: active===t ? 700 : 500,
          color: active===t ? 'var(--accent)' : 'var(--text2)',
          borderBottom: active===t ? '2px solid var(--accent)' : '2px solid transparent',
          marginBottom:-1, fontFamily:'inherit', transition:'color 0.15s',
        }}>{t}</button>
      ))}
    </div>
  );
}

export default function EquipmentPage() {
  const [tab, setTab]               = useState('Models');
  const [models, setModels]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [locations, setLocations]   = useState([]);
  const [search, setSearch]         = useState('');
  const [filterCat, setFilterCat]   = useState('');
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [saving, setSaving]         = useState(false);
  const [confirm, setConfirm]       = useState(null);

  const load = () => Promise.all([
    api.get('/equipment/models'),
    api.get('/equipment/categories'),
    api.get('/equipment/manufacturers'),
    api.get('/equipment/locations'),
  ]).then(([m,c,mfr,l]) => { setModels(m); setCategories(c); setManufacturers(mfr); setLocations(l); });

  useEffect(() => { load(); }, []);

  // ── Sort state per tab ────────────────────────────────────────────────────
  const modelsSorted = useSortedData(
    models.filter(m =>
      (m.name.toLowerCase().includes(search.toLowerCase()) ||
       (m.manufacturer_name||'').toLowerCase().includes(search.toLowerCase())) &&
      (!filterCat || m.category_id === filterCat)
    ),
    { col:'name', dir:'asc' }
  );
  const catsSorted  = useSortedData(categories,    { col:'name', dir:'asc' });
  const mfrsSorted  = useSortedData(manufacturers, { col:'name', dir:'asc' });
  const locsSorted  = useSortedData(locations,     { col:'name', dir:'asc' });

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openNew = (type) => {
    const defaults = {
      model:        { name:'', manufacturer_id:'', category_id:'', description:'', weight_kg:'', rental_price_day:'', replacement_value:'', notes:'' },
      category:     { name:'', color:'#6c63ff' },
      manufacturer: { name:'', website:'', notes:'' },
      location:     { name:'', description:'' },
    };
    setForm(defaults[type]);
    setModal({ type });
  };

  const openEdit   = (type, item) => { setForm({...item}); setModal({ type, item }); };
  const closeModal = () => { setModal(null); setForm({}); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { type, item } = modal;
      if (type === 'model') {
        const fd = new FormData();
        Object.entries(form).forEach(([k,v]) => { if (k !== 'image' && v !== '' && v != null) fd.append(k, v); });
        if (form.image) fd.append('image', form.image);
        if (item) await api.putForm(`/equipment/models/${item.id}`, fd);
        else      await api.postForm('/equipment/models', fd);
      } else if (type === 'category') {
        if (item) await api.put(`/equipment/categories/${item.id}`, form);
        else      await api.post('/equipment/categories', form);
      } else if (type === 'manufacturer') {
        if (item) await api.put(`/equipment/manufacturers/${item.id}`, form);
        else      await api.post('/equipment/manufacturers', form);
      } else if (type === 'location') {
        if (item) await api.put(`/equipment/locations/${item.id}`, form);
        else      await api.post('/equipment/locations', form);
      }
      closeModal(); load();
    } finally { setSaving(false); }
  };

  const askDelete = (type, item) => {
    setConfirm({
      msg: `Delete "${item.name}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        if (type === 'category')     await api.delete(`/equipment/categories/${item.id}`);
        else if (type === 'manufacturer') await api.delete(`/equipment/manufacturers/${item.id}`);
        else if (type === 'location')    await api.delete(`/equipment/locations/${item.id}`);
        load();
      }
    });
  };

  const modalTitle = () => {
    if (!modal) return '';
    const verb  = modal.item ? 'Edit' : 'Add';
    const nouns = { model:'Equipment Model', category:'Category', manufacturer:'Manufacturer', location:'Storage Location' };
    return `${verb} ${nouns[modal.type]}`;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Equipment</div>
          <div className="page-subtitle">
            {models.length} models · {models.reduce((s,m) => s+(m.total_assets||0), 0)} total assets
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {tab === 'Models'        && <button className="btn btn-primary" onClick={() => openNew('model')}>+ Add Model</button>}
          {tab === 'Categories'    && <button className="btn btn-primary" onClick={() => openNew('category')}>+ Add Category</button>}
          {tab === 'Manufacturers' && <button className="btn btn-primary" onClick={() => openNew('manufacturer')}>+ Add Manufacturer</button>}
          {tab === 'Locations'     && <button className="btn btn-primary" onClick={() => openNew('location')}>+ Add Location</button>}
        </div>
      </div>

      <TabBar tabs={['Models','Categories','Manufacturers','Locations']} active={tab} onChange={setTab} />

      {/* ── MODELS ── */}
      {tab === 'Models' && (
        <div className="card">
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div className="search-bar" style={{ flex:1 }}>
              <span className="search-icon">🔍</span>
              <input className="form-input" placeholder="Search models or manufacturer..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-select" style={{ width:180 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortableHeader col="name"              label="Model"       sort={modelsSorted.sort} onSort={modelsSorted.onSort} />
                  <SortableHeader col="category_name"     label="Category"    sort={modelsSorted.sort} onSort={modelsSorted.onSort} />
                  <SortableHeader col="manufacturer_name" label="Manufacturer" sort={modelsSorted.sort} onSort={modelsSorted.onSort} />
                  <SortableHeader col="rental_price_day"  label="Day Rate"    sort={modelsSorted.sort} onSort={modelsSorted.onSort} style={{ textAlign:'right' }} />
                  <SortableHeader col="replacement_value" label="Value"       sort={modelsSorted.sort} onSort={modelsSorted.onSort} style={{ textAlign:'right' }} />
                  <SortableHeader col="total_assets"      label="Total"       sort={modelsSorted.sort} onSort={modelsSorted.onSort} style={{ textAlign:'right' }} />
                  <SortableHeader col="available_assets"  label="Available"   sort={modelsSorted.sort} onSort={modelsSorted.onSort} style={{ textAlign:'right' }} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {modelsSorted.sorted.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign:'center', padding:'40px', color:'var(--text2)' }}>No models found</td></tr>
                ) : modelsSorted.sorted.map(m => (
                  <tr key={m.id}>
                    <td>
                      <div className="table-name">{m.name}</div>
                      {m.weight_kg && <div className="table-sub">{m.weight_kg} kg</div>}
                    </td>
                    <td>
                      {m.category_name
                        ? <span><span className="color-dot" style={{ background:m.category_color }}/>{m.category_name}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>{m.manufacturer_name || <span className="text-muted">—</span>}</td>
                    <td style={{ textAlign:'right' }}>${m.rental_price_day || 0}/day</td>
                    <td style={{ textAlign:'right' }}>${(m.replacement_value||0).toLocaleString()}</td>
                    <td style={{ textAlign:'right', fontWeight:600 }}>{m.total_assets || 0}</td>
                    <td style={{ textAlign:'right' }}>
                      <span style={{ fontWeight:600, color: m.available_assets > 0 ? 'var(--green)' : 'var(--red)' }}>
                        {m.available_assets || 0}
                      </span>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <Link to={`/equipment/${m.id}`} className="btn btn-ghost btn-sm">View</Link>
                        <Link to={`/equipment/${m.id}/labels`} className="btn btn-ghost btn-sm" title="Print Labels">🏷</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CATEGORIES ── */}
      {tab === 'Categories' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width:60 }}>Color</th>
                  <SortableHeader col="name" label="Name" sort={catsSorted.sort} onSort={catsSorted.onSort} />
                  <th>Models</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {catsSorted.sorted.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign:'center', padding:'40px', color:'var(--text2)' }}>No categories yet</td></tr>
                ) : catsSorted.sorted.map(c => (
                  <tr key={c.id}>
                    <td><div style={{ width:28, height:28, borderRadius:6, background:c.color, border:'1px solid var(--border)' }}/></td>
                    <td><div className="table-name">{c.name}</div></td>
                    <td style={{ color:'var(--text2)', fontSize:13 }}>{models.filter(m => m.category_id===c.id).length} models</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit('category', c)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => askDelete('category', c)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MANUFACTURERS ── */}
      {tab === 'Manufacturers' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortableHeader col="name"    label="Name"    sort={mfrsSorted.sort} onSort={mfrsSorted.onSort} />
                  <SortableHeader col="website" label="Website" sort={mfrsSorted.sort} onSort={mfrsSorted.onSort} />
                  <th>Models</th>
                  <SortableHeader col="notes" label="Notes" sort={mfrsSorted.sort} onSort={mfrsSorted.onSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mfrsSorted.sorted.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign:'center', padding:'40px', color:'var(--text2)' }}>No manufacturers yet</td></tr>
                ) : mfrsSorted.sorted.map(mfr => (
                  <tr key={mfr.id}>
                    <td><div className="table-name">{mfr.name}</div></td>
                    <td>
                      {mfr.website
                        ? <a href={mfr.website} target="_blank" rel="noreferrer" style={{ color:'var(--accent)', fontSize:13 }}>{mfr.website.replace(/^https?:\/\//,'')}</a>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ color:'var(--text2)', fontSize:13 }}>{models.filter(m => m.manufacturer_id===mfr.id).length} models</td>
                    <td style={{ fontSize:13, color:'var(--text2)', maxWidth:200 }}>{mfr.notes||'—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit('manufacturer', mfr)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => askDelete('manufacturer', mfr)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LOCATIONS ── */}
      {tab === 'Locations' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortableHeader col="name"        label="Name"        sort={locsSorted.sort} onSort={locsSorted.onSort} />
                  <SortableHeader col="description" label="Description" sort={locsSorted.sort} onSort={locsSorted.onSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {locsSorted.sorted.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign:'center', padding:'40px', color:'var(--text2)' }}>No locations yet</td></tr>
                ) : locsSorted.sorted.map(loc => (
                  <tr key={loc.id}>
                    <td><div className="table-name">{loc.name}</div></td>
                    <td style={{ fontSize:13, color:'var(--text2)' }}>{loc.description||'—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit('location', loc)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => askDelete('location', loc)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── UNIFIED MODAL ── */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && closeModal()}>
          <div className={`modal ${modal.type==='model' ? 'modal-lg' : ''}`}>
            <div className="modal-header">
              <div className="modal-title">{modalTitle()}</div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={handleSave}>

              {modal.type === 'model' && <>
                <div className="form-group">
                  <label className="form-label">Model Name *</label>
                  <input className="form-input" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required autoFocus />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" value={form.category_id||''} onChange={e=>setForm({...form,category_id:e.target.value})}>
                      <option value="">No category</option>
                      {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Manufacturer</label>
                    <select className="form-select" value={form.manufacturer_id||''} onChange={e=>setForm({...form,manufacturer_id:e.target.value})}>
                      <option value="">No manufacturer</option>
                      {manufacturers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Weight (kg)</label>
                    <input className="form-input" type="number" step="0.1" value={form.weight_kg||''} onChange={e=>setForm({...form,weight_kg:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Day Rate ($)</label>
                    <input className="form-input" type="number" step="0.01" value={form.rental_price_day||''} onChange={e=>setForm({...form,rental_price_day:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Replacement Value ($)</label>
                    <input className="form-input" type="number" step="0.01" value={form.replacement_value||''} onChange={e=>setForm({...form,replacement_value:e.target.value})} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" style={{minHeight:60}} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Image{modal.item ? ' (leave blank to keep current)' : ''}</label>
                  <input className="form-input" type="file" accept="image/*" onChange={e=>setForm({...form,image:e.target.files[0]})} />
                </div>
              </>}

              {modal.type === 'category' && <>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Color</label>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <input type="color" value={form.color||'#6c63ff'} onChange={e=>setForm({...form,color:e.target.value})}
                      style={{ width:56, height:42, border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', padding:2, background:'var(--surface2)' }} />
                    <div style={{ width:32, height:32, borderRadius:8, background:form.color||'#6c63ff', border:'1px solid var(--border)' }} />
                    <span style={{ fontSize:13, color:'var(--text2)' }}>{form.color||'#6c63ff'}</span>
                  </div>
                </div>
              </>}

              {modal.type === 'manufacturer' && <>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Website</label>
                  <input className="form-input" placeholder="https://..." value={form.website||''} onChange={e=>setForm({...form,website:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" style={{minHeight:60}} value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} />
                </div>
              </>}

              {modal.type === 'location' && <>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})} required autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" style={{minHeight:60}} value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} />
                </div>
              </>}

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : (modal.item ? 'Save Changes' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog msg={confirm.msg} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
