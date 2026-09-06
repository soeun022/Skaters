$content = Get-Content -Raw -Encoding UTF8 index_combined.html
$start = $content.IndexOf('<script>') + 8
$end = $content.IndexOf('</script>', $start)
$script = $content.Substring($start, $end - $start)
Set-Content -Encoding UTF8 -Path app.js -Value $script.Trim()
