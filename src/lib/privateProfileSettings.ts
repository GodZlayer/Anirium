import { validateProfileUpdateInput } from "./apiInput";
import { encryptPrivateJson, readStoredPrivateJson, profileSettingsPrivateContext } from "./privateData";

export interface ProfileSettings {
  theme?: string;
  preferredAudio?: string;
  preferredSubtitles?: string;
  autoNextEpisode?: boolean;
  autoSkipIntro?: boolean;
  telemetryHud?: boolean;
  usePlayerOnEpisodes?: boolean;
}

export function checkedProfileSettings(value: unknown): ProfileSettings {
  validateProfileUpdateInput({ settings: value });
  return { ...(value as ProfileSettings) };
}

export function readProfileSettings(owner: string, stored: unknown): ProfileSettings {
  return checkedProfileSettings(readStoredPrivateJson(stored, profileSettingsPrivateContext(owner)));
}

export function encodeProfileSettings(owner: string, value: unknown) {
  return encryptPrivateJson(checkedProfileSettings(value), profileSettingsPrivateContext(owner));
}
