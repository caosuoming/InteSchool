#define AppName "InteSchool 扫描桥接"
#define AppVersion "1.2.0"
#define OfficialSite "https://inteschool.fwerkor.com"
#define OfficialSiteEncoded "https%3A%2F%2Finteschool.fwerkor.com"

[Setup]
AppId={{B2A20F71-10F0-40CA-9057-4CF45CDE8634}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=InteSchool
DefaultDirName={localappdata}\Programs\InteSchool Scanner
DefaultGroupName=InteSchool
PrivilegesRequired=lowest
OutputDir=stage\output
OutputBaseFilename=InteSchool-Scanner-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern
UninstallDisplayIcon={app}\node.exe
CloseApplications=yes

[Files]
Source: "stage\node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\scripts\scanner-bridge.mjs"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\..\scripts\scanner-devices.mjs"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\..\scripts\scanner-pairing.mjs"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\..\scripts\scanner-launcher.mjs"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\..\scripts\scanner-wia.ps1"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "scanner-launch.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "scanner-tray.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\public\favicon.ico"; DestDir: "{app}"; DestName: "scanner.ico"; Flags: ignoreversion

[Tasks]
; A user-selected installation task grants the production site access without
; requiring a separate protocol-handler dialog or manual URL entry.
; Never silently approve arbitrary sites or enable this task by default.
Name: "authorizeOfficialWebsite"; Description: "授权 {#OfficialSite} 使用本机扫描仪"; GroupDescription: "网站访问权限（可选）："; Flags: unchecked

[Registry]
Root: HKCU; Subkey: "Software\Classes\inteschool-scanner"; ValueType: string; ValueName: ""; ValueData: "URL:InteSchool Scanner Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\inteschool-scanner"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\inteschool-scanner\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{sys}\wscript.exe"" ""{app}\scanner-launch.vbs"" ""%1"""

[Icons]
Name: "{group}\InteSchool 扫描桥接"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\scanner-launch.vbs"""
Name: "{userstartup}\InteSchool 扫描桥接"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\scanner-launch.vbs"""

[Run]
; Only the explicitly selected production origin is saved. The launcher uses
; the same origin validation and persistent allowlist as browser pairing.
Filename: "{app}\node.exe"; Parameters: """{app}\scripts\scanner-launcher.mjs"" ""inteschool-scanner://connect?origin={#OfficialSiteEncoded}"""; Tasks: authorizeOfficialWebsite; Flags: runhidden waituntilterminated; StatusMsg: "正在授权 InteSchool 网站..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File ""{app}\scanner-tray.ps1"" -Restart"; Description: "启动本机扫描服务"; Flags: nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\scanner-tray.ps1"" -Stop"; Flags: runhidden
