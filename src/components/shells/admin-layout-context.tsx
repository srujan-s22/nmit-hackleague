'use client';

import { createContext, useContext } from 'react';

/**
 * True inside src/app/admin/layout.tsx, which renders the admin shell once for
 * every /admin route. Pages (and AdminShell / SuperAdminShell used by them) check
 * this and render just their content instead of nesting a second shell, so the
 * sidebar stays mounted across navigation.
 */
export const AdminLayoutContext = createContext(false);

export function useInAdminLayout(): boolean {
  return useContext(AdminLayoutContext);
}
