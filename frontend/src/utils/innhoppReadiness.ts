type InnhoppReadySource = {
  sequence?: number | null;
  name?: string | null;
  coordinates?: string | null;
  elevation?: number | null;
  takeoff_airfield_id?: number | null;
  scheduled_at?: string | null;
  distance_by_air?: number | null;
  distance_by_road?: number | null;
  jumprun?: string | null;
  primary_landing_area?: {
    name?: string | null;
    size?: string | null;
    obstacles?: string | null;
    description?: string | null;
  };
  risk_assessment?: string | null;
  safety_precautions?: string | null;
  minimum_requirements?: string | null;
  hospital?: string | null;
  rescue_boat?: boolean | null;
};

const hasText = (value?: string | null) => !!value && value.trim().length > 0;
const hasNumber = (value?: number | null) => value !== null && value !== undefined && Number.isFinite(value);
const hasBoolean = (value?: boolean | null) => value !== null && value !== undefined;

export const isInnhoppReady = (innhopp: InnhoppReadySource): boolean => {
  const primary = innhopp.primary_landing_area || {};
  return (
    (innhopp.sequence ?? 0) > 0 &&
    hasText(innhopp.name) &&
    hasText(innhopp.coordinates) &&
    hasNumber(innhopp.elevation) &&
    hasText(innhopp.scheduled_at) &&
    hasNumber(innhopp.takeoff_airfield_id) &&
    hasNumber(innhopp.distance_by_air) &&
    hasNumber(innhopp.distance_by_road) &&
    hasText(innhopp.jumprun) &&
    hasText(primary.name) &&
    hasText(primary.description) &&
    hasText(primary.size) &&
    hasText(primary.obstacles) &&
    hasText(innhopp.risk_assessment) &&
    hasText(innhopp.safety_precautions) &&
    hasText(innhopp.minimum_requirements) &&
    hasText(innhopp.hospital) &&
    hasBoolean(innhopp.rescue_boat)
  );
};
