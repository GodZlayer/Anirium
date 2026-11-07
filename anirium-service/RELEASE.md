# Anirium Service release

Build on Windows from the repository root:

```powershell
powershell -NoProfile -File scripts/build-service.ps1
```

This checks Core/Player media boundaries, runs Go tests and compiles the current
source locally. Neither development nor signed component builds replace the
public download. Publication must use a validated, approved installer through
a separate release workflow; signing alone is insufficient. The existing download API is
`/api/download/service`. This gate does not certify any pre-existing download.

Unsigned development builds are not Microsoft-certified releases. The
`-RequireSignature` option requires a trusted signature for the staged build;
neither build mode publishes into the download directory. Supply `-CertificateThumbprint` for the real publisher's
certificate in CurrentUser/My and `-SignToolPath` for Windows SDK signtool.exe.
The script signs with SHA256 and an RFC3161 timestamp, verifies the signature,
and checks trust and timestamp before staging. Credentials remain outside the
repository. Do not use the TGAnalyzer development certificate. Signing does not
constitute Microsoft Store certification.

## Installer staging

`scripts/build-service-installer.ps1` builds a signed Service with `-StageOnly`,
then compiles the standalone Inno installer and signed uninstaller into
`anirium-service/release/<version>/`. It never changes the public download.
Supply the legal `Publisher`, `ReleaseVersion`, reviewed `MediaToolsDir`,
publisher `CertificateThumbprint`, SDK `SignToolPath` and `InnoCompilerPath`.
Both bundled media executables must already have trusted signatures; the script
does not silently sign third-party binaries under the publisher identity.
The installer receives a version/hash-based filename. An existing staging
version is rejected to avoid accidentally overwriting a prior artifact.
Signed uninstaller artifacts are explicitly retained in the same staging
directory. Acceptance fails if none exists, rather than passing an empty
signature-check loop. Their signatures still require the actual publisher and
timestamp checks; installed-uninstaller testing remains a separate requirement.

Store silent installation parameters are
`/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`.
Actual silent installation/uninstallation must still be verified in a clean
Windows environment. The compiler and signing checks have not yet run with
real release credentials. `verify-installer-boundaries.mjs` is a configuration
guard, not proof that the installer was compiled or certified.

The current mutable `/api/download/service` endpoint is not a Store submission
URL. Publish a versioned, immutable HTTPS installer URL only after the release
checks and required publisher approvals. Microsoft requires signatures on the
installer and its bundled PE files, silent/offline installation, and an unchanged
versioned URL: [MSI/EXE package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements).

The legacy endpoint returns `X-Anirium-Artifact-SHA256` computed from the actual
response bytes and `Cache-Control: no-store`. The mandatory Core runtime test
checks both. A matching fingerprint proves delivery integrity only, not a
trusted publisher signature or Microsoft approval. The existing executable was
observed as `NotSigned` on 2026-10-02 and is not a certified release.

## Current release blockers

See [ACCEPTANCE-AUDIT.md](ACCEPTANCE-AUDIT.md) for confirmed media gaps and the
limits of current build evidence. Green component tests are not full acceptance.

- Production `/api/user` rejects demo identity switching, unverified Google
  profile claims and self-issued Plus activation. The verified Google auth
  endpoint remains available. Implement a trusted entitlement confirmation
  flow before offering production plan activation; client-selected plans alone
  are not proof of entitlement. The Core image build tests these rejections.

- Microsoft Partner Center submission is a draft, not an approved release.
- Signed release builds require `go vet`, uncached functional/media tests and
  `go test -race -count=1 ./...`. On Windows the race detector needs
  `CGO_ENABLED=1` and a supported C compiler. The portable compiler can be
  prepared with `scripts/setup-service-race-toolchain.ps1`: it downloads a pinned
  WinLibs GCC 16.2/MinGW-w64 14 asset, verifies SHA256 and checks for
  `libsynchronization.a`. It stays in ignored `.toolcache`, outside Docker build
  context, without changing machine/user PATH or persistent Go configuration.
  Run `scripts/verify-service-race.ps1 -CompilerPath <path-to-gcc.exe>` to test;
  the runner temporarily configures CGO/CC/PATH and restores them in `finally`.
  Supply `-CCompilerPath` to either signed build script. A missing or unsuitable
  toolchain fails the release gate rather than skipping the concurrency check.
  The full Windows/amd64 suite passed `go test -race -count=1 ./...` with this
  toolchain. This is evidence for the executed tests only; native UI, browser
  playback and untested long-running workloads still need runtime coverage.
