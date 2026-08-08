import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import {
  clearAdminSessionExpiry,
  ensureAdminAuthSession,
  isAdminPortalSessionActive,
  recoverAdminSessionAfterSignOut,
  isAdminIntentionalLogout,
} from '@/lib/adminAuthSession';
import { isStudentPortalSessionActive } from '@/lib/studentAuthSession';
import { fetchCybercafeExists, fetchRolesForUser, hasPortalRole, readRolesFromUser } from '@/lib/portalAuth';

export type UserRole = 'super_admin' | 'admin' | 'staff' | 'student' | 'cybercafe' | 'college_admin' | 'referral_partner';

const ROLES_CACHE_PREFIX = 'ezyintern_cached_roles_';

function readCachedRoles(userId: string): UserRole[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(`${ROLES_CACHE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserRole[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedRoles(userId: string, roles: UserRole[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${ROLES_CACHE_PREFIX}${userId}`, JSON.stringify(roles));
  } catch {
    /* ignore quota errors */
  }
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const rolesRef = useRef<UserRole[]>([]);
  const lastCheckUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async (opts?: { force?: boolean }) => {
      try {
        if (isAdminPortalSessionActive()) {
          await ensureAdminAuthSession(supabase);
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!session) {
          setUser(null);
          setRoles([]);
          rolesRef.current = [];
          lastCheckUserIdRef.current = null;
          setLoading(false);
          return;
        }

        setUser(session.user);

        if (
          !opts?.force &&
          lastCheckUserIdRef.current === session.user.id &&
          rolesRef.current.length > 0
        ) {
          setLoading(false);
          return;
        }

        let rolesList: UserRole[] = [];
        const fromMeta = readRolesFromUser(session.user, session.user.id) as UserRole[] | null;
        if (fromMeta?.length) {
          rolesList = [...fromMeta];
        } else {
          const cached = readCachedRoles(session.user.id);
          if (cached.length > 0) {
            rolesList = [...cached];
          }
        }

        if (!rolesList.length) {
          try {
            const { data: { user: freshUser } } = await supabase.auth.getUser();
            const fromUser = readRolesFromUser(freshUser, session.user.id) as UserRole[] | null;
            if (fromUser?.length) {
              rolesList = [...fromUser];
            }
          } catch {
            /* ignore */
          }
        }

        if (!rolesList.length) {
          try {
            const roles = await fetchRolesForUser(supabase, session.user.id);
            rolesList = roles as UserRole[];
          } catch (rolesError) {
            const msg =
              rolesError instanceof Error
                ? rolesError.message
                : typeof rolesError === "object" && rolesError && "message" in rolesError
                  ? String((rolesError as { message: unknown }).message)
                  : String(rolesError);
            console.error('[useAuth] user_roles:', msg);
            if (!rolesList.length) {
              setLoading(false);
              return;
            }
          }
        }

        if (cancelled) return;

        // Apply roles before optional cybercafe lookup so a secondary failure cannot leave roles empty.
        rolesRef.current = rolesList;
        lastCheckUserIdRef.current = session.user.id;
        setRoles(rolesList);

        const needsCybercafeCheck = !hasPortalRole(rolesList);
        let cybercafe = false;
        if (needsCybercafeCheck) {
          try {
            cybercafe = await fetchCybercafeExists(supabase, session.user.id);
          } catch (cyberErr) {
            console.warn('[useAuth] cybercafe_profiles check skipped:', cyberErr);
          }
        }

        if (cancelled) return;

        if (cybercafe && !rolesList.includes('cybercafe')) {
          rolesList.push('cybercafe');
        }

        if (rolesList.length === 0) {
          rolesList.push('student');
        }

        rolesRef.current = rolesList;
        writeCachedRoles(session.user.id, rolesList);
        setRoles(rolesList);
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void checkAuth({ force: true });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        if (session) setUser(session.user);
        return;
      }

      if (session) {
        setUser(session.user);
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          setLoading(true);
          void checkAuth({ force: event === 'SIGNED_IN' });
        }
      } else if (event === 'SIGNED_OUT') {
        void (async () => {
          if (isAdminIntentionalLogout()) {
            if (cancelled) return;
            setUser(null);
            setRoles([]);
            rolesRef.current = [];
            setLoading(false);
            return;
          }
          if (isAdminPortalSessionActive()) {
            const recovered = await recoverAdminSessionAfterSignOut(supabase);
            if (recovered && !cancelled) {
              const { data: { session: retry } } = await supabase.auth.getSession();
              if (retry) {
                setUser(retry.user);
                setLoading(true);
                await checkAuth();
                return;
              }
            }
            clearAdminSessionExpiry();
          }
          if (cancelled) return;
          setUser(null);
          setRoles([]);
          rolesRef.current = [];
          setLoading(false);
        })();
      }
    });

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (isAdminPortalSessionActive()) {
        void ensureAdminAuthSession(supabase).then((ok) => {
          if (!ok || cancelled) return;
          void supabase.auth.getSession().then(({ data: { session } }) => {
            if (session && !cancelled) setUser(session.user);
          });
        });
        return;
      }
      if (isStudentPortalSessionActive()) {
        void supabase.auth.getSession().then(({ data: { session } }) => {
          if (session && !cancelled) setUser(session.user);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { user, roles, loading };
};
