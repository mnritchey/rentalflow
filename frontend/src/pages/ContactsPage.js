import { useState, useEffect } from 'react';
import { api, getToken } from '../utils/api';

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:'', email:'', phone:'', company:'', address:'', notes:'' });

  const load = () => api.get('/contacts').then(setContacts);
  useEffect(() => { load(); }, []);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.company||'').toLowerCase().includes(search.toLowerCase()) ||
    (c.email||'').toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditing(null); setForm({ name:'', email:'', phone:'', company:'', address:'', notes:'' }); setShowModal(true); };
  const openEdit   = (c) => { setEditing(c); setForm(c); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) await api.put(`/contacts/${editing.id}`, form);
    else await api.post('/contacts', form);
    setShowModal(false); load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this contact?')) return;
    await api.delete(`/contacts/${id}`); load();
  };

  const openReport = (id) => {
    const token = getToken();
    window.open(`/api/reports/contact/${id}/report/${token}`, '_blank');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Contacts</div>
          <div className="page-subtitle">{contacts.length} contacts</div>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Contact</button>
      </div>

      <div className="card">
        <div style={{ marginBottom:16 }}>
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input className="form-input" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign:'center', padding:'40px', color:'var(--text2)' }}>No contacts found</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id}>
                  <td><div className="table-name">{c.name}</div></td>
                  <td>{c.company || <span className="text-muted">—</span>}</td>
                  <td>
                    {c.email
                      ? <a href={`mailto:${c.email}`} style={{ color:'var(--accent)' }}>{c.email}</a>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td>{c.phone || <span className="text-muted">—</span>}</td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => openReport(c.id)}
                        title="Checkout report — all items currently out to this contact"
                      >📋 Report</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editing ? 'Edit Contact' : 'Add Contact'}</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form,name:e.target.value})} required autoFocus />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email||''} onChange={e => setForm({...form,email:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone||''} onChange={e => setForm({...form,phone:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Company</label>
                  <input className="form-input" value={form.company||''} onChange={e => setForm({...form,company:e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <textarea className="form-textarea" value={form.address||''} onChange={e => setForm({...form,address:e.target.value})} style={{ minHeight:60 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={form.notes||''} onChange={e => setForm({...form,notes:e.target.value})} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Save Changes' : 'Add Contact'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
