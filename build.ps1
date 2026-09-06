$html = Get-Content .\index.html -Raw -Encoding UTF8
$css = Get-Content .\style.css -Raw -Encoding UTF8
$js = Get-Content .\app.js -Raw -Encoding UTF8

$html = $html -replace '<link rel="stylesheet" href="style.css">', "<style>`n$css`n</style>"
$html = $html -replace '<script src="app.js"></script>', "<script>`n$js`n</script>"

Set-Content -Path .\index_combined.html -Value $html -Encoding UTF8
Write-Output "Successfully built index_combined.html"
