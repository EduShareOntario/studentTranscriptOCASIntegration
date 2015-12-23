# Installs the application based on the latest master repository source.
#
# Install:
# Copy to the project root directory on the target server.
#
# Run:
# Execute as a powershell script.
# eg.
# - From File Exporer -> right click on the filename + Run with Powershell
# - From Powershell window -> . c:\apps\local\studentTranscriptOCASIntegration\install.ps1
#
# Regardless of how it is launched it makes all it's directory references
# relative to it's location!!!
#

# Default to stopping on errors vs. the default of continue!!
# See https://technet.microsoft.com/en-us/library/hh847796.aspx for behavior
$ErrorActionPreference="Stop"

#
# Github/Project Specific Configuration
#
$githubArchiveUrl="https://github.com/EduShareOntario/studentTranscriptOCASIntegration/archive/master.zip"
$githubArchiveRootPath="studentTranscriptOCASIntegration-master"
$serviceNamePrefix = "TranscriptWorker_"

#
# Non-Sucking Service Manager configuration
# See https://nssm.cc/usage
#
$nodeProgram='"C:\Program Files\nodejs\node.exe"'
$nssmPath="C:\apps\nssm-2.24\win64"
if (-Not (Get-Command nssm -ErrorAction "Ignore")) {
    $Env:path += ";" + $nssmPath
    Write-Output "Path is $($Env:path)"
}

#
# Install process configuration
#
$thisScriptPath = $($MyInvocation.MyCommand.Path)
$rootPath = Split-Path $thisScriptPath -parent
$buildRoot = "$($rootPath)\build"
$currentRoot = "$($rootPath)\current"
$backupRoot = "$($rootPath)\backup"
$buildApplicationRoot = "$($buildRoot)\$($githubArchiveRootPath)"

Write-Output "Running script: $($thisScriptPath)"
Set-Location $rootPath
Write-Output "Current Path: $(Get-Location)"

#
# Get the latest from Github
#
function getLatestFromGithub() {
    $latestZipFilename = "latest.zip"
    Invoke-WebRequest $githubArchiveUrl -OutFile $latestZipFilename -Verbose
    #todo: if/when powershell 5 is available
    #Expand-Archive $latestZipFilename -Force
    & '7z' x $latestZipFilename
}

#
# Prepare latest build
#
function build() {
    # Cleanup filesystem from previous build
    if (Get-Item $buildRoot) {
        Write-Output "Removing old build directory $($buildRoot)"
        # Remove-Item : The specified path, file name, or both are too long. The fully qualified file name must be less than 260
        # The following is a hack to avoid the above error when using:
        #   Remove-Item -path $buildRoot -force -recurse -WarningAction "Ignore"
        & 'cmd' /C "rd $($buildRoot) /q /s"
    }
    New-Item $buildRoot -type directory

    Push-Location $buildRoot
    getLatestFromGithub

    # Build it
    Set-Location $buildApplicationRoot
    Write-Output "Installing Node Modules in $($buildApplicationRoot)"
    & 'npm' install
    Pop-Location
}

function currentServices() {
    return get-service | where-object {$_.name -like "$($serviceNamePrefix)*"}
}
#
# Disable current runtime
#
function stopServices($services) {
    if ($services) {
        $services | foreach {
            Write-Output "Service $($_.name) is $($_.status)"
            if ($_.status -ne "Stopped") {
                Write-Output "Stopping $($_.name)"
                Stop-Service $_.name
            }
        }
        $services | foreach {
            $_.WaitForStatus("Stopped", "00:00:40")
            Write-Output "Service $($_.name) is now $($_.status)"
        }
    }
}

function removeServices() {
    currentServices | foreach {
        & 'nssm' remove $_.name confirm
    }
}
#
# Backup the current version
#
function backup() {
    $backupFilename="$($backupRoot)\backup_$(Get-Date -Format 'yyyymmddThhmmssmsms').zip"
    Write-Output "Backing up $($currentRoot) filesystem to $($backupFilename)"
    & 7z a $backupFilename $currentRoot -x!current\node_modules
}

#
# Activate the latest build and start the application
#
function activateLatestBuild() {
    Remove-Item -path current -recurse -force -WarningAction "Ignore"  -ErrorAction "Ignore"
    Move-Item -path $buildApplicationRoot current -force
    # start IIS worker processes
    Start-WebAppPool -Name $webAppPoolName
}

function workerScripts() {
    return Get-Item "*Worker.js"
}

function createNewServices($currentServices) {
    Write-Output "Creating new services: $($currentServices)"
    workerScripts | foreach {
        # Only create the service if needed
        $newServiceName = "$($serviceNamePrefix)$($_.Basename)"
        $newScript = $_.name
        if ($currentServices -and ([Array]::Find($currentServices -as [System.ServiceProcess.ServiceController[]], [Predicate[System.ServiceProcess.ServiceController]]{ $args[0].name -eq $newServiceName }))) {
            Write-Output "Service $($newServiceName) already exists!"
        } else {
            createNodeService $newServiceName $newScript
        }
    }
}

function createNodeService($name, $script) {
    #todo $workingDir = "$($rootPath)\current"
    $workingDir = $rootPath
    Write-Output "creating service $($name), script $($script)"
    # Non-Sucking Service Manager parameters:
    # Application, AppParameters, AppDirectory, AppExit, AppAffinity, AppEnvironment, AppEnvironmentExtra, AppNoConsole, AppPriority, AppRestartDelay,
    # AppStdin, AppStdinShareMode, AppStdinCreationDisposition, AppStdinFlagsAndAttributes, AppStdout, AppStdoutShareMode, AppStdoutCreationDisposition,
    # AppStdoutFlagsAndAttributes, AppStderr, AppStderrShareMode, AppStderrCreationDisposition, AppStderrFlagsAndAttributes, AppStopMethodSkip, AppStopMethodConsole,
    # AppStopMethodWindow, AppStopMethodThreads, AppThrottle, AppRotateFiles, AppRotateOnline, AppRotateSeconds, AppRotateBytes, AppRotateBytesHigh, DependOnGroup,
    # DependOnService, Description, DisplayName, ImagePath, ObjectName, Name, Start, Type
    & 'nssm' install $name $nodeProgram $script
    if ($lastexitcode -eq 0) {
        & 'nssm' set $name AppDirectory $workingDir
        $logDirectory = "$($rootPath)\logs\$($name)"
        New-Item $logDirectory -Type "Directory" -WarningAction "Ignore"
        $logFilename = "$($rootPath)\logs\$($name)\service.log"
        & 'nssm' set $name AppStderr $logFilename
        & 'nssm' set $name AppStdout $logFilename
        & 'nssm' set $name Start SERVICE_AUTO_START
    }
}

#
# Mainline Install
#

#try {
    build
    stopServices(currentServices)
    createNewServices(currentServices)
#    removeServices
#    createNodeService TranscriptWorker_countStudent-Transcript-in-jobs countStudent-Transcript-in-jobs.js
#    createNodeService TranscriptWorker_getTranscriptFromOCASWorker getTranscriptFromOCASWorker.js
#    backup
#    activateLatestBuild
#}
#catch {
#    Write-Host "Exiting with code 9999"
#    exit 9999
#}

