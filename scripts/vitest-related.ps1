# Read stdin JSON payload passed by Copilot CLI
$jsonInput = [Console]::In.ReadToEnd()

if ($jsonInput) {
    $file = ($jsonInput | ConvertFrom-Json).tool_input.file_path
    if ($file -and ($file -match '\.(ts|tsx)$')) {
        npx vitest related "$file" --run 2>&1 | Select-Object -First 50
        exit $LASTEXITCODE
    }
}

exit 0
