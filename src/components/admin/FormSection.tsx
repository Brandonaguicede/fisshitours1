import type { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FormSection({ title, description, icon, children, className }: FormSectionProps) {
  return (
    <section className={`admin-form-section${className ? ` ${className}` : ''}`}>
      <header className="admin-form-section__head">
        {icon ? <span className="admin-form-section__icon">{icon}</span> : null}
        <div>
          <h3 className="admin-form-section__title">{title}</h3>
          {description ? <p className="admin-form-section__description">{description}</p> : null}
        </div>
      </header>
      <div className="admin-form-section__fields">{children}</div>
    </section>
  );
}

export default FormSection;
