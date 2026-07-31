import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  CYBER_CAFE_LOGIN_PATH,
  STUDENT_LOGIN_PATH,
  isCyberCafePartnerPublicPath,
  isPublicLoginPath,
} from "@/lib/authRoutes";
import { STUDENT_PAYMENT_REQUIRED_PATH } from "@/lib/studentPaymentAccess";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchRolesForUser } from "@/lib/portalAuth";
import { BRAND_TAGLINE } from "@/lib/brand";

const navLinkClass =
  "relative shrink-0 whitespace-nowrap text-[13px] font-medium text-slate-600 transition-colors hover:text-slate-900 xl:text-[14px]";

type NavItem = { to: string; label: string };

const PRIMARY_LINKS: NavItem[] = [
  { to: "/", label: "Home" },
  { to: "/#about", label: "About" },
  { to: "/benefits", label: "Benefits" },
  { to: "/courses", label: "Courses" },
  { to: "/#universities", label: "Universities" },
  { to: "/#gallery", label: "Gallery" },
  { to: "/#expert-team", label: "Team" },
  { to: "/#mous", label: "MOUs" },
  { to: "/verify", label: "Verify" },
  { to: "/contact", label: "Contact" },
];

export const SiteNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onPublicLoginPage = isPublicLoginPath(pathname);
  const loginPath = isCyberCafePartnerPublicPath(pathname)
    ? CYBER_CAFE_LOGIN_PATH
    : STUDENT_LOGIN_PATH;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const checkRole = async (userId: string) => {
      try {
        const roles = await fetchRolesForUser(supabase, userId);
        setIsAdmin(roles.includes("admin"));
        setIsSuperAdmin(roles.includes("super_admin"));
        setIsStaff(roles.includes("staff"));
      } catch {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setIsStaff(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setIsAuthed(!!s);
      if (s?.user) void checkRole(s.user.id);
      else {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setIsStaff(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setIsAuthed(!!data.session);
      if (data.session?.user) void checkRole(data.session.user.id);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const showSignedInControls = isAuthed && !onPublicLoginPage;

  const authButtons = (
    <>
      {showSignedInControls ? (
        <>
          {isSuperAdmin ? (
            <Button
              size="sm"
              className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90"
              onClick={() => navigate("/super-admin")}
            >
              Super Admin
            </Button>
          ) : isAdmin ? (
            <Button
              size="sm"
              className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90"
              onClick={() => navigate("/admin")}
            >
              Admin Panel
            </Button>
          ) : isStaff ? (
            <Button
              size="sm"
              className="h-9 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90"
              onClick={() => navigate("/staff-dashboard")}
            >
              Staff Panel
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg border-primary/20 px-3 text-[13px] font-semibold text-primary hover:bg-primary/5"
                onClick={() => navigate("/dashboard")}
              >
                Dashboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-lg border-amber-200 px-3 text-[13px] font-semibold text-amber-800 hover:bg-amber-50"
                onClick={() => navigate(STUDENT_PAYMENT_REQUIRED_PATH)}
              >
                Pay fee
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-[13px] font-semibold text-slate-500"
            onClick={() => void logout()}
          >
            Logout
          </Button>
        </>
      ) : (
        <>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="btn-press h-9 rounded-lg border-primary/20 bg-white px-3 text-[13px] font-semibold text-primary hover:bg-primary/5"
          >
            <Link to={loginPath}>Login</Link>
          </Button>
          <Button
            asChild
            variant="accent"
            size="sm"
            className="btn-press h-9 rounded-lg px-3 text-[13px] font-semibold"
          >
            <Link to="/register">Register</Link>
          </Button>
        </>
      )}
    </>
  );

  return (
    <header className="relative sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <nav className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6 lg:gap-4 lg:px-8">
        <Link to="/" className="flex min-w-0 shrink items-start gap-2.5 sm:gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white p-1 shadow-sm sm:size-11">
            <img src="/logo-icon.png" alt="Apna Intern" className="size-full object-contain" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="font-display text-[18px] font-bold tracking-tight text-slate-900 sm:text-[20px]">
              <span className="text-primary">Apna</span> Intern
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
              {BRAND_TAGLINE}
            </div>
            <div className="mt-0.5 text-[8px] font-semibold uppercase leading-snug tracking-[0.04em] text-slate-400 sm:text-[9px]">
              Apna Intern
            </div>
          </div>
        </Link>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-x-2.5 xl:flex xl:gap-x-4 2xl:gap-x-5">
          {PRIMARY_LINKS.map((item) => (
            <Link key={item.to + item.label} to={item.to} className={navLinkClass}>
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">{authButtons}</div>
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </Button>
        </div>
      </nav>

      {mobileMenuOpen ? (
        <div
          id="mobile-menu"
          className="absolute left-0 top-full z-50 flex w-full flex-col gap-1 border-b border-slate-200 bg-white p-4 shadow-lg xl:hidden"
        >
          {PRIMARY_LINKS.map((item) => (
            <Link
              key={item.to + item.label}
              to={item.to}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-4 md:hidden">
            {authButtons}
          </div>
        </div>
      ) : null}
    </header>
  );
};
