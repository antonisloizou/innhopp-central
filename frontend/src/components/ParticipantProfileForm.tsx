import { FormEvent, ReactNode, useState } from 'react';
import { CreateParticipantPayload, ParticipantProfile } from '../api/participants';
import { roleOptions } from '../utils/roles';

export const canopyCourseOptions = [
  'Attended 1 or more canopy courses',
  'Never attended a canopy course',
  'Want to attend one'
] as const;
export const landingAreaPreferenceOptions = [
  'Big and safe',
  'Limited with big and safe backup',
  'Limited and its your only choice'
] as const;
export const tshirtSizeOptions = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export const tshirtGenderOptions = ['Male', 'Female'] as const;
export const licenseOptions = ['Non jumper', 'A', 'B', 'C', 'D'] as const;
export const ratingOptions = ['AFF', 'Tandem', 'PRO / DEMO', 'Rigger', 'Video'] as const;
export const disciplineOptions = ['FS', 'FF', 'CP', 'WS', 'CRW', 'XRW'] as const;
export const otherAirSportOptions = ['Speedflying', 'BASE', 'Paragliding'] as const;
export const dietaryRestrictionOptions = [
  'None',
  'Vegetarian',
  'Vegan',
  'Kosher',
  'Halal',
  'Gluten-free'
] as const;
export const medicalExpertiseOptions = [
  'Doctor',
  'Paramedic',
  'First aid certified'
] as const;
export const hssQualityOptions = [
  'Drive fast in cars',
  'Pushing boundaries',
  'Active in multiple sports',
  'Party hard',
  'Oppose authorities',
  'Listen to music while reading',
  'Experiment with drugs',
  'Lots of spice on food',
  'Take risks'
] as const;

type ParticipantProfileFormProps = {
  form: CreateParticipantPayload;
  onChange: (next: CreateParticipantPayload) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitting?: boolean;
  saved?: boolean;
  error?: string | null;
  roleMode?: 'hidden' | 'readonly' | 'editable';
  showAdminRoleControl?: boolean;
  canEditAdminRole?: boolean;
  canSelfRemoveElevatedRoles?: boolean;
};

const normalizeList = (values?: string[]) => (Array.isArray(values) ? values : []);

const toggleValue = (values: string[] | undefined, value: string, checked: boolean) => {
  const current = new Set(normalizeList(values));
  if (checked) {
    current.add(value);
  } else {
    current.delete(value);
  }
  return Array.from(current);
};

const readNumberValue = (value?: number) => (typeof value === 'number' ? String(value) : '');

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
};

const hasText = (value?: string | number | null) => String(value ?? '').trim().length > 0;

const hasSkydiverRole = (roles: string[] | undefined) => normalizeList(roles).includes('Skydiver');

const syncSkydiverRole = (roles: string[] | undefined, isJumper: boolean) => {
  const current = new Set(normalizeList(roles));
  if (isJumper) {
    current.add('Skydiver');
  } else {
    current.delete('Skydiver');
  }
  return Array.from(current);
};

const hasAdminAccountRole = (roles: string[] | undefined) => normalizeList(roles).includes('admin');

const syncStaffRoleWithAdminAccess = (
  participantRoles: string[] | undefined,
  accountRoles: string[] | undefined
) => {
  const current = new Set(normalizeList(participantRoles));
  if (hasAdminAccountRole(accountRoles)) {
    current.add('Staff');
  }
  return Array.from(current);
};

const CollapsibleCard = ({
  title,
  children,
  open,
  onToggle
}: {
  title: string;
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
}) => (
  <article className="card">
    <header
      className="card-header"
      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
      onClick={onToggle}
    >
      <button
        className="ghost"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        {open ? '▾' : '▸'}
      </button>
      <h3 style={{ margin: 0, flex: 1, textAlign: 'left' }}>{title}</h3>
    </header>
    {open ? <div style={{ marginTop: '1rem' }}>{children}</div> : null}
  </article>
);

