param(
  [Parameter(Mandatory = $true)][ValidateSet("stable", "beta", "provider-experimental")][string]$Channel,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
  [Parameter(Mandatory = $true)][string]$KeyId,
  [string]$GithubRepository,
  [string]$Server = "root@moyustation.xyz",
  [ValidateSet('trusted', 'manifest-signed')][string]$TrustMode = 'trusted',
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
if ($Version -notmatch '^\d+\.\d+\.\d+(?:-(?:trial\.\d{8}|beta|exp)\.[1-9]\d*)?$') { throw "版本格式无效。" }
function Invoke-Checked([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "发布命令失败，已停止；未执行后续操作。" }
}
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $workspaceRoot
try {
  if (git status --porcelain) { throw "工作树不干净，拒绝生成不可变发布。" }
  $env:STUDYROOM_UPDATE_CHANNEL = $Channel
  $env:STUDYROOM_RELEASE_VERSION = $Version
  $env:STUDYROOM_UPDATE_CONTROL_ENABLED = "1"
  $env:STUDYROOM_SIGNING_MODE = $TrustMode
  $keyFile = (Resolve-Path -LiteralPath $PrivateKeyPath).Path
  if ($keyFile.StartsWith($workspaceRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Manifest private key must remain outside the repository.' }
  Invoke-Checked { node -e "require('./desktop/scripts/update-signing-config.cjs').updateSigningConfig()" }
  Invoke-Checked { npm run check:secrets }
  Invoke-Checked { npm run check:assets }
  Invoke-Checked { npm run typecheck }
  Invoke-Checked { npm test }
  if ($Channel -eq "provider-experimental") { $env:STUDYROOM_EXPERIMENTAL_PROVIDERS = "1" }
  Invoke-Checked { npm run build:desktop-candidate }
  Invoke-Checked { npm run package --workspace study-room-desktop }

  $releaseDir = Join-Path $workspaceRoot "desktop/release/$Channel"
  $installer = Get-ChildItem -LiteralPath $releaseDir -Filter "*.exe" -File
  if ($installer.Count -ne 1) { throw "必须且只能生成一个 NSIS 安装包。" }
  $signature = Get-AuthenticodeSignature -LiteralPath $installer[0].FullName
  if ($TrustMode -eq 'trusted') {
    if (-not $signature.SignerCertificate -or $signature.Status -ne 'Valid' -or !$signature.TimeStamperCertificate -or
        $signature.SignerCertificate.Thumbprint -ne $env:STUDYROOM_SIGNING_CERT_SHA1) { throw "安装包签名门禁失败：$($signature.Status)" }
  } elseif ($signature.Status -ne 'NotSigned' -or $signature.SignerCertificate) {
    throw 'manifest-signed mode requires an explicitly unsigned installer, not an invalid or unexpected publisher signature.'
  }

  $sha256 = (Get-FileHash -LiteralPath $installer[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$sha256 *$($installer[0].Name)" | Set-Content -LiteralPath (Join-Path $releaseDir "installer.sha256") -Encoding ascii
  Write-Host "Git: $(git rev-parse HEAD)"
  Write-Host "SHA-256: $sha256"

  $sourceArgs = @()
  if ($GithubRepository) { $sourceArgs = @('--github-repository', $GithubRepository) }
  Invoke-Checked { node scripts/create-update-release.mjs --channel $Channel --version $Version --directory $releaseDir --private-key $PrivateKeyPath --key-id $KeyId @sourceArgs }
  Invoke-Checked { node scripts/verify-update-release.mjs --directory $releaseDir --public-keys-json $env:STUDYROOM_UPDATE_PUBLIC_KEYS_JSON }
  if ($DryRun) { Write-Host "DryRun 完成：未连接服务器，制品位于 $releaseDir"; exit 0 }

  $incoming = "/srv/studyroom-updates/incoming/$Channel-$Version"
  $manifest = Get-Content -LiteralPath (Join-Path $releaseDir 'release.json') -Raw | ConvertFrom-Json
  # Upload only verified release entries, never the whole build directory or a nearby signing key.
  $publishFiles = @($manifest.files | ForEach-Object { Join-Path $releaseDir $_.name }) + @(
    (Join-Path $releaseDir 'release.json'), (Join-Path $releaseDir 'release.json.sig'), (Join-Path $releaseDir 'installer.sha256'))
  Invoke-Checked { ssh $Server "install -d -m 0700 '$incoming'" }
  Invoke-Checked { scp @publishFiles "${Server}:$incoming/" }
  Invoke-Checked { ssh $Server "sudo /usr/local/sbin/studyroom-import-update '$Channel' '$Version' '$incoming'" }
} finally {
  Pop-Location
}
