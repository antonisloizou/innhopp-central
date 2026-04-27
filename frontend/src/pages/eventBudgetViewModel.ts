import { BudgetSummary } from '../api/budgets';

export type ScenarioKey = 'confirm_case' | 'worst_case_gate' | 'full_capacity_case';

export type ScenarioBar = {
  key: ScenarioKey;
  label: string;
  participants: number;
  expectedCost: number;
  driftAmount: number;
  costWithDrift: number;
  revenue: number;
  marginWithoutTip: number;
  status: 'green' | 'red';
  revenuePct: number;
  costPct: number;
};

export type CostSplitMode = 'amount' | 'percentage';

export type CostSplitEntry = {
  key: string;
  label: string;
  total: number;
  percentage: number;
  barPct: number;
  displayValue: number;
};

export type MarginCurveMarker = {
  key: ScenarioKey;
  label: string;
  participants: number;
  margin: number;
  x: number;
  y: number;
  status: 'green' | 'red';
};

export type MarginCurveModel = {
  points: Array<{ participants: number; margin: number; x: number; y: number }>;
  polylinePoints: string;
  zeroY: number;
  yMax: number;
  yMin: number;
  axisMax: number;
  axisMin: number;
  chartWidth: number;
  chartHeight: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  xMin: number;
  xMax: number;
  markers: MarginCurveMarker[];
};

const scenarioSpecs: Array<{ key: ScenarioKey; label: string }> = [
  { key: 'confirm_case', label: 'Confirm' },
  { key: 'worst_case_gate', label: 'Worst' },
  { key: 'full_capacity_case', label: 'Full' }
];

export const buildScenarioBars = (summary: BudgetSummary | null): ScenarioBar[] => {
  if (!summary?.scenarios) return [];
  const bars = scenarioSpecs
    .map(({ key, label }) => {
      const raw = summary.scenarios[key];
      if (!raw || typeof raw.participants !== 'number') return null;
      const dynamicLabel = key === 'worst_case_gate' ? `Worst (${raw.participants} pax)` : label;
      return {
        key,
        label: dynamicLabel,
        participants: raw.participants,
        expectedCost: raw.expected_cost || 0,
        driftAmount: Math.max(0, (raw.cost_with_drift || 0) - (raw.expected_cost || 0)),
        costWithDrift: raw.cost_with_drift || 0,
        revenue: raw.revenue || 0,
        marginWithoutTip: raw.margin_without_tip || 0,
        status: raw.status || 'red'
      };
    })
    .filter((item): item is Omit<ScenarioBar, 'revenuePct' | 'costPct'> => item !== null);

  const maxValue = bars.reduce((max, item) => Math.max(max, item.costWithDrift, item.revenue), 0);
  return bars.map((item) => ({
    ...item,
    revenuePct: maxValue > 0 ? (item.revenue / maxValue) * 100 : 0,
    costPct: maxValue > 0 ? (item.costWithDrift / maxValue) * 100 : 0
  }));
};

export const buildCostSplit = (
  summary: BudgetSummary | null,
  mode: CostSplitMode
): CostSplitEntry[] => {
  if (!summary?.section_totals?.length) return [];
  const sectionTotals = summary.section_totals
    .map((section) => ({
      key: String(section.code || section.section_id),
      label: String(section.name || section.code || 'Section'),
      total: Number(section.total || 0)
    }))
    .filter((section) => section.total > 0);
  const grandTotal = sectionTotals.reduce((acc, section) => acc + section.total, 0);
  const maxSectionTotal = sectionTotals.reduce((acc, section) => Math.max(acc, section.total), 0);
  return sectionTotals.map((section) => {
    const percentage = grandTotal > 0 ? (section.total / grandTotal) * 100 : 0;
    return {
      key: section.key,
      label: section.label,
      total: section.total,
      percentage,
      barPct: maxSectionTotal > 0 ? (section.total / maxSectionTotal) * 100 : 0,
      displayValue: mode === 'percentage' ? percentage : section.total
    };
  });
};

