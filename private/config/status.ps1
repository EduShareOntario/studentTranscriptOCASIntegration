get-service | foreach-object {if ($_.name.startsWith('Transcript')) { write-output ($_.name + ', status:'+$_.status); } }