import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CreateParticipantPayload,
  ParticipantProfile,
  getMyParticipantProfile,
  updateParticipantProfile,
  upsertMyParticipantProfile
} from '../api/participants';
import {
  claimPublicRegistration,
  completeExistingRegistrationOnboarding,
  getPublicNonJumperActivities,
  getPublicRegistrationEvent,
  listMyRegistrations,
  PublicRegistrationEvent,
  Registration,
  RegistrationEventDetails
} from '../api/registrations';
import ParticipantProfileForm, {
  createParticipantFormState,
  toParticipantPayload
} from '../components/ParticipantProfileForm';
import { useAuth } from '../auth/AuthProvider';
import { listEventSummaries } from '../api/events';
import { formatEventLocalDate } from '../utils/eventDate';
import ParticipantEventsCard from '../components/ParticipantEventsCard';
import { isProfileCompleteForRegistration } from '../utils/profileCompleteness';
import { isEventLaunchedOrLater } from '../utils/eventStatus';

const PENDING_PUBLIC_REGISTRATION_KEY = 'innhopp-pending-public-registration';

const MyProfilePage = () => {
  const { user, refreshSession } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ParticipantProfile | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [launchedEventIDs, setLaunchedEventIDs] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<CreateParticipantPayload>(
    createParticipantFormState(null, {
      full_name: user?.full_name || '',
      email: user?.email || ''
    })
  );
  const canManageAccountRoles = user?.roles?.includes('admin') ?? false;
  const hasAdminAccess = form.account_roles?.includes('admin') ?? false;
  const canUseManagedUpdate = canManageAccountRoles && !!profile?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [claimingRegistration, setClaimingRegistration] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<Pick<PublicRegistrationEvent, 'id' | 'name' | 'non_jumper_activities'> | null>(null);
  const [eventDetails, setEventDetails] = useState<RegistrationEventDetails>({
    attendance_type: '' as RegistrationEventDetails['attendance_type'],
    accommodation: '' as RegistrationEventDetails['accommodation'],
    payment_method: '' as RegistrationEventDetails['payment_method'],
    heard_about_project: '',
    heard_about_event: ''
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm((current) =>
      current.full_name || current.email
        ? current
        : createParticipantFormState(null, {
            full_name: user?.full_name || '',
            email: user?.email || ''
          })
    );
  }, [user?.email, user?.full_name]);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nextProfile, nextRegistrations, events] = await Promise.all([
          getMyParticipantProfile(),
          listMyRegistrations(),
          listEventSummaries()
        ]);
        if (!cancelled) {
          setProfile(nextProfile);
          setRegistrations(nextRegistrations);
          setLaunchedEventIDs(
            new Set(events.filter((event) => isEventLaunchedOrLater(event.status)).map((event) => event.id))
          );
          setForm(createParticipantFormState(nextProfile));
          setSaved(false);
        }
      } catch (err) {
        if (!cancelled) {
          const status = (err as Error & { status?: number })?.status;
          if (status === 404) {
            setProfile(null);
            setRegistrations([]);
            setForm(
              createParticipantFormState(null, {
                full_name: user?.full_name || '',
                email: user?.email || ''
              })
            );
            setSaved(false);
            setError(null);
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load profile');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.email, user?.full_name]);

  useEffect(() => {
    let cancelled = false;

    const loadPendingPublicRegistration = async () => {
      if (!user || !profile || !isProfileCompleteForRegistration(profile) || typeof window === 'undefined') return;
      const params = new URLSearchParams(location.search);
      if (user.pending_registration?.existing_registration) {
        const activities = await getPublicNonJumperActivities(user.pending_registration.event_id);
        setPendingEvent({ id: user.pending_registration.event_id, name: user.pending_registration.event_name, non_jumper_activities: activities });
        return;
      }
      const slug = user.pending_registration?.event_slug
        || params.get('registrationSlug')?.trim()
        || window.sessionStorage.getItem(PENDING_PUBLIC_REGISTRATION_KEY)?.trim();
      if (!slug) return;

      try {
        const event = await getPublicRegistrationEvent(slug);
        if (cancelled) return;
        setPendingEvent(event);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to create registration';
        setError(message);
      }
    };

    void loadPendingPublicRegistration();
    return () => {
      cancelled = true;
    };
  }, [location.search, profile, user]);

  const handleRegistrationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(location.search);
    const slug = user?.pending_registration?.event_slug
      || params.get('registrationSlug')?.trim()
      || window.sessionStorage.getItem(PENDING_PUBLIC_REGISTRATION_KEY)?.trim();
    if (!slug && !user?.pending_registration?.existing_registration) return;
    setClaimingRegistration(true);
    setError(null);
    try {
      if (user?.pending_registration?.existing_registration) {
        await completeExistingRegistrationOnboarding(eventDetails);
      } else if (slug) {
        await claimPublicRegistration(slug, eventDetails);
      }
      window.sessionStorage.removeItem(PENDING_PUBLIC_REGISTRATION_KEY);
      setPendingEvent(null);
      const [nextRegistrations, events] = await Promise.all([listMyRegistrations(), listEventSummaries()]);
      setRegistrations(nextRegistrations);
      setLaunchedEventIDs(new Set(events.filter((item) => isEventLaunchedOrLater(item.status)).map((item) => item.id)));
      await refreshSession();
      navigate('/profile', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create registration');
    } finally {
      setClaimingRegistration(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const payload = toParticipantPayload(form);
      const saved = canUseManagedUpdate
        ? await updateParticipantProfile(profile.id, payload)
        : await upsertMyParticipantProfile(payload);
      setProfile(saved);
      setForm(createParticipantFormState(saved));
      setSaved(true);
      window.dispatchEvent(new Event('participant-profile-updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="muted">Loading profile…</p>;
  }

  const pendingPayments = registrations.flatMap((registration) => {
    if (!launchedEventIDs.has(registration.event_id)) return [];
    return (registration.payments || [])
      .filter((payment) => payment.status === 'pending')
      .map((payment) => ({ registration, payment }));
  });
  const profileIncomplete = !profile || !isProfileCompleteForRegistration(profile);
  const missingEventDetails = {
    attendance_type: !eventDetails.attendance_type,
    group_size: eventDetails.attendance_type === 'group' && (!eventDetails.group_size || eventDetails.group_size < 2),
    group_names: eventDetails.attendance_type === 'group' && !eventDetails.group_names?.trim(),
    accommodation: !eventDetails.accommodation,
    payment_method: !eventDetails.payment_method,
    heard_about_project: !eventDetails.heard_about_project.trim(),
    heard_about_event: !eventDetails.heard_about_event.trim()
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>My profile</h2>
        </div>
      </header>

      {profileIncomplete ? (
        <section className="notice warning profile-registration-blocked-notice" role="alert">
          <strong>Registration blocked</strong>
          <p>Complete every required profile field and save your profile before you can register for an event.</p>
        </section>
      ) : null}
      {user?.onboarding_required ? (
        <section className="notice warning profile-registration-blocked-notice" role="alert">
          <strong>Finish your event registration</strong>
          <p>
            Access to the rest of Innhopp Central remains restricted until you complete the registration
            {user.pending_registration?.event_name ? ` for ${user.pending_registration.event_name}` : ''}.
          </p>
        </section>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      {claimingRegistration ? <p className="muted">Creating your registration…</p> : null}
      {pendingEvent ? (
        <article className="card stack">
          <div>
            <h3>Register for {pendingEvent.name}</h3>
            <p className="muted">These answers apply only to this event.</p>
          </div>
          <form className="stack" onSubmit={handleRegistrationSubmit}>
            <div className="form-grid">
              <label className={`form-field ${missingEventDetails.attendance_type ? 'field-missing' : ''}`}>
                <span>Are you coming solo or in a group?</span>
                <select required value={eventDetails.attendance_type} onChange={(e) => setEventDetails((current) => ({ ...current, attendance_type: e.target.value as 'solo' | 'group' }))}>
                  <option value="" disabled>Select an option</option>
                  <option value="solo">Solo</option>
                  <option value="group">In a group</option>
                </select>
              </label>
              {eventDetails.attendance_type === 'group' ? (
                <>
                  <label className={`form-field ${missingEventDetails.group_size ? 'field-missing' : ''}`}><span>How many people are in your group?</span><input required min={2} type="number" value={eventDetails.group_size || ''} onChange={(e) => setEventDetails((current) => ({ ...current, group_size: Number(e.target.value) || undefined }))} /></label>
                  <label className={`form-field ${missingEventDetails.group_names ? 'field-missing' : ''}`}><span>Names of everyone in your group</span><textarea required value={eventDetails.group_names || ''} onChange={(e) => setEventDetails((current) => ({ ...current, group_names: e.target.value }))} /></label>
                </>
              ) : null}
              {profile?.license?.trim().toLowerCase() === 'non jumper' && pendingEvent.non_jumper_activities.some(a=>a.kind==='opt_in') ? <fieldset className="form-field form-field-full-span registration-activity-fieldset"><legend>Would you like to do any of these activities during the trip?</legend><div className="registration-activity-list">{pendingEvent.non_jumper_activities.filter(a=>a.kind==='opt_in').map(activity=><label className="registration-activity-choice" key={activity.id}><input type="checkbox" checked={(eventDetails.non_jumper_opt_in_ids||[]).includes(activity.id)} onChange={e=>setEventDetails(current=>({...current,non_jumper_opt_in_ids:e.target.checked?[...(current.non_jumper_opt_in_ids||[]),activity.id]:(current.non_jumper_opt_in_ids||[]).filter(id=>id!==activity.id)}))}/><span><strong>{activity.title}</strong>{activity.cost?<span className="badge neutral">COST: {activity.cost} {activity.cost_currency}</span>:null}<small className="muted">{activity.description}</small></span></label>)}</div></fieldset>:null}
              {profile?.license?.trim().toLowerCase() === 'non jumper' && pendingEvent.non_jumper_activities.some(a=>a.kind==='opt_out') ? <fieldset className="form-field form-field-full-span registration-activity-fieldset"><legend>Are there any of the following activities you DO NOT want to do?</legend><div className="registration-activity-list">{pendingEvent.non_jumper_activities.filter(a=>a.kind==='opt_out').map(activity=><label className="registration-activity-choice" key={activity.id}><input type="checkbox" checked={(eventDetails.non_jumper_opt_out_ids||[]).includes(activity.id)} onChange={e=>setEventDetails(current=>({...current,non_jumper_opt_out_ids:e.target.checked?[...(current.non_jumper_opt_out_ids||[]),activity.id]:(current.non_jumper_opt_out_ids||[]).filter(id=>id!==activity.id)}))}/><span><strong>{activity.title}</strong><small className="muted">{activity.description}</small></span></label>)}</div></fieldset>:null}
              <label className={`form-field ${missingEventDetails.accommodation ? 'field-missing' : ''}`}><span>Accommodation preference</span><select required value={eventDetails.accommodation} onChange={(e)=>setEventDetails(current=>({...current,accommodation:e.target.value as RegistrationEventDetails['accommodation'],accommodation_roommate:e.target.value === 'Shared (usually 2 per room)' ? current.accommodation_roommate : ''}))}><option value="" disabled>Select an option</option><option value="Shared (usually 2 per room)">Shared (usually 2 per room)</option><option value="Single Room (additional cost)">Single Room (additional cost)</option></select></label>
              {eventDetails.accommodation === 'Shared (usually 2 per room)' ? <label className="form-field"><span>I would like to share a room with</span><input type="text" value={eventDetails.accommodation_roommate || ''} onChange={(e)=>setEventDetails(current=>({...current,accommodation_roommate:e.target.value}))}/></label> : null}
              <label className={`form-field ${missingEventDetails.payment_method ? 'field-missing' : ''}`}>
                <span>How would you like to make your main payment?</span>
                <small className="muted">We offer two options: Bank transfer or Secure Online Payment via Stripe.<br />Please note:<br />1. We do not support Wise Direct Transfer – only Wise International Money Transfers that lead to our IBAN account.<br />2. You will have to pay the fees if you want to use Stripe Secure Online Payment. After you've filled out this form we will send you your final invoice, including estimated fees.</small>
                <select required value={eventDetails.payment_method} onChange={(e) => setEventDetails((current) => ({ ...current, payment_method: e.target.value as 'bank_transfer' | 'stripe' }))}>
                  <option value="" disabled>Select a payment method</option>
                  <option value="bank_transfer">Bank transfer to our bank account (via direct IBAN, SEPA or using Wise International Money Transfers)</option>
                  <option value="stripe">Secure Online Payment via Stripe (1,5% - 5.25% fees)</option>
                </select>
              </label>
              <label className="form-field"><span>Are you eligible for any discounts?</span><small className="muted">Specify the discount you've earned and list The Innhopp Project events you have previously attended, if any.</small><textarea value={eventDetails.discount_eligibility || ''} onChange={(e) => setEventDetails((current) => ({ ...current, discount_eligibility: e.target.value }))} /></label>
              <label className={`form-field ${missingEventDetails.heard_about_project ? 'field-missing' : ''}`}><span>How did you hear about The Innhopp Project?</span><textarea required value={eventDetails.heard_about_project} onChange={(e) => setEventDetails((current) => ({ ...current, heard_about_project: e.target.value }))} /></label>
              <label className={`form-field ${missingEventDetails.heard_about_event ? 'field-missing' : ''}`}><span>How did you hear about this specific event?</span><textarea required value={eventDetails.heard_about_event} onChange={(e) => setEventDetails((current) => ({ ...current, heard_about_event: e.target.value }))} /></label>
              <label className="form-field"><span>Is there anything else you want us to know?</span><textarea value={eventDetails.additional_information || ''} onChange={(e) => setEventDetails((current) => ({ ...current, additional_information: e.target.value }))} /></label>
            </div>
            <div className="detail-actions"><button className="primary" type="submit" disabled={claimingRegistration}>{claimingRegistration ? 'Registering…' : 'Complete registration'}</button></div>
          </form>
        </article>
      ) : null}
      {pendingPayments.length > 0 ? (
        <section className="card stack pending-payment-card-warning">
          <header className="card-header">
            <div>
              <h3>Pending payments</h3>
            </div>
          </header>
          <div className="stack pending-payment-list">
            {pendingPayments.map(({ registration, payment }) => (
              <article key={payment.id} className="pending-payment-item">
                <div>
                  <strong>{registration.event_name || `Event #${registration.event_id}`}</strong>
                  <p className="muted pending-payment-meta">
                    {payment.kind === 'main_invoice' ? 'Main invoice' : payment.kind.replace(/_/g, ' ')} {payment.amount} {payment.currency}
                    {payment.due_at ? ` · Due ${formatEventLocalDate(payment.due_at)}` : ''}
                  </p>
                </div>
                {payment.provider_ref ? (
                  <a
                    className="button-link primary"
                    href={payment.provider_ref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open payment link
                  </a>
                ) : (
                  <span className="muted">Payment link pending</span>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {profile ? (
        <ParticipantEventsCard
          participantId={profile.id}
          participantName={profile.full_name || user?.full_name || 'My score'}
          useOwnScores
          registrations={registrations}
          onGoToEvent={(eventId) => navigate(`/events/${eventId}`)}
        />
      ) : null}
      <ParticipantProfileForm
        form={form}
        onChange={(next) => {
          setForm(next);
          setSaved(false);
          setError(null);
        }}
        onSubmit={handleSubmit}
        submitting={saving}
        saved={saved}
        error={error}
        roleMode={canUseManagedUpdate ? 'editable' : 'readonly'}
        showAdminRoleControl={canManageAccountRoles || hasAdminAccess}
        canEditAdminRole={canUseManagedUpdate}
        canSelfRemoveElevatedRoles={!canUseManagedUpdate}
      />
    </section>
  );
};

export default MyProfilePage;
