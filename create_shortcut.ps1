$ws = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$startMenu = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"

# Find Edge
$edgePath = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
}

$htmlPath = "file:///C:/Users/maxim/.gemini/antigravity-ide/scratch/padezh-rush/index.html"
$args = "--app=`"$htmlPath`""

# 1. Desktop shortcut
$shortcutDesktop = $ws.CreateShortcut("$desktop\Case Rush.lnk")
$shortcutDesktop.TargetPath = $edgePath
$shortcutDesktop.Arguments = $args
$shortcutDesktop.Description = "Case Rush - Fast Russian Case Drills"
$shortcutDesktop.Save()

# 2. Start Menu shortcut
$shortcutStart = $ws.CreateShortcut("$startMenu\Case Rush.lnk")
$shortcutStart.TargetPath = $edgePath
$shortcutStart.Arguments = $args
$shortcutStart.Description = "Case Rush - Fast Russian Case Drills"
$shortcutStart.Save()

Write-Output "Successfully created shortcuts:"
Write-Output "  - Desktop: $desktop\Case Rush.lnk"
Write-Output "  - Start Menu: $startMenu\Case Rush.lnk"
