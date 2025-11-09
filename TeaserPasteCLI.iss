; Script Inno Setup hoàn chỉnh cho TeaserPaste CLI (V0.5.0+)

[Setup]
AppId={{203354a2-1cef-4e0d-9102-2b1d6b59b730}}
AppName=TeaserPaste CLI
AppVersion=0.6.5
AppPublisher=Teaserverse
DefaultDirName={autopf}\TeaserPaste CLI
DefaultGroupName=TeaserPaste CLI
OutputBaseFilename=TeaserPaste_CLI_Setup-0.6.5
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
SetupIconFile=assets\paste-black.ico

[Tasks]
Name: "addtopath"; Description: "Thêm thư mục ứng dụng vào PATH hệ thống (khuyến nghị)"; GroupDescription: "Tùy chỉnh:"; Flags: checkedonce

[Files]
Source: "dist\tp.exe"; DestDir: "{app}"; DestName: "tp.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\TeaserPaste CLI Documentation"; Filename: "https://docs.teaserverse.online/triple-tool/teaserpaste/cli"
Name: "{group}\Gỡ cài đặt TeaserPaste CLI"; Filename: "{uninstallexe}"

[Registry]
Root: "HKLM"; Subkey: "System\CurrentControlSet\Control\Session Manager\Environment"; \
    ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Tasks: addtopath
Root: "HKLM"; Subkey: "Software\Teaserverse\TeaserPasteCLI"; ValueType: string; ValueName: "PathAdded"; ValueData: "1"; Tasks: addtopath; Flags: uninsdeletekey

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
const
  WM_SETTINGCHANGE = $1A;

function CreateFile(lpFileName: AnsiString; dwDesiredAccess, dwShareMode: DWORD; lpSecurityAttributes: Cardinal; dwCreationDisposition, dwFlagsAndAttributes, hTemplateFile: DWORD): THandle; external 'CreateFileA@kernel32.dll stdcall';
function CloseHandle(hObject: THandle): BOOL; external 'CloseHandle@kernel32.dll stdcall';
function SendMessage(hWnd: Integer; Msg: Cardinal; wParam: Integer; lParam: string): Integer;
  external 'SendMessageA@user32.dll stdcall';

function Explode(Str: string; Delimiter: char): TArrayOfString; forward;
function RemoveTrailingBackslash(S: string): string; forward;
function IsSilent: Boolean; forward;

function IsFileInUse(const FileName: string): Boolean;
var
  F: THandle;
begin
  Result := False;
  if not FileExists(FileName) then Exit;
  F := CreateFile(FileName, $80000000 or $40000000, 0, 0, 3, $80, 0);
  if F = DWORD(-1) then
  begin
    Result := True;
  end else
  begin
    CloseHandle(F);
  end;
end;

// *** SỬA LỖI: Lấy đường dẫn cài đặt cũ từ Registry một cách an toàn ***
function GetPreviousInstallPath(): string;
var
  UninstallPath: string;
begin
  Result := '';
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + ExpandConstant('{#SetupSetting("AppId")}') + '_is1',
    'Inno Setup: App Path',
    UninstallPath)
  then
  begin
    RegQueryStringValue(HKEY_CURRENT_USER,
      'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + ExpandConstant('{#SetupSetting("AppId")}') + '_is1',
      'Inno Setup: App Path',
      UninstallPath);
  end;
  Result := UninstallPath;
end;

// Chạy trước khi cài đặt để kiểm tra phiên bản cũ
function InitializeSetup(): Boolean;
var
  AppPath: string;
  TPExePath: string;
  Msg: string;
begin
  Result := True;
  AppPath := GetPreviousInstallPath();

  if AppPath <> '' then
  begin
    TPExePath := AppPath + '\tp.exe';
    if FileExists(TPExePath) then
    begin
      while IsFileInUse(TPExePath) do
      begin
        Msg := 'Trình cài đặt đã phát hiện TeaserPaste CLI đang được sử dụng, có thể bởi một cửa sổ Terminal đang mở.' + #13#10 + #13#10 +
               'Vui lòng đóng tất cả các cửa sổ Terminal và nhấn OK để tiếp tục, hoặc Cancel để thoát.';
        if MsgBox(Msg, mbConfirmation, MB_OKCANCEL) = IDCANCEL then
        begin
          Result := False;
          Exit;
        end;
      end;
    end;
  end;
end;

procedure DeinitializeUninstall();
var
  AppPath, OriginalPath, NewPath, PathAddedFlag: string;
  PathArr: TArrayOfString;
  I: Integer;
begin
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE, 'Software\Teaserverse\TeaserPasteCLI', 'PathAdded', PathAddedFlag) or (PathAddedFlag <> '1') then
  begin
    Log('Tác vụ dọn dẹp PATH đã được bỏ qua vì nó không được thêm bởi trình cài đặt.');
    exit;
  end;

  if not RegQueryStringValue(HKEY_LOCAL_MACHINE, 'System\CurrentControlSet\Control\Session Manager\Environment', 'Path', OriginalPath) then
  begin
    Log('Không đọc được biến môi trường PATH.');
    exit;
  end;

  AppPath := RemoveTrailingBackslash(ExpandConstant('{app}'));
  PathArr := Explode(OriginalPath, ';');
  NewPath := '';

  for I := 0 to GetArrayLength(PathArr) - 1 do
  begin
    if CompareText(RemoveTrailingBackslash(Trim(PathArr[I])), AppPath) <> 0 then
    begin
      if NewPath <> '' then
        NewPath := NewPath + ';';
      NewPath := NewPath + PathArr[I];
    end;
  end;

  if RegWriteStringValue(HKEY_LOCAL_MACHINE, 'System\CurrentControlSet\Control\Session Manager\Environment', 'Path', NewPath) then
    Log('Đã xóa ' + AppPath + ' khỏi PATH thành công.')
  else
    Log('Lỗi khi ghi lại biến môi trường PATH.');

  SendMessage(HWND_BROADCAST, WM_SETTINGCHANGE, 0, 'Environment');
end;

function RemoveTrailingBackslash(S: string): string;
begin
  if (Length(S) > 0) and (S[Length(S)] = '\') then
    Result := Copy(S, 1, Length(S) - 1)
  else
    Result := S;
end;

function Explode(Str: string; Delimiter: char): TArrayOfString;
var
  p, p2: Integer;
begin
  SetArrayLength(Result, 0);
  p := 1;
  while p <= Length(Str) do
  begin
    p2 := Pos(Delimiter, Copy(Str, p, Length(Str)));
    if p2 > 0 then
    begin
      SetArrayLength(Result, GetArrayLength(Result) + 1);
      Result[GetArrayLength(Result)-1] := Copy(Str, p, p2-1);
      p := p + p2;
    end
    else
    begin
      SetArrayLength(Result, GetArrayLength(Result) + 1);
      Result[GetArrayLength(Result)-1] := Copy(Str, p, Length(Str));
      break;
    end;
  end;
end;

function IsSilent: Boolean;
var
  I: Integer;
begin
  Result := False;
  for I := 1 to ParamCount do
  begin
    if (CompareText(ParamStr(I), '/SILENT') = 0) or (CompareText(ParamStr(I), '/VERYSILENT') = 0) then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssDone) and (not IsSilent()) then
  begin
    MsgBox('Cài đặt TeaserPaste CLI hoàn tất!' + #13#10 + #13#10 +
           'Lệnh "tp" hiện đã sẵn sàng để sử dụng. Nếu lệnh không hoạt động, vui lòng thử mở một cửa sổ Terminal mới.',
           mbInformation, MB_OK);
  end;
end;

