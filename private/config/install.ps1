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
$nodeProgram='C:\Program Files\nodejs\node.exe'
$nssmPath='C:\apps\nssm-2.24\win64'
$msvs_version=2012

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
$currentConfigFile = "$($currentRoot)\config\settings.js"
$logRoot = "$($rootPath)\logs"
$backupRoot = "$($rootPath)\backup"
$buildApplicationRoot = "$($buildRoot)\$($githubArchiveRootPath)"
$buildConfigFile = "$($buildApplicationRoot)\config\settings.js"

#
# Log Step message
#
function logStepMessage($msg) {
	$breakLine = "=============================================================="
	Write-Output $breakLine
	Write-Output $msg
}

#
# Get the latest from Github
#
function getLatestFromGithub() {
	logStepMessage "Getting latest code from Github at $($githubArchiveUrl)"
    $latestZipFilename = "$($buildRoot)\latest.zip"
    Invoke-WebRequest $githubArchiveUrl -OutFile $latestZipFilename -Verbose
    #todo: if/when powershell 5 is available
    #Expand-Archive $latestZipFilename -Force
    7z x $latestZipFilename -o"$($buildRoot)"
}

#
# Prepare latest build
#
function build() {
	logStepMessage "Cleanup filesystem from previous build"

    # Cleanup filesystem from previous build
    if (Get-Item $buildRoot -ErrorAction Ignore) {
		Write-Output "Removing old build directory $($buildRoot)"
		# Remove-Item : The specified path, file name, or both are too long. The fully qualified file name must be less than 260
        # The following is a hack to avoid the above error when using:
        #   Remove-Item -path $buildRoot -force -recurse -WarningAction "Ignore"
        & 'cmd' /C "rd $($buildRoot) /q /s"
    }
    New-Item $buildRoot -type Directory -Force

    Push-Location $buildRoot
    getLatestFromGithub

    # Build it
    logStepMessage "Installing Node Modules in $($buildApplicationRoot)"
    Set-Location $buildApplicationRoot
	& 'npm' install --msvs_version=$msvs_version
    if ($LastExitCode -ne 0) { throw "install failed" }
    Pop-Location
}

function currentServices() {
    return get-service | where-object {$_.name -like "$($serviceNamePrefix)*"}
}

#
# Disable current runtime
#
function stopServices($services) {
	logStepMessage "Stopping services"
	$services | Format-List | Write-Output

    if ($services) {
#		[System.Collections.ArrayList]$stoppingServices
        $services | foreach {
            Write-Output "Service $($_.name) is $($_.status)"
            if ($_.status -ne "Stopped") {
#				$currentServiceScript = nssm get $_.name AppParameters
#				$currentServiceDirectory = nssm get $_.name AppDirectory
#				$currentScriptFilepath = "$($currentServiceDirectory)\$($currentServiceScript)"
#				$newScript = Get-Item "$($buildApplicationRoot)\$($currentServiceScript)" -ErrorAction Ignore
#				if ($newScript) {
#					if (Compare-Object -ReferenceObject $(Get-Content $currentScriptFilepath) -DifferenceObject $(Get-Content $newScript)) {
	    	            Write-Output "Stopping $($_.name)"
    	    	        Stop-Service $_.name
#						$stoppingServices.add($_)
#					} else {
#						Write-Output "No need to stop $($_.name) because $($currentServiceScript) hasn't changed!!!"
#					}
#				} else {
#					Write-Output "No need to stop $($_.name) because $($currentServiceScript) no longer exists!!!; Hold the phone...."
#					Write-Error "Shouldn't we be removing $($_.name)???"
#					Pause
#				}
            }
        }
#        $stoppingServices | foreach {
        $services | foreach {
            $_.WaitForStatus("Stopped", "00:00:40")
            Write-Output "Service $($_.name) is now $($_.status)"
        }
    }
}

#
# Enable current runtime
#
function startServices($services) {
	logStepMessage "Starting services"
	$services | Format-List

    if ($services) {
        $services | foreach {
            Write-Output "Service $($_.name) is $($_.status)"
            if ($_.status -ne "Running") {
                Write-Output "Starting $($_.name)"
                & 'nssm' start $_.name
            }
        }
        $services | foreach {
            try {$_.WaitForStatus("Running", "00:00:40")}catch{}
            Write-Output "Service $($_.name) is now $($_.status)"
        }
    }
}

