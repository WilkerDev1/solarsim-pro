import React from 'react';
import { cx } from './cx';

export interface SubHeaderProps {
  title: string;
  /** Un SubHeaderIconButton o SubHeaderTextButton. */
  action?: React.ReactNode;
}

export const SubHeader: React.FC<SubHeaderProps> = ({ title, action }) => (
  <div className="mt-2 flex min-h-7 items-center justify-between">
    <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-pd-muted">{title}</h3>
    {action}
  </div>
);

export interface SubHeaderIconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Texto accesible obligatorio: el botón solo tiene ícono. */
  label: string;
  icon: React.ReactNode;
}

export const SubHeaderIconButton: React.FC<SubHeaderIconButtonProps> = ({ label, icon, className, ...button }) => (
  <button
    type="button"
    {...button}
    aria-label={label}
    className={cx('inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-pd-strong disabled:cursor-default disabled:opacity-50', className)}
  >
    {icon}
  </button>
);

export interface SubHeaderTextButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  /** Estado de un botón de alternancia («Bloqueado»). */
  pressed?: boolean;
}

export const SubHeaderTextButton: React.FC<SubHeaderTextButtonProps> = ({ icon, pressed, className, children, ...button }) => (
  <button
    type="button"
    aria-pressed={pressed}
    {...button}
    className={cx('inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-pd-outline bg-transparent px-2.5 text-xs font-medium text-pd-strong disabled:cursor-default disabled:opacity-50', className)}
  >
    {icon}
    {children}
  </button>
);
