import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import EventCalendarPage from './pages/EventCalendarPage';
import EventCreatePage from './pages/EventCreatePage';
import EventDetailPage from './pages/EventDetailPage';
import SeasonCreatePage from './pages/SeasonCreatePage';
import ManifestManagementPage from './pages/ManifestManagementPage';
import ParticipantOnboardingPage from './pages/ParticipantOnboardingPage';
import ParticipantCreatePage from './pages/ParticipantCreatePage';
import ParticipantDetailPage from './pages/ParticipantDetailPage';
import LogisticsDashboardPage from './pages/LogisticsDashboardPage';

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/events" replace />} />
        <Route path="events" element={<EventCalendarPage />} />
        <Route path="events/new" element={<EventCreatePage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />
        <Route path="seasons/new" element={<SeasonCreatePage />} />
        <Route path="manifests" element={<ManifestManagementPage />} />
        <Route path="participants" element={<ParticipantOnboardingPage />} />
        <Route path="participants/new" element={<ParticipantCreatePage />} />
        <Route path="participants/:participantId" element={<ParticipantDetailPage />} />
        <Route path="logistics" element={<LogisticsDashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
