# PartsCompare - Native Local Web Server (No external dependencies required)
# Uses Windows .NET HttpListener built into PowerShell

$port = 8000
$prefix = "http://localhost:$port/"
$baseDir = $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " PartsCompare - Capstone Prototype Local Web Server" -ForegroundColor Green
Write-Host " Serving directory: $baseDir" -ForegroundColor Yellow
Write-Host " Listening on:      $prefix" -ForegroundColor Yellow
Write-Host " Press Ctrl+C in this window to stop the server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Port $port might be in use. You can also open index.html directly in your browser." -ForegroundColor Red
    Start-Process "$baseDir\index.html"
    exit
}

# Open default browser automatically
Start-Process $prefix

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $urlPath = $request.Url.LocalPath.TrimStart('/')
            if ([string]::IsNullOrEmpty($urlPath) -or $urlPath -eq "/") {
                $urlPath = "index.html"
            }

            $localFilePath = Join-Path $baseDir $urlPath

            if (Test-Path $localFilePath -PathType Leaf) {
                $extension = [System.IO.Path]::GetExtension($localFilePath).ToLower()
                $mimeType = switch ($extension) {
                    ".html" { "text/html; charset=utf-8" }
                    ".htm"  { "text/html; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".json" { "application/json; charset=utf-8" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".svg"  { "image/svg+xml" }
                    default { "application/octet-stream" }
                }

                $bytes = [System.IO.File]::ReadAllBytes($localFilePath)
                $response.ContentType = $mimeType
                $response.ContentLength64 = $bytes.Length
                $response.StatusCode = 200
                if ($request.HttpMethod -ne "HEAD") {
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.StatusCode = 404
                $response.ContentType = "text/plain"
                $response.ContentLength64 = $notFoundBytes.Length
                if ($request.HttpMethod -ne "HEAD") {
                    $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
                }
            }
        } catch {
            Write-Host "Request error: $_" -ForegroundColor DarkGray
        } finally {
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
