# Native Service Microsoft Store release

## Latest local candidate: 2.3.15.0

Built on 2026-10-03 with actual episode-file weight priority for compatible
window sources. Complete packaging-gate tests passed (42.834s), staged EXE
bundled H.264/AAC diagnostics passed and MakeAppx creation succeeded.
Subsequent complete Windows race-detector suite passed (44.745s), including
actual multi-file metadata weight selection and window fallback/promotion.
Path: `release/msix-2.3.15.0/Anirium-Service-2.3.15.0-store.msix`.
Package SHA256: `A6967A7D7F78CA9E07DCBF150ED126C29B12386C55700C62C59ADD2BFB70BC9B`.
Executable SHA256: `2D51DB5456A2C31048966183915715D1C351A3B9C3E06C23B036396AA04FB8F4`.
Not installed, submitted, Store-signed or certified. Submitted 2.2.1 and public
download remain unchanged; full installed/browser acceptance remains open.

## Previous local candidate: 2.3.14.0

Built on 2026-10-03. Complete uncached Service tests passed (55.058s in
the packaging gate; independent run 59.820s). Actual staged executable and
bundled H.264/AAC diagnostics passed; MakeAppx package creation succeeded.
Includes compatible audio fallback and empty-video fallback corrections.
Subsequent complete Windows race-detector suite passed (105.613s).
Path: `release/msix-2.3.14.0/Anirium-Service-2.3.14.0-store.msix`.
Package SHA256: `230A31DB43A0BEBA0E798E625F9DC096C19A6E73554768C3F6ED1CF13F6B4399`.
Executable SHA256: `AF6AADA3096119940EACB00BBE94FB237522A3DB68BDE9BC046EA478B6E58B19`.
Not installed, submitted, signed or certified. Public provider routing is now
verified; installed/authenticated playback and redistribution review remain open.

## Previous local candidate: 2.3.13.0

Built on 2026-10-03. Uncached Go suite passed (38.810s), static analysis and
architecture/authentication/source guards passed. Actual staged EXE with its
bundled H.264/AAC tools passed diagnostics without network initialization.
MakeAppx package creation succeeded.
Path: `release/msix-2.3.13.0/Anirium-Service-2.3.13.0-store.msix`.
Package SHA256: `AE97B1C0C0D9AFA8E833BD95BCAE8A599A2A0BA00980D6A8B69B05D1550DF79D`.
Executable SHA256: `8BEFBA5FFA03091B58BB75C2F2860601690E13C212484FFD344B32BF275AD4F2`.

Includes authenticated bounded playback windows, successor prefetch/promotion,
background encoder cancellation, per-window measured AAC budgeting and active
window manifest availability. Real consecutive-window clock testing corrected
an 83 ms initial muxer mismatch; the complete race suite passed (40.958s).
Matching Player seek, progress/subtitle clocks and explicit decoder retry are
implemented locally; the Player is not shipped inside this native package.

Not installed, submitted, Store-signed or certified. Public downloads and the
publisher-reported 2.2.1 submission were not replaced. Browser/installed playback
acceptance, seamless HLS handoff, public provider routing and corresponding
dependency source/build redistribution review remain open. See
`PLAYBACK-WINDOWS.md` for the implementation and acceptance boundaries.

Post-candidate local changes: a test-only synthetic browser fixture was added,
the Player clock was clamped against observed browser decoder tail, and window
video fallback now rejects empty successful transcodes before trying the next
eligible source. Window audio also recovers through compatible same-language
alternatives without duplicating Player options. These fallback changes modify
Service runtime code and are not in
the immutable 2.3.13.0 package. Repack after remaining acceptance fixes; do not
assume the package contains later worktree changes.

## Previous local candidate: 2.3.12.0

Built on 2026-10-02. Complete uncached Go suite passed (29.186s), static
analysis and architecture/authentication/source guards passed. Actual staged
EXE bundled-tool diagnostics and MakeAppx packaging succeeded.
Path: `release/msix-2.3.12.0/Anirium-Service-2.3.12.0-store.msix`.
Package SHA256: `95E7A4E28A38166DB0AE672F1A176685DCB37491D2C43C9C704799B8F4AB3F7E`.
Executable SHA256: `39FF95C8E81BBEBA087FFD4A32DB7D22B789CCB640A44DB835479836590EE017`.

