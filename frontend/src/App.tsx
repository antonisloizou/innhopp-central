import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import EventCalendarPage from './pages/EventCalendarPage';
import ManifestManagementPage from './pages/ManifestManagementPage';
import ParticipantOnboardingPage from './pages/ParticipantOnboardingPage';
import LogisticsDashboardPage from './pages/LogisticsDashboardPage';

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/events" replace />} />
        <Route path="events" element={<EventCalendarPage />} />
        <Route path="manifests" element={<ManifestManagementPage />} />
        <Route path="participants" element={<ParticipantOnboardingPage />} />
        <Route path="logistics" element={<LogisticsDashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
