BEGIN
    DELETE FROM svrtreq WHERE LOWER(svrtreq_data_origin) = 'deletexml';
    COMMIT;

    DELETE FROM svrtnte WHERE LOWER(svrtnte_data_origin) = 'deletexml';
    COMMIT;
    
    DELETE FROM shttran WHERE LOWER(shttran_data_origin) in ('xmltranscripts','deletexml');
    COMMIT;    
	
	DELETE FROM xml_agency;
    COMMIT;
	
	DELETE FROM shreptd
	WHERE LOWER(shreptd_data_origin) = 'update_xmldoc_status';
	COMMIT;
	
	DELETE FROM georgian.xml_transcripts;
	COMMIT;
    
END ;