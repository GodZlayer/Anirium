# Release acceptance audit

Status: **not release-ready**. Passing component builds does not prove the full
requested playback system. Existing tests must not redefine the original scope.

## Current state checked on 2026-10-03

- Window source-weight priority was corrected after the 2.3.14 package:
  discovery records actual selected episode-file lengths; quality-filtered
  compatible inputs are stably sorted by increasing length, with unknown
  lengths retained last as fallbacks. Reference/discovery order is not mutated.
  Focused quality/weight, empty-source recovery and prefetch tests passed
  (2.596s), as did Go vet. Complete Service suite passed (43.717s). A real
  multi-file torrent metadata fixture with distinct episode-file lengths also
  passed (0.509s), proving weight is not the entire torrent or another episode.
  Repackaging as 2.3.15 succeeded: complete packaging-gate tests (42.834s),
  actual staged EXE/bundled-tool diagnostics and MakeAppx creation passed.
  Artifact hashes are recorded in MSIX-RELEASE.md. The 2.3.14 package remains
  unchanged and does not contain this correction.

- Actual Core route code with a newly isolated PostgreSQL instance passed beta
  activation, Plus gating, second-Player rejection, account-scoped providers,
  provider disabling, beta revocation, closed-instance rejection and replacement.
  The disposable container and its volume were removed after identity checks;
  production data was not modified. This is route/SQL integration evidence,
  not installed Service or browser playback acceptance.

- Latest immutable local package is MSIX 2.3.15.0, including weight priority,
  empty-video and
  compatible-audio fallback fixes. EXE/bundled-tool encoding diagnostics and
  MakeAppx creation passed; hashes are in MSIX-RELEASE.md. Complete tests passed
  both independently (59.820s) and during packaging (55.058s).
  Full Windows race-detector suite subsequently passed (105.613s), including
  local-peer progressive ranges, compatible fallback and window publication.
  This does not replace installed/authenticated browser playback acceptance.
- Service now accepts authenticated seek windows, preserves current playback
  during successor prefetch, promotes that successor without duplicate encoding,
  cancels continuous background encoders for explicit demand and recalculates
  the shared AAC budget per new window. These supersede the historical statements
  below that no requested position reaches Service production code.
- Local Player seek controls, episode/subtitle/progress clocks, continuation and
  explicit decoder retry are connected to those endpoints. Production Next build
  and control fixtures passed. Reattaching playlists does not prove gapless
  playback; complete authenticated browser/installed acceptance remains open.
- Real consecutive-window fixtures corrected the first-window 83 ms transport
  shift; the complete race suite passed (40.958s). An independent, test-only
  synthetic fixture played both windows in Edge with the expected audio track
  and zero-based media origin. This is not authenticated Player Pro acceptance.
- Actual Core lease SQL passed on a separate disposable PostgreSQL instance,
  including concurrent acquisition/closure, session/device isolation, expiry,
  replacement and duplicate closure. Closed-instance records remain cumulative;
  pruning must preserve late-acquisition rejection. The production DB was not
  modified and the disposable test container/volume were removed.
- Public provider routing was published through the existing ANIRIUM tunnel:
  `n.anirium.com.br` targets `http://anirium-addon-nyaa-p2p:4001` directly,
  without the Core. Public HTTPS `/manifest` and `/health` returned 200;
  `/stream` returned 404. The manifest advertises `magnet.search` and the
  public origin. This proves routing, not an authenticated playback/search run.
- Get-AppxPackage found no GodZlayer.AniriumService package for the current
  Windows user; no listener was found on port 4004. A staged package is not an
  installed application or an end-to-end playback proof.
- Core container was updated to the validated window/fallback candidate image
  `sha256:aa86263c54607d92b174c5ed8bf31eebffcd1eee149d2a1b7fdb81333f7bc65c`.
  Public `/`, `/privacidade` and `/suporte` returned 200. Previous image is
  retained as `anirium-core:rollback-before-window-update-20261003`.
  Runtime verifier was corrected to distinguish beta anonymous activation (401)
  from the disabled-beta policy (403). The corrected verifier passed against
  the deployed image with its live beta environment; open-beta route fixtures
  also passed. This is not authenticated browser/installed acceptance.
