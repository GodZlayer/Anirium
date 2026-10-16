import { type ProfileSettings } from "./privateProfileSettings";

export type ExperienceLevel = 0 | 1 | 2 | 3;

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  level_tier: ExperienceLevel;
  badge_label: string;
  created_at: number;
  settings?: ProfileSettings;
  enabledAddons?: string[];
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: number | null;
}

export interface WatchHistoryItem {
  userId: string;
  canonicalEntityId?: string;
  seasonEntityId?: string;
  resumeAvailable: boolean;
  animeId: number | null;
  seasonIdx: number | null;
  episodeNumber: number | null;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: number | null;
  animeTitle?: string;
  animeImage?: string;
}

export interface BookmarkItem {
  seasonEntityId?: string;
  id?: string;
  userId: string;
  entityType: "UNIVERSE" | "ARC" | "SERIES" | "SEASON" | "EPISODE";
  entityId: string;
  canonicalEntityId?: string;
  animeId: number;
  seasonIdx?: number | null;
  episodeNumber?: number | null;
  status: "watching" | "plan_to_watch" | "completed" | "dropped" | "on_hold" | null;
  score?: number;
  createdAt: number | null;
  animeTitle?: string;
  animeImage?: string;
}

// Definição canônica dos Níveis do Anirium:
// Nível 0: Visitante (não logado, canônico factual)
// Nível 1: Membro da Comunidade (logado, sem addons ativados por padrão)
// Nível 2: Anirium+ / Otaku Pro (exclusivo via compra/admin)
// Nível 3: Admin do Sistema (gestão de contas, tiers e Anirium+)
export const INITIAL_PROFILES: UserProfile[] = [
  {
    id: "user-level-0",
    username: "canon_guest",
    display_name: "Visitante Canônico",
    avatar_url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80",
    level_tier: 0,
    badge_label: "Canônico",
    created_at: 1711584000000,
    settings: {
      theme: "default",
      preferredAudio: "Japonês (Original)",
      preferredSubtitles: "Português (Brasil)",
      autoNextEpisode: false,
      telemetryHud: false,
    },
    enabledAddons: [],
  },
  {
    id: "user-level-1",
    username: "community_member",
    display_name: "Membro da Comunidade",
    avatar_url: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80",
    level_tier: 1,
    badge_label: "Membro",
    created_at: 1711584000000,
    settings: {
      theme: "default",
      preferredAudio: "Japonês (Original)",
      preferredSubtitles: "Português (Brasil)",
      autoNextEpisode: true,
      telemetryHud: false,
    },
    enabledAddons: [],
  },
  {
    id: "user-level-2",
    username: "otaku_pro",
    display_name: "Otaku Pro",
    avatar_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80",
    level_tier: 2,
    badge_label: "Anirium+",
    created_at: 1711584000000,
    settings: {
      theme: "default",
      preferredAudio: "Japonês (Original)",
      preferredSubtitles: "Português (Brasil)",
      autoNextEpisode: true,
      autoSkipIntro: true,
      telemetryHud: true,
    },
    enabledAddons: [],
  },
  {
    id: "user-level-3",
    username: "admin_master",
    display_name: "Administrador Geral",
    avatar_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
    level_tier: 3,
    badge_label: "Admin",
    created_at: 1711584000000,
    settings: {
      theme: "default",
      preferredAudio: "Japonês (Original)",
      preferredSubtitles: "Português (Brasil)",
      autoNextEpisode: true,
      autoSkipIntro: true,
      telemetryHud: true,
    },
    enabledAddons: [],
  },
];
