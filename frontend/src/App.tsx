import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import ParticipantRouteGuard from './auth/ParticipantRouteGuard';
import StaffRouteGuard from './auth/StaffRouteGuard';
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
import MyProfilePage from './pages/MyProfilePage';
import LogisticsDashboardPage from './pages/LogisticsDashboardPage';
import LogisticsCreatePage from './pages/LogisticsCreatePage';
import LogisticsDetailPage from './pages/LogisticsDetailPage';
import LogisticsGroundCrewDashboardPage from './pages/LogisticsGroundCrewDashboardPage';
import LogisticsGroundCrewCreatePage from './pages/LogisticsGroundCrewCreatePage';
import LogisticsGroundCrewDetailPage from './pages/LogisticsGroundCrewDetailPage';
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
import InnhoppCsvPage from './pages/InnhoppCsvPage';
import PublicEventRegistrationPage from './pages/PublicEventRegistrationPage';
import EventRegistrationsPage from './pages/EventRegistrationsPage';
import RegistrationDetailPage from './pages/RegistrationDetailPage';
import EventCommsPage from './pages/EventCommsPage';
import CommunicationsPage from './pages/CommunicationsPage';

const App = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register/:slug" element={<PublicEventRegistrationPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/events" replace />} />
          <Route path="events" element={<EventCalendarPage />} />
          <Route path="communications" element={<ParticipantRouteGuard><CommunicationsPage /></ParticipantRouteGuard>} />
          <Route path="events/new" element={<ParticipantRouteGuard><EventCreatePage /></ParticipantRouteGuard>} />
          <Route path="events/:eventId" element={<EventSchedulePage />} />
          <Route path="events/:eventId/details" element={<ParticipantRouteGuard eventParam="eventId"><EventDetailPage /></ParticipantRouteGuard>} />
          <Route path="events/:eventId/registrations" element={<ParticipantRouteGuard eventParam="eventId"><EventRegistrationsPage /></ParticipantRouteGuard>} />
          <Route path="events/:eventId/comms" element={<ParticipantRouteGuard eventParam="eventId"><EventCommsPage /></ParticipantRouteGuard>} />
          <Route path="registrations/:registrationId" element={<ParticipantRouteGuard><RegistrationDetailPage /></ParticipantRouteGuard>} />
          <Route path="events/:eventId/accommodations/:accommodationId" element={<ParticipantRouteGuard eventParam="eventId"><AccommodationDetailPage /></ParticipantRouteGuard>} />
          <Route path="events/:eventId/innhopps/new" element={<ParticipantRouteGuard eventParam="eventId"><InnhoppDetailPage /></ParticipantRouteGuard>} />
          <Route path="events/:eventId/innhopps/:innhoppId" element={<ParticipantRouteGuard eventParam="eventId"><InnhoppDetailPage /></ParticipantRouteGuard>} />
          <Route path="innhopps/csv" element={<StaffRouteGuard><InnhoppCsvPage /></StaffRouteGuard>} />
          <Route path="airfields/new" element={<ParticipantRouteGuard><AirfieldCreatePage /></ParticipantRouteGuard>} />
          <Route path="airfields/:airfieldId" element={<ParticipantRouteGuard><AirfieldDetailPage /></ParticipantRouteGuard>} />
          <Route path="seasons/new" element={<ParticipantRouteGuard><SeasonCreatePage /></ParticipantRouteGuard>} />
          <Route path="manifests" element={<ParticipantRouteGuard><ManifestManagementPage /></ParticipantRouteGuard>} />
          <Route path="manifests/:manifestId" element={<ParticipantRouteGuard><ManifestDetailPage /></ParticipantRouteGuard>} />
          <Route path="participants" element={<ParticipantRouteGuard><ParticipantOnboardingPage /></ParticipantRouteGuard>} />
          <Route path="participants/new" element={<ParticipantRouteGuard><ParticipantCreatePage /></ParticipantRouteGuard>} />
          <Route path="participants/:participantId" element={<ParticipantRouteGuard><ParticipantDetailPage /></ParticipantRouteGuard>} />
          <Route path="profile" element={<MyProfilePage />} />
          <Route path="logistics" element={<ParticipantRouteGuard><LogisticsSummaryPage /></ParticipantRouteGuard>} />
          <Route path="logistics/transport" element={<ParticipantRouteGuard><LogisticsDashboardPage /></ParticipantRouteGuard>} />
          <Route path="logistics/ground-crew" element={<ParticipantRouteGuard><LogisticsGroundCrewDashboardPage /></ParticipantRouteGuard>} />
          <Route path="logistics/ground-crew/new" element={<ParticipantRouteGuard><LogisticsGroundCrewCreatePage /></ParticipantRouteGuard>} />
          <Route path="logistics/ground-crew/:groundCrewId" element={<ParticipantRouteGuard><LogisticsGroundCrewDetailPage /></ParticipantRouteGuard>} />
          <Route path="logistics/accommodations" element={<ParticipantRouteGuard><LogisticsAccommodationsPage /></ParticipantRouteGuard>} />
          <Route path="logistics/accommodations/new" element={<ParticipantRouteGuard><LogisticsAccommodationCreatePage /></ParticipantRouteGuard>} />
          <Route path="logistics/meals" element={<ParticipantRouteGuard><LogisticsMealsPage /></ParticipantRouteGuard>} />
          <Route path="logistics/meals/new" element={<ParticipantRouteGuard><LogisticsMealCreatePage /></ParticipantRouteGuard>} />
          <Route path="logistics/meals/:mealId" element={<ParticipantRouteGuard><LogisticsMealDetailPage /></ParticipantRouteGuard>} />
          <Route path="logistics/others" element={<ParticipantRouteGuard><LogisticsOthersPage /></ParticipantRouteGuard>} />
          <Route path="logistics/others/new" element={<ParticipantRouteGuard><LogisticsOtherCreatePage /></ParticipantRouteGuard>} />
          <Route path="logistics/others/:otherId" element={<ParticipantRouteGuard><LogisticsOtherDetailPage /></ParticipantRouteGuard>} />
          <Route path="logistics/new" element={<ParticipantRouteGuard><LogisticsCreatePage /></ParticipantRouteGuard>} />
          <Route path="logistics/:transportId" element={<ParticipantRouteGuard><LogisticsDetailPage /></ParticipantRouteGuard>} />
          <Route path="logistics/vehicles/:vehicleId" element={<ParticipantRouteGuard><VehicleDetailPage /></ParticipantRouteGuard>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
