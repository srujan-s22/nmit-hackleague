import React from 'react';

export function Table({
  className = '',
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-md border border-border-subtle shadow-xs">
      <table
        className={`w-full caption-bottom text-left border-collapse ${className}`.trim()}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHeader({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`border-b border-border-subtle bg-surface-subtle ${className}`.trim()}
      {...props}
    >
      {children}
    </thead>
  );
}

export function TableBody({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={`divide-y divide-border-subtle bg-surface-canvas ${className}`.trim()}
      {...props}
    >
      {children}
    </tbody>
  );
}

export function TableFooter({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={`border-t border-border-subtle bg-surface-subtle font-medium text-text-primary ${className}`.trim()}
      {...props}
    >
      {children}
    </tfoot>
  );
}

export function TableRow({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`transition-colors hover:bg-surface-subtle/80 ${className}`.trim()}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  className = '',
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`h-10 px-4 text-xs font-semibold text-text-secondary uppercase tracking-wider align-middle select-none ${className}`.trim()}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({
  className = '',
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`p-4 align-middle text-sm text-text-primary ${className}`.trim()}
      {...props}
    >
      {children}
    </td>
  );
}

export function TableCaption({
  className = '',
  children,
  ...props
}: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption
      className={`p-2 text-xs text-text-secondary ${className}`.trim()}
      {...props}
    >
      {children}
    </caption>
  );
}
