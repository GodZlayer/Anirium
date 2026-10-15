interface InstalledAddon {
  addon_id: string;
  enabled: unknown;
  config_json: unknown;
  canonical_plugin_id?: string | null;
  selected_release_id?: string | null;
  selected_version?: string | null;
  selected_source_kind?: string | null;
}

/** Called only after account/session/entitlement validation. Metadata is not a
 * grant; the account allowlist and enabled relation remain the authority. */
export function projectAuthorizedAddons(installed: InstalledAddon[], authorizedIds: string[]) {
  const allowed = new Set(authorizedIds);
  return installed.filter(addon => addon.enabled === true && allowed.has(addon.addon_id))
    .map(addon => ({
      id:addon.addon_id, config:addon.config_json,
      canonicalPluginId:addon.canonical_plugin_id ?? null,
      selectedReleaseId:addon.selected_release_id ?? null,
      selectedVersion:addon.selected_version ?? null,
      releaseOrigin:addon.selected_source_kind ?? null,
      authorizationPolicy:"account-addon-allowlist" as const,
    }));
}
