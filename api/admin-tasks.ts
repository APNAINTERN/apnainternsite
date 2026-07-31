import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServerDb } from './lib/getServerDb';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { action, email, password, roleTag, permissions, role } = req.body;

  let db;
  try {
    db = getServerDb();
  } catch (cfgErr: unknown) {
    const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
    return res.status(500).json({ success: false, message: msg });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error('Authorization required');

    const token = authHeader.split(' ')[1];
    const { data: userData, error: authError } = await db.auth.getUser(token);
    const user = userData?.user;
    if (authError || !user) throw new Error('Invalid or expired session');

    const { data: roles } = await db.from('user_roles').select('role').eq('user_id', user.id);
    const roleRows = (roles || []) as Array<{ role: string }>;
    const isAdmin = roleRows.some((r) => r.role === 'admin' || r.role === 'super_admin');
    if (!isAdmin) throw new Error('Unauthorized: Admin access required');

    if (action === 'create_sub_user') {
      if (!email || !password || !roleTag) throw new Error('Email, Password, and Role Tag are required');
      const userRole = role === 'staff' ? 'staff' : 'admin';

      const { data: newUser, error: createError } = await db.auth.admin.createUser({
        email: String(email).trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { full_name: roleTag },
      });

      if (createError) throw createError;
      const userId = newUser?.user?.id;
      if (!userId) throw new Error('User creation failed');

      await db.from('user_roles').upsert({ user_id: userId, role: userRole }, { onConflict: 'user_id,role' });
      await db.from('profiles').upsert({
        id: userId,
        full_name: roleTag,
        email: String(email).trim().toLowerCase(),
      });
      await db.from('admin_staff').upsert({
        id: userId,
        email: String(email).trim().toLowerCase(),
        full_name: roleTag,
        role_tag: roleTag,
        permissions: permissions || {},
      });
      await db.from('admin_permissions').upsert({
        user_id: userId,
        can_manage_students: permissions?.can_manage_students ?? true,
        can_manage_classes: permissions?.can_manage_classes ?? true,
        can_manage_certificates: permissions?.can_manage_certificates ?? true,
        can_manage_institutions: permissions?.can_manage_institutions ?? true,
        can_view_payments: permissions?.can_view_payments ?? true,
        can_manage_leads: permissions?.can_manage_leads ?? true,
        can_manage_notifications: permissions?.can_manage_notifications ?? true,
        can_manage_assignments: permissions?.can_manage_assignments ?? true,
        can_manage_communications: permissions?.can_manage_communications ?? true,
      });

      return res.status(200).json({ success: true, userId, role: userRole });
    }

    if (action === 'force_logout') {
      const { target_user_id } = req.body;
      if (!target_user_id) throw new Error('target_user_id is required');

      const isSuperAdmin = roleRows.some((r) => r.role === 'super_admin');
      if (!isSuperAdmin) throw new Error('Unauthorized: Super Admin access required to force logout admins');

      const { error: signOutError } = await db.auth.admin.signOut(target_user_id, 'global');
      if (signOutError) throw signOutError;

      return res.status(200).json({ success: true, message: 'User has been logged out from all devices' });
    }

    return res.status(400).json({ success: false, message: `Action "${action}" not implemented` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Admin tasks API error:', err);
    return res.status(500).json({ success: false, error: message });
  }
}
