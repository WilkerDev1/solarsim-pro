import React from 'react';
import { cx } from './cx';

export interface StatItem {
  label: string;
  value: string;
  /** `accent` solo para el precio de venta. */
  tone?: 'default' | 'accent';
}

export interface StatStripProps {
  items: StatItem[];
}

export const StatStrip: React.FC<StatStripProps> = ({ items }) => (
  <dl className={cx('m-0 grid gap-1', items.length >= 3 ? 'grid-cols-3' : 'grid-cols-2')}>
    {items.map(item => (
      <div key={item.label} className="min-w-0 rounded-md bg-pd-item px-2.5 py-2">
        <dt className="text-[11px] text-pd-muted">{item.label}</dt>
        <dd className={cx('m-0 truncate font-mono text-[13px] font-semibold', item.tone === 'accent' ? 'text-pd-accent' : 'text-pd-text')}>{item.value}</dd>
      </div>
    ))}
  </dl>
);
