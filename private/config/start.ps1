get-service | foreach-object {if ($_.name.startsWith('TranscriptWorker')) { nssm start $_.name; } }