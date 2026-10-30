import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
export function buildNative(desktopRoot){
  if(process.platform!=='win32'){console.log('Windows input helper is built only by the Windows artifact job.');return;}
  const vswhere=resolve(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft Visual Studio/Installer/vswhere.exe');
  const installation=spawnSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true});
  if(installation.status!==0||!installation.stdout.trim())throw new Error('WINDOWS_CPP_TOOLCHAIN_REQUIRED');
  const vcvars=resolve(installation.stdout.trim(),'VC/Auxiliary/Build/vcvars64.bat'),output=resolve(desktopRoot,'dist/native');mkdirSync(output,{recursive:true});
  const source=resolve(desktopRoot,'native/input-helper/main.cpp'),exe=resolve(output,'moyu-input.exe');
  const command=`call "${vcvars}" >nul && cl /nologo /std:c++17 /O2 /MT /EHsc /W4 "${source}" /Fo"${resolve(output,'moyu-input.obj')}" /Fe"${exe}" /link user32.lib /DYNAMICBASE /NXCOMPAT /SUBSYSTEM:CONSOLE`;
  const result=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`"${command}"`],{stdio:'inherit',windowsHide:true,windowsVerbatimArguments:true});
  if(result.status!==0||!existsSync(exe))throw new Error('WINDOWS_INPUT_HELPER_BUILD_FAILED');
  // All cases must reject before registering a hotkey or installing hooks.
  for(const args of [[],['0','3','0','0','0'],['0','3','0','4294967295','0'],['0','3','0','-1','0'],['0','3','0','1','0'],['0','3','0','1x','0'],['0','3','0',String(process.pid),'0'],['0','3','0',String(process.pid),'1']]){
    const check=spawnSync(exe,args,{encoding:'utf8',timeout:3000,windowsHide:true});
    if(check.status!==2)throw new Error('WINDOWS_INPUT_HELPER_OWNER_BOUNDARY_FAILED');
  }
  console.log('Windows input helper rejects missing, invalid and unrelated owners.');
}
