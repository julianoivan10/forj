import {
  Bell,
  Bookmark,
  Briefcase,
  FileSignature,
  FileText,
  LayoutList,
  MessageSquare,
  Search,
  Settings,
  Sparkles,
  UserSquare,
} from 'lucide-react';

export type Mode = 'client' | 'freelancer' | 'both';

export interface NavItem {
  key: string;
  labelKey: string;
  href: string | ((username: string | null) => string);
  icon: React.ComponentType<{ className?: string }>;
  /** Perspectives that see this item. */
  modes: Mode[];
  badge?: 'messages' | 'notifications';
  /** Shown in the mobile bottom bar (in this order); everything else lives under "More". */
  tab?: number;
  /** Treat nested routes as active (e.g. /dashboard/contracts/123). */
  prefix?: boolean;
  dataTour?: string;
}

export interface NavSection {
  key: string;
  titleKey: string;
  items: NavItem[];
}

const ALL: Mode[] = ['client', 'freelancer', 'both'];
const FREELANCE: Mode[] = ['freelancer', 'both'];
const HIRING: Mode[] = ['client', 'both'];

/**
 * One navigation model for the desktop rail, the mobile tab bar and the
 * mobile "More" sheet. Organised around what people do (work, inbox,
 * saved, you) rather than around database tables.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'work',
    titleKey: 'shell.work',
    items: [
      { key: 'console', labelKey: 'shell.console', href: '/dashboard', icon: LayoutList, modes: ALL, tab: 1 },
      { key: 'contracts', labelKey: 'shell.contracts', href: '/dashboard/contracts', icon: FileSignature, modes: ALL, tab: 2, prefix: true },
      { key: 'find', labelKey: 'shell.findWork', href: '/jobs', icon: Search, modes: FREELANCE, tab: 3 },
      { key: 'posted', labelKey: 'shell.postedJobs', href: '/dashboard/jobs', icon: Briefcase, modes: HIRING, tab: 3, prefix: true },
      { key: 'proposals', labelKey: 'shell.proposals', href: '/dashboard/proposals', icon: FileText, modes: FREELANCE, prefix: true },
      { key: 'services', labelKey: 'shell.services', href: '/dashboard/services', icon: Sparkles, modes: FREELANCE, prefix: true },
    ],
  },
  {
    key: 'inbox',
    titleKey: 'shell.inbox',
    items: [
      { key: 'messages', labelKey: 'shell.messages', href: '/dashboard/messages', icon: MessageSquare, modes: ALL, badge: 'messages', tab: 4, prefix: true },
      { key: 'activity', labelKey: 'shell.activity', href: '/dashboard/notifications', icon: Bell, modes: ALL, badge: 'notifications' },
    ],
  },
  {
    key: 'saved',
    titleKey: 'shell.saved',
    items: [
      { key: 'savedJobs', labelKey: 'shell.savedJobs', href: '/dashboard/saved', icon: Bookmark, modes: FREELANCE, dataTour: 'sidebar-saved' },
      { key: 'savedServices', labelKey: 'shell.savedServices', href: '/dashboard/saved-services', icon: Bookmark, modes: HIRING },
    ],
  },
  {
    key: 'you',
    titleKey: 'shell.you',
    items: [
      { key: 'profile', labelKey: 'shell.profile', href: (u) => (u ? `/u/${u}` : '/dashboard/settings'), icon: UserSquare, modes: ALL },
      { key: 'settings', labelKey: 'shell.settings', href: '/dashboard/settings', icon: Settings, modes: ALL, prefix: true, dataTour: 'sidebar-settings' },
    ],
  },
];

export function resolveHref(item: NavItem, username: string | null): string {
  return typeof item.href === 'function' ? item.href(username) : item.href;
}

export function isActive(item: NavItem, href: string, pathname: string): boolean {
  if (pathname === href) return true;
  return Boolean(item.prefix) && href !== '/dashboard' && pathname.startsWith(`${href}/`);
}

export function sectionsFor(mode: Mode): NavSection[] {
  return NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.modes.includes(mode)) })).filter(
    (s) => s.items.length > 0,
  );
}

/** Up to four tab-bar destinations for this perspective, then "More". */
export function tabsFor(mode: Mode): NavItem[] {
  const seen = new Set<number>();
  return NAV_SECTIONS.flatMap((s) => s.items)
    .filter((i) => i.tab != null && i.modes.includes(mode))
    .sort((a, b) => (a.tab ?? 0) - (b.tab ?? 0))
    .filter((i) => (seen.has(i.tab!) ? false : (seen.add(i.tab!), true)));
}
