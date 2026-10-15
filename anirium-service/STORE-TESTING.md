# Certification testing preparation — 2026-10-02

This is a testing preparation document, not installed-package acceptance or
Microsoft approval. The user reported submitting 2.2.1.0; the draft observations
below are historical and do not contradict that later report. Do not submit a
replacement candidate before its functional/distribution gates are resolved.

## Current testing state (2026-10-03)

Latest candidate is 2.3.14.0; actual executable/bundled media diagnostics and
MakeAppx packaging passed. It is unsigned, not installed and not submitted.
The local MSIX cannot be described as an already Store-signed installation.
Do not install new trusted certificates or weaken Windows protections to test it.
The site container now includes current Player windows/fallback UI. Public
provider `https://n.anirium.com.br/manifest` and `/health` returned 200 through
a direct tunnel route to the independent provider; `/stream` returned 404.
These facts supersede older testing notes below. Full authenticated installed
playback and Microsoft approval remain unverified. Artifact hashes are in
MSIX-RELEASE.md.

## Historical testing state (2026-10-02)

Source now supports `anirium-service.exe --diagnostics` before any GUI, HTTP,
torrent or provider initialization. It reports JSON and fails if its own bundled
ffmpeg/ffprobe cannot execute, then runs a synthetic H.264/AAC smoke test.
This command is present in staged 2.3.9, not in 2.3.8 or submitted 2.2.1. The new
diagnostic function was tested against the actual 2.3.8 payload's tools (9.05s),
not an installed package. Missing bundled tools are rejected without PATH fallback.
Once packaged, execute this diagnostic from the new package as part of runtime
acceptance; a successful result does not prove installation, networking, real
playback, complete codecs, upgrade, uninstall or Microsoft certification.

Latest staged candidate is 2.3.9.0 (see MSIX-RELEASE.md). Its actual staged EXE
passed diagnostics before MakeAppx packaging. On 2026-10-02 the current user's package inventory contained no
`GodZlayer.AniriumService`, and no `anirium-service.exe` process was running.
The website now deploys free profile-based Plus activation during open beta;
route/database fixtures verify activation and session policy, but actual Google
login and complete browser playback remain unverified. Earlier observations of
an activation-blocking route and a running 2.2.0 process below are historical.
The provider public origin is configured but public DNS/tunnel routing is still
pending. The current Service discovers account-authorized remote manifests;
the 2.2.1 local provider-configuration description below applies to that old
candidate only.

## Historical submitted candidate: 2.2.1.0

- Product: Anirium+ Service, GodZlayer, Store ID `9MV35DDQ6SBD`.
- Native Windows.Desktop X64 MSIX `2.2.1.0`, minimum Windows `10.0.19041.0`.
- SHA256: `B6A59F33948274478702B5505AE8482FF2FCAD1503E301F2912AE00A33E36BB6`.
- Historical Partner Center inspection: Packages Complete / Validated, In draft.
  The user later reported submission for certification; current status unverified.
- Public support: https://anirium.com.br/suporte, `admin@anirium.com.br`.
- Public privacy: https://anirium.com.br/privacidade.

## Proposed certification description

Anirium+ Service is a native desktop companion, not a PWA, catalogue or
standalone player. Its native window displays local processing and transfer
telemetry. The Player runs on https://anirium.com.br and communicates with the
local HTTP API at 127.0.0.1:4004. This loopback binding is distinct from the
BitTorrent client's network communication, which can receive and upload pieces
to peers and disclose the user's network address to participating peers.

The runFullTrust capability is required for the native Win32 window/tray,
loopback HTTP server, local torrent/media cache and bundled ffmpeg/ffprobe
subprocesses. Media tools are located beside the executable in tools/. Runtime
cache/log files are written outside the package's installation directory.

