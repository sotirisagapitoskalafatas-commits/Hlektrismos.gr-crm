import { useEffect, useState } from 'react';
import { fetchStaff } from '@/lib/api';
import type { StaffProfile } from '@/lib/api';

/** Staff directory (names/roles) as returned by the existing profiles query; RLS decides visibility. */
export function useStaff() {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  useEffect(() => { void fetchStaff().then(setStaff); }, []);
  return staff;
}
