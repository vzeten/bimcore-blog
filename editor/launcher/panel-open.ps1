# Открыть панель экземпляров BIMCORE Editor — работа основного ярлыка владельца.
#
# Чёрных окон здесь нет ни одного: сам ярлык — .vbs, он поднимает этот файл скрытым PowerShell,
# а панель запускается отдельным скрытым процессом. Всё, что человек видит, — окно браузера, а
# при беде обычное окно с сообщением.
#
# Порядок ровно тот же, что у ярлыка редактора: сначала спросить, кто отвечает на порту, и только
# потом что-то делать. Панель называет себя ручкой `/api/panel/whoami`; ответил кто-то другой —
# ничего не открывается, не подменяется и не завершается.

$ErrorActionPreference = 'Stop'

$принятая = 'C:\My_code\bimcore-blog\editor\.coordination\worktrees\accepted-editor'
$кодDir = Join-Path $принятая 'editor'
$панель = Join-Path $кодDir 'panel.mjs'
$node = 'C:\Program Files\nodejs\node.exe'
$порт = 4779
$адрес = "http://localhost:$порт"
$перенос = [Environment]::NewLine

# Сообщение показывается окном, а не строкой консоли: консоли у этого запуска нет вовсе.
function Сказать {
  param([string]$текст)

  Add-Type -AssemblyName PresentationFramework | Out-Null
  [System.Windows.MessageBox]::Show($текст, 'BIMCORE Editor') | Out-Null
}

# Кто на порту: наша панель, посторонняя программа или никого. Молчание и чужой ответ — разные
# случаи: на первый можно поднять панель, на второй нельзя трогать ничего.
function Опрос {
  $ответ = $null
  $живой = $false
  try {
    $ответ = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$адрес/api/panel/whoami"
    $живой = $true
  } catch {
    if ($_.Exception.Response) { $живой = $true }
  }

  if ($ответ) {
    try { $о = $ответ.Content | ConvertFrom-Json } catch { $о = $null }
    if ($о -and $о.panel -eq $true -and [int]$о.port -eq $порт) { return 'панель' }
  }

  if ($живой) { return 'чужой' }
  return 'тихо'
}

$кто = Опрос
if ($кто -eq 'панель') { Start-Process $адрес; exit 0 }

if ($кто -eq 'чужой') {
  Сказать ("На порту $порт отвечает не панель экземпляров, а посторонняя программа.$перенос$перенос" +
    'Ничего не открыто, не запущено и не завершено. Закройте эту программу и запустите ярлык снова.')
  exit 1
}

if (-not (Test-Path -LiteralPath $панель)) {
  Сказать "Панель не найдена в принятой копии редактора.$перенос${перенос}Ожидался файл: $панель"
  exit 1
}

if (-not (Test-Path -LiteralPath $node)) {
  Сказать "Не найден Node.js: $node"
  exit 1
}

# Скрытый отдельный процесс: окна консоли не появляется, а панель живёт дальше сама по себе.
Start-Process -FilePath $node -ArgumentList "`"$панель`"" -WorkingDirectory $кодDir -WindowStyle Hidden

for ($n = 0; $n -lt 40; $n++) {
  Start-Sleep -Milliseconds 700
  if ((Опрос) -eq 'панель') { Start-Process $адрес; exit 0 }
}

Сказать ("Панель не поднялась за отведённое время.$перенос$перенос" +
  "Проверьте, что в папке $кодDir установлены зависимости командой npm install.")
exit 1
