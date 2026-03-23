import { useState, useRef } from 'react';
import { api } from '../utils/api';

const TYPES = [
  {
    key: 'categories',
    label: 'Categories',
    headers: 'name,color',
    example: 'Lighting,#f59e0b\nAudio,#3b82f6',
    required: ['name'],
    notes: 'Color is optional (defaults to purple). Duplicate names are skipped.',
  },
  {
    key: 'manufacturers',
    label: 'Manufacturers',
    headers: 'name,website,notes',
    example: 'Chauvet,https://chauvetdj.com,\nShure,https://shure.com,',
    required: ['name'],
    notes: 'Website and notes are optional. Duplicate names are skipped.',
  },
  {
    key: 'models',
    label: 'Equipment Models',
    headers: 'name,manufacturer,category,description,weight_kg,rental_price_day,replacement_value,notes',
    example: 'LED Par 64,Chauvet,Lighting,LED wash fixture,1.2,25,400,',
    required: ['name'],
    notes: 'Manufacturer and category must already exist (import those first). Duplicate model names are skipped.',
  },
  {
    key: 'assets',
    label: 'Assets / Barcodes',
    headers: 'barcode,model,serial_number,condition,location,purchase_date,purchase_price,notes',
    example: 'PAR001,LED Par 64,SN12345,excellent,Warehouse A,2023-01-01,380,',
    required: ['barcode', 'model'],
    notes: 'Model must already exist. Condition: excellent/good/fair/poor/damaged. Duplicate barcodes are skipped.',
  },
];

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line, lineIdx) => {
    const vals = [];
    let inQ = false, cur = '';
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const obj = { _lineNumber: lineIdx + 2 }; // +2 for header row + 1-indexed
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

// Result section component
function ResultPanel({ result }) {
  const [showSkipped, setShowSkipped] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showErrors, setShowErrors] = useState(true);

  if (!result) return null;

  const skippedCount  = result.skipped?.length  || 0;
  const warningItems  = (result.errors || []).filter(e => e.includes('warning:'));
  const errorItems    = (result.errors || []).filter(e => !e.includes('warning:'));
  const hasAnything   = skippedCount > 0 || warningItems.length > 0 || errorItems.length > 0;
  const allGood       = result.created > 0 && !hasAnything;
  const borderColor   = errorItems.length > 0 ? 'var(--red)' : skippedCount > 0 || warningItems.length > 0 ? 'var(--amber)' : 'var(--green)';

  return (
    <div className="card" style={{ marginTop: 20, border: `1px solid ${borderColor}` }}>
      <div className="card-title" style={{ marginBottom: 16 }}>Import Results</div>

      {/* Summary counters */}
      <div style={{ display: 'flex', gap: 24, marginBottom: hasAnything ? 20 : 0, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)' }}>{result.created}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created</div>
        </div>
        {skippedCount > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--amber)' }}>{skippedCount}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Skipped</div>
          </div>
        )}
        {warningItems.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--amber)' }}>{warningItems.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Warnings</div>
          </div>
        )}
        {errorItems.length > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>{errorItems.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Errors</div>
          </div>
        )}
      </div>

      {allGood && (
        <div style={{ color: 'var(--green)', fontSize: 14, fontWeight: 600 }}>
          ✅ All rows imported successfully.
        </div>
      )}

      {/* Skipped section */}
      {skippedCount > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowSkipped(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', color: 'var(--amber)', fontWeight: 700,
              fontSize: 13, padding: '4px 0', marginBottom: showSkipped ? 8 : 0,
            }}
          >
            <span style={{ fontSize: 11 }}>{showSkipped ? '▼' : '▶'}</span>
            ⏭ {skippedCount} row{skippedCount !== 1 ? 's' : ''} skipped (not imported)
          </button>
          {showSkipped && (
            <div style={{
              background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 8, overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(245,158,11,0.15)' }}>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--amber)', width: '35%' }}>Item</th>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--amber)' }}>Reason Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {result.skipped.map((s, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(245,158,11,0.2)' }}>
                      <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: 'var(--text)' }}>{s.identifier}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--amber)' }}>{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Warnings section */}
      {warningItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowWarnings(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', color: 'var(--amber)', fontWeight: 700,
              fontSize: 13, padding: '4px 0', marginBottom: showWarnings ? 8 : 0,
            }}
          >
            <span style={{ fontSize: 11 }}>{showWarnings ? '▼' : '▶'}</span>
            ⚠ {warningItems.length} warning{warningItems.length !== 1 ? 's' : ''} (imported with caveats)
          </button>
          {showWarnings && (
            <div style={{
              background: 'var(--amber-dim)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {warningItems.map((w, i) => {
                const [item, ...rest] = w.split(' warning: ');
                return (
                  <div key={i} style={{ fontSize: 12, color: 'var(--amber)', display: 'flex', gap: 8 }}>
                    <span style={{ flexShrink: 0 }}>⚠</span>
                    <span><strong>{item}</strong>{rest.length ? ` — ${rest.join(' warning: ')}` : ''}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Errors section */}
      {errorItems.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowErrors(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', color: 'var(--red)', fontWeight: 700,
              fontSize: 13, padding: '4px 0', marginBottom: showErrors ? 8 : 0,
            }}
          >
            <span style={{ fontSize: 11 }}>{showErrors ? '▼' : '▶'}</span>
            ❌ {errorItems.length} error{errorItems.length !== 1 ? 's' : ''} (rows not imported)
          </button>
          {showErrors && (
            <div style={{
              background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {errorItems.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--red)', display: 'flex', gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>•</span>
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImportExportPage() {
  const [activeType, setActiveType] = useState('categories');
  const [importing, setImporting]   = useState(false);
  const [result, setResult]         = useState(null);
  const [preview, setPreview]       = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [csvText, setCsvText]       = useState('');
  const fileRef = useRef(null);

  const typeInfo = TYPES.find(t => t.key === activeType);

  const switchType = (key) => {
    setActiveType(key);
    setPreview([]);
    setParsedRows([]);
    setCsvText('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExport = () => {
    const token = localStorage.getItem('token');
    fetch(`/api/io/export/${activeType}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.blob()).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${activeType}-export.csv`; a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const rows = parseCSV(text);
      setCsvText(text);
      setParsedRows(rows);
      setPreview(rows.slice(0, 5));
      setResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText || !parsedRows.length) return;
    setImporting(true);
    try {
      const res = await api.post(`/io/import/${activeType}`, { rows: parsedRows });
      setResult(res);
      setCsvText('');
      setParsedRows([]);
      setPreview([]);
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Import / Export</div>
          <div className="page-subtitle">Bulk manage your catalog via CSV files</div>
        </div>
      </div>

      {/* Type tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TYPES.map(t => (
          <button
            key={t.key}
            className={`btn ${activeType === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => switchType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>

        {/* Export */}
        <div className="card">
          <div className="card-title">⬇ Export {typeInfo.label}</div>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            Download all {typeInfo.label.toLowerCase()} as a CSV. Edit and re-import to make bulk changes.
          </p>
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Columns</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all' }}>{typeInfo.headers}</div>
          </div>
          <button className="btn btn-primary" onClick={handleExport}>⬇ Download CSV</button>
        </div>

        {/* Import */}
        <div className="card">
          <div className="card-title">⬆ Import {typeInfo.label}</div>

          {/* Notes */}
          <div style={{
            background: 'var(--accent-dim)', border: '1px solid rgba(108,99,255,0.25)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--text2)',
          }}>
            ℹ {typeInfo.notes}
          </div>

          {/* Required fields */}
          <div style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Required:
            </span>{' '}
            {typeInfo.required.map(f => (
              <span key={f} style={{
                background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 4,
                padding: '1px 6px', fontSize: 11, fontFamily: 'monospace', marginRight: 4,
              }}>{f}</span>
            ))}
          </div>

          {/* Example */}
          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Example</div>
            <pre className="mono" style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {typeInfo.headers}{'\n'}{typeInfo.example}
            </pre>
          </div>

          <div className="form-group">
            <label className="form-label">Select CSV File</label>
            <input
              ref={fileRef}
              className="form-input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
          </div>

          {/* Preview table */}
          {preview.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                Preview — first {preview.length} of {parsedRows.length} rows:
              </div>
              <div style={{ overflow: 'auto', maxHeight: 160, border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ fontSize: 11, width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {Object.keys(preview[0]).filter(k => k !== '_lineNumber').map(h => (
                        <th key={h} style={{ padding: '6px 8px', background: 'var(--surface2)', textAlign: 'left', whiteSpace: 'nowrap' }}>
                          {typeInfo.required.includes(h)
                            ? <span style={{ color: 'var(--red)' }}>{h}*</span>
                            : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {Object.entries(row)
                          .filter(([k]) => k !== '_lineNumber')
                          .map(([k, v], j) => (
                            <td key={j} style={{
                              padding: '5px 8px', borderTop: '1px solid var(--border)',
                              maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              color: !v && typeInfo.required.includes(k) ? 'var(--red)' : undefined,
                            }}>
                              {v || (typeInfo.required.includes(k) ? '⚠ empty' : '—')}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!parsedRows.length || importing}
          >
            {importing ? 'Importing...' : `⬆ Import ${parsedRows.length || 0} Row${parsedRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      <ResultPanel result={result} />
    </div>
  );
}
