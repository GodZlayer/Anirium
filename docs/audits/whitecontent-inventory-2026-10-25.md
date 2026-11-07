# Inventário da revisão whitecontent

Gerado pelos scripts de auditoria. Alcance estático não comprova execução de um fluxo e ausência de achados lexicais não comprova conformidade.

| Arquivo | Linhas | Candidatos lexicais | Alcance |
|---|---:|---:|---|
| app/Http/Controllers/AuthController.php | 166 | 0 | fora do grafo JS |
| app/Http/Controllers/CatalogGraphController.php | 69 | 0 | fora do grafo JS |
| app/Http/Controllers/CatalogLibraryController.php | 29 | 0 | fora do grafo JS |
| app/Http/Controllers/CatalogPreviewController.php | 65 | 0 | fora do grafo JS |
| app/Http/Controllers/CatalogSearchController.php | 60 | 0 | fora do grafo JS |
| app/Http/Controllers/Controller.php | 9 | 0 | fora do grafo JS |
| app/Http/Controllers/ServiceSessionController.php | 275 | 0 | fora do grafo JS |
| app/Http/Controllers/TelemetryDeviceController.php | 720 | 0 | fora do grafo JS |
| app/Http/Middleware/HandleInertiaRequests.php | 109 | 0 | fora do grafo JS |
| app/Support/AccountAchievementCatalog.php | 43 | 0 | fora do grafo JS |
| app/Support/AccountExperience.php | 34 | 0 | fora do grafo JS |
| app/Support/AtomicFileCache.php | 14 | 0 | fora do grafo JS |
| app/Support/CatalogActionArchive.php | 18 | 0 | fora do grafo JS |
| app/Support/CatalogActionBackfill.php | 52 | 1 | fora do grafo JS |
| app/Support/CatalogActionTarget.php | 51 | 0 | fora do grafo JS |
| app/Support/CatalogActivationSource.php | 64 | 2 | fora do grafo JS |
| app/Support/CatalogContextLookup.php | 57 | 0 | fora do grafo JS |
| app/Support/CatalogDatabaseBackup.php | 31 | 0 | fora do grafo JS |
| app/Support/CatalogDatabaseRetry.php | 31 | 0 | fora do grafo JS |
| app/Support/CatalogEpisodeFeed.php | 48 | 2 | fora do grafo JS |
| app/Support/CatalogEpisodeReferenceRepair.php | 36 | 0 | fora do grafo JS |
| app/Support/CatalogEpisodeStore.php | 38 | 0 | fora do grafo JS |
| app/Support/CatalogExternalIdentityStore.php | 28 | 0 | fora do grafo JS |
| app/Support/CatalogGraphChildren.php | 47 | 0 | fora do grafo JS |
| app/Support/CatalogGraphImporter.php | 71 | 0 | fora do grafo JS |
| app/Support/CatalogGraphVisibility.php | 20 | 0 | fora do grafo JS |
| app/Support/CatalogIdentityActivation.php | 56 | 0 | fora do grafo JS |
| app/Support/CatalogIdentityImportRun.php | 75 | 0 | fora do grafo JS |
| app/Support/CatalogIdentityInput.php | 65 | 0 | fora do grafo JS |
| app/Support/CatalogIdentityStore.php | 74 | 0 | fora do grafo JS |
| app/Support/CatalogImportCheckpoint.php | 72 | 0 | fora do grafo JS |
| app/Support/CatalogImportedArcRepair.php | 41 | 0 | fora do grafo JS |
| app/Support/CatalogLibrary.php | 75 | 0 | fora do grafo JS |
| app/Support/CatalogPipelineProcessLock.php | 43 | 0 | fora do grafo JS |
| app/Support/CatalogPlaybackContext.php | 30 | 0 | fora do grafo JS |
| app/Support/CatalogPreferenceProjection.php | 29 | 0 | fora do grafo JS |
| app/Support/CatalogPreferenceReconciliation.php | 61 | 0 | fora do grafo JS |
| app/Support/CatalogRegistryAdoption.php | 41 | 0 | fora do grafo JS |
| app/Support/CatalogSearch.php | 153 | 0 | fora do grafo JS |
| app/Support/CatalogSearchFacets.php | 34 | 0 | fora do grafo JS |
| app/Support/CatalogSearchFilters.php | 43 | 0 | fora do grafo JS |
| app/Support/CatalogUnavailable.php | 6 | 0 | fora do grafo JS |
| app/Support/CatalogUserCompletion.php | 65 | 1 | fora do grafo JS |
| app/Support/CatalogWorkCompletion.php | 50 | 0 | fora do grafo JS |
| app/Support/CatalogWorkGraph.php | 38 | 0 | fora do grafo JS |
| app/Support/EntityContextAliases.php | 51 | 0 | fora do grafo JS |
| app/Support/GoogleIdentityVerifier.php | 31 | 0 | fora do grafo JS |
| app/Support/RemoteAddonReference.php | 30 | 0 | fora do grafo JS |
| resources/css/app.css | 21 | 0 | fora do grafo JS |
| resources/data/achievement-catalog.json | 12 | 0 | fora do grafo JS |
| resources/data/experience-rules.json | 2 | 0 | fora do grafo JS |
| resources/js/Components/AnimeCard.tsx | 141 | 1 | import estático / entrada |
| resources/js/Components/ArcReleaseTrack.tsx | 114 | 7 | revisar carga dinâmica ou não uso |
| resources/js/Components/ArcSourceCredit.tsx | 22 | 1 | import estático / entrada |
| resources/js/Components/CatalogCredits.tsx | 20 | 1 | import estático / entrada |
| resources/js/Components/CatalogFilterBar.tsx | 195 | 19 | import estático / entrada |
| resources/js/Components/CinematicArena.tsx | 315 | 7 | import estático / entrada |
| resources/js/Components/ContextNavigationCard.tsx | 22 | 0 | import estático / entrada |
| resources/js/Components/DribbbleContentSwitchers.tsx | 104 | 5 | import estático / entrada |
| resources/js/Components/DribbbleVerticalActionDock.tsx | 124 | 3 | import estático / entrada |
| resources/js/Components/EpisodeDiscussionFeed.tsx | 180 | 10 | import estático / entrada |
| resources/js/Components/LolProfileBadge.tsx | 441 | 54 | import estático / entrada |
| resources/js/Components/ModularHubTrack.tsx | 99 | 0 | import estático / entrada |
| resources/js/Components/ModularPlayerBox.tsx | 111 | 1 | import estático / entrada |
| resources/js/Components/OrbitalFranchiseMap.tsx | 47 | 0 | revisar carga dinâmica ou não uso |
| resources/js/Components/PlayerLaunchState.tsx | 31 | 0 | import estático / entrada |
| resources/js/Components/ProfileAddonsTab.tsx | 361 | 53 | import estático / entrada |
| resources/js/Components/ProfileCatalogLibrary.tsx | 28 | 0 | import estático / entrada |
| resources/js/Components/ProfileGamificationHub.tsx | 157 | 50 | import estático / entrada |
| resources/js/Components/ProfileLibraryTab.tsx | 117 | 11 | import estático / entrada |
| resources/js/Components/ProfileSettingsTab.tsx | 112 | 25 | import estático / entrada |
| resources/js/Components/PublicationDetails.tsx | 25 | 1 | import estático / entrada |
| resources/js/Components/RightActionDock.tsx | 117 | 4 | revisar carga dinâmica ou não uso |
| resources/js/Components/ThemeLanguageSelector.tsx | 187 | 0 | import estático / entrada |
| resources/js/Components/UnifiedCatalogExplorer.tsx | 36 | 1 | import estático / entrada |
| resources/js/Components/UnifiedCatalogFilters.tsx | 28 | 1 | import estático / entrada |
| resources/js/Components/UnifiedWorkCard.tsx | 13 | 1 | import estático / entrada |
| resources/js/Components/UserProfileModal.tsx | 228 | 13 | import estático / entrada |
| resources/js/Components/WorkArcCard.tsx | 35 | 11 | import estático / entrada |
| resources/js/Components/WorkSeasonSelector.tsx | 21 | 2 | import estático / entrada |
| resources/js/Pages/ContextView.tsx | 1606 | 134 | import estático / entrada |
| resources/js/Pages/Lobby.tsx | 557 | 19 | import estático / entrada |
| resources/js/addons/mal-sync/episodePage.tsx | 6 | 2 | revisar carga dinâmica ou não uso |
| resources/js/addons/mal-sync/manifest.json | 16 | 0 | revisar carga dinâmica ou não uso |
| resources/js/addons/player-pro/PlayerProComponent.tsx | 1880 | 109 | import estático / entrada |
| resources/js/addons/player-pro/bufferAhead.ts | 18 | 0 | import estático / entrada |
| resources/js/addons/player-pro/episodeClock.ts | 11 | 0 | import estático / entrada |
| resources/js/addons/player-pro/episodePage.tsx | 12 | 3 | revisar carga dinâmica ou não uso |
| resources/js/addons/player-pro/manifest.json | 31 | 0 | revisar carga dinâmica ou não uso |
| resources/js/addons/player-pro/playbackBuffer.ts | 46 | 0 | import estático / entrada |
| resources/js/addons/player-pro/playbackIdentity.ts | 31 | 0 | import estático / entrada |
| resources/js/addons/player-pro/playbackPreferences.ts | 17 | 0 | import estático / entrada |
| resources/js/addons/player-pro/playbackStatus.ts | 32 | 0 | import estático / entrada |
| resources/js/addons/player-pro/subtitleBundle.ts | 67 | 1 | import estático / entrada |
| resources/js/addons/player-pro/subtitleDelivery.ts | 17 | 0 | import estático / entrada |
| resources/js/addons/player-pro/subtitleOptions.ts | 16 | 0 | import estático / entrada |
| resources/js/addons/player-pro/usePlaybackBuffer.ts | 48 | 0 | import estático / entrada |
| resources/js/addons/player-pro/useSubtitleBundle.ts | 41 | 0 | import estático / entrada |
| resources/js/addons/watch-party/manifest.json | 15 | 0 | revisar carga dinâmica ou não uso |
| resources/js/app.tsx | 21 | 0 | import estático / entrada |
| resources/js/context/ThemeContext.tsx | 143 | 0 | import estático / entrada |
| resources/js/lib/accountAddonClient.ts | 17 | 0 | import estático / entrada |
| resources/js/lib/achievementCatalog.mjs | 25 | 0 | import estático / entrada |
| resources/js/lib/addonPlayerLoader.ts | 59 | 0 | revisar carga dinâmica ou não uso |
| resources/js/lib/addonRegistry.ts | 113 | 0 | import estático / entrada |
| resources/js/lib/addonTypes.ts | 83 | 0 | import estático / entrada |
| resources/js/lib/airingSchedule.ts | 73 | 0 | import estático / entrada |
| resources/js/lib/arcEvidence.mjs | 23 | 1 | import estático / entrada |
| resources/js/lib/arcNavigation.mjs | 10 | 0 | import estático / entrada |
| resources/js/lib/broadcastSchedule.mjs | 12 | 0 | revisar carga dinâmica ou não uso |
| resources/js/lib/canonicalArcs.ts | 30 | 0 | import estático / entrada |
| resources/js/lib/canonicalPreferenceWriter.mjs | 16 | 0 | import estático / entrada |
| resources/js/lib/catalogAliases.mjs | 14 | 0 | import estático / entrada |
| resources/js/lib/catalogCompletion.mjs | 16 | 0 | import estático / entrada |
| resources/js/lib/catalogEntityContext.mjs | 46 | 1 | import estático / entrada |
| resources/js/lib/catalogEntityGraph.mjs | 70 | 0 | import estático / entrada |
| resources/js/lib/catalogFilters.ts | 122 | 0 | import estático / entrada |
| resources/js/lib/catalogGenerationClient.mjs | 93 | 1 | import estático / entrada |
| resources/js/lib/catalogIdentity.mjs | 45 | 0 | import estático / entrada |
| resources/js/lib/catalogLocation.mjs | 12 | 0 | import estático / entrada |
| resources/js/lib/catalogMetadata.mjs | 20 | 0 | import estático / entrada |
| resources/js/lib/catalogRelease.mjs | 10 | 0 | import estático / entrada |
| resources/js/lib/catalogSearchRequest.mjs | 13 | 0 | import estático / entrada |
| resources/js/lib/catalogSnapshotCache.mjs | 19 | 0 | import estático / entrada |
| resources/js/lib/catalogSourceRefresh.mjs | 18 | 0 | import estático / entrada |
| resources/js/lib/catalogStrings.ts | 111 | 0 | import estático / entrada |
| resources/js/lib/catalogTransport.mjs | 16 | 0 | import estático / entrada |
| resources/js/lib/catalogUniverseIdentity.mjs | 9 | 0 | import estático / entrada |
| resources/js/lib/contextNavigation.ts | 39 | 0 | import estático / entrada |
| resources/js/lib/contextWorkRefresh.mjs | 33 | 0 | import estático / entrada |
| resources/js/lib/designStrings.ts | 848 | 109 | import estático / entrada |
| resources/js/lib/deviceFingerprint.ts | 55 | 0 | import estático / entrada |
| resources/js/lib/discussionClient.mjs | 21 | 0 | import estático / entrada |
| resources/js/lib/discussionStrings.ts | 9 | 0 | import estático / entrada |
| resources/js/lib/episodeClassification.mjs | 39 | 1 | import estático / entrada |
| resources/js/lib/episodeCompositionEvidence.mjs | 34 | 0 | import estático / entrada |
| resources/js/lib/episodeFieldEvidence.mjs | 33 | 0 | import estático / entrada |
| resources/js/lib/episodeMetadata.mjs | 65 | 1 | import estático / entrada |
| resources/js/lib/episodeMetadataLoader.mjs | 24 | 0 | import estático / entrada |
| resources/js/lib/feedRefreshClock.mjs | 5 | 0 | import estático / entrada |
| resources/js/lib/libraryReferences.mjs | 39 | 0 | import estático / entrada |
| resources/js/lib/loadSqlUniverseWorks.mjs | 26 | 1 | import estático / entrada |
| resources/js/lib/loadUniverseWorks.ts | 8 | 0 | import estático / entrada |
| resources/js/lib/parquetCatalog.ts | 371 | 7 | import estático / entrada |
| resources/js/lib/playbackStrings.ts | 9 | 0 | import estático / entrada |
| resources/js/lib/playerProAddonBootstrapper.tsx | 63 | 2 | import estático / entrada |
| resources/js/lib/progressReferences.mjs | 32 | 1 | revisar carga dinâmica ou não uso |
| resources/js/lib/telemetryXpLoop.ts | 533 | 0 | import estático / entrada |
| resources/js/lib/unifiedCatalogStrings.ts | 9 | 0 | import estático / entrada |
| resources/js/lib/universalNavigationStack.ts | 90 | 0 | import estático / entrada |
| resources/js/lib/universeMembership.mjs | 12 | 0 | import estático / entrada |
| resources/js/lib/universeRelations.ts | 27 | 3 | import estático / entrada |
| resources/js/lib/useCatalogFeed.ts | 39 | 0 | import estático / entrada |
| resources/js/lib/useCatalogLibrary.ts | 34 | 0 | import estático / entrada |
| resources/js/lib/useCatalogUpdates.ts | 29 | 0 | import estático / entrada |
| resources/js/lib/useCatalogWorkGraph.ts | 25 | 0 | import estático / entrada |
| resources/js/lib/useDiscussion.ts | 34 | 0 | import estático / entrada |
| resources/js/lib/useUnifiedCatalogSearch.ts | 38 | 0 | import estático / entrada |
| resources/js/lib/useWorkEpisodeMetadata.ts | 26 | 0 | import estático / entrada |
| resources/js/lib/workCapabilities.mjs | 12 | 0 | import estático / entrada |
| resources/views/app.blade.php | 15 | 0 | fora do grafo JS |
| resources/views/welcome.blade.php | 224 | 38 | fora do grafo JS |
| routes/console.php | 14 | 0 | fora do grafo JS |
| routes/web.php | 79 | 0 | fora do grafo JS |
| scripts/catalog/source-contracts.mjs | 27 | 0 | fora do grafo JS |
