import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../utils/api';

const LABEL_SIZES = [
  { id:'62mm',   name:'62mm Continuous (Standard)', width:696, height:165,  desc:'DK-22205' },
  { id:'29mm',   name:'29mm Continuous (Narrow)',   width:306, height:165,  desc:'DK-22210' },
  { id:'62x29',  name:'62mm × 29mm (Die-cut small)',width:696, height:336,  desc:'DK-11209' },
  { id:'62x100', name:'62mm × 100mm (Large)',        width:696, height:1109, desc:'DK-11202' },
];

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function ensureLibs() {
  await Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'),
  ]);
}

export default function LabelPrintPage() {
  const { id: routeModelId } = useParams();

  const [models, setModels]               = useState([]);
  const [selectedModel, setSelectedModel] = useState(routeModelId || '');
  const [assets, setAssets]               = useState([]);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [previewAsset, setPreviewAsset]   = useState(null);

  const [labelType, setLabelType] = useState('barcode');
  const [labelSize, setLabelSize] = useState('62mm');
  const [showName, setShowName]   = useState(true);
  const [showText, setShowText]   = useState(true);
  const [showLogo, setShowLogo]   = useState(false);
  const [copies, setCopies]       = useState(1);

  const [companyLogo, setCompanyLogo] = useState(null);

  useEffect(() => {
    api.get('/equipment/models').then(setModels);
    api.get('/settings').then(s => { if (s.logo_path) setCompanyLogo(s.logo_path); });
    ensureLibs();
  }, []);

  useEffect(() => {
    if (!selectedModel) { setAssets([]); setSelectedAssets([]); setPreviewAsset(null); return; }
    api.get(`/equipment/models/${selectedModel}`).then(data => {
      const a = data.assets || [];
      setAssets(a);
      setSelectedAssets(a.map(x => x.id));
      if (a.length > 0) setPreviewAsset(a[0]);
    });
  }, [selectedModel]);

  const sz        = LABEL_SIZES.find(s => s.id === labelSize) || LABEL_SIZES[0];
  const modelName = models.find(m => m.id === selectedModel)?.name || '';
  const hasLogo   = showLogo && !!companyLogo;

  const toggleAsset = (id) =>
    setSelectedAssets(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── Live preview component ────────────────────────────────────────────────
  function PreviewLabel({ asset }) {
    const bcRef  = useRef(null);
    const qrRef  = useRef(null);

    useEffect(() => {
      if (!asset) return;
      ensureLibs().then(() => {
        if ((labelType === 'barcode' || labelType === 'both') && bcRef.current && window.JsBarcode) {
          try {
            window.JsBarcode(bcRef.current, asset.barcode, {
              format:'CODE128', width:1.5, height:36, displayValue:showText, fontSize:9, margin:2,
            });
          } catch {}
        }
        if ((labelType === 'qrcode' || labelType === 'both') && qrRef.current && window.QRCode) {
          qrRef.current.innerHTML = '';
          try {
            new window.QRCode(qrRef.current, {
              text:asset.barcode, width:54, height:54, correctLevel:window.QRCode?.CorrectLevel?.M,
            });
          } catch {}
        }
      });
    }, [asset?.barcode, labelType, showText, labelSize]);

    if (!asset) return null;
    const scale = Math.min(320 / sz.width, 160 / sz.height);
    const pw    = Math.round(sz.width  * scale);
    const ph    = Math.round(sz.height * scale);

    // logo column width = 28% of label when present
    const logoColW = hasLogo ? Math.round(pw * 0.28) : 0;

    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
        <div style={{ fontSize:11, color:'var(--text2)' }}>{sz.width}×{sz.height}px · {sz.desc}</div>
        <div style={{
          width:pw, height:ph, border:'2px solid var(--border)', borderRadius:4,
          background:'white', display:'flex', flexDirection:'row',
          overflow:'hidden',
        }}>
          {/* Logo column */}
          {hasLogo && (
            <div style={{
              width: logoColW, minWidth: logoColW, height:'100%',
              display:'flex', alignItems:'center', justifyContent:'center',
              borderRight:'1px solid #e2e8f0', padding:4,
              background:'white',
            }}>
              <img src={companyLogo} alt="logo"
                style={{ maxWidth:'100%', maxHeight:'80%', objectFit:'contain' }} />
            </div>
          )}
          {/* Barcode/info column */}
          <div style={{
            flex:1, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', padding:4, gap:2, overflow:'hidden',
          }}>
            {showName && (
              <div style={{
                fontSize:Math.max(7, Math.round(ph * 0.11)), fontWeight:700,
                color:'#1e293b', fontFamily:'Arial', textAlign:'center',
                maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>{modelName}</div>
            )}
            {(labelType === 'barcode' || labelType === 'both') && (
              <svg ref={bcRef} style={{ maxWidth:'100%' }} />
            )}
            {(labelType === 'qrcode' || labelType === 'both') && (
              <div ref={qrRef} style={{ display:'flex', justifyContent:'center' }} />
            )}
          </div>
        </div>
        <div style={{ fontSize:11, color:'var(--text2)', fontFamily:'monospace' }}>{asset.barcode}</div>
      </div>
    );
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = async () => {
    await ensureLibs();
    const printAssets = assets.filter(a => selectedAssets.includes(a.id));
    if (!printAssets.length) return;

    const logoAbsURL = (hasLogo && companyLogo) ? `${window.location.origin}${companyLogo}` : null;
    // logo column = 25% of label width when shown
    const logoColPct = logoAbsURL ? 25 : 0;

    const allLabels = [];
    printAssets.forEach(asset => {
      for (let c = 0; c < copies; c++) {
        allLabels.push({
          asset,
          barcodeId: `bc-${asset.id}-${c}-${Date.now()}`,
          qrId:      `qr-${asset.id}-${c}-${Date.now()}`,
        });
      }
    });

    const bcH    = Math.round(sz.height * 0.40);
    const bcFS   = Math.max(9, Math.round(sz.height * 0.085));
    const qrSize = Math.min(Math.round(sz.height * 0.68), Math.round(sz.width * (1 - logoColPct/100) * 0.45));
    const nameFS = Math.max(10, Math.round(sz.height * 0.105));

    const logoHtml = logoAbsURL
      ? `<div class="logo-col"><img src="${logoAbsURL}" class="logo-img"></div>`
      : '';

    const labelsHTML = allLabels.map(({ asset, barcodeId, qrId }) => `
      <div class="label">
        ${logoHtml}
        <div class="info-col">
          ${showName ? `<div class="lname">${modelName}</div>` : ''}
          ${labelType==='barcode'||labelType==='both' ? `<svg id="${barcodeId}" class="bc"></svg>` : ''}
          ${labelType==='qrcode' ||labelType==='both' ? `<div id="${qrId}"  class="qr"></div>` : ''}
        </div>
      </div>`).join('');

    const initJS = allLabels.map(({ asset, barcodeId, qrId }) => `
      ${labelType==='barcode'||labelType==='both' ? `
        try { JsBarcode("#${barcodeId}", ${JSON.stringify(asset.barcode)}, {
          format:"CODE128", width:2, height:${bcH},
          displayValue:${showText}, fontSize:${bcFS}, margin:4
        }); } catch(e){}
      ` : ''}
      ${labelType==='qrcode'||labelType==='both' ? `
        try { new QRCode(document.getElementById(${JSON.stringify(qrId)}), {
          text:${JSON.stringify(asset.barcode)}, width:${qrSize}, height:${qrSize},
          correctLevel:QRCode.CorrectLevel.M
        }); } catch(e){}
      ` : ''}
    `).join('\n');

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Labels</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"><\/script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#fff}
        .label{
          width:${sz.width}px; height:${sz.height}px;
          display:flex; flex-direction:row;
          overflow:hidden;
          page-break-after:always; break-after:page;
        }
        .logo-col{
          width:${logoColPct}%; min-width:${logoColPct}%; height:100%;
          display:flex; align-items:center; justify-content:center;
          border-right:1px solid #e0e0e0; padding:6px;
          background:white;
        }
        .logo-img{ max-width:100%; max-height:80%; object-fit:contain; display:block; }
        .info-col{
          flex:1; display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          padding:6px; gap:2px; overflow:hidden;
        }
        .lname{
          font-family:Arial,sans-serif; font-size:${nameFS}px;
          font-weight:700; text-align:center; max-width:100%;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:2px;
        }
        .bc{ max-width:100%; }
        .qr{ display:flex; justify-content:center; }
        .no-print{
          background:#1e293b;color:#fff;padding:12px 20px;
          display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;
        }
        .no-print button{background:#10b981;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:14px}
        @media print{
          @page{margin:0}
          .no-print{display:none}
          body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        }
      </style>
    </head><body>
      <div class="no-print">
        <span style="font-weight:600">${printAssets.length} asset(s) × ${copies} cop${copies===1?'y':'ies'} = ${allLabels.length} label(s)</span>
        <button onclick="window.print()">🖨 Print to P-touch</button>
      </div>
      ${labelsHTML}
      <script>window.onload=function(){${initJS}};<\/script>
    </body></html>`);
    win.document.close();
  };

  return (
    <div className="page" style={{ maxWidth:900 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Print Asset Labels</div>
          <div className="page-subtitle">Brother P-touch compatible</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems:'start', gap:20 }}>
        {/* Left — settings */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card">
            <div className="card-title">Label Settings</div>

            <div className="form-group">
              <label className="form-label">Label Size</label>
              <select className="form-select" value={labelSize} onChange={e => setLabelSize(e.target.value)}>
                {LABEL_SIZES.map(s => <option key={s.id} value={s.id}>{s.name} — {s.desc}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Code Type</label>
              <div style={{ display:'flex', gap:8 }}>
                {[['barcode','📊 Barcode'],['qrcode','◻ QR Code'],['both','Both']].map(([v,l]) => (
                  <button key={v} className={`btn btn-sm ${labelType===v?'btn-primary':'btn-ghost'}`}
                    onClick={() => setLabelType(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Options</label>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                  <input type="checkbox" checked={showName} onChange={e => setShowName(e.target.checked)} />
                  Show model name
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                  <input type="checkbox" checked={showText} onChange={e => setShowText(e.target.checked)} />
                  Show barcode number text
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13,
                  opacity: companyLogo ? 1 : 0.45 }}>
                  <input type="checkbox" checked={showLogo} onChange={e => setShowLogo(e.target.checked)}
                    disabled={!companyLogo} />
                  Show logo (left column)
                  {!companyLogo && <span style={{ fontSize:11, color:'var(--text2)' }}> — upload in Settings first</span>}
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Copies per asset</label>
              <input className="form-input" type="number" min={1} max={20}
                value={copies} onChange={e => setCopies(Math.max(1, parseInt(e.target.value)||1))}
                style={{ width:80 }} />
            </div>
          </div>

          <div className="card">
            <div className="card-title">Select Equipment</div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <select className="form-select" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                <option value="">Choose a model...</option>
                {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.total_assets} assets)</option>)}
              </select>
            </div>
            {assets.length > 0 && (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:12, color:'var(--text2)' }}>{selectedAssets.length} / {assets.length} selected</span>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedAssets(assets.map(a=>a.id))}>All</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedAssets([])}>None</button>
                  </div>
                </div>
                <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
                  {assets.map(a => (
                    <label key={a.id} style={{
                      display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                      cursor:'pointer', borderBottom:'1px solid var(--border)',
                    }} onMouseEnter={() => setPreviewAsset(a)}>
                      <input type="checkbox" checked={selectedAssets.includes(a.id)} onChange={() => toggleAsset(a.id)} />
                      <span className="mono" style={{ fontSize:13 }}>{a.barcode}</span>
                      {a.serial_number && <span style={{ fontSize:11, color:'var(--text2)' }}>{a.serial_number}</span>}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            className="btn btn-primary btn-lg"
            style={{ justifyContent:'center' }}
            onClick={handlePrint}
            disabled={!selectedAssets.length}
          >
            🖨 Print {selectedAssets.length * copies || 0} Label{selectedAssets.length * copies !== 1 ? 's' : ''}
          </button>
          <p style={{ fontSize:12, color:'var(--text2)', textAlign:'center', marginTop:-8 }}>
            Opens a new window — select your P-touch in the browser print dialog
          </p>
        </div>

        {/* Right — preview + tips */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card" style={{ position:'sticky', top:20 }}>
            <div className="card-title">Live Preview</div>
            {previewAsset && selectedModel ? (
              <PreviewLabel asset={previewAsset} />
            ) : (
              <div className="empty-state" style={{ padding:'40px 20px' }}>
                <div className="icon">🏷</div>
                <p>Select a model to preview</p>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">P-touch Print Tips</div>
            <ul style={{ fontSize:13, color:'var(--text2)', paddingLeft:18, lineHeight:2 }}>
              <li>Use <strong style={{color:'var(--text)'}}>Chrome</strong> or <strong style={{color:'var(--text)'}}>Edge</strong></li>
              <li>Print dialog → <strong style={{color:'var(--text)'}}>Margins: None</strong></li>
              <li>Disable <strong style={{color:'var(--text)'}}>Headers and footers</strong></li>
              <li><strong style={{color:'var(--text)'}}>Scale: 100%</strong></li>
              <li>Select your Brother P-touch printer</li>
              {!companyLogo && <li style={{color:'var(--amber)'}}>Upload logo in Settings to enable it on labels</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
