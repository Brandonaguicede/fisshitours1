import { useEffect, useRef } from 'react';

export interface AdminStepperStep<Id extends string = string> {
  id: Id;
  label: string;
}

interface AdminStepperProps<Id extends string> {
  steps: Array<AdminStepperStep<Id>>;
  current: Id;
  onSelect: (id: Id) => void;
  label: string;
}

/**
 * Single-row numbered stepper shared by the Tours and Botes wizards. Steps before the
 * current one are marked done; on narrow screens the row scrolls horizontally and keeps
 * the current step in view.
 */
export function AdminStepper<Id extends string>({ steps, current, onSelect, label }: AdminStepperProps<Id>) {
  const listRef = useRef<HTMLOListElement>(null);
  const currentIndex = steps.findIndex((step) => step.id === current);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [current]);

  return (
    <ol className="admin-stepper" aria-label={label} ref={listRef}>
      {steps.map((item, index) => (
        <li
          key={item.id}
          aria-current={current === item.id ? 'step' : undefined}
          className={`admin-stepper__item${current === item.id ? ' admin-stepper__item--active' : ''}${index < currentIndex ? ' admin-stepper__item--done' : ''}`}
        >
          <button type="button" onClick={() => onSelect(item.id)}><span>{index + 1}</span><strong>{item.label}</strong></button>
        </li>
      ))}
    </ol>
  );
}

export default AdminStepper;
