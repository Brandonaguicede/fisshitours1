interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, label, description, disabled }: ToggleSwitchProps) {
  return (
    <div className="admin-switch-field">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`admin-switch${checked ? ' admin-switch--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="admin-switch__knob" />
      </button>
      <span className="admin-switch__text">
        <span className="admin-switch__label">{label}</span>
        {description ? <span className="admin-switch__description">{description}</span> : null}
        <span className={`admin-switch__state${checked ? ' admin-switch__state--on' : ''}`}>
          {checked ? 'Activo' : 'Inactivo'}
        </span>
      </span>
    </div>
  );
}

export default ToggleSwitch;
