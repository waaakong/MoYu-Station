$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)
$env:STUDYROOM_RELEASE_VERSION='0.2.0-trial.20261017.1'
$env:STUDYROOM_UPDATE_CHANNEL='stable'
$env:STUDYROOM_CLOUD_ORIGIN='https://8.163.29.26'
$env:STUDYROOM_DESKTOP_ORIGIN='https://8.163.29.26'
$env:STUDYROOM_UPDATE_API_BASE_URL='https://8.163.29.26/api'
$env:STUDYROOM_UPDATE_ORIGIN='https://8.163.29.26'
$env:STUDYROOM_UPDATE_CONTROL_ENABLED='0'
$env:STUDYROOM_SIGNING_MODE='disabled'
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
$env:STUDYROOM_EXPERIMENTAL_PROVIDERS='1'
$env:STUDYROOM_PROVIDERS='1'
$env:VITE_FEATURE_MEDIA_ASSETS='1'
$env:VITE_API_BASE_URL='/api'
foreach($provider in @('NETEASE','QQ_MUSIC','KUGOU')) {
  [Environment]::SetEnvironmentVariable("STUDYROOM_PROVIDER_$provider",'1','Process')
  [Environment]::SetEnvironmentVariable("VITE_FEATURE_PROVIDER_$provider",'1','Process')
  foreach($cap in @('SEARCH','PLAYLISTS','FAVORITES','LYRICS','PLAYBACK')) {
    [Environment]::SetEnvironmentVariable("STUDYROOM_PROVIDER_${provider}_$cap",'1','Process')
  }
  [Environment]::SetEnvironmentVariable("STUDYROOM_PROVIDER_${provider}_RECOMMENDATIONS",'0','Process')
}
$env:VITE_FEATURE_PROVIDERS='1'
$env:VITE_FEATURE_PUBLIC_RADIO='1'
npm.cmd run build:desktop-candidate
if($LASTEXITCODE -ne 0){throw 'Desktop build failed'}
Push-Location desktop
try {
  & ../node_modules/.bin/electron-builder.cmd --config electron-builder.config.cjs --win nsis --x64 --publish never
  if($LASTEXITCODE -ne 0){throw 'Packaging failed'}
  node scripts/smoke.mjs --packaged
  if($LASTEXITCODE -ne 0){throw 'Packaged smoke failed'}
} finally {Pop-Location}
npm.cmd run build:web
if($LASTEXITCODE -ne 0){throw 'Web build failed'}
node scripts/check-web-production.mjs frontend/dist
if($LASTEXITCODE -ne 0){throw 'Production web scan failed'}
