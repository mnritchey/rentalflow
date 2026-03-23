import './index.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetail from './pages/ProjectDetail';
import ScanPage from './pages/ScanPage';
import EquipmentPage from './pages/EquipmentPage';
import ModelDetail from './pages/ModelDetail';
import ContactsPage from './pages/ContactsPage';
import SettingsPage from './pages/SettingsPage';
import MaintenancePage from './pages/MaintenancePage';
import ImportExportPage from './pages/ImportExportPage';
import LabelPrintPage from './pages/LabelPrintPage';
import ActivityPage from './pages/ActivityPage';
import InventoryPage from './pages/InventoryPage';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text2)', fontSize:16 }}>
      Loading...
    </div>
  );
  return user ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="scan" element={<ScanPage />} />
              <Route path="scan/:projectId" element={<ScanPage />} />
              <Route path="equipment" element={<EquipmentPage />} />
              <Route path="equipment/:id" element={<ModelDetail />} />
              <Route path="equipment/:id/labels" element={<LabelPrintPage />} />
              <Route path="labels" element={<LabelPrintPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="maintenance" element={<MaintenancePage />} />
              <Route path="import-export" element={<ImportExportPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="inventory" element={<InventoryPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
