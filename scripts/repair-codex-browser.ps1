param(
  [ValidateRange(10,120)][int]$DelaySeconds=35,
  [Parameter(Mandatory=$true)][int]$CodexAppProcessId,
  [string]$ExpectedAppPath='C:\Program Files\WindowsApps\OpenAI.Codex_26.1002.6548.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe',
  [string]$ExpectedCorePath='C:\Users\ruyal\AppData\Local\OpenAI\Codex\bin\979a96ce184041d1\codex.exe',
  [string]$TaskName='Atencion-Codex-Browser-Repair'
)
$ErrorActionPreference='Stop'
$workspaceDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$reportPath=Join-Path $workspaceDirectory 'logs\codex-browser-repair.json'
$sandboxOutputPath=Join-Path $workspaceDirectory 'logs\codex-browser-sandbox-check.txt'
$appFamily='OpenAI.Codex_2p2nqsd0c76g0'
$expectedRuntimeRoot='C:\Users\ruyal\AppData\Local\OpenAI\Codex\runtimes\cua_node\2c9e75c4e9c71beb\bin\'
$expectedCoreRoot=Split-Path -Parent $ExpectedCorePath
$expectedAppRoot=Split-Path -Parent $ExpectedAppPath
$configPath='C:\Users\ruyal\.codex\config.toml'
$report=[ordered]@{startedAt=[DateTime]::UtcNow.ToString('o');status='waiting';runnerProcessId=$PID;runnerParentProcessId=$null;independentRunner=$false;stopped=@();sandboxExitCode=$null;appReopened=$false;settingsChanged=$false;error=$null;finishedAt=$null;temporaryTaskRemoved=$false}
function Write-RepairReport { $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8 }
function Is-CodexExecutable([string]$ExecutablePath){
  return $ExecutablePath -and ($ExecutablePath.StartsWith($expectedRuntimeRoot,[StringComparison]::OrdinalIgnoreCase) -or $ExecutablePath.StartsWith($expectedAppRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or $ExecutablePath.StartsWith($expectedCoreRoot+'\',[StringComparison]::OrdinalIgnoreCase))
}
$configHashBefore=(Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash
$runner=Get-CimInstance Win32_Process -Filter "ProcessId=$PID"
$report.runnerParentProcessId=$runner.ParentProcessId
$ancestor=$runner
$seenAncestors=[Collections.Generic.HashSet[int]]::new()
while($ancestor -and $seenAncestors.Add([int]$ancestor.ProcessId)){
  if(Is-CodexExecutable $ancestor.ExecutablePath){throw 'El reparador debe ejecutarse desde el Programador de tareas, fuera de Codex.'}
  $ancestor=Get-CimInstance Win32_Process -Filter "ProcessId=$($ancestor.ParentProcessId)"
}
$report.independentRunner=$true
Write-RepairReport
Start-Sleep -Seconds $DelaySeconds
try {
  $app=Get-CimInstance Win32_Process -Filter "ProcessId=$CodexAppProcessId"
  if(!$app -or $app.ExecutablePath -ne $ExpectedAppPath){throw 'La aplicación ya cambió de proceso. Se cancela para no cerrar otra ventana.'}
  $allProcesses=@(Get-CimInstance Win32_Process)
  $ownedIds=[Collections.Generic.HashSet[int]]::new();[void]$ownedIds.Add($CodexAppProcessId)
  do {
    $changed=$false
    foreach($candidate in $allProcesses){
      if($ownedIds.Contains([int]$candidate.ParentProcessId) -and !$ownedIds.Contains([int]$candidate.ProcessId)){
        [void]$ownedIds.Add([int]$candidate.ProcessId);$changed=$true
      }
    }
  }while($changed)
  $ownedProcesses=@($allProcesses | Where-Object {$ownedIds.Contains([int]$_.ProcessId)})
  $report.status='closing-app';Write-RepairReport
  $mainProcess=Get-Process -Id $CodexAppProcessId -ErrorAction SilentlyContinue
  if($mainProcess){[void]$mainProcess.CloseMainWindow();Start-Sleep -Seconds 3}
  $currentMain=Get-CimInstance Win32_Process -Filter "ProcessId=$CodexAppProcessId"
  if($currentMain -and $currentMain.ExecutablePath -eq $ExpectedAppPath){Stop-Process -Id $CodexAppProcessId -Force; $report.stopped+=@{id=$CodexAppProcessId;name='ChatGPT.exe'}}
  foreach($candidate in $ownedProcesses){
    if($candidate.ProcessId -eq $CodexAppProcessId){continue}
    $current=Get-CimInstance Win32_Process -Filter "ProcessId=$($candidate.ProcessId)"
    if($current -and $current.ExecutablePath -eq $candidate.ExecutablePath -and $current.ParentProcessId -eq $candidate.ParentProcessId -and (Is-CodexExecutable $current.ExecutablePath)){
      Stop-Process -Id $current.ProcessId -Force -ErrorAction SilentlyContinue;$report.stopped+=@{id=$current.ProcessId;name=$current.Name}
    }
  }
  Start-Sleep -Seconds 2
  $remaining=@(Get-CimInstance Win32_Process | Where-Object { (Is-CodexExecutable $_.ExecutablePath) -and $_.Name -in @('ChatGPT.exe','codex.exe','node_repl.exe','codex-computer-use-swift.exe') })
  if($remaining.Count -gt 0){throw ('Todavia hay componentes de Codex abiertos: '+(($remaining | ForEach-Object {$_.Name+' ('+$_.ProcessId+')'}) -join ', '))}
  $report.status='checking-sandbox';Write-RepairReport
  & $ExpectedCorePath sandbox --permission-profile ':read-only' --include-managed-config -C $workspaceDirectory -- 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -Command "Write-Output 'ATENCION_SANDBOX_OK'" *> $sandboxOutputPath
  $report.sandboxExitCode=$LASTEXITCODE
  $report.settingsChanged=((Get-FileHash -LiteralPath $configPath -Algorithm SHA256).Hash -ne $configHashBefore)
  $report.status=if($LASTEXITCODE -eq 0){'sandbox-check-passed'}else{'sandbox-check-failed'}
}catch{
  $report.status='repair-incomplete';$report.error=$_.Exception.Message
}finally{
  $report.finishedAt=[DateTime]::UtcNow.ToString('o')
  try { Start-Process -FilePath 'explorer.exe' -ArgumentList ('shell:AppsFolder\'+$appFamily+'!App') -WindowStyle Hidden;$report.appReopened=$true }catch{ $report.error=($report.error+' Reapertura: '+$_.Exception.Message).Trim() }
  try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop;$report.temporaryTaskRemoved=$true }catch{ $report.error=($report.error+' Limpieza: '+$_.Exception.Message).Trim() }
  Write-RepairReport
}
