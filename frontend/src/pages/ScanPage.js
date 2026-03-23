import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { playSound } from '../utils/audio';

export default function ScanPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [mode, setMode] = useState('checkout');
  const [scanLog, setScanLog] = useState([]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [conflict, setConflict] = useState(null);
  const inputRef = useRef(null);

  // Use refs for values needed inside the async handler to avoid stale closures
  const modeRef = useRef(mode);
  const pendingBarcodeRef = useRef(pendingBarcode);
  const conflictRef = useRef(conflict);
  const processingRef = useRef(false);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { pendingBarcodeRef.current = pendingBarcode; }, [pendingBarcode]);
  useEffect(() => { conflictRef.current = conflict; }, [conflict]);

  const load = () => projectId && api.get(`/projects/${projectId}`).then(setProject);
  useEffect(() => { load(); }, [projectId]);

  // Keep focus on input always
  useEffect(() => {
    const interval = setInterval(() => {
      if (inputRef.current) inputRef.current.focus();
    }, 300);
    return () => clearInterval(interval);
  }, []);

  const addLog = useCallback((entry) => {
    setScanLog(prev => [entry, ...prev].slice(0, 100));
  }, []);

  const handleScan = useCallback(async (barcode) => {
    const trimmed = barcode.trim();
    if (!trimmed) return;

    // Guard against double-fire using a ref (not state) to avoid stale closures
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);
    setInput('');

    try {
      const pending = pendingBarcodeRef.current;
      const currentConflict = conflictRef.current;

      // Re-scan of same barcode → confirm transfer
      if (pending && pending === trimmed) {
        const res = await api.post('/scan', {
          barcode: trimmed,
          project_id: projectId,
          action: 'checkout',
          force_checkin_project_id: currentConflict?.current_project_id
        });
        playSound(res.sound);
        addLog({ barcode: trimmed, message: res.message, type: res.success ? 'success' : 'error', time: new Date().toLocaleTimeString() });
        if (res.success) load();
        setPendingBarcode(null);
        setConflict(null);
        return;
      }

      // Different barcode while transfer pending → cancel pending, process new
      if (pending) {
        addLog({ barcode: pending, message: 'Transfer cancelled — different item scanned', type: 'warning', time: new Date().toLocaleTimeString() });
        setPendingBarcode(null);
        setConflict(null);
      }

      const action = projectId ? modeRef.current : 'global_checkin';
      const res = await api.post('/scan', {
        barcode: trimmed,
        project_id: projectId || null,
        action
      });

      playSound(res.sound);

      if (res.requires_action && res.action_type === 'already_checked_out') {
        setConflict(res);
        setPendingBarcode(trimmed);
        addLog({
          barcode: trimmed,
          message: res.message + ' — Scan same barcode again to transfer.',
          type: 'warning',
          time: new Date().toLocaleTimeString()
        });
        return;
      }

      addLog({
        barcode: trimmed,
        message: res.message,
        type: res.success ? 'success' : (res.sound === 'warning' ? 'warning' : 'error'),
        time: new Date().toLocaleTimeString()
      });
      if (res.success) load();

    } catch (err) {
      addLog({ barcode: trimmed, message: `Error: ${err.message || 'Network error'}`, type: 'error', time: new Date().toLocaleTimeString() });
      playSound('error');
    } finally {
      processingRef.current = false;
      setProcessing(false);
      // Re-focus input after every scan
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [projectId, addLog]);

  const cancelTransfer = () => {
    addLog({ barcode: pendingBarcodeRef.current, message: 'Transfer cancelled', type: 'warning', time: new Date().toLocaleTimeString() });
    setPendingBarcode(null);
    setConflict(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleScan(input);
  };

  const checkedOut = (project?.items || []).filter(i => i.status === 'checked_out');
  const checkedIn  = (project?.items || []).filter(i => i.status === 'checked_in');
  const booked     = (project?.items || []).filter(i => i.status === 'booked');

  const isGlobal = !projectId;
  const borderColor = pendingBarcode ? 'var(--amber)' : isGlobal ? 'var(--green)' : (mode === 'checkout' ? 'var(--accent)' : 'var(--green)');

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {projectId
            ? <Link to={`/projects/${projectId}`} className="btn btn-ghost btn-sm">← Project</Link>
            : <Link to="/" className="btn btn-ghost btn-sm">← Dashboard</Link>
          }
          <div>
            <div className="page-title">{isGlobal ? 'Global Check-In' : 'Scan Station'}</div>
            <div className="page-subtitle">{isGlobal ? 'Return equipment from any project' : (project?.name || 'Loading...')}</div>
          </div>
        </div>
        {!isGlobal && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn ${mode === 'checkout' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setMode('checkout'); setPendingBarcode(null); setConflict(null); }}
            >📤 Check Out</button>
            <button
              className={`btn ${mode === 'checkin' ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => { setMode('checkin'); setPendingBarcode(null); setConflict(null); }}
            >📥 Check In</button>
          </div>
        )}
      </div>

      {/* Scan input card */}
      <div className="card" style={{ marginBottom: 16, border: `2px solid ${borderColor}`, transition: 'border-color 0.2s' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>
            {isGlobal ? '📥' : (mode === 'checkout' ? '📤' : '📥')}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {isGlobal ? 'Check In — Any Project' : (mode === 'checkout' ? 'Checking Out' : 'Checking In')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>
            {pendingBarcode
              ? <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                  ⚠ Scan <span className="mono">{pendingBarcode}</span> again to confirm transfer
                </span>
              : 'Scan barcodes or type and press Enter'
            }
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            className="form-input mono"
            style={{
              fontSize: 18,
              textAlign: 'center',
              letterSpacing: 2,
              background: pendingBarcode ? 'rgba(245,158,11,0.08)' : undefined
            }}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan or type barcode..."
            autoFocus
          />
          <button
            className="btn btn-primary btn-lg"
            onClick={() => handleScan(input)}
            disabled={!input.trim() || processing}
          >
            {processing ? '...' : 'Go'}
          </button>
        </div>

        {/* Transfer confirm banner */}
        {pendingBarcode && conflict && (
          <div style={{
            marginTop: 12, background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8,
            padding: '10px 14px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 10
          }}>
            <div>
              <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ Pending transfer: </span>
              <span style={{ fontSize: 13 }}>
                Scan <span className="mono" style={{ background: 'rgba(245,158,11,0.2)', padding: '1px 6px', borderRadius: 4 }}>
                  {pendingBarcode}
                </span> again to move from <strong>{conflict.current_project_name}</strong> to this project
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={cancelTransfer}>Cancel</button>
          </div>
        )}

        {/* Stats row for project scan */}
        {!isGlobal && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 14 }}>
            {[
              { label: 'Checked Out', value: checkedOut.length, color: 'var(--green)' },
              { label: 'Checked In',  value: checkedIn.length,  color: 'var(--text2)' },
              { label: 'Booked',      value: booked.length,     color: 'var(--amber)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '10px', background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scan feed */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Scan Log</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setScanLog([])}>Clear</button>
        </div>
        <div className="scan-feed">
          {scanLog.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text2)', fontSize: 13 }}>
              Scans will appear here...
            </div>
          ) : scanLog.map((entry, i) => (
            <div key={i} className={`scan-item ${entry.type}`}>
              <span className="scan-icon">
                {entry.type === 'success' ? '✅' : entry.type === 'warning' ? '⚠️' : '❌'}
              </span>
              <div className="scan-msg">{entry.message}</div>
              <span className="scan-time mono">{entry.barcode}</span>
              <span className="scan-time">{entry.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Equipment list */}
      {!isGlobal && (project?.items || []).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Project Equipment</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Equipment</th><th>Barcode</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(project.items || []).map(item => (
                  <tr key={item.id}>
                    <td><div className="table-name">{item.model_name}</div></td>
                    <td><span className="mono" style={{ fontSize: 13 }}>{item.barcode}</span></td>
                    <td>
                      <span className={`badge ${item.status === 'checked_out' ? 'badge-green' : item.status === 'checked_in' ? 'badge-gray' : 'badge-amber'}`}>
                        {item.status.replace('_', ' ')}
                      </span>
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