Includes 2.3.11 plus video/audio capacity gating before input acquisition,
per-reader measured readahead, excluded-swarm cleanup and filtered retention
after discovery. Adds a fingerprint-bound media notice; this does not complete
corresponding-source redistribution. The complete race suite subsequently
passed with the filtered-retention fix (31.256s). Not installed, submitted,
Store-signed or certified. Public downloads and submitted 2.2.1 unchanged.
Playhead scheduling, continuous output adaptation, public provider routing,
manual installed acceptance and dependency source/build review remain open.

## Previous local candidate: 2.3.11.0

Built on 2026-10-02. Complete uncached Go suite passed (29.076s), static
analysis and architecture/authentication/source guards passed. The actual staged
EXE passed bundled-tool H.264/AAC encoding diagnostics without network startup.
MakeAppx package creation succeeded.
Path: `release/msix-2.3.11.0/Anirium-Service-2.3.11.0-store.msix`.
Package SHA256: `61F7AA9892012D0697B68DB52B975D0446A368CF6E69C1850FE707CCB0ABFC26`.
Executable SHA256: `DB01E684126E9D5B77BF3620E3BDA10C24061B64B94593E6AD4C5E67F18F4A86`.

Includes 2.3.10 plus full-prefix recovery checking, shared timing-filtered source
selection, optional external subtitle info-hash binding, and retirement cleanup
that preserves shared torrents. No cross-edit correction is attempted. Equal
timing is not edit-identity proof; legacy unbound subtitles remain unverified.
Not installed, submitted, Store-signed or certified. Public downloads and the
submitted 2.2.1 remain unchanged. Playback scheduling/adaptation, manual installed
acceptance, public provider routing and redistribution review remain outstanding.

## Previous local candidate: 2.3.10.0

Built on 2026-10-02. Complete uncached Go suite passed (32.703s), static
analysis and architecture/authentication/source guards passed. The actual staged
EXE passed its bundled-tool H.264/AAC encoding diagnostics without network
initialization. MakeAppx package creation succeeded.
Path: `release/msix-2.3.10.0/Anirium-Service-2.3.10.0-store.msix`.
Package SHA256: `3DD244EBC24F5AA3DCEE5D0E1E89128CA154D681E7BED534A7AB8116E4A4B323`.
Executable SHA256: `896C1085C5A4AB1CB38BC04F29749D36128988970762C5F278E4FDAC5FE28DD3`.

Includes 2.3.9 plus remote provider search-budget propagation, centered audio
content comparison, regional language normalization, and external subtitle
language grouping while preserving independent alternatives. Not installed,
submitted, Store-signed or certified. Public downloads and the submitted 2.2.1
remain unchanged. Cross-output edition alignment, continuous adaptation,
installed-package acceptance and media redistribution review remain open.

## Previous local candidate: 2.3.9.0

Built on 2026-10-02. Complete uncached Go suite passed (33.561s), static
analysis and architecture/authentication/source guards passed. The actual staged
EXE then executed `--diagnostics` with its own bundled tools, verifying tool
execution and a synthetic H.264/AAC encoding smoke test before packaging.
MakeAppx creation succeeded.
Path: `release/msix-2.3.9.0/Anirium-Service-2.3.9.0-store.msix`.
Package SHA256: `4759139EE26DE2DBF15347E5E09E093EE00E9A4C374B3BCF53BE2F0CB2AAD8A4`.
Executable SHA256: `61E3ACFACDA442843EBC28FA2AD104CB6592187E97DE04B28064EA4046C12AD8`.

Includes 2.3.8 plus explicit zero-buffer variant retry, safe failed-input cache
recovery, private per-segment provenance, runtime JSON privacy and the no-network
diagnostic command. This is not installed-package acceptance, complete playback,
Microsoft certification or resolved media redistribution compliance. Public
downloads and the submitted 2.2.1 remain unchanged.

