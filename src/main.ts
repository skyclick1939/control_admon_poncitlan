import type { User } from '@supabase/supabase-js';
import { createApp } from './app';
import { checkSession, initAuth } from './features/auth';
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
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const userInfo = document.getElementById('user-info')!;
const mainSidebar = document.getElementById('main-sidebar')!;
const mobileMenuButton = document.getElementById('mobile-menu-button')!;
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay')!;

// --- Feature wiring (event listeners attached once) ---
// Registration order matches the original monolith's showDashboardView call
// order (members, apoyos, pagos) even though these three onRefresh listeners
// are fully independent and order-insensitive.
initMiembros(app);
initApoyos({ app, getCurrentUser });
const pagosApi = initPagos({ app, getCurrentUser });

const setActiveView = (viewId: string): void => {
  document.querySelectorAll('.page-content').forEach((view) => view.classList.add('view-hidden'));
  document.getElementById(viewId)!.classList.remove('view-hidden');
  document.querySelectorAll<HTMLElement>('.nav-link').forEach((link) => {
    link.classList.remove('bg-gray-200');
    if (link.dataset.view === viewId) link.classList.add('bg-gray-200');
  });

  if (viewId === 'pagos-content') pagosApi.renderPagosForm();
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
  dashboardView.classList.remove('view-hidden');
  setText(userInfo, `Usuario: ${user.email}`);
  await app.refresh();
  setActiveView('main-dashboard-content');
};

const showLoginView = (): void => {
  currentUser = null;
  dashboardView.classList.add('view-hidden');
  loginView.classList.remove('view-hidden');
  loginForm.reset();
};

initAuth({ onLogin: showDashboardView, onLogout: showLoginView });
setupNavigation();

void checkSession({ onLogin: showDashboardView, onLogout: showLoginView });
