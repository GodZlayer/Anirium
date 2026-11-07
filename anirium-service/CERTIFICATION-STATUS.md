# Microsoft release status

Current certification status is **not independently verified**; the user
reported submitting native MSIX 2.2.1.0 for certification. Local candidates and
passing tests are not Microsoft approval or readiness for public replacement.
This file is not a legal opinion.

## Current checks (2026-10-03)

Latest staged candidate is unsigned MSIX 2.3.14.0, not installed or submitted.
Public provider routing now works at `https://n.anirium.com.br`; the superseded
hostname below is historical. Updated Core/Player image is deployed, with
public catalogue/privacy/support pages returning 200. Full installed playback,
current Partner Center certification and redistribution review remain open.
See MSIX-RELEASE.md and ACCEPTANCE-AUDIT.md for artifact/runtime evidence.

## Historical authoritative state (2026-10-02)

- Selected distribution is native MSIX, not the previous EXE/MSI listing and
  not a PWA. Store identity: `GodZlayer.AniriumService`, publisher `GodZlayer`,
  Store ID `9MV35DDQ6SBD`. Buying an EXE Authenticode certificate is not the
  selected Store packaging workflow. The historical EXE signing checklist below
  must not be applied as the prerequisite for this MSIX submission.
- User-reported submitted package: 2.2.1.0. Latest staged testing candidate:
  2.3.9.0, including actual staged-EXE diagnostics with bundled media tools.
  See MSIX-RELEASE.md for verified artifact hashes and limitations.
- `Get-AppxPackage -Name GodZlayer.AniriumService` returned no package for the
  current Windows user. A process query found no `anirium-service.exe` running.
  Installed-package playback, media subprocesses, upgrade and uninstall remain
  untested; a staged package cannot substitute for this evidence.
- Public website/privacy/support are https://anirium.com.br,
  https://anirium.com.br/privacidade and https://anirium.com.br/suporte.
  User-approved public contact: `admin@anirium.com.br`.
- Core and independent community-provider containers have been updated.
  Their passing boundary checks do not establish legal immunity, content rights
  or complete authenticated browser playback.
- Public provider origin is configured as https://nyaa.tgdevs.pp.ua, but DNS/
  tunnel publication remains unverified/uncompleted pending Cloudflare login.
- Shared media timeline alignment, continuous adaptation, installed acceptance
  and exact media-tool source/dependency redistribution review remain open.

## Current release gates

1. Finish and verify the original playback requirements in ACCEPTANCE-AUDIT.md.
2. Resolve exact bundled media-tool redistribution requirements.
3. Build a final versioned MSIX and verify actual installation, native runtime,
   bundled media tools, upgrade and uninstall without weakening Windows security.
4. Verify the actual Partner Center certification/publication state and submit
   the completed package through the native MSIX product when ready. Do not
   cancel or overwrite the existing submission merely to refresh this document.
5. Verify the approved Store artifact before replacing public distribution.

## Historical observations below — superseded where noted

The following records describe the earlier EXE/MSI inspection, not the current
MSIX product or its live certification status. Unconfirmed contact fields and
empty draft properties below must not be repeated as current findings.

## Architecture

- Core/site: catalogue, official-source links, account/session/plan authorization
  and UI plugin host. No community provider execution or torrent dependency.
- Official Player Pro: account token and episode context to local Service;
  playback from Service manifests/media, or independent local/HTTP files.
- Local Service: authorized provider-server discovery and local torrent/media
  processing. Community provider server: independent metadata/magnet search,
  without Core imports or media streaming.

Mandatory static guards and component/runtime tests support these boundaries.
They cannot establish immunity from legal responsibility or third-party rights.

## Observed on 2026-10-02

- Windows SDK 10.0.26100.0 x64 SignTool and Windows App Certification Kit exist.
- No Inno compiler was found on PATH; availability elsewhere is not established.
- CurrentUser/My contains only an observed TGAnalyzer Development Only
  self-issued signing certificate. It is rejected by the release preflight.
- No trusted Anirium publisher signing credential has been supplied.
- Legal publisher identity, actual privacy URL and support contact remain
  unconfirmed. Do not fabricate these fields or certify their accuracy.
- The Service executable is a development build, not a signed installer.
- The public download remains the previous executable, not an approved release.
- The complete development build was rerun after the loopback-listener change:
  architecture/installer/token/official-source guards, `go vet` and the uncached
  Go suite passed (19.262 seconds). The resulting local executable SHA256 is
  `3a9b279a43dedbd18e63c08ee0e9c646e66c7eb7600ac443eaec015b544d8f58`,
  Authenticode status `NotSigned`. No public copy occurred. This run did not
  execute the signed-release database/race gates, clean installation, browser
  acceptance or Microsoft review, and is not proof of complete acceptance.
- A separate uncached `go test -race` run subsequently passed for the current
  Service code (19.945 seconds) with the portable Windows GCC toolchain.
  Both audit images also passed their runtime checks under Docker
  `--network none`: Core rejects unauthenticated operations and excludes the
  community provider; provider serves its manifest and has no streaming route
  in the exercised checks. These checks do not exercise live provider searches,
  production entitlements, clean-Windows installation or the complete browser
  playback flow. No deployed production container was replaced.
- The authenticated Partner Center Properties draft was inspected read-only.
  Primary category is still `Pick a category`. Privacy policy URL is empty and
  displays `Privacy policy URL is required.` Website, support contact, publisher
  email/phone/address and certification notes are empty. Hardware selections
  remain unspecified. These observations describe this page only, not the
  validation status or requiredness of every field in the complete submission.
  No fields were edited, saved or submitted, and no Microsoft approval was seen.

## Partner Center handoff

Provide the real legal publisher identity, privacy policy and support information
before completing the draft. Do not substitute invented contacts or assume the
signed-in account display name is the legal publisher. Category and reviewer
notes must accurately describe the shipped local Service, its account/plan
requirements and external dependencies; do not claim unverified accessibility
or certification. A reviewer account/access procedure must be supplied securely
if the locked features are part of the submission. No credentials belong here.

The Properties page belongs to the product named `Anirium`. Confirm whether this
listing is intended for the local Service installer or a different Anirium app
before changing its product descriptions or submitting a package. This inspection
did not navigate away from the open form, so its potential unsaved state was
preserved; package URL and other submission sections remain unverified.

## Historical EXE/MSI release checklist (not the selected MSIX workflow)

1. Publisher-provided trusted signing configuration; do not send private keys
   or passwords in chat. Use the local certificate store or approved signing flow.
2. Reviewed redistributable media tools/licenses and installer compiler.
3. Signed/versioned installer and uninstaller, validated offline/silent
   installation, upgrade and uninstall in clean Windows.
4. Applicable Windows certification tests and actual Partner Center review;
   local WACK success and Authenticode signing are not Microsoft Store approval.
5. Immutable installer URL, verified artifact/hash and approved public download
   publication. Component builders deliberately do not publish automatically.

Remaining functional and security acceptance gaps are recorded separately in
ACCEPTANCE-AUDIT.md. Keep them explicit in reviewer notes; do not describe an
unfinished feature as certified or already accepted.
