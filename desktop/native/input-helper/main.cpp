#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <atomic>
#include <cstdio>
#include <cwchar>
#include <thread>

// No ordinary key data leaves this process. Only the configured hold gesture is observed.
static HHOOK keyboardHook=nullptr,mouseHook=nullptr;
static DWORD ownerThread=0;static UINT trigger=VK_SPACE,modifiers=MOD_CONTROL|MOD_ALT;
static bool active=false,held=false,blockRight=false,blockEscape=false,allowFullscreen=false;
static unsigned long sequence=0;static HWND foreground=nullptr;
static std::atomic<ULONGLONG> heartbeat{0};static ULONGLONG lastMove=0;
static void emit(const char* type){POINT p{};GetCursorPos(&p);std::printf("%s %lu %ld %ld\n",type,sequence,p.x,p.y);std::fflush(stdout);}
static void cancel(){if(active){active=false;emit("CANCEL");}}
static bool down(int key){return (GetAsyncKeyState(key)&0x8000)!=0;}
static bool combination(){return down(VK_CONTROL)&&down(VK_MENU)&&(!(modifiers&MOD_SHIFT)||down(VK_SHIFT))&&!down(VK_LWIN)&&!down(VK_RWIN);}
static bool fullscreen(){
  HWND w=GetForegroundWindow();if(!w)return true;
  wchar_t cls[64]{};GetClassNameW(w,cls,64);if(!wcscmp(cls,L"Progman")||!wcscmp(cls,L"WorkerW"))return false;
  RECT r{};MONITORINFO mi{sizeof(mi)};if(!GetWindowRect(w,&r)||!GetMonitorInfoW(MonitorFromWindow(w,MONITOR_DEFAULTTONEAREST),&mi))return true;
  return r.left==mi.rcMonitor.left&&r.top==mi.rcMonitor.top&&r.right==mi.rcMonitor.right&&r.bottom==mi.rcMonitor.bottom;
}
static LRESULT CALLBACK keyboard(int code,WPARAM msg,LPARAM data){
  if(code<0)return CallNextHookEx(keyboardHook,code,msg,data);
  const auto* e=reinterpret_cast<KBDLLHOOKSTRUCT*>(data);
  if(e->flags&LLKHF_INJECTED)return CallNextHookEx(keyboardHook,code,msg,data);
  const bool press=msg==WM_KEYDOWN||msg==WM_SYSKEYDOWN,release=msg==WM_KEYUP||msg==WM_SYSKEYUP;
  if(blockEscape&&e->vkCode==VK_ESCAPE){if(release)blockEscape=false;return 1;}
  if(active&&press&&e->vkCode==VK_ESCAPE){blockEscape=true;cancel();return 1;}
  if(e->vkCode==trigger){
    if(press&&held)return 1;
    if(press&&combination()&&GetTickCount64()-heartbeat.load()<2500&&(allowFullscreen||!fullscreen())){
      held=true;active=true;foreground=GetForegroundWindow();++sequence;emit("OPEN");return 1;
    }
    if(release&&held){held=false;if(active){if(GetForegroundWindow()!=foreground||GetTickCount64()-heartbeat.load()>2500||(!allowFullscreen&&fullscreen()))cancel();else{active=false;emit("RELEASE");}}return 1;}
  }
  if(active&&release&&(e->vkCode==VK_CONTROL||e->vkCode==VK_LCONTROL||e->vkCode==VK_RCONTROL||e->vkCode==VK_MENU||e->vkCode==VK_LMENU||e->vkCode==VK_RMENU||((modifiers&MOD_SHIFT)&&(e->vkCode==VK_SHIFT||e->vkCode==VK_LSHIFT||e->vkCode==VK_RSHIFT))))cancel();
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
  if(argc!=4)return 2;wchar_t* end=nullptr;
  trigger=static_cast<UINT>(wcstoul(argv[1],&end,10));if(!end||*end||!(trigger==VK_SPACE||(trigger>='A'&&trigger<='Z')||(trigger>='0'&&trigger<='9')||(trigger>=VK_F1&&trigger<=VK_F12)))return 2;
  modifiers=static_cast<UINT>(wcstoul(argv[2],&end,10));if(!end||*end||(modifiers!=(MOD_CONTROL|MOD_ALT)&&modifiers!=(MOD_CONTROL|MOD_ALT|MOD_SHIFT)))return 2;
  if(wcscmp(argv[3],L"0")&&wcscmp(argv[3],L"1"))return 2;allowFullscreen=!wcscmp(argv[3],L"1");
  // Reserve the chord as well as observing key-up, so conflicting registrations fail explicitly.
  if(!RegisterHotKey(nullptr,1,modifiers|MOD_NOREPEAT,trigger)){std::puts("ERROR KEY_CONFLICT");std::fflush(stdout);return 3;}
  ownerThread=GetCurrentThreadId();MSG msg{};PeekMessageW(&msg,nullptr,WM_USER,WM_USER,PM_NOREMOVE);
  keyboardHook=SetWindowsHookExW(WH_KEYBOARD_LL,keyboard,GetModuleHandleW(nullptr),0);mouseHook=SetWindowsHookExW(WH_MOUSE_LL,mouse,GetModuleHandleW(nullptr),0);
  if(!keyboardHook||!mouseHook){if(keyboardHook)UnhookWindowsHookEx(keyboardHook);if(mouseHook)UnhookWindowsHookEx(mouseHook);UnregisterHotKey(nullptr,1);return 4;}
  heartbeat=GetTickCount64();SetTimer(nullptr,1,100,nullptr);
  std::thread([]{char c;while(std::fread(&c,1,1,stdin)==1){if(c=='H')heartbeat=GetTickCount64();}PostThreadMessageW(ownerThread,WM_QUIT,0,0);}).detach();
  std::puts("READY");std::fflush(stdout);
  while(GetMessageW(&msg,nullptr,0,0)>0){
    if(msg.message==WM_TIMER){if(GetTickCount64()-heartbeat.load()>2500){cancel();held=false;}else if(!GetForegroundWindow()||GetForegroundWindow()!=foreground)cancel();}
    TranslateMessage(&msg);DispatchMessageW(&msg);
  }
  cancel();KillTimer(nullptr,1);UnhookWindowsHookEx(keyboardHook);UnhookWindowsHookEx(mouseHook);UnregisterHotKey(nullptr,1);return 0;
}
