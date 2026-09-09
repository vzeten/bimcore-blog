# Включение нового ярлыка — только когда это уже безопасно.
#
# Безопасно значит: принятая рабочая копия стоит на ветке `editor`, дерево чистое, и её код
# действительно умеет отвечать о себе (`/api/identity`). До переноса операции в `editor` эта
# проверка не проходит, ничего не меняется, и рабочий ярлык владельца сломать нельзя.
#
# Логика живёт в PowerShell, а не в самом .bat: имя ярлыка написано кириллицей, а командный файл
# читается в кодовой странице консоли, и путь там превращается в мусор. Здесь имя вообще не
# набирается — ярлык находится единственным .bat в своей папке.

$ErrorActionPreference = 'Stop'

$принятая = 'C:\My_code\bimcore-blog\editor\.coordination\worktrees\accepted-editor'
$кодDir = Join-Path $принятая 'editor'
$кандидат = Join-Path $кодDir 'launcher\BIMCORE-Editor.bat'
$папкаЯрлыка = Join-Path $env:USERPROFILE 'Documents\BIMCORE Editor'
$git = 'C:\Program Files\Git\cmd\git.exe'

function Стоп($сообщение) {
  Write-Host $сообщение
  Write-Host 'Ничего не изменено.'
  exit 1
}

if (-not (Test-Path -LiteralPath $кандидат)) {
  Стоп "Кандидата ярлыка в принятой копии ещё нет: $кандидат"
}

$ветка = (& $git -C $принятая branch --show-current 2>$null | Select-Object -First 1)
if ($ветка -ne 'editor') { Стоп "Принятая копия стоит на ветке `"$ветка`", а не на `"editor`"." }

if (& $git -C $принятая status --porcelain 2>$null) {
  Стоп "В принятой копии есть несохранённые правки: $принятая"
}

$server = Get-Content -LiteralPath (Join-Path $кодDir 'server.mjs') -Raw
if ($server -notmatch '/api/identity') {
  Стоп 'Принятый код ещё не отвечает о себе: ручки /api/identity нет. Сначала перенесите операцию в editor.'
}

$ярлыки = @(Get-ChildItem -LiteralPath $папкаЯрлыка -Filter '*.bat' -File)
if ($ярлыки.Count -ne 1) {
  Стоп "В папке $папкаЯрлыка должен лежать ровно один .bat, а их $($ярлыки.Count)."
}
$ярлык = $ярлыки[0].FullName

$резерв = "$ярлык.bak"
if (-not (Test-Path -LiteralPath $резерв)) { Copy-Item -LiteralPath $ярлык -Destination $резерв }

# Замена одним движением: сначала полная копия рядом, потом переименование поверх. Оборвись
# копирование на середине — рабочий ярлык остаётся прежним, а не превращается в обрубок.
$временный = "$ярлык.new"
Copy-Item -LiteralPath $кандидат -Destination $временный -Force
Move-Item -LiteralPath $временный -Destination $ярлык -Force

Write-Host 'Готово. Ярлык теперь проверяет, кто отвечает на 4780, и открывает только ваш редактор.'
Write-Host "Прежний ярлык сохранён: $резерв"
