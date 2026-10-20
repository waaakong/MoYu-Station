param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9._-]{1,64}$')][string]$KeyId,
  [string]$Directory = (Join-Path $env:LOCALAPPDATA 'MoYuStation/release-signing')
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = [IO.Path]::GetFullPath($Directory)
if ($target -eq $root -or $target.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Private keys must stay outside the repository.' }
if (Test-Path -LiteralPath $target) {
  if ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Signing directory cannot be a reparse point.' }
} else { New-Item -ItemType Directory -Path $target | Out-Null }
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetOwner($owner)
foreach ($sid in @($owner, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $target -AclObject $acl
$env:MOYU_KEY_DIRECTORY = $target
$env:MOYU_KEY_ID = $KeyId
try {
  node -e 'const fs=require("node:fs"),p=require("node:path"),c=require("node:crypto"); const d=process.env.MOYU_KEY_DIRECTORY,id=process.env.MOYU_KEY_ID;const secret=p.join(d,id+".pem"),pub=p.join(d,id+".public.json");if(fs.existsSync(secret)||fs.existsSync(pub))throw Error("Key already exists; never overwrite it");const pair=c.generateKeyPairSync("ed25519");fs.writeFileSync(secret,pair.privateKey.export({format:"pem",type:"pkcs8"}),{flag:"wx",mode:0o600});const json=JSON.stringify({[id]:pair.publicKey.export({format:"der",type:"spki"}).toString("base64")});fs.writeFileSync(pub,json,{flag:"wx",mode:0o600});process.stdout.write(json+"\n");'
  if ($LASTEXITCODE -ne 0) { throw 'Key generation failed; existing files were not overwritten.' }
} finally { Remove-Item Env:MOYU_KEY_DIRECTORY,Env:MOYU_KEY_ID -ErrorAction SilentlyContinue }
