import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import EventCalendarPage from './pages/EventCalendarPage';
import EventCreatePage from './pages/EventCreatePage';
import EventDetailPage from './pages/EventDetailPage';
import AirfieldDetailPage from './pages/AirfieldDetailPage';
import AirfieldCreatePage from './pages/AirfieldCreatePage';
import SeasonCreatePage from './pages/SeasonCreatePage';
import ManifestManagementPage from './pages/ManifestManagementPage';
import ParticipantOnboardingPage from './pages/ParticipantOnboardingPage';
import ParticipantCreatePage from './pages/ParticipantCreatePage';
import ParticipantDetailPage from './pages/ParticipantDetailPage';
import LogisticsDashboardPage from './pages/LogisticsDashboardPage';
import LogisticsCreatePage from './pages/LogisticsCreatePage';
import LogisticsDetailPage from './pages/LogisticsDetailPage';
import LogisticsSummaryPage from './pages/LogisticsSummaryPage';
import LogisticsAccommodationsPage from './pages/LogisticsAccommodationsPage';
import LogisticsAccommodationCreatePage from './pages/LogisticsAccommodationCreatePage';
import LogisticsMealsPage from './pages/LogisticsMealsPage';
import LogisticsMealCreatePage from './pages/LogisticsMealCreatePage';
import LogisticsMealDetailPage from './pages/LogisticsMealDetailPage';
import LogisticsOthersPage from './pages/LogisticsOthersPage';
import LogisticsOtherCreatePage from './pages/LogisticsOtherCreatePage';
import LogisticsOtherDetailPage from './pages/LogisticsOtherDetailPage';
import EventSchedulePage from './pages/EventSchedulePage';
import VehicleDetailPage from './pages/VehicleDetailPage';
import InnhoppDetailPage from './pages/InnhoppDetailPage';
import ManifestDetailPage from './pages/ManifestDetailPage';
import AccommodationDetailPage from './pages/AccommodationDetailPage';

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/events" replace />} />
        <Route path="events" element={<EventCalendarPage />} />
        <Route path="events/new" element={<EventCreatePage />} />
        <Route path="events/:eventId" element={<EventSchedulePage />} />
        <Route path="events/:eventId/details" element={<EventDetailPage />} />
        <Route path="events/:eventId/accommodations/:accommodationId" element={<AccommodationDetailPage />} />
        <Route path="events/:eventId/innhopps/new" element={<InnhoppDetailPage />} />
        <Route path="events/:eventId/innhopps/:innhoppId" element={<InnhoppDetailPage />} />
        <Route path="airfields/new" element={<AirfieldCreatePage />} />
        <Route path="airfields/:airfieldId" element={<AirfieldDetailPage />} />
        <Route path="seasons/new" element={<SeasonCreatePage />} />
        <Route path="manifests" element={<ManifestManagementPage />} />
        <Route path="manifests/:manifestId" element={<ManifestDetailPage />} />
        <Route path="participants" element={<ParticipantOnboardingPage />} />
        <Route path="participants/new" element={<ParticipantCreatePage />} />
        <Route path="participants/:participantId" element={<ParticipantDetailPage />} />
        <Route path="logistics" element={<LogisticsSummaryPage />} />
        <Route path="logistics/transport" element={<LogisticsDashboardPage />} />
        <Route path="logistics/accommodations" element={<LogisticsAccommodationsPage />} />
        <Route path="logistics/accommodations/new" element={<LogisticsAccommodationCreatePage />} />
        <Route path="logistics/meals" element={<LogisticsMealsPage />} />
        <Route path="logistics/meals/new" element={<LogisticsMealCreatePage />} />
        <Route path="logistics/meals/:mealId" element={<LogisticsMealDetailPage />} />
        <Route path="logistics/others" element={<LogisticsOthersPage />} />
        <Route path="logistics/others/new" element={<LogisticsOtherCreatePage />} />
        <Route path="logistics/others/:otherId" element={<LogisticsOtherDetailPage />} />
        <Route path="logistics/new" element={<LogisticsCreatePage />} />
        <Route path="logistics/:transportId" element={<LogisticsDetailPage />} />
        <Route path="logistics/vehicles/:vehicleId" element={<VehicleDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
