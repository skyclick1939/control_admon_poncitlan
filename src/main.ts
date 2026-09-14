import type { User } from '@supabase/supabase-js';
import { createApp } from './app';
import { checkSession, initAuth } from './features/auth';
import { challengeTotp, enrollTotp, hasVerifiedTotpFactor, requiresForcedEnrollment, verifyTotp } from './features/auth/mfa';
import { initAdmin } from './features/admin';
import { initBankConfig } from './features/admin/bank-config';
import { checkCurrentAdmin } from './features/admin/repo';
import { initApoyos } from './features/apoyos';
import { initializeDashboard } from './features/dashboard';
import { initMiembros } from './features/miembros';
import { initPagos } from './features/pagos';
import { setText } from './lib/escape';

const app = createApp();
let currentUser: User | null = null;
const getCurrentUser = (): User | null => currentUser;

// --- Shell DOM refs (view toggling, navigation — not owned by any single feature) ---
const loginView = document.getElementById('login-view')!;
const dashboardView = document.getElementById('dashboard-view')!;
const mfaEnrollView = document.getElementById('mfa-enroll-view')!;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const userInfo = document.getElementById('user-info')!;
const mainSidebar = document.getElementById('main-sidebar')!;
const mobileMenuButton = document.getElementById('mobile-menu-button')!;
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay')!;
const navAdminLink = document.getElementById('nav-admin-link')!;

// --- Forced MFA enrollment gate DOM refs (spec superadmin-mfa — TOTP Enrollment) ---
const mfaEnrollForm = document.getElementById('mfa-enroll-form') as HTMLFormElement;
const mfaEnrollQr = document.getElementById('mfa-enroll-qr') as HTMLImageElement;
const mfaEnrollSecret = document.getElementById('mfa-enroll-secret')!;
const mfaEnrollCode = document.getElementById('mfa-enroll-code') as HTMLInputElement;
const mfaEnrollFeedback = document.getElementById('mfa-enroll-feedback')!;
const mfaEnrollButton = document.getElementById('mfa-enroll-verify-button') as HTMLButtonElement;
let pendingEnrollmentFactorId: string | null = null;

// --- Feature wiring (event listeners attached once) ---
// Registration order matches the original monolith's showDashboardView call
// order (members, apoyos, pagos) even though these three onRefresh listeners
// are fully independent and order-insensitive.
initMiembros(app);
initApoyos({ app, getCurrentUser });
const pagosApi = initPagos({ app, getCurrentUser });
const adminApi = initAdmin({ getCurrentUser });
const bankConfigApi = initBankConfig({ getCurrentUser });

const setActiveView = (viewId: string): void => {
  document.querySelectorAll('.page-content').forEach((view) => view.classList.add('view-hidden'));
  document.getElementById(viewId)!.classList.remove('view-hidden');
  document.querySelectorAll<HTMLElement>('.nav-link').forEach((link) => {
    link.classList.remove('bg-gray-200');
    if (link.dataset.view === viewId) link.classList.add('bg-gray-200');
  });

  if (viewId === 'pagos-content') pagosApi.renderPagosForm();
  if (viewId === 'admin-content') {
    void adminApi.refresh();
    void bankConfigApi.refresh();
  }
  if (viewId === 'main-dashboard-content') void initializeDashboard();

  mainSidebar.classList.remove('open');
  mobileMenuOverlay.classList.add('view-hidden');
};

const setupNavigation = (): void => {
  mainSidebar.querySelectorAll<HTMLElement>('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveView((e.target as HTMLElement).closest<HTMLElement>('.nav-link')!.dataset.view!);
    });
  });

  mobileMenuButton.addEventListener('click', () => {
    mainSidebar.classList.toggle('open');
    mobileMenuOverlay.classList.toggle('view-hidden');
  });

  mobileMenuOverlay.addEventListener('click', () => {
    mainSidebar.classList.remove('open');
    mobileMenuOverlay.classList.add('view-hidden');
  });
};