- Public release, replacement of the publisher-reported 2.2.1 submission,
  Microsoft certification/signing, and corresponding dependency source/build
  redistribution review remain uncompleted. Architecture separation alone is
  not a legal-liability or licensing certification.

## Historical corrections (2026-10-02; current state above takes precedence)

- Latest candidate is MSIX 2.3.12.0 (see MSIX-RELEASE.md). Complete race suite
  passed (31.256s) with filtered-retention cleanup, capacity-before-input workers
  and measured per-reader readahead. These do not implement playhead scheduling:
  Player time updates currently change local UI/progress only; no requested
  position reaches Service production. Fast seeking into unprepared media is
  still unproven and requires a real demand-driven output design.
- Production video/audio source workers now reserve their existing processing
  capacity before acquiring progressive inputs. Video's selected-quality queue
  therefore gates input acquisition as well as FFmpeg, without double-acquiring
  slots. Direct transcoder helpers retain their own capacity guards. Queued input
  cancellation and selected-quality tests passed; the complete uncached suite
  passed (29.067s) and vet passed after the audio change. This bounds acquisition
  concurrency, not continuous bandwidth adaptation or playhead scheduling, and
  does not preempt work that already owns a slot. Changes postdate MSIX 2.3.11.
- Episode retirement now retains its original magnet ownership list separate
  from the filtered playable sources. After old workers and progressive readers
  finish, cleanup drops only hashes not owned by the current generation or
  another retiring generation, serialized with guarded torrent opening/reset.
  The complete race-detector suite passed (91.418s); this change remains source-
  only and does not prove installed-package/browser acceptance.
- The requested provider origin is now `https://n.anirium.com.br`, replacing
  the earlier community-domain request. Compose and provider deployment docs
  were updated; the provider container was recreated and its live manifest
  confirmed that origin. This does not create DNS or the Cloudflare route.
- Discovery now records ffprobe stream/container timing and freezes a shared
  source set before starting audio/video workers: stable first video reference,
  alternatives within 50ms start and 250ms container duration, unknown timing
  retained only for the reference itself. Qualities and subtitle-language
  telemetry are rebuilt from the filtered set. Unit tests reject divergent
  timing and phantom options; real local-peer media retains matching containers
  at different resolutions. Timing equality is not proof of edit identity.
- External subtitle providers can declare an optional hexadecimal `infoHash`.
  Explicit malformed or nonselected bindings are discarded when freezing the
  set. Legacy unbound results remain supported; their temporal compatibility
  is not certified. Focused provider/filter tests and vet passed.
- The filter/full-prefix implementation passed the complete race suite
  (31.755s) before the subsequent optional subtitle-binding change. Latest
  source changes are not included in staged MSIX 2.3.10.0.
- Authorization revocation retains the original magnet list independently of
  the filtered source set. Episode switches cancel old workers, but retirement
  still needs torrent ownership cleanup that preserves swarms shared with the
  next generation; worker cancellation alone does not prove swarm disposal.
- Current local candidate is MSIX 2.3.10.0; package/executable hashes and build
  evidence are recorded in MSIX-RELEASE.md. It includes provider budgets, audio
  DC-bias handling and regional/external subtitle normalization, but not the
  subsequent full-prefix recovery check. The submitted 2.2.1 is unchanged.
- Source recovery now checks the entire available published prefix, not just
  the last overlap. A real-video regression rejects a changed opening even
  when the most recent overlap matches. Focused audio/video recovery tests
  passed (8.877s), followed by the complete uncached suite (33.819s) and vet.
  This is within-output recovery evidence, not cross-output edition alignment.
- The complete race suite passed (34.386s) before the full-prefix change. An
  earlier run failed because Windows denied the fixture's UDP ephemeral port;
  uTP was disabled only in the no-transfer torrent-ownership fixture. Runtime
  Service protocol settings were not changed. The new prefix check still
  requires its own race validation.