## Previous local candidate: 2.3.8.0

Built on 2026-10-02. Complete uncached Go tests passed (34.311s), static
analysis and architecture/authentication/source guards passed, and MakeAppx
successfully created the native package.
Path: `release/msix-2.3.8.0/Anirium-Service-2.3.8.0-store.msix`.
Package SHA256: `B32EDFE80E6C1E467B633D89411623B01F228E35EFAA0322347855B8C632453C`.
Executable SHA256: `46A0C008C64E36360765B6B6DE52CCDC9E8CACDE730C2DD136F7E6B5AB350305`.

Includes the previous candidate plus container commentary/cover handling,
completed-inventory variant gating, language aliases, multilingual subtitle
queries, live authorization cancellation and guarded torrent opening, generation-
scoped subtitle cancellation, and explicit audio storage-failure reporting.
Not installed, submitted, signed by the Store or certified. Public downloads and
the submitted 2.2.1 remain unchanged. Cross-output edition alignment, continuous
adaptation, installed-package acceptance and media redistribution review remain
open; this package is a testing candidate, not a completed release.

## Previous local candidate: 2.3.7.0

Built on 2026-10-02 after static analysis, the complete uncached Go suite and
architecture/authentication/source guards. MakeAppx packaging succeeded.
Path: `release/msix-2.3.7.0/Anirium-Service-2.3.7.0-store.msix`.
Package SHA256: `8BCA9B0F502E3629CE65847954841A2CB08CF927D9E1C5D05C4EBA13B1CD75D5`.
Executable SHA256: `C3CBB6D9838D89B5EA49CD85EC0BAF8E48824D90086F106753E8D9BDD6FB908F`.

Includes actual video-height inventory, separate audio/video outputs, content
guards, partial-failure reporting, removal of legacy direct-magnet handlers,
published-ID-only subtitle delivery and concurrent video input acquisition.
Preparation now requires the Core-confirmed Player instance. Media tickets are
bound to that instance and cannot be renewed by another Player on the same account.
Includes on-demand video variants, selected-quality queue priority and accurate
availability when other advertised qualities have not been requested.
Also includes pooled peer/web-seed hints, strict magnet and variant-request
validation, subtitle capability compatibility and explicit episode filtering,
shared initial audio budgets, bounded discovery and empty-search handling.
The complete uncached Go suite passed in 34.765 seconds during packaging,
including healthy-video publication while another input remains blocked.
This candidate is not installed, submitted or certified. Public
downloads and the submitted 2.2.1 package are unchanged. Full playback,
cross-release content alignment, continuous adaptation, installed-package
acceptance and redistribution compliance remain unresolved.

The publisher selected MSIX on 2026-10-02. This is a native desktop package,
not a PWA and not an MSI/EXE installer submission. The existing installer
scripts describe a separate distribution path; their Authenticode requirements
must not be mistaken for a requirement to buy a certificate for Store MSIX.

## Partner Center identity

Use a new MSIX app named `Anirium+ Service` under the GodZlayer publisher.
The item was created after explicit confirmation on 2026-10-02. Product identity
in Partner Center reports:

- Identity Name: `GodZlayer.AniriumService`
- Publisher: `CN=27B01EF0-8B9B-4186-9321-D5C62004CBB6`
- PublisherDisplayName: `GodZlayer`
- Package Family Name: `GodZlayer.AniriumService_qj9mh70hf1pxj`
- Store ID: `9MV35DDQ6SBD`
- Web link: `https://apps.microsoft.com/detail/9MV35DDQ6SBD`
- Store protocol: `ms-windows-store://pdp/?productid=9MV35DDQ6SBD`

This reserved identity is not evidence of certification or public availability.

