# ============================================================
# serveur.ps1 – petit serveur web local pour tester l'app sur le PC
# Utilise uniquement ce qui est déjà dans Windows (rien à installer).
# Lancement : double-cliquez sur "lancer-serveur.bat".
# Arrêt : fermez la fenêtre noire (ou Ctrl+C).
# ============================================================

$port = 8080
$racine = [IO.Path]::GetFullPath($PSScriptRoot)

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.md'   = 'text/plain; charset=utf-8'
}

$ecoute = New-Object System.Net.HttpListener
$ecoute.Prefixes.Add("http://localhost:$port/")
try {
  $ecoute.Start()
} catch {
  Write-Host "Impossible de démarrer sur le port $port (déjà utilisé ?)." -ForegroundColor Red
  Read-Host "Appuyez sur Entrée pour fermer"
  exit 1
}

Write-Host ""
Write-Host "  Carnet Taxi tourne sur :  http://localhost:$port/" -ForegroundColor Yellow
Write-Host "  Pour arrêter : fermez cette fenêtre (ou Ctrl+C)."
Write-Host ""

try {
  while ($ecoute.IsListening) {
    $attente = $ecoute.GetContextAsync()
    while (-not $attente.Wait(500)) { }   # boucle courte pour que Ctrl+C fonctionne
    $ctx = $attente.Result
    $reponse = $ctx.Response
    try {
      $chemin = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($chemin -eq '' -or $chemin.EndsWith('/')) { $chemin += 'index.html' }
      $fichier = [IO.Path]::GetFullPath((Join-Path $racine $chemin))

      if ($fichier.StartsWith($racine) -and (Test-Path -LiteralPath $fichier -PathType Leaf)) {
        $octets = [IO.File]::ReadAllBytes($fichier)
        $ext = [IO.Path]::GetExtension($fichier).ToLower()
        $reponse.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $reponse.Headers.Add('Cache-Control', 'no-cache')
        $reponse.ContentLength64 = $octets.Length
        $reponse.OutputStream.Write($octets, 0, $octets.Length)
        Write-Host ("200  /" + $chemin)
      } else {
        $reponse.StatusCode = 404
        Write-Host ("404  /" + $chemin) -ForegroundColor DarkGray
      }
    } catch {
      $reponse.StatusCode = 500
    } finally {
      $reponse.Close()
    }
  }
} finally {
  $ecoute.Stop()
}
