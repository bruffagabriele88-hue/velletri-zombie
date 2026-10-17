# Server locale del gioco per Windows. Non serve installare niente: usa PowerShell, gia' presente in Windows.
$porta = 8765
$radice = Split-Path -Parent $MyInvocation.MyCommand.Path
$ascolto = New-Object System.Net.HttpListener
$ascolto.Prefixes.Add("http://localhost:$porta/")
$ascolto.Start()
Write-Host "Velletri Zombie avviato. Lascia aperta questa finestra mentre giochi; chiudila per uscire."
Start-Process "http://localhost:$porta/index.html"
$tipi = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json'; '.wav' = 'audio/wav'; '.css' = 'text/css'; '.txt' = 'text/plain; charset=utf-8' }
while ($ascolto.IsListening) {
  $c = $ascolto.GetContext()
  try {
    $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath).TrimStart('/')
    if ($p -eq '') { $p = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $radice $p))
    if ($file.StartsWith($radice) -and (Test-Path $file -PathType Leaf)) {
      $dati = [IO.File]::ReadAllBytes($file)
      $est = [IO.Path]::GetExtension($file).ToLower()
      if ($tipi.ContainsKey($est)) { $c.Response.ContentType = $tipi[$est] }
      $c.Response.Headers.Add('Cache-Control', 'no-store')
      $c.Response.ContentLength64 = $dati.Length
      $c.Response.OutputStream.Write($dati, 0, $dati.Length)
    } else { $c.Response.StatusCode = 404 }
  } catch { }
  $c.Response.Close()
}
