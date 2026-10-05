# Runs only on an ephemeral GitHub Windows runner, never the user's machine.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) { throw 'Use an ephemeral GitHub runner.' }
$version = (Get-Content package.json | ConvertFrom-Json).version
$installDir = Join-Path $env:RUNNER_TEMP 'SolarSimInstalledQA'
$previousDir = Join-Path $env:RUNNER_TEMP 'SolarSimPreviousQA'
New-Item -ItemType Directory -Path $previousDir | Out-Null
gh release download v2.1.5 --repo WilkerDev1/solarsim-pro --pattern SolarSim-Pro-Setup-2.1.5.exe --dir $previousDir
if ($LASTEXITCODE -ne 0) { throw 'Could not download the known previous release.' }
function Install-QACandidate($setup) {
  $process = Start-Process -FilePath $setup -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
  if (-not (Test-Path (Join-Path $installDir 'SolarSim Pro.exe'))) { throw 'Installed executable is missing.' }
}
Install-QACandidate (Join-Path $previousDir 'SolarSim-Pro-Setup-2.1.5.exe')
$asar = Join-Path $installDir 'resources/app.asar'
$oldVersion = node -e "process.stdout.write(JSON.parse(require('@electron/asar').extractFile(process.argv[1],'package.json').toString()).version)" $asar
if ($LASTEXITCODE -ne 0 -or $oldVersion -ne '2.1.5') { throw 'Previous installed version is invalid.' }
Install-QACandidate (Join-Path (Get-Location) "release/SolarSim-Pro-Setup-$version.exe")
$newVersion = node -e "process.stdout.write(JSON.parse(require('@electron/asar').extractFile(process.argv[1],'package.json').toString()).version)" $asar
if ($LASTEXITCODE -ne 0 -or $newVersion -ne $version) { throw 'Upgrade did not install the candidate version.' }
node scripts/qa/runElectronRuntime.mjs $asar
if ($LASTEXITCODE -ne 0) { throw 'Installed ASAR runtime failed.' }
Write-Output 'PASS: NSIS installation of 2.1.5, upgrade to candidate and installed runtime/IPC.'