export const buildMarginCurveModel = (summary: BudgetSummary | null): MarginCurveModel | null => {
  const rawCurve = summary?.margin_curve;
  const scenarioCurvePoints = scenarioSpecs
    .map(({ key }) => {
      const scenario = summary?.scenarios?.[key];
      if (!scenario) return null;
      return {
        participants: scenario.participants || 0,
        margin: scenario.margin_without_tip || 0
      };
    })
    .filter((point): point is { participants: number; margin: number } => point !== null)
    .sort((a, b) => a.participants - b.participants);
  const sourceCurvePoints =
    scenarioCurvePoints.length >= 2
      ? scenarioCurvePoints
      : (rawCurve || []).map((point) => ({
          participants: point.participants || 0,
          margin: point.margin || 0
        }));
  if (!sourceCurvePoints.length) return null;
  const width = 640;
  const height = 220;
  const padLeft = 30;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 28;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  if (plotWidth <= 0 || plotHeight <= 0) return null;

  const participants = sourceCurvePoints.map((point) => point.participants);
  const margins = sourceCurvePoints.map((point) => point.margin);
  const confirmParticipants = summary?.scenarios?.confirm_case?.participants;
  const fullParticipants = summary?.scenarios?.full_capacity_case?.participants;
  const minParticipants = Math.max(
    0,
    typeof confirmParticipants === 'number' ? confirmParticipants - 1 : Math.min(...participants)
  );
  const maxParticipants = Math.max(
    minParticipants + 1,
    typeof fullParticipants === 'number' ? fullParticipants + 1 : Math.max(...participants)
  );
  const yMin = Math.min(...margins);
  const yMax = Math.max(...margins);
  const maxAbsMargin = Math.max(1, Math.abs(yMin), Math.abs(yMax));
  const verticalHeadroomRatio = 0.1;
  const axisExtent = maxAbsMargin * (1 + verticalHeadroomRatio);
  const axisMin = -axisExtent;
  const axisMax = axisExtent;
  const yRange = axisMax - axisMin || 1;
  const participantRange = maxParticipants - minParticipants || 1;
  const plotLeft = padLeft;
  const plotRight = width - padRight;
  const plotTop = padTop;
  const plotBottom = height - padBottom;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const toX = (value: number) => {
    const rawX = padLeft + ((value - minParticipants) / participantRange) * plotWidth;
    return clamp(rawX, plotLeft, plotRight);
  };
  const toY = (value: number) => {
    const rawY = padTop + ((axisMax - value) / yRange) * plotHeight;
    return clamp(rawY, plotTop, plotBottom);
  };

  const points = sourceCurvePoints.map((point) => ({
    participants: point.participants,
    margin: point.margin,
    x: toX(point.participants),
    y: toY(point.margin)
  }));
  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const zeroY = toY(0);

  const markers = scenarioSpecs
    .map(({ key, label }) => {
      const scenario = summary?.scenarios?.[key];
      if (!scenario) return null;
      const markerLabel = key === 'worst_case_gate' ? 'Worst' : label;
      return {
        key,
        label: markerLabel,
        participants: scenario.participants || 0,
        margin: scenario.margin_without_tip || 0,
        x: toX(scenario.participants || 0),
        y: toY(scenario.margin_without_tip || 0),
        status: scenario.status || 'red'
      };
    })
    .filter((marker): marker is MarginCurveMarker => marker !== null);

  return {
    points,
    polylinePoints,
    zeroY,
    yMax,
    yMin,
    axisMax,
    axisMin,
    chartWidth: width,
    chartHeight: height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    xMin: minParticipants,
    xMax: maxParticipants,
    markers
  };
};

export const isWorstCaseGreen = (summary: BudgetSummary | null): boolean => {
  return (summary?.scenarios?.worst_case_gate?.margin_without_tip || 0) >= 0;
};

export const getWorstCaseGap = (summary: BudgetSummary | null): number => {
  return Math.abs(summary?.scenarios?.worst_case_gate?.margin_without_tip || 0);
};

export const hasFalseSafetyWarning = (summary: BudgetSummary | null): boolean => {
  const confirmMargin = summary?.scenarios?.confirm_case?.margin_without_tip || 0;
  const worstMargin = summary?.scenarios?.worst_case_gate?.margin_without_tip || 0;
  return confirmMargin >= 0 && worstMargin < 0;
};

export const isSubmitForReviewDisabled = (
  status: string | undefined,
  summary: BudgetSummary | null,
  submitting: boolean
): boolean => {
  if (submitting) return true;
  if ((status || '').trim() !== 'draft') return true;
  return !isWorstCaseGreen(summary);
};