- Supply publisher signing credentials and a distributable installer with
  installation/uninstallation. The installer now requires `MediaToolsDir`
  containing `ffmpeg.exe`, `ffprobe.exe` and `LICENSE.txt`. Supply a package
  reviewed for redistribution obligations; the locally installed development
  tools are not automatically approved for redistribution. The Service resolves
  bundled `{app}/tools` executables before PATH and refuses media preparation
  when either tool is absent. Installer compilation and clean-machine testing
  are still pending.
- Complete privacy policy, support contacts, product listing and reviewer notes
  from real publisher information.
- PostgreSQL leases passed eight concurrent acquisition attempts, renewal,
  wrong-device/session rejection, reconnection and expiry tests. Run
  `npm run verify:service-leases` with an isolated test `DATABASE_URL`.
  Signed release builds require this check before compiling the Service.
- Provider searches now intersect local server IDs with account addon IDs
  returned by Core session validation. Tests cover absent authorization,
  mismatched manifest identity and declared search endpoints. Provider IDs
  configured locally must match the enabled account addon IDs exactly.
- Media requires a local playback grant and revalidation against Core; legacy
  playback entry points are rejected. Player renews the grant every two minutes.
- Verify source timeline alignment and codec/audio compatibility with actual
  media before accepting multi-source segments as production playback.
  A synthetic FFmpeg test now verifies fixed four-second cuts from two video
  inputs and decodes a playlist switching between their segments. It does not
  prove that independently edited releases share the same content timeline.
- Exercise negative authorization cases and playback end-to-end; current unit
  tests and architecture scans alone do not verify every product requirement.

Core production deployments require `ANIRIUM_SERVICE_SECRET`. The Service
defaults to `https://anirium.com.br` starting with the `2.2.1.0` Store candidate;
`ANIRIUM_CORE_URL` remains an explicit deployment/test override. It reads provider configuration from
`ANIRIUM_PROVIDER_SERVERS`. Keep configuration and secrets out of image layers.

The Player HTTP API binds explicitly to `127.0.0.1:4004`, not every network
interface. A real-listener test verifies this binding and local connectivity.
BitTorrent peer transports are separate and remain network-capable. Loopback
binding does not replace token validation or a browser-origin security policy.

Provider configuration accepts optional `timeoutMs`: omitted/non-positive values
use 30 seconds, with explicit values bounded to 100–30000 milliseconds. The
deadline covers manifest and search together after a worker slot is acquired.
Up to four providers are queried concurrently per search, preserving configured
result order; cancellation of the playback request cancels discovery.

The production media cache now provides generation-scoped private loopback
HTTP range inputs to FFmpeg/ffprobe instead of copying complete videos first.
Each request has a separate, context-cancelable torrent reader, bounded to its
selected file with 256 KiB readahead. URLs are unpredictable and never sent to
the Player; browser-Origin requests are rejected and generation cancellation
retires the listener. Real-peer tests verify start/tail ranges while files remain
incomplete; the generated-media pipeline also runs through these seekable URLs.
Video and audio workers now publish closed segments into growing EVENT HLS
playlists before transcoding finishes. Video producers run concurrently with a
four-worker limit per variant; published segments are not rewritten if a later
source offers cheaper bytes. Failed producers can supply valid prefixes but
cannot falsely finalize an episode. The manifest exposes buffered seconds and
processing completion separately; `ready` means playable closed media exists,
not that processing is complete. Generated-media tests decoded early video/audio
while an HTTP input tail was blocked, then completed after it was released.
Authenticated Player playback over a restricted-throughput torrent remains
unverified. Cut/cumulative timing checks are not content alignment between edits.
