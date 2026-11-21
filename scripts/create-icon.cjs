// Rebuild Windows icons from the artwork supplied by fur6i (generated with Gemini).
const path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..','assets'),input=path.resolve(process.argv[2]||path.join(root,'vela-source.png'));
const script=String.raw`
Add-Type -AssemblyName System.Drawing
$source=[Drawing.Image]::FromFile($env:VELA_ICON_SOURCE)
function Resize-Artwork([int]$size) {
  $bitmap=New-Object Drawing.Bitmap($size,$size)
  $graphics=[Drawing.Graphics]::FromImage($bitmap)
  try { $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $graphics.DrawImage($source,0,0,$size,$size) } finally { $graphics.Dispose() }
  return $bitmap
}
try {
  $original=Join-Path $env:VELA_ICON_ROOT 'vela-source.png'
  if ([IO.Path]::GetFullPath($env:VELA_ICON_SOURCE) -ine $original) {
    $clean=New-Object Drawing.Bitmap($source.Width,$source.Height)
    $graphics=[Drawing.Graphics]::FromImage($clean)
    try { $graphics.DrawImage($source,0,0,$source.Width,$source.Height); $clean.Save($original,[Drawing.Imaging.ImageFormat]::Png) } finally { $graphics.Dispose(); $clean.Dispose() }
  }
  $display=Resize-Artwork 512
  try { $display.Save((Join-Path $env:VELA_ICON_ROOT 'vela.png'),[Drawing.Imaging.ImageFormat]::Png) } finally { $display.Dispose() }
  $frames=@()
  foreach ($size in @(16,24,32,48,64,128,256)) {
    $bitmap=Resize-Artwork $size; $stream=New-Object IO.MemoryStream
    try { $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png); $frames+=,@{Size=$size;Bytes=$stream.ToArray()} } finally { $bitmap.Dispose(); $stream.Dispose() }
  }
  $file=[IO.File]::Create((Join-Path $env:VELA_ICON_ROOT 'vela.ico')); $writer=New-Object IO.BinaryWriter($file)
  try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset=6+16*$frames.Count
    foreach ($frame in $frames) {
      $dimension=if($frame.Size -eq 256){0}else{$frame.Size}
      $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
      $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset)
      $offset+=$frame.Bytes.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
  } finally { $writer.Dispose(); $file.Dispose() }
} finally { $source.Dispose() }
`;
execFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop';"+script,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,VELA_ICON_SOURCE:input,VELA_ICON_ROOT:root},stdio:'inherit'});
console.log('Restored supplied artwork: source PNG, display PNG and seven Windows icon sizes.');
