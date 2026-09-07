$html = Get-Content .\index.html -Raw -Encoding UTF8
$css = Get-Content .\style.css -Raw -Encoding UTF8
$js = Get-Content .\app.js -Raw -Encoding UTF8

$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`n$css`n</style>")
$html = $html.Replace('<script src="app.js"></script>', "<script>`n$js`n</script>")

Set-Content -Path .\index_combined.html -Value $html -Encoding UTF8
Write-Output "Successfully built index_combined.html"