const CardSaveAction = ({
  submitting,
  saved,
  error
}: {
  submitting: boolean;
  saved: boolean;
  error?: string | null;
}) => (
  <div className="form-actions" style={{ marginTop: '1rem' }}>
    <button type="submit" className={`primary ${saved ? 'saved' : ''}`} disabled={submitting || saved}>
      {submitting ? 'Saving…' : saved ? 'Saved' : 'Save'}
    </button>
    {error ? <span className="error-text">{error}</span> : null}
  </div>
);

const MultiSelectField = ({
  label,
  values,
  options,
  onToggle,
  customLabel = 'Add custom value',
  allowCustom = true,
  hideLabel = false,
  optionDisplay = 'badge'
}: {
  label: string;
  values?: string[];
  options: readonly string[];
  onToggle: (value: string, checked: boolean) => void;
  customLabel?: string;
  allowCustom?: boolean;
  hideLabel?: boolean;
  optionDisplay?: 'badge' | 'list';
}) => {
  const [customValue, setCustomValue] = useState('');
  const selectedValues = normalizeList(values);
  const customValues = selectedValues.filter((value) => !options.includes(value));

  return (
    <div className="form-field" style={{ gridColumn: '1 / -1' }}>
      {hideLabel ? null : <span>{label}</span>}
      <div
        style={
          optionDisplay === 'list'
            ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }
            : { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }
        }
      >
        {options.map((option) => (
          <label
            key={option}
            className="badge neutral"
            style={
              optionDisplay === 'list'
                ? {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'transparent',
                    color: 'inherit'
                  }
                : { display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }
            }
          >
            <input
              type="checkbox"
              checked={selectedValues.includes(option)}
              onChange={(event) => onToggle(option, event.target.checked)}
            />
            {option}
          </label>
        ))}
        {allowCustom
          ? customValues.map((value) => (
              <button
                key={value}
                type="button"
                className="badge neutral"
                style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '0.25rem' }}
                onClick={() => onToggle(value, false)}
              >
                <span>{value}</span>
                <sup style={{ fontSize: '0.7em', lineHeight: 1 }}>x</sup>
              </button>
            ))
          : null}
      </div>
      {allowCustom ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.35rem' }}>
          <input
            type="text"
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder={customLabel}
            style={{ flex: '1 1 260px' }}
          />
          <button
            type="button"
            className="ghost"
            style={{ flex: '0 0 auto' }}
            onClick={() => {
              const trimmed = customValue.trim();
              if (!trimmed) return;
              onToggle(trimmed, true);
              setCustomValue('');
            }}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const createParticipantFormState = (
  profile?: Partial<ParticipantProfile> | null,
  seed?: Partial<CreateParticipantPayload>
): CreateParticipantPayload => {
  const accountRoles = profile?.account_roles ?? seed?.account_roles ?? [];
  const roles = syncStaffRoleWithAdminAccess(profile?.roles ?? seed?.roles ?? ['Participant'], accountRoles);

  return {
    full_name: profile?.full_name ?? seed?.full_name ?? '',
    email: profile?.email ?? seed?.email ?? '',
    phone: profile?.phone ?? seed?.phone ?? '',
    experience_level: profile?.experience_level ?? seed?.experience_level ?? '',
    emergency_contact: profile?.emergency_contact ?? seed?.emergency_contact ?? '',
    whatsapp: profile?.whatsapp ?? seed?.whatsapp ?? '',
    instagram: profile?.instagram ?? seed?.instagram ?? '',
    citizenship: profile?.citizenship ?? seed?.citizenship ?? '',
    date_of_birth: profile?.date_of_birth ?? seed?.date_of_birth ?? '',
    jumper: hasSkydiverRole(roles) ? true : (profile?.jumper ?? seed?.jumper ?? false),
    years_in_sport: profile?.years_in_sport ?? seed?.years_in_sport,
    jump_count: profile?.jump_count ?? seed?.jump_count,
    recent_jump_count: profile?.recent_jump_count ?? seed?.recent_jump_count,
    main_canopy: profile?.main_canopy ?? seed?.main_canopy ?? '',
    wingload: profile?.wingload ?? seed?.wingload ?? '',
    license: profile?.license ?? seed?.license ?? '',
    roles,
    ratings: profile?.ratings ?? seed?.ratings ?? [],
    disciplines: profile?.disciplines ?? seed?.disciplines ?? [],
    other_air_sports: profile?.other_air_sports ?? seed?.other_air_sports ?? [],
    canopy_course: profile?.canopy_course ?? seed?.canopy_course ?? '',
    landing_area_preference: profile?.landing_area_preference ?? seed?.landing_area_preference ?? '',
    tshirt_size: profile?.tshirt_size ?? seed?.tshirt_size ?? '',
    tshirt_gender: profile?.tshirt_gender ?? seed?.tshirt_gender ?? '',
    dietary_restrictions: profile?.dietary_restrictions ?? seed?.dietary_restrictions ?? [],
    medical_conditions: profile?.medical_conditions ?? seed?.medical_conditions ?? '',
    medical_expertise: profile?.medical_expertise ?? seed?.medical_expertise ?? [],
    hss_qualities: profile?.hss_qualities ?? seed?.hss_qualities ?? [],
    account_roles: accountRoles
  };
};

export const toParticipantPayload = (form: CreateParticipantPayload): CreateParticipantPayload => ({
  full_name: form.full_name.trim(),
  email: form.email.trim(),
  phone: form.phone?.trim() || undefined,
  experience_level: form.experience_level?.trim() || undefined,
  emergency_contact: form.emergency_contact?.trim() || undefined,
  whatsapp: form.whatsapp?.trim() || undefined,
  instagram: form.instagram?.trim() || undefined,
  citizenship: form.citizenship?.trim() || undefined,
  date_of_birth: form.date_of_birth?.trim() || undefined,
  jumper: !!form.jumper,
  years_in_sport: form.years_in_sport,
  jump_count: form.jump_count,
  recent_jump_count: form.recent_jump_count,
  main_canopy: form.main_canopy?.trim() || undefined,
  wingload: form.wingload?.trim() || undefined,
  license: form.license?.trim() === 'Non jumper' ? undefined : form.license?.trim() || undefined,
  roles: normalizeList(form.roles).length ? normalizeList(form.roles) : ['Participant'],
  ratings: normalizeList(form.ratings),
  disciplines: normalizeList(form.disciplines),
  other_air_sports: normalizeList(form.other_air_sports),
  canopy_course: form.canopy_course?.trim() || undefined,
  landing_area_preference: form.landing_area_preference?.trim() || undefined,
  tshirt_size: form.tshirt_size?.trim() || undefined,
  tshirt_gender: form.tshirt_gender?.trim() || undefined,
  dietary_restrictions: normalizeList(form.dietary_restrictions),
  medical_conditions: form.medical_conditions?.trim() || undefined,
  medical_expertise: normalizeList(form.medical_expertise),
  hss_qualities: normalizeList(form.hss_qualities),
  account_roles: normalizeList(form.account_roles)
});

const ParticipantProfileForm = ({
  form,
  onChange,
  onSubmit,
  submitting = false,
  saved = false,
  error,
  roleMode = 'hidden',
  showAdminRoleControl = false,
  canEditAdminRole = false,
  canSelfRemoveElevatedRoles = false
}: ParticipantProfileFormProps) => {
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({
    basic: true,
    skydiving: true,
    medical: true,
    preferences: true
  });
  const updateField = <K extends keyof CreateParticipantPayload>(key: K, value: CreateParticipantPayload[K]) => {
    onChange({ ...form, [key]: value });
  };
  const isNonJumper = form.license === 'Non jumper' || !form.jumper;

  const updateLicense = (value: string) => {
    const nextJumper = value !== 'Non jumper';
    onChange({
      ...form,
      license: value,
      jumper: nextJumper,
      roles: syncSkydiverRole(form.roles, nextJumper)
    });
  };
  const toggleCard = (key: string) => {
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const missingRequired = {
    full_name: !hasText(form.full_name),
    email: !hasText(form.email),
    whatsapp: !hasText(form.whatsapp),
    license: !isNonJumper && !hasText(form.license),
    main_canopy: !isNonJumper && !hasText(form.main_canopy),
    wingload: !isNonJumper && !hasText(form.wingload),
    years_in_sport: !isNonJumper && typeof form.years_in_sport !== 'number',
    jump_count: !isNonJumper && typeof form.jump_count !== 'number',
    recent_jump_count: !isNonJumper && typeof form.recent_jump_count !== 'number',
    tshirt_size: !hasText(form.tshirt_size),
    tshirt_gender: !hasText(form.tshirt_gender)
  };

  return (
    <form className="stack" onSubmit={onSubmit}>
      <CollapsibleCard title="Basic info" open={expandedCards.basic} onToggle={() => toggleCard('basic')}>
        <div
          className="form-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          <label className={`form-field ${missingRequired.full_name ? 'field-missing' : ''}`}>
            <span>Name</span>
            <input
              type="text"
              value={form.full_name}
              onChange={(event) => updateField('full_name', event.target.value)}
              required
            />
          </label>
          <label className={`form-field ${missingRequired.email ? 'field-missing' : ''}`}>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              required
            />
          </label>
          <label className="form-field">
            <span>Date of Birth</span>
            <input
              type="date"
              value={form.date_of_birth || ''}
              onChange={(event) => updateField('date_of_birth', event.target.value)}
            />
          </label>
          <label className={`form-field ${missingRequired.whatsapp ? 'field-missing' : ''}`} style={{ gridColumn: '1' }}>
            <span>Whatsapp</span>
            <input
              type="text"
              value={form.whatsapp || ''}
              onChange={(event) => updateField('whatsapp', event.target.value)}
              placeholder="Needed for event comms"
            />
          </label>
          <label className="form-field">
            <span>Instagram</span>
            <input
              type="text"
              value={form.instagram || ''}
              onChange={(event) => updateField('instagram', event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Citizenship</span>
            <input
              type="text"
              value={form.citizenship || ''}
              onChange={(event) => updateField('citizenship', event.target.value)}
            />
          </label>
          <label className={`form-field ${missingRequired.tshirt_size ? 'field-missing' : ''}`}>
            <span>T-shirt size</span>
            <select
              value={form.tshirt_size || ''}
              onChange={(event) => updateField('tshirt_size', event.target.value)}
            >
              <option value="">Select one</option>
              {tshirtSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className={`form-field ${missingRequired.tshirt_gender ? 'field-missing' : ''}`}>
            <span>T-shirt gender</span>
            <select
              value={form.tshirt_gender || ''}
              onChange={(event) => updateField('tshirt_gender', event.target.value)}
            >
              <option value="">Select one</option>
              {tshirtGenderOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {roleMode !== 'hidden' ? (
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Roles</span>
              {roleMode === 'editable' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {roleOptions.map((role) => (
                    <label
                      key={role}
                      className="badge neutral"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <input
                        type="checkbox"
                        checked={normalizeList(form.roles).includes(role)}
                        onChange={(event) => {
                          const nextRoles = toggleValue(form.roles, role, event.target.checked);
                          onChange({
                            ...form,
                            roles: nextRoles,
                            jumper: role === 'Skydiver' ? event.target.checked : form.jumper
                          });
                        }}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              ) : canSelfRemoveElevatedRoles ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {(normalizeList(form.roles).length ? normalizeList(form.roles) : ['Participant']).map((role) => (
                    <label
                      key={role}
                      className="badge neutral"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <input
                        type="checkbox"
                        checked
                        disabled={role !== 'Staff'}
                        readOnly={role !== 'Staff'}
                        onChange={
                          role === 'Staff'
                            ? (event) => {
                                if (event.target.checked) return;
                                updateField('roles', toggleValue(form.roles, 'Staff', false));
                              }
                            : undefined
                        }
                      />
                      {role}
                    </label>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {(normalizeList(form.roles).length ? normalizeList(form.roles) : ['Participant']).map((role) => (
                    <label
                      key={role}
                      className="badge neutral"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <input type="checkbox" checked disabled readOnly />
                      {role}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {showAdminRoleControl ? (
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Account access</span>
              {canEditAdminRole ? (
                <label
                  className="badge neutral"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', width: 'fit-content' }}
                >
                  <input
                    type="checkbox"
                    checked={normalizeList(form.account_roles).includes('admin')}
                    onChange={(event) => {
                      const nextAccountRoles = toggleValue(form.account_roles, 'admin', event.target.checked);
                      onChange({
                        ...form,
                        account_roles: nextAccountRoles,
                        roles: syncStaffRoleWithAdminAccess(form.roles, nextAccountRoles)
                      });
                    }}
                  />
                  Admin access
                </label>
              ) : canSelfRemoveElevatedRoles && normalizeList(form.account_roles).includes('admin') ? (
                <label
                  className="badge neutral"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', width: 'fit-content' }}
                >
                  <input
                    type="checkbox"
                    checked
                    onChange={(event) => {
                      if (event.target.checked) return;
                      updateField('account_roles', toggleValue(form.account_roles, 'admin', false));
                    }}
                  />
                  Admin access
                </label>
              ) : normalizeList(form.account_roles).includes('admin') ? (
                <label
                  className="badge neutral"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', width: 'fit-content' }}
                >
                  <input type="checkbox" checked disabled readOnly />
                  Admin access
                </label>
              ) : (
                <span className="muted">No elevated access</span>
              )}
            </div>
          ) : null}
        </div>
        <CardSaveAction submitting={submitting} saved={saved} error={error} />
      </CollapsibleCard>

      <CollapsibleCard title="Skydiving" open={expandedCards.skydiving} onToggle={() => toggleCard('skydiving')}>
        <div
          className="form-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          <label className={`form-field ${missingRequired.license ? 'field-missing' : ''}`}>
            <span>License</span>
            <select
              value={isNonJumper ? 'Non jumper' : form.license || ''}
              onChange={(event) => updateLicense(event.target.value)}
            >
              <option value="">Select one</option>
              {licenseOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {!isNonJumper ? (
            <>
              <label className={`form-field ${missingRequired.main_canopy ? 'field-missing' : ''}`}>
                <span>Main canopy</span>
                <input
                  type="text"
                  value={form.main_canopy || ''}
                  onChange={(event) => updateField('main_canopy', event.target.value)}
                />
              </label>
              <label className={`form-field ${missingRequired.wingload ? 'field-missing' : ''}`}>
                <span>Wingload</span>
                <input
                  type="text"
                  value={form.wingload || ''}
                  onChange={(event) => updateField('wingload', event.target.value)}
                />
              </label>
              <div style={{ gridColumn: '1 / -1', height: 0 }} />
              <label className={`form-field ${missingRequired.years_in_sport ? 'field-missing' : ''}`}>
                <span>Years in the sport</span>
                <input
                  type="number"
                  min="0"
                  value={readNumberValue(form.years_in_sport)}
                  onChange={(event) => updateField('years_in_sport', parseOptionalNumber(event.target.value))}
                />
              </label>
              <label className={`form-field ${missingRequired.jump_count ? 'field-missing' : ''}`}>
                <span>Number of jumps</span>
                <input
                  type="number"
                  min="0"
                  value={readNumberValue(form.jump_count)}
                  onChange={(event) => updateField('jump_count', parseOptionalNumber(event.target.value))}
                />
              </label>
              <label className={`form-field ${missingRequired.recent_jump_count ? 'field-missing' : ''}`}>
                <span>Jumps in last 3 months</span>
                <input
                  type="number"
                  min="0"
                  value={readNumberValue(form.recent_jump_count)}
                  onChange={(event) => updateField('recent_jump_count', parseOptionalNumber(event.target.value))}
                />
              </label>
              <MultiSelectField
                label="Ratings"
                values={form.ratings}
                options={ratingOptions}
                onToggle={(value, checked) => updateField('ratings', toggleValue(form.ratings, value, checked))}
                allowCustom={false}
              />
              <div style={{ gridColumn: '1 / -1' }}>
                <MultiSelectField
                  label="Disciplines"
                  values={form.disciplines}
                  options={disciplineOptions}
                  onToggle={(value, checked) => updateField('disciplines', toggleValue(form.disciplines, value, checked))}
                  customLabel="Add another discipline"
                />
              </div>
              <label className="form-field" style={{ gridColumn: '1 / -1', maxWidth: '320px' }}>
                <span>Canopy course</span>
                <select
                  value={form.canopy_course || ''}
                  onChange={(event) => updateField('canopy_course', event.target.value)}
                >
                  <option value="">Select one</option>
                  {canopyCourseOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ gridColumn: '1 / -1' }}>
                <MultiSelectField
                  label="Other air sports"
                  values={form.other_air_sports}
                  options={otherAirSportOptions}
                  onToggle={(value, checked) =>
                    updateField('other_air_sports', toggleValue(form.other_air_sports, value, checked))
                  }
                  allowCustom={false}
                />
              </div>
            </>
          ) : null}
        </div>
        <CardSaveAction submitting={submitting} saved={saved} error={error} />
      </CollapsibleCard>

      <CollapsibleCard title="Medical and Safety" open={expandedCards.medical} onToggle={() => toggleCard('medical')}>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Any Medical or other physical conditions</span>
            <input
              type="text"
              value={form.medical_conditions || ''}
              onChange={(event) => updateField('medical_conditions', event.target.value)}
            />
          </label>
          <MultiSelectField
            label="Dietary restrictions"
            values={form.dietary_restrictions}
            options={dietaryRestrictionOptions}
            onToggle={(value, checked) =>
              updateField('dietary_restrictions', toggleValue(form.dietary_restrictions, value, checked))
            }
            customLabel="Add another restriction"
          />
          <MultiSelectField
            label="Medical expertise"
            values={form.medical_expertise}
            options={medicalExpertiseOptions}
            onToggle={(value, checked) =>
              updateField('medical_expertise', toggleValue(form.medical_expertise, value, checked))
            }
            customLabel="Add another expertise"
          />
        </div>
        <CardSaveAction submitting={submitting} saved={saved} error={error} />
      </CollapsibleCard>

      <CollapsibleCard title="Preferences" open={expandedCards.preferences} onToggle={() => toggleCard('preferences')}>
        <div className="form-grid">
          <label className="form-field" style={{ gridColumn: '1 / -1', maxWidth: '420px' }}>
            <span>Landing area preference</span>
            <select
              value={form.landing_area_preference || ''}
              onChange={(event) => updateField('landing_area_preference', event.target.value)}
            >
              <option value="">Select one</option>
              {landingAreaPreferenceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <MultiSelectField
            label="High Sensation Seeker"
            values={form.hss_qualities}
            options={hssQualityOptions}
            onToggle={(value, checked) => updateField('hss_qualities', toggleValue(form.hss_qualities, value, checked))}
            allowCustom={false}
            optionDisplay="list"
          />
        </div>
        <CardSaveAction submitting={submitting} saved={saved} error={error} />
      </CollapsibleCard>
    </form>
  );
};

export default ParticipantProfileForm;
