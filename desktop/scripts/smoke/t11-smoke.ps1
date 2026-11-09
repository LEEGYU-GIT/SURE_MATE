# Final-review fixes smoke (human timing): hotkey held with OS-like auto-repeat, late modifier release in a box
# that ignores Ctrl+Insert, modifiers held > 0.5 s, two lookups 0.35 s apart.
param([string]$Combo = 'Alt+`')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\smoke-lib.ps1"
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @"
using System.Windows.Forms;
public class NoInsertBox : TextBox {
  protected override bool ProcessCmdKey(ref Message msg, Keys keyData) {
    if (keyData == (Keys.Control | Keys.Insert)) return true;
    return base.ProcessCmdKey(ref msg, keyData);
  }
}
"@
$r = [ordered]@{}
$hk = $Combo.ToLower().Split('+'); $mods = @($hk[0..($hk.Count - 2)] | ForEach-Object { VkOf $_ }); $main = VkOf $hk[-1]
function CountOf([string]$event) { @(NewLogs $event).Count }

[System.Windows.Forms.Clipboard]::SetText('ORIGINAL-CLIP')
$form = New-Object System.Windows.Forms.Form
$form.Text = 'SureMate-Test'; $form.ControlBox = $false; $form.Width = 520; $form.Height = 160; $form.StartPosition = 'CenterScreen'
$tb = New-Object NoInsertBox
$tb.Width = 480; $tb.Left = 10; $tb.Top = 10; $tb.Text = 'Sure-Mate late release ABC'
$form.Controls.Add($tb)
$form.Show(); Pump 300
Key 0x12; [void][W]::SetForegroundWindow($form.Handle); Key 0x12 -Up; $form.Activate(); $tb.Focus(); Pump 300

# 1) palette hotkey held ~1.5 s: first repeat after 500 ms, then every 33 ms (Windows default repeat timing)
$s0 = CountOf 'palette.show'; $h0 = CountOf 'palette.hide'
foreach ($m in $mods) { Key $m }
Key $main; Pump 500
for ($i = 0; $i -lt 30; $i++) { Key $main; Pump 33 }
Key $main -Up; foreach ($m in $mods[($mods.Count - 1)..0]) { Key $m -Up }; Pump 600
$r.hold_show = (CountOf 'palette.show') - $s0
$r.hold_hide = (CountOf 'palette.hide') - $h0
$r.hold_palette_in_front = (IsApp)
if ((IsApp)) { Tap $VK['esc']; Pump 600 }

# 2) lookup with modifiers released 0.3 s late, in a box that ignores Ctrl+Insert (needs the Ctrl+C fallback)
$form.Activate(); $tb.Focus(); $tb.SelectAll(); Pump 200
Key 0x11; Key 0x12; Tap 0x57; Pump 300; Key 0x12 -Up; Key 0x11 -Up; Pump 1500
$r.late_release_capture = NewLogs 'wiki.card' | Select-Object -Last 1
$r.clipboard_after_late = [System.Windows.Forms.Clipboard]::GetText()
if ((IsApp)) { Tap $VK['esc']; Pump 600 }

# 3) modifiers held 1.2 s after the lookup hotkey -> no keys sent, text unchanged
$form.Activate(); $tb.Focus(); $tb.SelectAll(); Pump 200
$before = $tb.Text
Key 0x11; Key 0x12; Tap 0x57; Pump 1200; Key 0x12 -Up; Key 0x11 -Up; Pump 800
$r.held_capture = NewLogs 'wiki.card' | Select-Object -Last 1
$r.textbox_unchanged = ($tb.Text -eq $before)
$r.clipboard_after_held = [System.Windows.Forms.Clipboard]::GetText()
if ((IsApp)) { Tap $VK['esc']; Pump 600 }

# 4) two lookups 0.35 s apart while the first is still running -> second is busy, clipboard ends original
$form.Activate(); $tb.Focus(); $tb.SelectAll(); Pump 200
$c0 = CountOf 'wiki.card'
Key 0x11; Key 0x12; Tap 0x57; Pump 200; Key 0x12 -Up; Key 0x11 -Up; Pump 150
Combo 'Ctrl+Alt+W'; Pump 2000
$r.double_capture = (@(NewLogs 'wiki.card') | Select-Object -Skip $c0) -join ' | '
$r.clipboard_after_double = [System.Windows.Forms.Clipboard]::GetText()
if ((IsApp)) { Tap $VK['esc']; Pump 600 }

$form.Close()
$r.GetEnumerator() | ForEach-Object { "{0} = {1}" -f $_.Key, $_.Value }
