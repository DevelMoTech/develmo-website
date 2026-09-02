import type { ComponentProps, ReactNode } from "react";

// Labelled inputs with the accessibility wiring built in: htmlFor on every
// label, aria-invalid + aria-describedby on errors, help text linked by id.

type FieldProps = {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  className?: string;
};

function describedBy(id: string, help?: ReactNode, error?: string | null) {
  const ids = [error ? `${id}-err` : null, help ? `${id}-help` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

function FieldFrame({ id, label, help, error, className, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className={["adm-field", className].filter(Boolean).join(" ")}>
      <label className="adm-label" htmlFor={id}>{label}</label>
      {children}
      {error && <p id={`${id}-err`} className="adm-error">{error}</p>}
      {help && !error && <p id={`${id}-help`} className="adm-help">{help}</p>}
    </div>
  );
}

export function Input({ id, label, help, error, className, ...rest }: FieldProps & Omit<ComponentProps<"input">, "id" | "className">) {
  return (
    <FieldFrame id={id} label={label} help={help} error={error} className={className}>
      <input id={id} className="adm-input" aria-invalid={error ? "true" : undefined} aria-describedby={describedBy(id, help, error)} {...rest} />
    </FieldFrame>
  );
}

export function Textarea({ id, label, help, error, className, ...rest }: FieldProps & Omit<ComponentProps<"textarea">, "id" | "className">) {
  return (
    <FieldFrame id={id} label={label} help={help} error={error} className={className}>
      <textarea id={id} className="adm-input" aria-invalid={error ? "true" : undefined} aria-describedby={describedBy(id, help, error)} {...rest} />
    </FieldFrame>
  );
}

export function Select({
  id,
  label,
  help,
  error,
  className,
  options,
  ...rest
}: FieldProps & Omit<ComponentProps<"select">, "id" | "className"> & { options: { value: string; label: string }[] }) {
  return (
    <FieldFrame id={id} label={label} help={help} error={error} className={className}>
      <select id={id} className="adm-input adm-select" aria-invalid={error ? "true" : undefined} aria-describedby={describedBy(id, help, error)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldFrame>
  );
}

export function Checkbox({ id, label, ...rest }: { id: string; label: ReactNode } & Omit<ComponentProps<"input">, "id" | "type">) {
  return (
    <label className="adm-check" htmlFor={id}>
      <input id={id} type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}