const showDashboardView = async (user: User): Promise<void> => {
  currentUser = user;
  loginView.classList.add('view-hidden');
  mfaEnrollView.classList.add('view-hidden');
  dashboardView.classList.remove('view-hidden');
  setText(userInfo, `Usuario: ${user.email}`);
  await app.refresh();
  setActiveView('main-dashboard-content');
};

const showLoginView = (): void => {
  currentUser = null;
  navAdminLink.classList.add('view-hidden');
  dashboardView.classList.add('view-hidden');
  mfaEnrollView.classList.add('view-hidden');
  loginView.classList.remove('view-hidden');
  loginForm.reset();
};

/**
 * Forced TOTP enrollment screen (spec superadmin-mfa — TOTP Enrollment).
 * Shown instead of the dashboard when `requiresForcedEnrollment` is true. A
 * fresh `enrollTotp()` call is made every time the gate opens, matching
 * design.md's enrollment sequence diagram — the factor stays unverified
 * until the form below completes `challengeTotp` + `verifyTotp`.
 */
const showMfaEnrollView = async (): Promise<void> => {
  loginView.classList.add('view-hidden');
  dashboardView.classList.add('view-hidden');
  mfaEnrollView.classList.remove('view-hidden');
  mfaEnrollFeedback.textContent = '';
  mfaEnrollForm.reset();
  pendingEnrollmentFactorId = null;

  try {
    const enrollment = await enrollTotp();
    pendingEnrollmentFactorId = enrollment.factorId;
    mfaEnrollQr.src = enrollment.qrCode;
    setText(mfaEnrollSecret, enrollment.secret);
  } catch (error) {
    console.error('Error al iniciar la inscripción de MFA:', error);
    mfaEnrollFeedback.textContent = 'No se pudo iniciar la verificación en dos pasos. Intenta de nuevo.';
  }
};

mfaEnrollForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  mfaEnrollFeedback.textContent = '';

  const enrollingUser = getCurrentUser();
  if (!pendingEnrollmentFactorId || !enrollingUser) return;

  mfaEnrollButton.disabled = true;
  try {
    const challengeId = await challengeTotp(pendingEnrollmentFactorId);
    await verifyTotp(pendingEnrollmentFactorId, challengeId, mfaEnrollCode.value.trim());
    await showDashboardView(enrollingUser);
  } catch {
    mfaEnrollFeedback.textContent = 'Código incorrecto. Verifica la hora de tu dispositivo e intenta de nuevo.';
  } finally {
    mfaEnrollButton.disabled = false;
  }
});

/**
 * Runs right after a session resolves a user: determines admin/superadmin
 * status and TOTP verification status (specs auth-roles, superadmin-mfa),
 * toggles the admin nav link, and routes to the forced-enrollment gate or
 * straight to the dashboard. Client-side only — the real boundary is the
 * database's restrictive AAL2 policy on `app_admins` writes.
 */
const handleLogin = async (user: User): Promise<void> => {
  currentUser = user;

  let isSuperadmin = false;
  navAdminLink.classList.add('view-hidden');
  try {
    const admin = await checkCurrentAdmin(user.id);
    navAdminLink.classList.toggle('view-hidden', admin === null);
    isSuperadmin = admin?.rol === 'superadmin';
  } catch (error) {
    console.error('No se pudo verificar el rol de administrador:', error);
  }

  let hasVerifiedTotp = false;
  try {
    hasVerifiedTotp = await hasVerifiedTotpFactor();
  } catch (error) {
    console.error('No se pudo verificar el estado de MFA:', error);
  }

  if (requiresForcedEnrollment(isSuperadmin, hasVerifiedTotp)) {
    await showMfaEnrollView();
    return;
  }

  await showDashboardView(user);
};

initAuth({ onLogin: handleLogin, onLogout: showLoginView });
setupNavigation();

void checkSession({ onLogin: handleLogin, onLogout: showLoginView });
