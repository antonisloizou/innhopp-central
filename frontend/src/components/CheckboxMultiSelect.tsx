import { useEffect, useRef } from 'react';

type CheckboxMultiSelectOption = {
  value: string;
  label: string;
};

type CheckboxMultiSelectProps = {
  summary: string;
  options: CheckboxMultiSelectOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  clearLabel: string;
  emptyLabel: string;
};

const CheckboxMultiSelect = ({
  summary,
  options,
  selectedValues,
  onChange,
  clearLabel,
  emptyLabel
}: CheckboxMultiSelectProps) => {
  const dropdownRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (dropdownRef.current?.open && target && !dropdownRef.current.contains(target)) {
        dropdownRef.current.removeAttribute('open');
      }
    };

    document.addEventListener('mousedown', handleOutsidePointer);
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
    };
  }, []);

  const toggleValue = (value: string, checked: boolean) => {
    if (checked) {
      onChange(selectedValues.includes(value) ? selectedValues : [...selectedValues, value]);
      return;
    }
    onChange(selectedValues.filter((current) => current !== value));
  };

  return (
    <details className="multi-select-dropdown" ref={dropdownRef}>
      <summary>{summary}</summary>
      <div className="multi-select-panel">
        {selectedValues.length > 0 ? (
          <button type="button" className="multi-select-option multi-select-option-clear" onClick={() => onChange([])}>
            {clearLabel}
          </button>
        ) : null}
        {options.length === 0 ? (
          <div className="muted logistics-dashboard-empty-option">{emptyLabel}</div>
        ) : (
          options.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <label key={option.value} className="multi-select-option">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => toggleValue(option.value, event.target.checked)}
                />
                <span className="multi-select-option-label">{option.label}</span>
              </label>
            );
          })
        )}
      </div>
    </details>
  );
};

export default CheckboxMultiSelect;