- The deployed independent provider passed all 15 tests inside its container.
  Its live manifest advertises `https://nyaa.tgdevs.pp.ua`, `magnet.search`,
  and separate manifest/search/health endpoints. Public availability is not
  proven: the Cloudflare dashboard remains unauthenticated, and DNS/tunnel
  publication and end-to-end remote consumption remain outstanding.
- Core/Player boundary verification now also rejects the old source-provider
  contract, explicit community-index names/URLs and tracker endpoints, and scans
  the lockfile for known transitive P2P packages rather than checking only two
  direct dependencies. The expanded guard passed; npm's installed dependency
  query returned an empty tree for all eight checked P2P packages. This is a
  targeted architecture guard, not an exhaustive software-composition/legal
  certification. Existing generic-addon gateway removal remains deployed.
- Audio segment correspondence now removes each comparison window's DC bias
  before correlation. A synthetic PCM regression rejects different waveforms
  sharing a strong constant bias and accepts the same waveform at different
  mastering gain/bias. Actual compressed-audio signatures and source-recovery
  tests passed (7.923s); static analysis passed. Constant windows cannot certify
  differing values. This improves a segment content gate only: it does not
  estimate offsets, align edits or prove initial audio/video correspondence.
  This change postdates staged MSIX 2.3.9.
- A real Service HTTP provider fixture now verifies that the search carries the
  remaining time budget with response reserve and the exact English/Romaji
  catalogue aliases, while still rejecting credential forwarding and cross-
  account discovery. Focused tests passed (0.427s), then the complete uncached
  Go suite passed (31.168s) and static analysis passed. This is fixture HTTP
  evidence, not production DNS, installed MSIX or authenticated browser playback.
- Removed the latent generic Core addon gateway: a UI manifest's `serviceUrl`
  no longer authorizes proxying arbitrary endpoints or forwarding request
  cookies/authorization. All seven route methods explicitly return 410 without
  registry/network access. Actual handler fixtures and TypeScript passed;
  mandatory build and production-HTTP guards were added. No in-tree consumer
  of this old gateway was found. Core redeployment completed on image
  `sha256:c485d2fce6760cbe24c99ca1b9185acf6eab1b0e4f486177f9ee92e9047d1815`.
  All seven methods returned 410 with the expected response over the public
  domain, and `/service` returned 200. This closes the generic proxy path, not
  every remaining full-playback acceptance requirement.
- The provenance implementation passed the complete race-detector suite
  (33.423s). A separate JSON regression test passed after hiding runtime work
  directories from serialization; neither private source identities nor input
  selectors/provenance appear in runtime JSON. This validates concurrency and
  serialization boundaries, not cross-edition synchronization.
- The live incremental mixer now records private per-segment provenance:
  output start/duration, actual contributing source and FFmpeg input stream
  selector. Audio and video workers populate it, and runtime snapshots retain
  the published intervals without mutating earlier snapshots. Recovery fixtures
  verify source transitions, and a real audio worker verifies the selected
  fallback source/stream (focused tests 5.536s and 1.688s). This is output-relative
  evidence for implementing shared alignment, not an alignment algorithm or
  a guarantee that independent audio/video editions match. No provider identity
  was added to the Player manifest. These changes postdate staged 2.3.8.
- Player quality selection now reissues explicit demand when the already-
  selected quality is stalled or its request failed. It does not automatically
  retry on manifest polling, or restart healthy/preparing selections. The actual
  handler passed fixture execution and TypeScript passed; this is not rendered
  browser acceptance. Core deployment completed with its existing auth/beta
  environment preserved and a rollback image retained. Running image:
  `sha256:c6f9375b653b921a360d7ca4cabd270bdfcaf79073b20a916af42b586bac3eed`.
- Explicit video demand can retry a terminal zero-buffer failure after its
  worker returns. Completed failed input-cache entries are evicted on demand;
  pending loads and usable inputs are preserved. A real generated video fixture
  first fails input acquisition, then succeeds on a later request without
  producing unrequested variants. Published prefixes are never replaced by this
  retry. Focused tests passed (3.549s), static analysis passed, and the complete
  race-detector suite passed (39.153s). A separate cache ownership regression
  test passed. These changes postdate the staged 2.3.8 candidate.
