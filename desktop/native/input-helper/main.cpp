#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <atomic>
#include <cstdio>
#include <cwchar>
#include <thread>

// No ordinary key data leaves this process. Only the configured hold gesture is observed.
static HHOOK keyboardHook=nullptr,mouseHook=nullptr;
static DWORD ownerThread=0;static UINT trigger=VK_SPACE,modifiers=MOD_CONTROL|MOD_ALT;
static bool active=false,held=false,blockRight=false,blockEscape=false,allowFullscreen=false;
static unsigned long sequence=0;static HWND foreground=nullptr;
static DWORD parentProcess=0;static bool pendingRelease=false;static POINT releasePoint{};
static constexpr UINT finishMessage=WM_APP+1;
static constexpr UINT probeMessage=WM_APP+2;
static std::atomic<ULONGLONG> heartbeat{0};static ULONGLONG lastMove=0;
static void emit(const char* type){POINT p{};GetCursorPos(&p);std::printf("%s %lu %ld %ld\n",type,sequence,p.x,p.y);std::fflush(stdout);}
static void cancel(){if(active||pendingRelease){active=false;pendingRelease=false;emit("CANCEL");}}
static bool down(int key){return (GetAsyncKeyState(key)&0x8000)!=0;}
static bool combination(){return down(VK_CONTROL)&&down(VK_MENU)&&(!(modifiers&MOD_SHIFT)||down(VK_SHIFT))&&!down(VK_LWIN)&&!down(VK_RWIN);}
static bool fullscreen(){
  HWND w=GetForegroundWindow();if(!w)return true;
  wchar_t cls[64]{};GetClassNameW(w,cls,64);if(!wcscmp(cls,L"Progman")||!wcscmp(cls,L"WorkerW"))return false;
  RECT r{};MONITORINFO mi{sizeof(mi)};if(!GetWindowRect(w,&r)||!GetMonitorInfoW(MonitorFromWindow(w,MONITOR_DEFAULTTONEAREST),&mi))return true;
  return r.left==mi.rcMonitor.left&&r.top==mi.rcMonitor.top&&r.right==mi.rcMonitor.right&&r.bottom==mi.rcMonitor.bottom;
}
static bool control(UINT key){return key==VK_CONTROL||key==VK_LCONTROL||key==VK_RCONTROL;}
static bool alt(UINT key){return key==VK_MENU||key==VK_LMENU||key==VK_RMENU;}
static bool shift(UINT key){return key==VK_SHIFT||key==VK_LSHIFT||key==VK_RSHIFT;}
static bool permitted(){return GetTickCount64()-heartbeat.load()<2500&&(allowFullscreen||!fullscreen());}
static void begin(){if(pendingRelease)cancel();held=true;active=true;foreground=GetForegroundWindow();++sequence;emit("OPEN");}
static void finish(){
  if(!active)return;
  if(GetForegroundWindow()!=foreground||!permitted())cancel();
  else{
    active=false;pendingRelease=true;GetCursorPos(&releasePoint);
    // Return from the low-level hook before handing off foreground permission.
    // Preserve the release coordinates and cancel if a newer gesture intervenes.
    if(!PostThreadMessageW(ownerThread,finishMessage,sequence,0))cancel();
  }
}
static bool ownsParent(DWORD expected){
  HANDLE snapshot=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);
  if(snapshot==INVALID_HANDLE_VALUE)return false;
  PROCESSENTRY32W entry{};entry.dwSize=sizeof(entry);bool found=false;
  if(Process32FirstW(snapshot,&entry))do{if(entry.th32ProcessID==GetCurrentProcessId()){found=entry.th32ParentProcessID==expected;break;}}while(Process32NextW(snapshot,&entry));
  CloseHandle(snapshot);return found;
}
static LRESULT CALLBACK keyboard(int code,WPARAM msg,LPARAM data){
  if(code<0)return CallNextHookEx(keyboardHook,code,msg,data);
  const auto* e=reinterpret_cast<KBDLLHOOKSTRUCT*>(data);
  if(e->flags&LLKHF_INJECTED)return CallNextHookEx(keyboardHook,code,msg,data);
  const bool press=msg==WM_KEYDOWN||msg==WM_SYSKEYDOWN,release=msg==WM_KEYUP||msg==WM_SYSKEYUP;
  if(blockEscape&&e->vkCode==VK_ESCAPE){if(release)blockEscape=false;return 1;}
  if(active&&press&&e->vkCode==VK_ESCAPE){blockEscape=true;cancel();return 1;}
  if(trigger==0){
    // Low-level hooks run before Windows updates async key state. Include this
    // event explicitly so either Ctrl/Alt press order opens on the second key.
    const bool ctrl=control(e->vkCode)?press:down(VK_CONTROL);
    const bool menu=alt(e->vkCode)?press:down(VK_MENU);
    const bool altGr=e->vkCode==VK_RMENU||down(VK_RMENU);
    if(press&&!control(e->vkCode)&&!alt(e->vkCode))cancel();
    if(active&&release&&(control(e->vkCode)||alt(e->vkCode)))finish();
    if(press&&(control(e->vkCode)||alt(e->vkCode))&&!held&&ctrl&&menu&&!altGr&&!down(VK_SHIFT)&&!down(VK_LWIN)&&!down(VK_RWIN)&&permitted())begin();
    // A cancelled gesture cannot rearm until both modifiers are released.
    if(release&&!ctrl&&!menu)held=false;
    // Do not swallow modifiers: every passed key-down retains its key-up.
    return CallNextHookEx(keyboardHook,code,msg,data);
  }
  if(e->vkCode==trigger){
    if(press&&held)return 1;
    if(press&&combination()&&GetTickCount64()-heartbeat.load()<2500&&(allowFullscreen||!fullscreen())){
      begin();return 1;
    }
    if(release&&held){held=false;finish();return 1;}
  }
  if(active&&release&&(control(e->vkCode)||alt(e->vkCode)||((modifiers&MOD_SHIFT)&&shift(e->vkCode))))finish();
  return CallNextHookEx(keyboardHook,code,msg,data);
}
static LRESULT CALLBACK mouse(int code,WPARAM msg,LPARAM data){
  if(code>=0){
    if(blockRight&&msg==WM_RBUTTONUP){blockRight=false;return 1;}
    if(active&&msg==WM_RBUTTONDOWN){blockRight=true;cancel();return 1;}
    if(active&&msg==WM_MOUSEMOVE&&GetTickCount64()-lastMove>=16){lastMove=GetTickCount64();emit("MOVE");}
  }
  return CallNextHookEx(mouseHook,code,msg,data);
}
int wmain(int argc,wchar_t** argv){
  if(argc!=5)return 2;wchar_t* end=nullptr;
  // The only process we can authorize is our actual launching parent. Never
  // accept ASFW_ANY, a renderer-supplied PID or a window owned by another app.
  if(!argv[4][0])return 2;
  for(const wchar_t* digit=argv[4];*digit;++digit)if(*digit<L'0'||*digit>L'9')return 2;
  const unsigned long long parent=_wcstoui64(argv[4],&end,10);
  if(!end||*end||parent==0||parent>=MAXDWORD||!ownsParent(static_cast<DWORD>(parent)))return 2;
  parentProcess=static_cast<DWORD>(parent);
  trigger=static_cast<UINT>(wcstoul(argv[1],&end,10));if(!end||*end||!(trigger==0||trigger==VK_SPACE||(trigger>='A'&&trigger<='Z')||(trigger>='0'&&trigger<='9')||(trigger>=VK_F1&&trigger<=VK_F12)))return 2;
  modifiers=static_cast<UINT>(wcstoul(argv[2],&end,10));if(!end||*end||(modifiers!=(MOD_CONTROL|MOD_ALT)&&modifiers!=(MOD_CONTROL|MOD_ALT|MOD_SHIFT)))return 2;
  if(wcscmp(argv[3],L"0")&&wcscmp(argv[3],L"1"))return 2;allowFullscreen=!wcscmp(argv[3],L"1");
  // Reserve the chord as well as observing key-up, so conflicting registrations fail explicitly.
  // Windows cannot reserve a modifiers-only chord. It is observed by the hook;
  // combinations with a third key retain the explicit OS conflict check.
  if(trigger&&!RegisterHotKey(nullptr,1,modifiers|MOD_NOREPEAT,trigger)){std::puts("ERROR KEY_CONFLICT");std::fflush(stdout);return 3;}
  ownerThread=GetCurrentThreadId();MSG msg{};PeekMessageW(&msg,nullptr,WM_USER,WM_USER,PM_NOREMOVE);
  keyboardHook=SetWindowsHookExW(WH_KEYBOARD_LL,keyboard,GetModuleHandleW(nullptr),0);mouseHook=SetWindowsHookExW(WH_MOUSE_LL,mouse,GetModuleHandleW(nullptr),0);
  if(!keyboardHook||!mouseHook){if(keyboardHook)UnhookWindowsHookEx(keyboardHook);if(mouseHook)UnhookWindowsHookEx(mouseHook);UnregisterHotKey(nullptr,1);return 4;}
  heartbeat=GetTickCount64();SetTimer(nullptr,1,100,nullptr);
  std::thread([]{char c;while(std::fread(&c,1,1,stdin)==1){if(c=='H')heartbeat=GetTickCount64();else if(c=='D')PostThreadMessageW(ownerThread,probeMessage,0,0);}PostThreadMessageW(ownerThread,WM_QUIT,0,0);}).detach();
  std::puts("READY");std::fflush(stdout);
  while(GetMessageW(&msg,nullptr,0,0)>0){
    if(msg.message==finishMessage){
      if(pendingRelease&&msg.wParam==sequence){
        if(GetForegroundWindow()!=foreground||!permitted())cancel();
        else{
          pendingRelease=false;
          // Windows enforces whether this gesture grants foreground rights.
          // Failure is not worked around with injected input or global policy.
          SetLastError(0);const BOOL granted=AllowSetForegroundWindow(parentProcess);
          const DWORD error=granted?0:GetLastError();
          std::printf("TRANSFER %lu %d %lu\n",sequence,granted?1:0,error);
          std::printf("GESTURE %lu %d %d\n",sequence,down(VK_CONTROL)?1:0,down(VK_MENU)?1:0);
          std::printf("RELEASE %lu %ld %ld\n",sequence,releasePoint.x,releasePoint.y);std::fflush(stdout);
        }
      }
      continue;
    }
    if(msg.message==probeMessage){
      const HWND window=GetForegroundWindow();DWORD owner=0;if(window)GetWindowThreadProcessId(window,&owner);
      const bool topmost=window&&(GetWindowLongPtrW(window,GWL_EXSTYLE)&WS_EX_TOPMOST)!=0;
      std::printf("FOREGROUND %lu %d %d\n",sequence,owner==parentProcess?1:0,topmost?1:0);std::fflush(stdout);continue;
    }
    if(msg.message==WM_TIMER){if(GetTickCount64()-heartbeat.load()>2500){cancel();held=false;}else if(!GetForegroundWindow()||GetForegroundWindow()!=foreground)cancel();}
    TranslateMessage(&msg);DispatchMessageW(&msg);
  }
  cancel();KillTimer(nullptr,1);UnhookWindowsHookEx(keyboardHook);UnhookWindowsHookEx(mouseHook);UnregisterHotKey(nullptr,1);return 0;
}
