#
# Use:
# Execute this script with powershell with the current directory set to the location of the install.ps1 script!
#

# Default to stopping on errors vs. the default of continue!!
# See https://technet.microsoft.com/en-us/library/hh847796.aspx for behavior
$ErrorActionPreference="Stop"

#
# Specific Configuration for this install
#
$installScript = "install.ps1"
$latestInstallScript = "current\private\config\install.ps1"

$workingDir = (Get-Location).path
$nonce = $(Get-Date -Format 'yyyymmddThhmmssmsms')
$installLogFilename = "install_$($nonce).log"

# Capture the script output
powershell.exe -noprofile -file $installScript | tee $installLogFilename

if ( $lastexitcode -eq 0 ) {
    # Replace the current install.ps1 script with the latest project version, if it exists.
    $ErrorActionPreference="Continue"
    $jobName="replaceInstallScript_$($nonce)"
    start-job -name $jobName -scriptblock {
        Write-Output "Replacing $($args[1]) with $($args[2])"
        Set-Location $args[0]
        Copy-Item -Path $args[1] -Destination "install_$($args[3]).bak" -Force
        Copy-Item -Path $args[2] -Destination $args[1] -Force
    } -ArgumentList $workingDir,$installScript,$latestInstallScript,$nonce
    wait-job $jobName
    # Log the result of job
    receive-job $jobName | tee -Append $installLogFilename
}