- Audio directory creation failure now publishes `stalled`/`processingFailed`
  instead of leaving a discovered language indefinitely `preparing`. An actual
  nonexistent Windows temporary directory exercises the worker and manifest;
  this and preferred-input recovery tests passed (1.799s).
- Cross-output alignment is still missing at initial selection:
  `refreshAudioSelectionLocked` ranks container audio independently of video,
  and `buildAudioTrack` encodes its selected source without a video-edition
  correspondence check. Audio recovery signatures do not prove compatibility
  with the video selected by another worker. Thus initial mixed-language playback
  across different edits cannot be declared synchronized or complete.
- Subtitle HTTP work now shares cancellation with its playback generation:
  external provider fetches, sidecar reads, metadata waits and embedded extraction
  cannot outlive that owner. The subtitle route also uses the guarded torrent
  opener; production `AddMagnet` calls are centralized there. Cancellation and
  peer-media tests passed (4.944s), and static analysis passed. This source change
  is not in an installed or submitted package.
- Live authorization is periodically revalidated against Core. Revocation cancels
  only the matching playback generation and drops its torrents. Opening a torrent
  checks the canceled context while synchronized with generation cancellation,
  preventing an old worker from reopening it after revocation. Focused tests and
  the full Go suite passed (37.102s), including a complete race-detector run
  (36.877s); `go vet ./...` passed. These changes are not
  included in the staged 2.3.7 package or the submitted 2.2.1 package.
- Post-2.3.7 source changes: demand waits for completed inventory; attached
  pictures are excluded from video quality and encoder mapping; container-marked
  commentary cannot replace principal same-language audio or enter its recovery
  pool. Real generated containers verify cover and commentary handling.
- Audio exhaustion now distinguishes all-stalled tracks from ongoing work and
  genuine silent content. Subtitle searches include English/Romaji titles.
  These source changes are not present in the staged 2.3.7 package.
- Account-configured subtitle providers accept both `subtitles.search` and the
  legacy `subtitle.search` spelling throughout discovery. HTTP fixtures prove
  two same-language alternatives survive. This is not subtitle timeline alignment.
- Magnet deduplication preserves unique trackers, web seeds and explicit peers;
  a real local torrent transfer now discovers its peer exclusively through the
  pooled magnet. Conflicting BTIH identities and malformed queries are rejected.
- Preparation without magnets returns `no-sources` without issuing a ticket.
  Completed discovery without video reports `stalled`, not indefinite preparation.
  FFprobe's 90-second budget includes waiting for the shared input; deadline and
  generation-cancellation tests passed.
- Preparation-time audio output budget is shared among concurrent language
  outputs. This does not account for full torrent input demand, HLS overhead or
  continuous adaptation and must not be described as a fluidity guarantee.
- Video preparation is on demand: the initial actual highest quality starts,
  and the Player requests other advertised qualities through the ticket-protected
  `/playback/variant` endpoint. Selected qualities receive priority for queued
  video worker slots. Active whole-file transcodes are not preempted and this
  does not yet implement playhead-based segment scheduling.
- Unrequested variants are marked `available`, not `preparing`. Overall
  availability no longer waits for every advertised quality; per-variant
  readiness remains required to open its playlist. Component and full Go tests
  passed. Browser playback and connection-fluidity acceptance remain open.
- The deployed Player handles expired variant tickets consistently and does
  not permanently revoke its instance on BFCache suspension. Its lifecycle
  handler, TypeScript and media boundaries passed; real browser restoration
  has not been verified.
- Preparation now derives an audio budget from observed torrent payload rates.
  AAC output respects that bitrate budget, normalizes sampling frequencies and
  applies channel limits. Generated HLS at 16/64/256 kbps was decoded in tests.
  This supersedes the historical fixed-output description below, but is not
  continuous adaptation or evidence of stall-free playback on a restricted link.
