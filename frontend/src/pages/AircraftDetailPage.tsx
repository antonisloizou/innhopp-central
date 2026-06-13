import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AircraftInput,
  AircraftPricingModel,
  AircraftSlotPricingBandInput,
  createAircraft,
  deleteAircraft,
  getAircraft,
  updateAircraft
} from '../api/events';
import { DetailPageLockTitle, useDetailPageLock } from '../components/DetailPageLock';
import { ISO_CURRENCY_CODES } from '../constants/currencies';

const emptyBand = (sortOrder: number): AircraftSlotPricingBandInput => ({
  max_distance_km: 0,
  slot_multiplier: 1,
  sort_order: sortOrder
});

const emptyForm = (): AircraftInput => ({
  name: '',
  pricing_model: 'time',
  rate_currency: 'EUR',
  rate_per_minute: 0,
  cruising_speed_kmh: 180,
  minimum_load_duration: 0,
  price_per_slot: 0,
  notes: '',
  slot_pricing_bands: [emptyBand(0)]
});

const AircraftDetailPage = () => {
  const { aircraftId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<AircraftInput>(emptyForm);
  const [loading, setLoading] = useState(!!aircraftId);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { locked, toggleLocked, editGuardProps, showLockedNoticeAtEvent } = useDetailPageLock();
  const isNew = !aircraftId;
  const isSlotModel = form.pricing_model === 'slot';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!aircraftId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getAircraft(Number(aircraftId));
        if (cancelled) return;
        setForm({
          id: data.id,
          name: data.name,
          pricing_model: data.pricing_model,
          rate_currency: data.rate_currency,
          rate_per_minute: data.rate_per_minute ?? 0,
          cruising_speed_kmh: data.cruising_speed_kmh ?? 180,
          minimum_load_duration: data.minimum_load_duration ?? 0,
          price_per_slot: data.price_per_slot ?? 0,
          notes: data.notes || '',
          sort_order: data.sort_order ?? 0,
          slot_pricing_bands:
            data.slot_pricing_bands?.map((band) => ({
              id: band.id,
              max_distance_km: band.max_distance_km,
              slot_multiplier: band.slot_multiplier,
              sort_order: band.sort_order
            })) || [emptyBand(0)]
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load aircraft');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [aircraftId]);

  const setBand = (index: number, patch: Partial<AircraftSlotPricingBandInput>) => {
    setForm((prev) => ({
      ...prev,
      slot_pricing_bands: (prev.slot_pricing_bands || []).map((band, bandIndex) =>
        bandIndex === index ? { ...band, ...patch } : band
      )
    }));
  };

  const addBand = () => {
    setForm((prev) => ({
      ...prev,
      slot_pricing_bands: [...(prev.slot_pricing_bands || []), emptyBand((prev.slot_pricing_bands || []).length)]
    }));
  };

  const removeBand = (index: number) => {
    setForm((prev) => ({
      ...prev,
      slot_pricing_bands: (prev.slot_pricing_bands || [])
        .filter((_, bandIndex) => bandIndex !== index)
        .map((band, bandIndex) => ({ ...band, sort_order: bandIndex }))
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: AircraftInput = {
        ...form,
        name: form.name.trim(),
        notes: form.notes?.trim() || '',
        slot_pricing_bands: (form.slot_pricing_bands || []).map((band, index) => ({
          ...band,
          sort_order: index
        }))
      };
      if (isNew) {
        const created = await createAircraft(payload);
        navigate(`/aircraft/${created.id}`, { replace: true });
        return;
      }
      const updated = await updateAircraft(Number(aircraftId), payload);
      setForm((prev) => ({
        ...prev,
        id: updated.id,
        slot_pricing_bands:
          updated.slot_pricing_bands?.map((band) => ({
            id: band.id,
            max_distance_km: band.max_distance_km,
            slot_multiplier: band.slot_multiplier,
            sort_order: band.sort_order
          })) || prev.slot_pricing_bands
      }));
      setMessage('Aircraft saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save aircraft');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!aircraftId) return;
    if (!window.confirm('Delete this aircraft?')) return;
    setDeleting(true);
    setMessage(null);
    try {
      await deleteAircraft(Number(aircraftId));
      navigate(-1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete aircraft');
      setDeleting(false);
    }
  };

  if (loading) return <p className="muted">Loading aircraft…</p>;
  if (error) return <p className="error-text">{error}</p>;

  return (
    <section {...editGuardProps}>
      <header className="page-header">
        <div>
          <DetailPageLockTitle locked={locked} onToggleLocked={toggleLocked}>
            <h2>{isNew ? 'New Aircraft' : form.name || 'Aircraft'}</h2>
          </DetailPageLockTitle>
        </div>
        <div className="card-actions">
          <button className="ghost" type="button" onClick={() => navigate(-1)}>
            Back
          </button>
          {!isNew ? (
            <button
              className="ghost danger"
              type="button"
              disabled={deleting}
              onClick={(event) => {
                if (locked) {
                  showLockedNoticeAtEvent(event);
                  return;
                }
                handleDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete aircraft'}
            </button>
          ) : null}
        </div>
      </header>

      <article className="card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
          </label>
          <label className="form-field">
            <span>Pricing model</span>
            <select
              value={form.pricing_model}
              onChange={(e) => setForm((prev) => ({ ...prev, pricing_model: e.target.value as AircraftPricingModel }))}
            >
              <option value="time">Time</option>
              <option value="slot">Slot</option>
            </select>
          </label>
          <label className="form-field">
            <span>Rate currency</span>
            <select
              value={form.rate_currency}
              onChange={(e) => setForm((prev) => ({ ...prev, rate_currency: e.target.value }))}
            >
              {ISO_CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          {isSlotModel ? (
            <label className="form-field">
              <span>Price per slot</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price_per_slot ?? 0}
                onChange={(e) => setForm((prev) => ({ ...prev, price_per_slot: Number(e.target.value) }))}
              />
            </label>
          ) : (
            <label className="form-field">
              <span>Rate per minute</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.rate_per_minute ?? 0}
                onChange={(e) => setForm((prev) => ({ ...prev, rate_per_minute: Number(e.target.value) }))}
              />
            </label>
          )}
          <label className="form-field">
            <span>Cruising speed km/h</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.cruising_speed_kmh ?? 180}
              onChange={(e) => setForm((prev) => ({ ...prev, cruising_speed_kmh: Number(e.target.value) }))}
            />
          </label>
          <label className="form-field">
            <span>Minimum load duration</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.minimum_load_duration ?? 0}
              onChange={(e) => setForm((prev) => ({ ...prev, minimum_load_duration: Number(e.target.value) }))}
            />
          </label>

          <label className="form-field">
            <span>Notes</span>
            <textarea value={form.notes || ''} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={4} />
          </label>

          {isSlotModel ? (
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <div className="card-header event-detail-section-header">
                <div className="event-detail-section-header-main">
                  <h3 className="event-detail-section-title">Slot Bands</h3>
                </div>
                <button type="button" className="ghost" onClick={addBand}>
                  Add band
                </button>
              </div>
              <div className="form-grid">
                {(form.slot_pricing_bands || []).map((band, index) => (
                  <div key={band.id || index} className="event-detail-innhopp-inline-row">
                    <label className="form-field">
                      <span>Max distance km</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={band.max_distance_km}
                        onChange={(e) => setBand(index, { max_distance_km: Number(e.target.value) })}
                      />
                    </label>
                    <label className="form-field">
                      <span>Slot multiplier</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={band.slot_multiplier}
                        onChange={(e) => setBand(index, { slot_multiplier: Number(e.target.value) })}
                      />
                    </label>
                    <div className="form-field">
                      <span>&nbsp;</span>
                      <button type="button" className="ghost danger" onClick={() => removeBand(index)} disabled={(form.slot_pricing_bands || []).length <= 1}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="muted">Lower bounds are implicit from the previous band. The last band is treated as open-ended for costing and should warn when used beyond its max distance.</p>
            </div>
          ) : null}

          <div className="card-actions" style={{ gridColumn: '1 / -1' }}>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create aircraft' : 'Save aircraft'}
            </button>
            {message ? <span className="muted">{message}</span> : null}
          </div>
        </form>
      </article>
    </section>
  );
};

export default AircraftDetailPage;