The publisher confirmed on 2026-10-02 that Anirium+ activation is free during
the open testing beta; payment is not required. This does not remove account,
entitlement or device/session checks. The publisher subsequently instructed
testers to sign in and activate Anirium+ in their user profile, keeping the
existing flow unchanged. Follow that path; do not request payment or introduce
a special reviewer entitlement bypass. This instruction is publisher-provided,
not evidence that the activation request was tested successfully by this agent.

Playback requires a real active Anirium+ account and a current device/session
grant validated with the Core. The package defaults to https://anirium.com.br;
no environment variable is required for that production Core URL. A second
player session for the same account is blocked by the Core lease policy.

No movies, episodes or provider-server endpoints are bundled. Media providers
are separate servers configured locally and must be authorized for the account.
The current candidate reads their local configuration through
ANIRIUM_PROVIDER_SERVERS. Without configured and authorized providers, no
provider media is available. This limitation must be disclosed, not hidden by
test credentials that bypass provider or Plus checks.

Only use media whose publisher has authorized this distribution and testing.
The Core/site does not relay the Service's torrent pieces or media segments.
This architectural separation is not a claim of legal immunity.

## Manual test sequence to execute and record

1. Install the actual candidate in an approved Windows package-testing workflow.
   Do not disable security protections or bypass certificate/browser warnings.
2. Launch Anirium+ Service from the Start menu. Check the native window, tray,
   loopback listener, media subprocess availability and writable runtime cache.
3. Sign in on https://anirium.com.br using the normal Google login. Open the
   user profile and activate Anirium+ there; the publisher states activation
   is free during the open beta. Confirm active Plus entitlement and enable
   the Player Pro UI plugin. If activation fails, record the error and contact
   admin@anirium.com.br; do not bypass authorization or use personal publisher
   credentials.
4. Configure the approved test provider locally before starting the Service.
   Confirm its ID is enabled for that account and its remote manifest/search
   endpoints work. Do not include unauthorized index servers in reviewer tests.
5. Open a specifically identified authorized episode in Player Pro. Record the
   actual prepare response, ready HLS variant, audio/subtitle selections and
   corresponding native telemetry. Do not treat unit tests as this evidence.
6. Verify anonymous/non-Plus, expired/revoked session and wrong-device rejection.
   Test the second-session block without disrupting another person's session.
7. Minimize to tray, restore the window, then choose Encerrar Serviço from its
   tray menu. Confirm it exits and releases the local listener/cache handles.
8. Uninstall and verify package-removal behavior. Do not claim that uninstall
   automatically deletes the website account or all temporary files.

## Historical pre-submission notes (not a current status report)

- Publisher confirmation to delete the old EXE/MSI item is pending.
- IARC preview is 18+; final Terms of Use/adulthood acceptance is pending.
- No genuine native application screenshot has been obtained yet. The existing
  running 2.2.0 process is online but its window is not exposed in the native
  window inventory. Launch of the candidate was rejected by the execution tool;
  no alternate launch path/security bypass was attempted.
- Reviewers should follow the publisher's normal profile activation flow using
  their own test identity rather than requesting the publisher's Google
  credentials. Successful profile activation remains unverified by this agent;
  the inspected production route blocks activate_anirium_plus, so preserve that
  discrepancy as an unverified runtime issue without changing access policy.
  An authorized test provider and exact authorized episode still need to be
  supplied/approved before reviewers can exercise provider playback.
- Installed MSIX runtime tests have not been performed.
- The bundled Gyan FFmpeg 9.0.2 build declares GPLv3. Its LICENSE and README are
  included, but exact corresponding source/build/dependency redistribution
  compliance is not established merely by including a link to the FFmpeg commit.
  Resolve this distribution gate before public release; do not silently replace
  codecs or remove the bundled tools to make a narrower package pass.

References inspected on 2026-10-02:

- https://ffmpeg.org/legal.html
- https://www.gyan.dev/ffmpeg/builds/
- Partner Center's visible Additional Testing Information form for this item.