- Compatible same-language/channel inputs remain in the audio recovery pool,
  including lossless and unknown-rate sources. All producers share one output
  configuration. Their input bitrate is not treated as delivered AAC bitrate.
  Real producer recovery tests pass; content alignment remains unproven.
- Every actual valid probed video height can be exposed, including 360p and
  1440p; the previous three-quality cap is removed. Actual 360p transcoding and
  invalid-quality rejection passed. Aggregate resource limits still need review.
- Account authorization to remote provider discovery was tested through HTTP
  Core/provider fixtures without forwarding credentials. This is not a live
  authenticated production-site acceptance test.
- Core and independent provider containers have been updated. The provider
  now advertises https://nyaa.tgdevs.pp.ua. The container is running, but public
  DNS still returns NXDOMAIN; Cloudflare publication remains uncompleted and
  requires the user's browser login. A configured origin is not public reachability.
- The Microsoft-submitted 2.2.1 package is unchanged. Later staging candidates
  do not prove certification, installed compatibility or completed playback.

## Media requirements confirmed incomplete in current code

- Progressive pieces: the production generation cache now registers private
  loopback range inputs instead of calling `materializeVideo`. Probing and
  embedded subtitles use these seekable inputs directly, without prioritizing
  a complete video or attempting a non-seekable pipe first. Three real-peer runs
  verified beginning/tail ranges return while each 2 MiB file is incomplete;
  generated-media probing, audio/subtitle extraction and mixed-video decoding
  also passed through these range inputs. Production video/audio workers now
  publish growing EVENT playlists from closed segments, with bounded concurrent
  video producers and immutable already-published prefixes. Generated media
  tests decoded early video and audio segments while the input tail was blocked,
  then verified complete playlists after release. This is not yet authenticated
  Player playback over a throughput-restricted real torrent: verify that full
  flow and request/buffer scheduling before claiming end-to-end acceptance.
- Compatible releases: the incremental mixer checks cut duration and cumulative
  segment start within 50 ms, rejecting later segments shifted by an earlier
  shorter cut. This is not content alignment. Establish a common timeline;
  align or reject differing
  edits, openings, recaps and offsets. Test different encodings of the same
  authorized content and verify video/audio/subtitle synchronization.
  A generated container regression test proved an existing intra-file defect:
  resetting audio to its own STARTPTS removed a one-second delayed start. Audio
  transcoding now retains relative timestamps and fills the initial gap with
  silence via resampling. The test verifies low initial amplitude and the later
  tone, and normal track-selection/HTTP playback tests still pass. This does not
  establish alignment between different edits, arbitrary stream-start offsets,
  negative timestamps or independently offset video/subtitle timelines.
  A separate delayed-video fixture verifies its own one-second packet PTS
  offset, then measures the first audio/video packets of output HLS. Restoring
  the old video STARTPTS filter reproduced a lost delay (approximately 21 ms);
  removing that reset and using passthrough after explicit 24 fps filtering
  preserves the relative start. HLS stream-level start metadata is insufficient
  for this test because its demuxer reports a shared start; actual packet PTS is
  checked. Cross-release content alignment and playback of such offsets in the
  browser remain unproven.
  Production audio/video producers now additionally probe the first packet PTS
  of each candidate segment (cached per path) and reject departures over 50 ms
  from the established output clock. A real-media regression remuxes the second
  segment one second later without changing its EXTINF and requires rejection,
  a one-segment prefix and no false ENDLIST. Per-segment ffprobe adds work and
  startup latency: measure resource cost before release. This still does not
  identify differing content edits with equal timestamps or provide audio pool
  mixing; arbitrary timing gaps remain fail-closed rather than repaired.
