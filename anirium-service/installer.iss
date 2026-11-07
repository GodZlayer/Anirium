; Compile through scripts/build-service-installer.ps1. Never output directly
; into public/downloads; compilation/signing is not Store certification.
#ifndef Publisher
  #error Publisher must be supplied explicitly
#endif
#ifndef ReleaseVersion
  #error ReleaseVersion must be supplied explicitly
#endif
#ifndef StageDir
  #error StageDir must identify a non-public staging directory
#endif
#ifndef MediaToolsDir
  #error MediaToolsDir must identify a redistribution-reviewed FFmpeg package
#endif
[Setup]
AppId={{D3F961CC-0834-46B3-97D8-6C9F0C41EF3D}
AppName=Anirium Service
AppVersion={#ReleaseVersion}
AppPublisher={#Publisher}
DefaultDirName={localappdata}\Programs\Anirium Service
DefaultGroupName=Anirium Service
PrivilegesRequired=lowest
OutputDir={#StageDir}
OutputBaseFilename=anirium-service-setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\anirium-service.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
SignTool=anirium
SignedUninstaller=yes
SignedUninstallerDir={#StageDir}

[Files]
Source: "anirium-service.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#MediaToolsDir}\ffmpeg.exe"; DestDir: "{app}\tools"; Flags: ignoreversion
Source: "{#MediaToolsDir}\ffprobe.exe"; DestDir: "{app}\tools"; Flags: ignoreversion
Source: "{#MediaToolsDir}\LICENSE.txt"; DestDir: "{app}\tools"; Flags: ignoreversion

[Icons]
Name: "{group}\Anirium Service"; Filename: "{app}\anirium-service.exe"; WorkingDir: "{app}"
Name: "{group}\Uninstall Anirium Service"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\anirium-service.exe"; Description: "Start Anirium Service"; Flags: nowait postinstall skipifsilent unchecked
