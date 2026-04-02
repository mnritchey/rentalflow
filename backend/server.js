const express = require('express');
const cors = require('cors');
const expressWs = require('express-ws');

const app = express();
expressWs(app);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static('/data/uploads'));

// WebSocket for real-time updates
const wsClients = new Set();
app.ws('/ws', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data });
  wsClients.forEach(ws => { try { ws.send(msg); } catch {} });
}
app.set('broadcast', broadcast);

// API Routes — all must be registered before static/catch-all
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/equipment',   require('./routes/equipment'));
app.use('/api/assets',      require('./routes/assets'));
app.use('/api/projects',    require('./routes/projects'));
app.use('/api/contacts',    require('./routes/contacts'));
app.use('/api/scan',        require('./routes/scan'));
app.use('/api/reports',     require('./routes/reports'));
app.use('/api/settings',    require('./routes/settings'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/io',          require('./routes/importexport'));
app.use('/api/inventory',   require('./routes/inventory'));
app.use('/api/tasks',       require('./routes/tasks'));
app.use('/api/licenses',    require('./routes/licenses'));

// 404 handler for unmatched /api/* routes — returns JSON, not HTML
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Serve built React frontend
app.use(express.static('/app/frontend'));

// SPA fallback — only for non-API GET requests
app.get('*', (req, res) => {
  res.sendFile('/app/frontend/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RentalFlow running on port ${PORT}`));