- Audio pool: `selectAudioCandidates` still defines one output per language,
  but `buildAudioTrack` now gathers unique alternatives of the same language
  and channel count from actual probing, ranks the preferred source first and
  transcodes alternatives with bounded concurrent producers. Segment selection
  prioritizes that ranking over compressed weight, falls back when a preferred
  position is unavailable, and applies the production packet-clock guard.
  Unit tests cover ranking, deduplication, language/channel exclusion and
  per-position preference/fallback. `TestRealAudioPoolRecoversAfterPreferredPrefixFails`
  feeds real FLAC/AAC encodings into the production incremental publisher,
  interrupts the preferred producer after its first closed segment and requires
  two contributing sources, complete eight-second coverage, successful decoding
  and the expected synthesized tone before/after the switch. This tests media
  producers/publishing, not full preparation, account-authorized discovery or
  same-language recovery over real peers. Browser synchronization and that full
  flow still require acceptance tests; matching language/channels/PTS
  does not prove the same content or editing. The existing real-peer fixture
  exercises two audio languages, not same-language multi-source recovery.
  `TestRealAudioWorkerUsesAlternativeWhenPreferredInputFails` additionally calls
  the actual audio worker with the probed pool and shared input cache. The
  preferred loader fails twice (bounded shared recovery), the alternative loads
  once, the runtime completes, its HLS decodes and only one Japanese output is
  exposed. This covers worker/pool/cache wiring, not peer transport or an
  authenticated prepare-to-browser test.
- Fluent maximum audio quality: production uses `AudioPolicy{}` and AAC
  320k/48kHz output. Derive/update connection and output constraints; test stalls
  and recovery under restricted throughput. Measured HLS bandwidth alone does
  not implement this policy.
- Multiple matching files: `expandMediaSources` now inventories each eligible
  version as a distinct internal input sharing the torrent. A local real-torrent
  metadata test proves two versions are selected independently and another
  episode is excluded. `TestServiceMaterializesDistinctFilesThroughLocalTorrentPeer`
  also transfers both byte fixtures over a real localhost torrent connection,
  checks exact file boundaries/content and requires unlocked files after client
  shutdown. Five consecutive Windows runs passed after switching production and
  this test to explicitly owned mmap storage with per-torrent unmapping. These
  byte fixtures do not prove playback. An additional generated-media test,
  `TestPeerMediaProducesMixedVideoAudioAndSubtitleAlternatives`, crosses the same
  peer/cache path with 480p/720p MKV files, probes actual streams, extracts four
  same-language subtitle alternatives, builds two language-specific audio HLS
  outputs, verifies their distinct synthesized tones, forces missing video
  segment recovery across both inputs and decodes the resulting mixed HLS.
  This is not an authenticated browser/manifest test, progressive playback or
  evidence of alignment between differing edits. Large-batch resource behavior of the
  explicit storage backend also needs load validation before release.
- Player acceptance: synthetic FFmpeg/HTTP helper tests are not the complete
  authenticated browser flow. Verify preparation, quality/audio switching,
  subtitle language cycling, seek, offline local/HTTP playback and session errors.

## Build evidence and limits

- Latest local development build after the authorization and real HTTP-manifest
  tests and relative audio/video timing fixes: SHA256 `610930EA24DE04BB6AF0889730DFCD24CA06E6D879047F497064BAE12E8E53CC`,
  Authenticode `NotSigned`. The build ran architecture, installer configuration,
  token and official-source checks, Go static analysis, full uncached tests and
  compilation. Functional tests now also use verbose output and a three-minute
  timeout. Public download hash remains
  `890EEE0E10E5BF69B9AD76CA9A5BC26345ABDE38AF35FA1972A796189AB94548`.
  This local artifact is not a signed installer or Microsoft-certified release.

- `TestMasterPlaybackWithExternalAudioOverAuthorizedHTTP` now decodes generated
  video and a distinct external audio tone through the production Service HTTP
  handler, not a replacement media server. A fixture Core validates the actual
  opaque grant for playlists/segments; revocation rejects master, media playlist
  and audio segment access. This is stronger HTTP-boundary evidence, but uses
  prebuilt runtime media and does not prove prepare/discovery/real peers, browser
  controls or production Core authentication end to end.
  It now also fetches the real authenticated manifest and opens its advertised
  video playlist, verifies one actual video quality and only the ready audio
  language, and rejects publication of a pending audio playlist, internal local
  path, token or device credential. Pending audio remains explicitly described
  as preparing, not selectable via the ready-language list.
  The same real HTTP flow now expires its actual grant while the fixture Core
  remains authorized, requires playlist/segment rejection and rejects renewal
  through both the grant function and `/playback/renew`. Restoring the test grant
  and revoking Core authorization checks that independent rejection afterward.

