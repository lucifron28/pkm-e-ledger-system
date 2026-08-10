import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "dark";
type ButtonVariant = "primary" | "secondary" | "quiet" | "success" | "danger" | "dark";

const buttonClasses: Record<ButtonVariant, string> = {
  primary: "ui-button ui-button-primary",
  secondary: "ui-button ui-button-secondary",
  quiet: "ui-button ui-button-quiet",
  success: "ui-button ui-button-success",
  danger: "ui-button ui-button-danger",
  dark: "ui-button ui-button-dark",
};

const toneClasses: Record<Tone, string> = {
  neutral: "ui-metric ui-metric-neutral",
  brand: "ui-metric ui-metric-brand",
  success: "ui-metric ui-metric-success",
  warning: "ui-metric ui-metric-warning",
  danger: "ui-metric ui-metric-danger",
  dark: "ui-metric ui-metric-dark",
};

export function Button({
  variant = "primary",
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button className={`${buttonClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link href={href} className={`${buttonClasses[variant]} ${className}`} {...props}>
      {children}
    </Link>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="ui-page-header">
      <div className="min-w-0">
        {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
        <h1 className="ui-page-title">{title}</h1>
        {description && <p className="ui-page-description">{description}</p>}
      </div>
      <div className="ui-page-actions">
        {backHref && (
          <Link href={backHref} className="ui-inline-link">
            <span aria-hidden="true">&larr;</span> {backLabel}
          </Link>
        )}
        {actions}
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-panel ${className}`}>
      {(title || description || actions) && (
        <div className="ui-panel-header">
          <div className="min-w-0">
            {title && <h2 className="ui-panel-title">{title}</h2>}
            {description && <p className="ui-panel-description">{description}</p>}
          </div>
          {actions && <div className="ui-panel-actions">{actions}</div>}
        </div>
      )}
      <div className="ui-panel-body">{children}</div>
    </section>
  );
}

export function MetricCard({
  label,
  value,
  help,
  tone = "neutral",
  className = "",
}: {
  label: string;
  value: ReactNode;
  help?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={`${toneClasses[tone]} ${className}`}>
      <p className="ui-metric-label">{label}</p>
      <p className="ui-metric-value">{value}</p>
      {help && <p className="ui-metric-help">{help}</p>}
    </div>
  );
}

export function StatusPanel({
  tone = "warning",
  title,
  children,
  action,
}: {
  tone?: "success" | "warning" | "danger" | "brand";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`ui-status ui-status-${tone}`} role={tone === "danger" ? "alert" : undefined}>
      <div className="min-w-0">
        <h2 className="ui-status-title">{title}</h2>
        {children && <div className="ui-status-body">{children}</div>}
      </div>
      {action && <div className="ui-status-action">{action}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="ui-section-label">{children}</p>;
}
