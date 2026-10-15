import fs from 'node:fs';

// Configuration guard only: it does not prove a compiled installer's signature,
// silent installation, bundled licenses or Microsoft certification.
const spec = fs.readFileSync('anirium-service/installer.iss', 'utf8');
const builder = fs.readFileSync('scripts/build-service-installer.ps1', 'utf8');
const serviceBuilder = fs.readFileSync('scripts/build-service.ps1', 'utf8');
function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}
for (const define of ['Publisher', 'ReleaseVersion', 'MediaToolsDir', 'StageDir']) {
  requireMatch(spec, new RegExp(`#ifndef ${define}\\s+#error`), `Missing explicit installer input: ${define}`);
}
requireMatch(spec, /^OutputDir=\{#StageDir\}\s*$/m, 'Installer output must be staged, not published');
requireMatch(spec, /^SignTool=anirium\s*$/m, 'Installer must configure signing');
requireMatch(spec, /^SignedUninstaller=yes\s*$/m, 'Uninstaller must be signed');
requireMatch(spec, /^SignedUninstallerDir=\{#StageDir\}\s*$/m, 'Signed uninstaller artifacts must use the version staging directory');
requireMatch(builder, /if \(\$uninstallers\.Count -eq 0\)/, 'Missing signed uninstaller must fail release acceptance');
requireMatch(builder, /build-service\.ps1'\) -RequireSignature -StageOnly/, 'Installer must use staged signed Service build');
requireMatch(builder, /Assert-TrustedExecutable \$installer -RequirePublisher/, 'Installer publisher verification is required');
requireMatch(builder, /foreach \(\$name in @\('ffmpeg\.exe', 'ffprobe\.exe'\)\)/, 'Both bundled media tools must be checked');
requireMatch(builder, /\/VERYSILENT \/SUPPRESSMSGBOXES \/NORESTART \/SP-/, 'Silent install parameters must be documented');
if (/Copy-Item|public[\\/]downloads/.test(serviceBuilder)) throw new Error('Service component builds must not publish, even when signed');
requireMatch(serviceBuilder, /Assert-ReleaseCertificate \$publisherCertificate/, 'Publisher certificate preflight is required');
requireMatch(serviceBuilder, /verify-release-certificate\.ps1/, 'Certificate preflight regression tests are required');
if (/public[\\/]downloads/.test(spec) && /^OutputDir=.*public/m.test(spec)) throw new Error('Installer outputs directly into public downloads');
if (/Copy-Item|public[\\/]downloads/.test(builder)) throw new Error('Installer preparation must not publish');
console.log('Installer configuration boundaries verified (not installer runtime/certification).');