- Every media grant revalidation now requires the Core account identity to
  equal the identity stored when that grant was issued, not merely any active
  Plus account. Tests change the fixture identity and require rejection for
  validation, renewal and the real HLS playlist/segment/subtitle routes. These
  checks do not replace actual Core/device-session end-to-end acceptance.

- Core authorization uses a dedicated non-redirecting HTTP client. Tests cover
  301/302/303/307/308 responses to both same-origin and different-origin
  destinations, require rejection, and assert zero destination requests. This
  prevents credential forwarding via redirects; it does not validate deployment
  TLS configuration or the trustworthiness of the configured Core URL.

- Service session validation now requires a nonblank Core account identity,
  one complete JSON document and a response no larger than 1 MiB. Regression
  tests reject missing/blank identity, appended JSON/garbage and oversized
  responses. This tests the authorization boundary with a fixture Core, not
  production entitlement activation or authenticated browser playback.

- Shutdown now tracks current and retired playback workers and waits for private
  range handlers to retire before closing torrent storage. A regression test
  holds an old input reader open and verifies shutdown cannot return until it
  is released. The complete functional suite and Windows race suite passed
  after this change. Shutdown also marks preparation closed while holding its
  serialization mutex, so queued/new requests cannot create workers after
  storage closure. A real preparation-handler test validates a Core fixture,
  then requires 503 `service_shutting_down` and no generation change. Native
  tray shutdown and full application-exit behavior still require runtime tests.

- Core: architecture, token, official URL destination checks; compilation and
  production HTTP rejection tests. These do not prove individual licensing or
  regional availability.
  The current Core was rebuilt as validation image
  `sha256:ec5bff9e2c444cfa7d46493369b61e514ce9838a71de55ec64993fb801e36bac`.
  Its mandatory build-time HTTP gate and a separate `--network none` runtime
  check both passed: anonymous/unsafe account mutations rejected, community
  provider code absent, HTTP download hash equal to the packaged public file.
  The verified download is still the old unsigned artifact; this check must not
  be interpreted as release approval. Production containers were not replaced.
- Provider: standalone manifest/search normalization tests, not actual peer
  transfer through the Service.
  The independent provider image now uses Node.js 24 LTS rather than the
  unsupported Node.js 20 line. Its mandatory runtime gate checks that major
  version and rejects duplicated title/episode/season query parameters. URL
  parsing uses WHATWG URL instead of deprecated `url.parse`. The rebuilt
  non-root image passed its unit and HTTP gates, including a network-isolated
  runtime check; this does not prove a live external provider search.
  Compact SxxEyy validation now rejects explicit season/episode mismatches and
  conflicting compact identifiers before incidental bare-number matching. The
  mandatory unit gate includes both title validation and RSS normalization of a
  wrong-season compact result. Series identity/alias accuracy remains separate
  from this episode-context check and needs broader catalogue integration tests.
  The provider's production HTTP handler now has an injectable upstream fetch
  for tests. A mandatory container-build test starts that handler independently,
  follows its manifest search endpoint and verifies normalized magnets, duplicate
  removal and wrong-season rejection over HTTP. Invalid duplicate parameters
  and unsupported methods are rejected before upstream access. The upstream RSS
  is a fixture, not evidence of a successful live external-index search.
  Search now pools all three title/episode spellings concurrently instead of
  stopping at the first nonempty response. Cross-query hashes are deduplicated,
  and a failed alternative does not erase successful results. The HTTP test
  requires a version found only by the second spelling and injects failure in
  the third. This is not exhaustive index pagination, complete catalogue alias
  discovery or proof that every possible torrent has been enumerated.
  RSS input now has a 4 MiB byte limit, enforced on both declared length and
  streamed chunks. Oversized bodies are rejected rather than parsed as a valid
  truncated prefix; readers are canceled and released. Tests cover UTF-8 byte
  counting, declared excess, chunked excess and cancellation. HTTP upstream
  errors also cancel their unused bodies. This bounds each query body, not
  aggregate request concurrency or an exhaustive provider resource audit.