Submission 1 was created as a draft: `1152921505702031112`.
The draft-status details below are historical observations, not current status.
The user subsequently reported submitting version 2.2.1 for certification.
Current certification/publication has not been independently reverified.
The staging package `release/msix-2.2.0.0/Anirium-Service-2.2.0.0-store.msix`
was compiled after `go vet`, uncached Go tests and architecture/token/source
checks. Windows SDK MakeAppx validated and packed it successfully.
SHA256: `633A94433954B89A2F9D6EFE98A29ED92FD0F5C6BF74057BBDFB5556F909FD76`.
TypeScript checking and the Player media-boundary check passed after replacing
the offline download action with the Store protocol link above.

After the user enabled file URL access, the same Edge profile reconnected and
the package upload succeeded on 2026-10-02. The Partner Center Packages page
recognized version `2.2.0.0`, X64 and Windows.Desktop minimum `10.0.19041.0`.
After saving, Application overview explicitly showed this file as `Validated`
and Packages as `Complete`. The submission still shows `In draft` and
`Submit for certification` is disabled. Pricing and availability (free install)
and Properties are now `Complete`. Age ratings are `In Progress` and Store
listings are `Incomplete` pending real application screenshots. Package validation
does not establish installed runtime correctness or Store certification.
The old EXE/MSI item has not been deleted. Installed-package tests, complete
third-party redistribution compliance and listing/reviewer fields remain open.

Do not delete the existing Anirium EXE/MSI item until its exact target and the
deletion confirmation have been reviewed. No deletion or submission is proven
by this document.

## Package preparation and verification

- Package the native `anirium-service.exe`, its tray icon/resources, and
  reviewed redistributable media tools under `tools/` with required notices.
- Use the new Store identity in AppxManifest.xml, with a four-part package
  version and a native desktop/full-trust application declaration.
- The Service currently writes its log, tray icon and torrent/media caches
  under `os.TempDir()`, rather than the installation directory. This source
  inspection is not proof of installed-package runtime compatibility.
- Media tools are resolved adjacent to the executable under `tools/` before
  PATH. Verify that subprocesses run after installation from the package.
- Verify tray launch/exit, loopback API access from the website, authorization,
  dependency availability, media preparation and uninstall behavior in an
  installed-package test. Do not weaken Windows networking/security settings
  to hide a failed compatibility check.
- Pack with Windows SDK MakeAppx and validate the package. Local test signing
  and certificate trust changes require a separate explicitly authorized test
  workflow; a development certificate is not public publisher certification.
- Submit the MSIX through the Store, which signs the distributed package.
  This does not produce a trusted signature for an independently downloaded EXE.

## Site handoff

On 2026-10-02 the Core Docker container was rebuilt and deployed. Public
`https://anirium.com.br/privacidade`, `/suporte` and `/service` returned HTTP 200.
The publisher supplied `admin@anirium.com.br` for public support/privacy contact.
Partner Center Properties saved the privacy URL, website and support URL and
Application overview confirmed `Complete`. The previous Core image is retained
as `anirium-core-before-info-20261002` for rollback. Deployment did not recreate
the database or tunnel. Future deployments must preserve the existing Core
`ANIRIUM_SERVICE_SECRET`; do not print it or commit it to source control.

Replace the Player's `/api/download/service` action with the exact new item's
Store detail link only after obtaining its actual product ID. Do not redirect
to TGDesk, a Store search page, or a fabricated item. Verify the link opens the
new item's page. A reserved name alone does not prove public availability.

## Submission completion evidence

Complete truthful listing, privacy/support information, age rating and reviewer
instructions. Reviewer access must exercise actual entitlement/session checks;
do not fabricate an account or bypass authorization. Record package hash,
identity, version and the resulting submission status. Report that Microsoft
review is pending only after Partner Center shows an actual submitted review.

## 2.2.1.0 candidate

The publisher clarified that Anirium+ activation is free during the open testing
beta. On 2026-10-02 the support, privacy and Service pages were updated and
redeployed in the Core container; all three public pages returned HTTP 200 and
contained the free-beta notice. Store Portuguese description and short
description were saved and re-opened to verify persistence. No authentication,
entitlement or payment flow was changed. The current production user route
still blocks self-issued activation, so the working beta activation flow needs
verification; free access must not be confused with anonymous access. The prior
Core image is retained as `anirium-core-before-beta-copy-20261002`.

