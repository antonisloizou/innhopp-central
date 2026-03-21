import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateParticipantPayload, createParticipantProfile } from '../api/participants';
import { useAuth } from '../auth/AuthProvider';
import ParticipantProfileForm, {
  createParticipantFormState,
  toParticipantPayload
} from '../components/ParticipantProfileForm';

const ParticipantCreatePage = () => {
  const { user } = useAuth();
  const canManageAccountRoles = user?.roles?.includes('admin') ?? false;
  const [form, setForm] = useState<CreateParticipantPayload>(createParticipantFormState());
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setSaved(false);
    setError(null);
    try {
      await createParticipantProfile(toParticipantPayload(form));
      setSaved(true);
      navigate('/participants');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create participant');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <h2>Create participant</h2>
          <p>Add a new member to the Innhopp Family.</p>
        </div>
        <button className="ghost" type="button" onClick={() => navigate('/participants')}>
          Back to participants
        </button>
      </header>
      <ParticipantProfileForm
        form={form}
        onChange={(next) => {
          setForm(next);
          setSaved(false);
          setError(null);
        }}
        onSubmit={handleSubmit}
        submitting={submitting}
        saved={saved}
        error={error}
        roleMode="editable"
        showAdminRoleControl={canManageAccountRoles}
        canEditAdminRole={canManageAccountRoles}
      />
    </section>
  );
};

export default ParticipantCreatePage;