- Service: architecture/token/official URL checks, `go vet`, uncached tests and
  compilation. Real FFmpeg/ffprobe fixtures do not establish release alignment.
- Signed builds additionally require persistent session and race checks.
  The full Windows/amd64 suite passed `go test -race -count=1 ./...` using the
  locally prepared, SHA256-verified WinLibs GCC 16.2/MinGW-w64 14 compiler.
  `verify-service-race.ps1` enables CGO only for that invocation and restores
  CC/CGO/PATH; signed builds invoke it as a mandatory gate. This establishes
  no detected races in executed tests, not all native UI/runtime workloads.
  The race runner now prints each test and enforces a three-minute suite timeout
  so a stalled release gate provides a diagnostic instead of waiting silently.
  The latest repeated suite passed in 14.198 seconds; the preceding run also
  passed, but took 74.072 seconds. No deadlock was established by that delay.

## Publication still outstanding

- Component builds no longer copy even a signed Service executable into public
  downloads. The configuration guard rejects publication operations in either
  component or installer staging builders. An approved-installer publication
  workflow remains to be implemented after full acceptance/certification; this
  separation is not completion of the requested public delivery.

- Certificate preflight now rejects `DevelopmentOnly` as well as spaced names,
  self-issued certificates, future/expired validity, absent private keys and
  absent/non-code-signing EKU. The Service build runs eight rejection fixtures
  and requires this preflight before signing. These are policy tests, not proof
  of an available trusted publisher credential or a signed release.

- Real publisher identity, privacy policy and support details.
- Trusted signing credentials and timestamped signature verification.
- Redistributable FFmpeg package with license obligations fulfilled.
- Compiled/signed installer and clean-Windows install/uninstall/playback tests.
  Installer compilation now stages a version/hash-named artifact rather than
  writing directly to public downloads; requires trusted media inputs and signs
  setup/uninstall via Inno's SignTool. Compiler execution and actual signatures
  remain unverified, not established by the configuration guard.
- Trusted production entitlement activation and authenticated end-to-end tests.
- Microsoft submission, certification result and production deployment.
- Public download verified against the approved artifact, not merely an existing
  unsigned executable with a matching local hash.

Recent development builds have not replaced the public download. Do not claim
the existing executable is certified or current to the latest sources. A signing
certificate or successful Docker build does not resolve the media gaps above.

### 2026-10-03: Player initial playback window

- Fixed Player Pro startup to request window zero when the Service advertises
  `windowOnDemand`, instead of requesting the legacy continuous variant first.
  Existing windows and paused seek targets retain their intended behavior.
- Initial-window and window-seek regression checks and TypeScript passed.
- Built and deployed `anirium-core:fix-initial-window-20261003` to `anirium_core`;
  public homepage returned HTTP 200 and the deployed Core runtime guard passed.
- Service executable and Store submission were not changed. Actual playback on
  the user's torrent still requires a refreshed Player and an end-to-end retest.

### 2026-10-03: Real Edge playback retest

- Used the connected Edge extension on the existing authenticated Anirium tab,
  reloaded the published Player, and opened Zeri Feisheng episode 5.
- Preparation temporarily showed an interrupted-processing state, then playback
  started. Observed episode time advancing through 00:28, 00:38, 00:48 and 01:05.
- The video element reported `paused=false`, `readyState=4`, and no media error.
  Local window time differed from episode time, consistent with window playback.
- UI displayed actual 800p video and zho audio. Subtitle menu listed language
  counts, including zho (1/2); selected por (1/1). Portuguese cue rendering and
  same-language cycling were not yet verified. Startup delay/intermediate error
  remains a usability issue; this is not full release acceptance.
