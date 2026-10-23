import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function PointsHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/points');
  }

  // Check if authenticated user is an administrator
  const { data: admin } = await supabase
    .from('admin_profiles')
    .select('is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (admin && admin.is_active) {
    redirect('/admin/points');
  }

  // Otherwise route to student points
  redirect('/student/points');
}
