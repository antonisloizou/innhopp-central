type ChecklistStatusTagVariant = 'blocked' | 'clear' | 'proceeding' | 'completed' | 'overridden';

type ChecklistStatusTagProps = {
  variant: ChecklistStatusTagVariant;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function ChecklistStatusTag({ variant, title, detail, actionLabel, onAction }: ChecklistStatusTagProps) {
  return (
    <div className={`checklist-status-tag checklist-status-tag--${variant}`}>
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
      {actionLabel && onAction && <button type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}
