import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { playSound } from '../utils/audio';

export default function InventoryPage() {
  const [sessions, setSessions]       = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [view, setView]               = useState('list'); // 'list' | 'scan' | 'results'
  const [input, setInput]             = useState('');
  const [processing, setProcessing]   = useState(false);
  const processingRef                 = useRef(false);
  const [scanLog, setScanLog]         = useState([]);
  const [newForm, setNewForm]         = useState({ name: '', notes: '' });
  const [showNew, setShowNew]         = useState(false);
  const [showClose, setShowClose]     = useState(false);
  const [selectedMissing, setSelectedMissing] = useState(new Set());
  const inputRef                      = useRef(null);

  const loadSessions = () => api.get('/inventory/sessions').then(setSessions);

  useEffect(() => {
    loadSessions();
  }, []);

  // Auto-focus scan input
  useEffect(() => {
    if (view === 'scan') {
      const t = setInterval(() => { if (inputRef.current) inputRef.current.focus(); }, 300);
      return () => clearInterval(t);
    }
  }, [view]);

  const openSession = async (session) => {
    setActiveSession(session);
    const detail = await api.get(`/inventory/sessions/${session.id}`);
    setSessionDetail(detail);
    setScanLog([]);
    setView(session.status === 'open' ? 'scan' : 'results');
  };

  const refreshSession = async () => {
    if (!activeSession) return;
    const detail = await api.get(`/inventory/sessions/${activeSession.id}`);
    setSessionDetail(detail);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await api.post('/inventory/sessions', newForm);
    if (res.id) {
      setShowNew(false);
      setNewForm({ name: '', notes: '' });
      await loadSessions();
      const sessions2 = await api.get('/inventory/sessions');
      setSessions(sessions2);
      const created = sessions2.find(s => s.id === res.id);
      if (created) openSession(created);
    } else if (res.error) {
      alert(res.error);
    }
  };

  const handleScan = useCallback(async (barcode) => {
    const trimmed = barcode.trim();
    if (!trimmed || processingRef.current || !activeSession) return;
    processingRef.current = true;
    setProcessing(true);
    setInput('');
    try {
      const res = await api.post(`/inventory/sessions/${activeSession.id}/scan`, { barcode: trimmed });
      playSound(res.sound || (res.success ? 'success' : 'error'));
      const type = res.success ? 'success' : (res.sound === 'warning' ? 'warning' : 'error');
      setScanLog(prev => [{ barcode: trimmed, message: res.message, type, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 200));
      if (res.success) refreshSession();
    } catch (err) {
      playSound('error');
      setScanLog(prev => [{ barcode: trimmed, message: `Error: ${err.message}`, type: 'error', time: new Date().toLocaleTimeString() }, ...prev]);
    } finally {
      processingRef.current = false;
      setProcessing(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [activeSession]);

  const handleUndoScan = async (assetId) => {
    await api.delete(`/inventory/sessions/${activeSession.id}/scan/${assetId}`);
    await refreshSession();
    setScanLog(prev => prev.filter(l => l.type !== 'success' || !l.message.includes(assetId)));
  };

  const handleCloseSession = async (markAll) => {
    const mark_missing = markAll ? true : Array.from(selectedMissing);
    const res = await api.post(`/inventory/sessions/${activeSession.id}/close`, { mark_missing });
    if (res.success) {
      setShowClose(false);
      await loadSessions();
      const detail = await api.get(`/inventory/sessions/${activeSession.id}`);
      setSessionDetail(detail);
      setActiveSession({ ...activeSession, status: 'closed' });
      setView('results');
    }
  };

  const scannedCount = sessionDetail?.scanned?.length || 0;
  const missingCount = sessionDetail?.missing?.length || 0;

  // ── SESSION LIST ────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <div className="page-title">Inventory / Audit</div>
            <div className="page-subtitle">Scan items to verify what's in the shop</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ New Session</button>
        </div>

        {sessions.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="icon">🔍</div>
              <p>No inventory sessions yet.</p>
              <button className="btn btn-primary" style={{ marginTop:12 }} onClick={() => setShowNew(true)}>Start First Session</button>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Session Name</th><th>Status</th><th>Scanned</th><th>Created By</th><th>Date</th><th>Actions</th></tr></thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id}>
                      <td><div className="table-name">{s.name}</div>{s.notes && <div className="table-sub">{s.notes}</div>}</td>
                      <td>
                        <span className={`badge ${s.status === 'open' ? 'badge-green' : 'badge-gray'}`}>
                          {s.status === 'open' ? '🟢 Open' : '✓ Closed'}
                        </span>
                      </td>
                      <td style={{ fontWeight:600 }}>{s.scanned_count || 0} items</td>
                      <td style={{ fontSize:13, color:'var(--text2)' }}>{s.created_by_name || '—'}</td>
                      <td style={{ fontSize:12, color:'var(--text2)' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openSession(s)}>
                          {s.status === 'open' ? '📷 Continue' : '📋 View Results'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showNew && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNew(false)}>
            <div className="modal">
              <div className="modal-header">
                <div className="modal-title">New Inventory Session</div>
                <button className="modal-close" onClick={() => setShowNew(false)}>✕</button>
              </div>
              <p style={{ color:'var(--text2)', fontSize:13, marginBottom:16 }}>
                Start scanning barcodes to take stock of what's physically in the shop.
                Items scanned will be marked as available. Items not scanned can be flagged as missing when you close the session.
              </p>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label className="form-label">Session Name *</label>
                  <input className="form-input" placeholder="e.g. Monthly Stock Count — March 2026" value={newForm.name} onChange={e => setNewForm({...newForm, name:e.target.value})} required autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes (optional)</label>
                  <textarea className="form-textarea" style={{minHeight:60}} value={newForm.notes} onChange={e => setNewForm({...newForm, notes:e.target.value})} />
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Start Session</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── SCAN VIEW ───────────────────────────────────────────────────────────
  if (view === 'scan') {
    return (
      <div className="page" style={{ maxWidth:900, margin:'0 auto' }}>
        <div className="page-header">
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); loadSessions(); }}>← Sessions</button>
            <div>
              <div className="page-title">📦 {activeSession?.name}</div>
              <div className="page-subtitle">Scan each item that is physically present in the shop</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" onClick={() => setView('results')}>View Results</button>
            <button className="btn btn-danger" onClick={() => setShowClose(true)}>Close Session</button>
          </div>
        </div>

        {/* Scan input */}
        <div className="card" style={{ marginBottom:16, border:'2px solid var(--accent)' }}>
          <div style={{ textAlign:'center', marginBottom:14 }}>
            <div style={{ fontSize:32, marginBottom:4 }}>🔍</div>
            <div style={{ fontSize:17, fontWeight:700 }}>Scanning Inventory</div>
            <div style={{ fontSize:13, color:'var(--text2)', marginTop:3 }}>
              Scan every item that is physically present — scanned items are confirmed as available
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input
              ref={inputRef}
              className="form-input mono"
              style={{ fontSize:18, textAlign:'center', letterSpacing:2 }}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScan(input)}
              placeholder="Scan or type barcode..."
              disabled={processing}
              autoFocus
            />
            <button className="btn btn-primary btn-lg" onClick={() => handleScan(input)} disabled={!input.trim() || processing}>
              {processing ? '...' : 'Scan'}
            </button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}>
            <div style={{ textAlign:'center', padding:12, background:'var(--surface2)', borderRadius:8 }}>
              <div style={{ fontSize:26, fontWeight:800, color:'var(--green)' }}>{scannedCount}</div>
              <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Scanned ✓</div>
            </div>
            <div style={{ textAlign:'center', padding:12, background:'var(--surface2)', borderRadius:8 }}>
              <div style={{ fontSize:26, fontWeight:800, color:'var(--text2)' }}>
                {(sessionDetail?.scanned || []).filter(s => s.asset_status === 'checked_out').length}
              </div>
              <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Auto Checked-In</div>
            </div>
          </div>
        </div>

        {/* Scan log */}
        <div className="card" style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div className="card-title" style={{ marginBottom:0 }}>Scan Log</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setScanLog([])}>Clear log</button>
          </div>
          <div className="scan-feed" style={{ maxHeight:280 }}>
            {scanLog.length === 0 ? (
              <div style={{ textAlign:'center', padding:24, color:'var(--text2)', fontSize:13 }}>Scans will appear here...</div>
            ) : scanLog.map((entry, i) => (
              <div key={i} className={`scan-item ${entry.type}`}>
                <span className="scan-icon">{entry.type==='success'?'✅':entry.type==='warning'?'⚠️':'❌'}</span>
                <div className="scan-msg">{entry.message}</div>
                <span className="scan-time mono">{entry.barcode}</span>
                <span className="scan-time">{entry.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scanned items list */}
        {scannedCount > 0 && (
          <div className="card">
            <div className="card-title">Confirmed Present ({scannedCount})</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Equipment</th><th>Barcode</th><th>Scanned By</th><th>Time</th><th></th></tr></thead>
                <tbody>
                  {(sessionDetail?.scanned || []).map(s => (
                    <tr key={s.id}>
                      <td><div className="table-name">{s.model_name}</div><div className="table-sub">{s.category_name}</div></td>
                      <td><span className="mono" style={{fontSize:13}}>{s.barcode}</span></td>
                      <td style={{fontSize:13,color:'var(--text2)'}}>{s.scanned_by_name || '—'}</td>
                      <td style={{fontSize:12,color:'var(--text2)'}}>{new Date(s.scanned_at).toLocaleTimeString()}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => handleUndoScan(s.asset_id)} title="Remove this scan">↩ Undo</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Close session modal */}
        {showClose && (
          <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowClose(false)}>
            <div className="modal">
              <div className="modal-header">
                <div className="modal-title">Close Inventory Session</div>
                <button className="modal-close" onClick={() => setShowClose(false)}>✕</button>
              </div>
              <p style={{ color:'var(--text2)', marginBottom:20, fontSize:13 }}>
                You have scanned <strong>{scannedCount}</strong> items. Closing will finalize the count.
                You can choose to mark unscanned assets as <strong style={{color:'var(--red)'}}>missing</strong>.
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <button className="btn btn-danger" onClick={() => handleCloseSession(true)}>
                  Close &amp; Mark All Unscanned as Missing
                </button>
                <button className="btn btn-ghost" onClick={() => handleCloseSession(false)}>
                  Close Without Marking Missing
                </button>
                <button className="btn btn-ghost" onClick={() => setShowClose(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── RESULTS VIEW ────────────────────────────────────────────────────────
  if (view === 'results') {
    const scanned = sessionDetail?.scanned || [];
    const missing = sessionDetail?.missing || [];

    return (
      <div className="page">
        <div className="page-header">
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setView('list'); loadSessions(); }}>← Sessions</button>
            <div>
              <div className="page-title">{activeSession?.name}</div>
              <div className="page-subtitle">
                {activeSession?.status === 'open' ? '🟢 Session in progress' : `✓ Closed ${sessionDetail?.closed_at ? new Date(sessionDetail.closed_at).toLocaleDateString() : ''}`}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {activeSession?.status === 'open' && (
              <button className="btn btn-primary" onClick={() => setView('scan')}>📷 Continue Scanning</button>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid-3" style={{ marginBottom:20 }}>
          {[
            { label:'Items Scanned',   value: scanned.length,        color:'var(--green)'  },
            { label:'Items Missing',   value: missing.length,        color: missing.length > 0 ? 'var(--red)' : 'var(--text2)' },
            { label:'Auto Checked-In', value: scanned.filter(s=>s.asset_status==='checked_out').length, color:'var(--accent)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-value" style={{color:s.color}}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Scanned */}
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-title">✅ Confirmed Present ({scanned.length})</div>
          {scanned.length === 0 ? <div className="empty-state" style={{padding:20}}><p>No items scanned</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Equipment</th><th>Barcode</th><th>Serial #</th><th>Scanned By</th><th>Time</th></tr></thead>
                <tbody>
                  {scanned.map(s => (
                    <tr key={s.id}>
                      <td><div className="table-name">{s.model_name}</div><div className="table-sub">{s.category_name}</div></td>
                      <td><span className="mono" style={{fontSize:13}}>{s.barcode}</span></td>
                      <td style={{fontSize:13,color:'var(--text2)'}}>{s.serial_number||'—'}</td>
                      <td style={{fontSize:13,color:'var(--text2)'}}>{s.scanned_by_name||'—'}</td>
                      <td style={{fontSize:12,color:'var(--text2)'}}>{new Date(s.scanned_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Missing */}
        {activeSession?.status === 'closed' && (
          <div className="card" style={{ border: missing.length > 0 ? '1px solid rgba(239,68,68,.3)' : undefined }}>
            <div className="card-title" style={{color: missing.length > 0 ? 'var(--red)' : undefined}}>
              {missing.length > 0 ? `⚠️ Not Scanned / Missing (${missing.length})` : '✅ All Items Accounted For'}
            </div>
            {missing.length === 0 ? (
              <p style={{color:'var(--text2)',fontSize:13}}>Every asset was scanned in this session.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Equipment</th><th>Barcode</th><th>Serial #</th><th>Status</th></tr></thead>
                  <tbody>
                    {missing.map(a => (
                      <tr key={a.id}>
                        <td><div className="table-name">{a.model_name}</div><div className="table-sub">{a.category_name}</div></td>
                        <td><span className="mono" style={{fontSize:13}}>{a.barcode}</span></td>
                        <td style={{fontSize:13,color:'var(--text2)'}}>{a.serial_number||'—'}</td>
                        <td><span className={`badge ${a.status==='missing'?'badge-red':'badge-gray'}`}>{a.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeSession?.status === 'open' && (
          <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button className="btn btn-danger" onClick={() => setShowClose(true)}>Close Session</button>
            {showClose && (
              <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowClose(false)}>
                <div className="modal">
                  <div className="modal-header"><div className="modal-title">Close Session</div><button className="modal-close" onClick={()=>setShowClose(false)}>✕</button></div>
                  <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:8}}>
                    <button className="btn btn-danger" onClick={() => handleCloseSession(true)}>Close &amp; Mark All Unscanned as Missing</button>
                    <button className="btn btn-ghost" onClick={() => handleCloseSession(false)}>Close Without Marking Missing</button>
                    <button className="btn btn-ghost" onClick={()=>setShowClose(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