function removeServices($services) {
	$continue = Read-Host "Enter 'y' to remove existing services"
	if ($continue -eq 'y') {
	    $services | foreach {
			Write-Output "Removing service $($_.name)"
    	    & 'nssm' remove $_.name confirm
    	}
	}
}

#
# Backup the current version
#
function backup() {
	logStepMessage "Backing up current"
    $backupFilename="$($backupRoot)\backup_$(Get-Date -Format 'yyyymmddThhmmssmsms').zip"
    Write-Output "Archiving $($currentRoot) to $($backupFilename) excluding node_modules"
    & 7z a $backupFilename $currentRoot -x!current\node_modules
}

#
# Activate the latest build and start the application
#
function activateLatestBuild() {
	logStepMessage "Activating latest build"

	stopServices(currentServices)
	
	removeServices(currentServices)

	# Keep the current configuration
	Copy-Item -Path $currentConfigFile -Destination $buildConfigFile -ErrorAction Ignore
	
    # Remove-Item : The specified path, file name, or both are too long. The fully qualified file name must be less than 260
    # The following is a hack to avoid the above error when using:
    #   Remove-Item -path $currentRoot -recurse -force -WarningAction "Ignore"  -ErrorAction "Ignore"
    & 'cmd' /C "rd $($currentRoot) /q /s"


    Move-Item -path $buildApplicationRoot $currentRoot -force

    createNewServices(workerScripts($currentRoot))

	startServices(currentServices)
}

function workerScripts($dir) {
    return Get-Item "$($dir)\*Worker.js"
}

function createNewServices($scripts) {
    logStepMessage "Creating new services for scripts: $($scripts)"
	$serviceAccountUser= Read-Host "Enter the service account user (eg. GCServiceXMLTrans)"
	$serviceAccountPassword = Read-Host "Enter the password for $($serviceAccountUser)"

    $scripts | foreach {
        # Only create the service if needed
        $newServiceName = "$($serviceNamePrefix)$($_.Basename)"
        $newScript = $_.name
        createNodeService $newServiceName $newScript $serviceAccountUser $serviceAccountPassword
    }
}

function createNodeService($name, $script, $account, $password) {
    Write-Output "Creating service $($name), script $($script), account $($account)"

	$existingService = get-service | where-object {$_.name -eq $name}
	if ($existingService) {
		Write-Output "Service already exists! $($existingService.name)"
	} else {
	    # Non-Sucking Service Manager parameters:
	    # Application, AppParameters, AppDirectory, AppExit, AppAffinity, AppEnvironment, AppEnvironmentExtra, AppNoConsole, AppPriority, AppRestartDelay,
	    # AppStdin, AppStdinShareMode, AppStdinCreationDisposition, AppStdinFlagsAndAttributes, AppStdout, AppStdoutShareMode, AppStdoutCreationDisposition,
	    # AppStdoutFlagsAndAttributes, AppStderr, AppStderrShareMode, AppStderrCreationDisposition, AppStderrFlagsAndAttributes, AppStopMethodSkip, AppStopMethodConsole,
	    # AppStopMethodWindow, AppStopMethodThreads, AppThrottle, AppRotateFiles, AppRotateOnline, AppRotateSeconds, AppRotateBytes, AppRotateBytesHigh, DependOnGroup,
	    # DependOnService, Description, DisplayName, ImagePath, ObjectName, Name, Start, Type
	    & 'nssm' install $name $nodeProgram $script
	    if ($lastexitcode -eq 0) {
	        & 'nssm' set $name AppDirectory $currentRoot
	        $logDirectory = "$($logRoot)\$($name)"
			New-Item $logRoot -Type "Directory" -Force
	        New-Item $logDirectory -Type "Directory" -Force
	        $logFilename = "$($logDirectory)\service.log"
	        & 'nssm' set $name AppStderr $logFilename
	        & 'nssm' set $name AppStdout $logFilename
	        & 'nssm' set $name Start SERVICE_AUTO_START
			& 'nssm' set $name ObjectName $account $password
	    }
	}
}

#
# Mainline Install
#

#try {
logStepMessage "Running script: $($thisScriptPath)"
Set-Location $rootPath
Write-Output "Current Path: $(Get-Location)"
build
backup
activateLatestBuild
#}
#catch {
#    Write-Host "Exiting with code 9999"
#    exit 9999
#}

