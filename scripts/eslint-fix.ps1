# Read stdin JSON payload passed by Copilot CLI
$jsonInput = [Console]::In.ReadToEnd()

if ($jsonInput) {
    $payload = $jsonInput | ConvertFrom-Json
    $file = $payload.tool_input.file_path
    if ($file) {
        npx eslint --fix "$file" --quiet 2>&1
        exit $LASTEXITCODE
    }
}