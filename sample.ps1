$ErrorActionPreference = 'Stop'
while ($true) {
    $cpu = $null
    $gpu = @()
    try {
        $cpu = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
    } catch {}
    try {
        $engines = @{}
        foreach ($item in Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine) {
            if ($item.Name -match '^pid_\d+_luid_(.+?)_phys_(\d+)_eng_(\d+)_engtype_(.+)$') {
                $adapter = $Matches[1] + '/' + $Matches[2]
                $key = "$adapter|" + $Matches[3] + '|' + $Matches[4]
                $engines[$key] += [double]$item.UtilizationPercentage
            }
        }
        $gpu = @(foreach ($group in ($engines.Keys | Group-Object { ($_ -split '\|')[0] })) {
            $total = 0
            $decode = 0
            foreach ($key in $group.Group) {
                $value = [Math]::Min(100, $engines[$key])
                $total = [Math]::Max($total, $value)
                if ($key.EndsWith('|VideoDecode')) { $decode = [Math]::Max($decode, $value) }
            }
            @{ id = $group.Name; busy = $total; decode = $decode }
        })
    } catch {}
    @{ time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); cpu = $cpu; gpu = $gpu } | ConvertTo-Json -Compress -Depth 4
    Start-Sleep -Seconds 1
}