The publisher supplied the production domain, so this candidate defaults Core
authorization to `https://anirium.com.br` without manual environment setup.
An explicit `ANIRIUM_CORE_URL` override remains available for deployments/tests.
Token, Plus, account and device validation were not bypassed. The native window
now labels the API as loopback-only and states that Anirium+ authorization is
required, instead of claiming a multi-device LAN connection or an authenticated
P2P connection while idle. Uncached Go tests, `go vet`, architecture guards and
MakeAppx packing passed on 2026-10-02.

- Candidate: `release/msix-2.2.1.0/Anirium-Service-2.2.1.0-store.msix`
- SHA256: `B6A59F33948274478702B5505AE8482FF2FCAD1503E301F2912AE00A33E36BB6`
- Uploaded and saved in Partner Center. Application overview explicitly shows
  `Anirium-Service-2.2.1.0-store.msix` as `Validated` and Packages as `Complete`.
  The draft's older 2.2.0.0 package was automatically superseded; both local
  candidates remain preserved. This is not certification or a runtime test.
- IARC preview: 18+ (Brazil/global), based on unrestricted P2P content exchange
  and no native moderation. Final Terms of Use/adulthood acceptance remains
  unperformed pending the publisher's specific confirmation.
- The old EXE/MSI item deletion confirmation is open; no deletion occurred.
- `STORE-TESTING.md` contains the prepared reviewer instructions and unresolved
  acceptance/access gates. The live Additional Testing Information form has no
  credentials; reviewer playback access must be provided before submission.
- A local executable launch attempt was rejected by the execution tool. No
  alternate launch mechanism or Windows security bypass was attempted. A real
  native screenshot and installed-package runtime acceptance remain open.

References:

- https://learn.microsoft.com/windows/msix/package/signing-package-overview
- https://learn.microsoft.com/windows/apps/publish/publish-your-app/msix/app-package-requirements

## Confirmed actions after publisher approval

## 2.3.0.0 development candidate

Generated on 2026-10-02 after architecture/auth/official-source guards, go vet
and the complete uncached Go suite passed. MakeAppx validation and packing
succeeded. This candidate includes account-scoped remote addon discovery,
observed-current-swarm preparation-time audio budgeting, shared pool output
configuration, stable published audio IDs and internal packet-clock validation.

- File: `release/msix-2.3.0.0/Anirium-Service-2.3.0.0-store.msix`
- SHA256: `BB637BBE4B08837745AA5E4FCFF7C26EFD0C7762C9843A8B41BC02419F5E249B`
- EXE SHA256: `7CB49EE96606289F349033CE3C81763D8F1FD5BF5F090AE2647505D77B055000`
- Local staging only; not installed, submitted, certified or publicly deployed.
- Does not complete continuous adaptation, cross-release content alignment,
  authenticated browser acceptance or bundled dependency license review.
- Existing 2.2.1.0 submission and public download were not replaced.

### Earlier confirmed submission actions

On 2026-10-02 the publisher explicitly confirmed the pending actions. The IARC
terms/adulthood checkbox was accepted and saved; the fresh application overview
showed Age ratings as Complete. The old EXE/MSI draft deletion was confirmed.
Partner Center returned to the application list: the old row remained as Not
started, but reopening it reported that its information could not be found.
This proves draft deletion, not removal of the remaining name reservation.

The running older Service process was restarted with the 2.2.1.0 payload to
obtain a genuine native-window screenshot. This interrupted its active local
playback. The new window showed idle media state and loopback authorization
labels. It was launched from the payload, not installed as an MSIX runtime test.
The capture is `.artifacts/service-2.2.1-real-window-valid.png` (607 x 729).
The first upload was rejected because the original screenshot bytes were JPEG
despite the PNG filename; a content-preserving PNG conversion was saved.
The retry lost browser connectivity before successful upload could be verified.
At that earlier observation, the overview showed Store listings Incomplete and
certification submission disabled. Later the publisher reported submitting
2.2.1 and seeing Certification status. Current Microsoft review status requires
a fresh Partner Center observation; local package builds do not establish it.
