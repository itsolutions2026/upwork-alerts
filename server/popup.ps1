# Shows new Upwork jobs in a window at the top-right of the screen.
# Started by server.js with a JSON file of jobs (newest first).
# Click a job to open it in the browser. Esc or the X button closes the window.
param([Parameter(Mandatory = $true)][string]$JsonFile)

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms

$jobs = ConvertFrom-Json (Get-Content $JsonFile -Raw -Encoding UTF8)
$count = @($jobs).Count

# Non-ASCII characters as codes, because PowerShell 5.1 reads this file as ANSI.
$dot = " $([char]0x00B7) "
$star = [string][char]0x2605
$cross = [string][char]0x2715
$check = [string][char]0x2713

$WIDTH = 560
$GREEN = '#14a800'
$brushes = New-Object Windows.Media.BrushConverter
function Brush($hex) { $brushes.ConvertFromString($hex) }

function New-Text($text, $size = 13, $color = '#001e00', $bold = $false) {
    $t = New-Object Windows.Controls.TextBlock
    $t.Text = $text
    $t.FontSize = $size
    $t.Foreground = Brush $color
    $t.TextWrapping = 'Wrap'
    $t.Margin = '0,2,0,0'
    if ($bold) { $t.FontWeight = 'SemiBold' }
    return $t
}

# ---------- window ----------
$wa = [Windows.SystemParameters]::WorkArea
$win = New-Object Windows.Window
$win.Title = "Upwork: $count new job(s)"
$win.WindowStyle = 'None'
$win.ResizeMode = 'NoResize'
$win.Topmost = $true
$win.Width = $WIDTH
$win.SizeToContent = 'Height'
$win.MaxHeight = $wa.Height - 24
$win.Left = $wa.Right - $WIDTH - 12
$win.Top = $wa.Top + 12
$win.Background = Brush '#ffffff'
$win.BorderBrush = Brush $GREEN
$win.BorderThickness = 2
$win.FontFamily = 'Segoe UI'

$root = New-Object Windows.Controls.DockPanel

# ---------- header (drag to move) ----------
$header = New-Object Windows.Controls.DockPanel
$header.Background = Brush $GREEN
[Windows.Controls.DockPanel]::SetDock($header, 'Top')
$header.Add_MouseLeftButtonDown({ $win.DragMove() })

$close = New-Object Windows.Controls.Button
$close.Content = $cross
$close.FontSize = 14
$close.Foreground = Brush '#ffffff'
$close.Background = Brush $GREEN
$close.BorderThickness = 0
$close.Padding = '14,6'
$close.Cursor = 'Hand'
$close.Add_Click({ $win.Close() })
[Windows.Controls.DockPanel]::SetDock($close, 'Right')
$header.Children.Add($close) | Out-Null

$heading = New-Text "$count new Upwork job$(if ($count -ne 1) { 's' })" 16 '#ffffff' $true
$heading.Margin = '14,8'
$header.Children.Add($heading) | Out-Null
$root.Children.Add($header) | Out-Null

# ---------- job list ----------
$scroll = New-Object Windows.Controls.ScrollViewer
$scroll.VerticalScrollBarVisibility = 'Auto'
$list = New-Object Windows.Controls.StackPanel
$scroll.Content = $list
$root.Children.Add($scroll) | Out-Null

foreach ($j in $jobs) {
    $card = New-Object Windows.Controls.Border
    $card.BorderBrush = Brush '#e4ebe4'
    $card.BorderThickness = '0,0,0,1'
    $card.Padding = '14,10'
    $card.Background = Brush '#ffffff'
    $card.Cursor = 'Hand'
    $card.Tag = $j.url
    $card.Add_MouseEnter({ param($s) $s.Background = Brush '#f2f7f2' })
    $card.Add_MouseLeave({ param($s) $s.Background = Brush '#ffffff' })
    $card.Add_MouseLeftButtonUp({ param($s) if ($s.Tag) { Start-Process $s.Tag } })

    $body = New-Object Windows.Controls.StackPanel

    # Title row: title on the left, small "Copy link" button on the right.
    # The button handles its own click, so it doesn't also open the job.
    $titleRow = New-Object Windows.Controls.DockPanel
    $copy = New-Object Windows.Controls.Button
    $copy.Content = 'Copy link'
    $copy.Tag = $j.url
    $copy.FontSize = 11
    $copy.Padding = '8,2'
    $copy.Margin = '10,2,0,0'
    $copy.VerticalAlignment = 'Top'
    $copy.Cursor = 'Hand'
    $copy.Foreground = Brush $GREEN
    $copy.Background = Brush '#ffffff'
    $copy.BorderBrush = Brush $GREEN
    $copy.Add_Click({
        param($s)
        if (-not $s.Tag) { return }
        # Clipboard tools (e.g. remote desktop sync) can lock the clipboard for a
        # moment. The WinForms call retries by itself (10 tries, 100 ms apart);
        # the WPF one fails on this.
        $ok = $true
        try { [System.Windows.Forms.Clipboard]::SetDataObject([string]$s.Tag, $true, 10, 100) } catch { $ok = $false }
        $s.Content = if ($ok) { "Copied $check" } else { 'Copy failed' }
        $timer = New-Object Windows.Threading.DispatcherTimer
        $timer.Interval = [TimeSpan]::FromSeconds(1.5)
        $timer.Tag = $s
        $timer.Add_Tick({ param($t) $t.Tag.Content = 'Copy link'; $t.Stop() })
        $timer.Start()
    })
    [Windows.Controls.DockPanel]::SetDock($copy, 'Right')
    $titleRow.Children.Add($copy) | Out-Null
    $titleRow.Children.Add((New-Text $j.title 15 $GREEN $true)) | Out-Null
    $body.Children.Add($titleRow) | Out-Null

    $pay = if ($j.budget) { "Fixed: $($j.budget)" } else { $j.type }
    $line1 = @($pay, $j.level, "Proposals: $($j.proposals)") | Where-Object { $_ }
    $body.Children.Add((New-Text ($line1 -join $dot) 13 '#001e00' $true)) | Out-Null

    $verified = if ($j.paymentVerified) { 'Payment verified' } else { 'Payment NOT verified' }
    $rating = if ($j.rating -and $j.rating -ne '0') { "$star $($j.rating)" } else { 'No rating' }
    $spent = if ($j.spent) { "$($j.spent) spent" } else { '' }
    $line2 = @($verified, $spent, $rating, $j.location) | Where-Object { $_ }
    $body.Children.Add((New-Text ($line2 -join $dot) 12 '#3d4a3d')) | Out-Null

    if ($j.posted) { $body.Children.Add((New-Text $j.posted 12 '#5e6d55')) | Out-Null }

    if ($j.description) {
        $desc = New-Text $j.description 12 '#3d4a3d'
        $desc.Margin = '0,6,0,0'
        $desc.MaxHeight = 52   # about 3 lines
        $desc.TextTrimming = 'CharacterEllipsis'
        $body.Children.Add($desc) | Out-Null
    }
    if ($j.skills -and @($j.skills).Count) {
        $body.Children.Add((New-Text (@($j.skills) -join ', ') 12 '#5e6d55')) | Out-Null
    }

    $card.Child = $body
    $list.Children.Add($card) | Out-Null
}

$win.Content = $root
$win.Add_KeyDown({ param($s, $e) if ($e.Key -eq 'Escape') { $win.Close() } })
$win.Add_Loaded({ [System.Media.SystemSounds]::Exclamation.Play() })
$win.ShowDialog() | Out-Null
