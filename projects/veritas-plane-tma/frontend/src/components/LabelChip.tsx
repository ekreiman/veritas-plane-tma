import type { PlaneLabel } from '../api/types';

interface LabelChipProps {
  labelId: string;
  labels: PlaneLabel[];
}

export function LabelChip({ labelId, labels }: LabelChipProps) {
  const label = labels.find((l) => l.id === labelId);
  if (!label) return null;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${label.color}22`, color: label.color }}
    >
      {label.name}
    </span>
  );
}
