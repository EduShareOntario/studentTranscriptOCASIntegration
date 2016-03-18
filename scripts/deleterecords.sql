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


/********DELETE RECORDS BY TRACKINGID*******************/
BEGIN

    DELETE FROM svrtnte WHERE svrtnte_bgn02 = :pTrackingId;

    DELETE FROM shttran WHERE shttran_bgn02 = :pTrackingId;
    
    DELETE FROM xml_agency WHERE xml_agency_requesttrackingid = :pTrackingId;
    
    DELETE FROM georgian.xml_transcripts WHERE request_tracking_id = :pTrackingId;

    DELETE FROM svrtreq where svrtreq_bgn02 = :pTrackingId;

END;
