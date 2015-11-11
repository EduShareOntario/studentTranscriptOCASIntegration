process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var config = require('app-config');
var oracledb = require('oracledb');
var xml2js = require('xml2js');

console.log('Start Her Up');
var authToken;




function matchStudentInfo(transcriptRequest) {
    console.log(transcriptRequest.TransmissionData.RequestTrackingID);
    var birthDate = new Date(transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate);
    oracledb.getConnection(
        {
            user          : "georgian",
            password      : "BANNER8",
            connectString : "testrac01-vip.admin.georgianc.on.ca/GSB4"
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            
            connection.execute(
            "BEGIN georgian.svptreq_pkg.match_student_info(:p_svrtreq_bgn02, :p_svrtreq_birth_date,:p_svrtreq_sex,:p_svrtreq_ssn,:p_svrtreq_last_name,:p_svrtreq_first_name,:p_svrtreq_state_ind,:p_svrtreq_match_ind,:p_spriden_pidm,:p_svrtreq_id ); END;",
            {
                // bind variables                   
                p_svrtreq_bgn02: transcriptRequest.TransmissionData.RequestTrackingID,
                p_svrtreq_birth_date: birthDate,
                p_svrtreq_sex: transcriptRequest.Request.RequestedStudent.Person.Gender.GenderCode,
                p_svrtreq_ssn: transcriptRequest.Request.RequestedStudent.SSN,
                p_svrtreq_last_name: transcriptRequest.Request.RequestedStudent.Person.Name.LastName,
                p_svrtreq_first_name: transcriptRequest.Request.RequestedStudent.Person.Name.FirstName,	
                p_svrtreq_state_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                p_svrtreq_match_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                p_spriden_pidm: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
                p_svrtreq_id : { dir: oracledb.BIND_OUT, type: oracledb.STRING }
            },	
            function (err, result) {
                if (err) {
                    console.error(err.message);
                    return;
                    }
                    var actionCode = "";
                    var holdType = "";
                    if (transcriptRequest.Request.Recipient.constructor === Array) {
                        holdType = transcriptRequest.Request.Recipient[0].TranscriptHold.HoldType;
                    } else {
                        holdType = transcriptRequest.Request.Recipient.TranscriptHold.HoldType; 
                    }
                    switch (holdType) {
                        case "Now":
                            actionCode = "R2";
                            break;
                        case "AfterSpecifiedTerm":
                            actionCode = "R2";
                            break;
                        default :
                            actionCode = "??";
                            break;                   
                    }
                   
                    var holdData = { pidm: 263234, stateInd: "", holdInd: "" };
                    checkForHolds(holdData);
                //check for any holds
                    if (result.outBinds.p_spriden_pidm != null) {
                        phold = checkForHolds(holdData);
                    }
                //write out the record
                console.log('do we have a match ' + result.outBinds.p_svrtreq_match_ind);
                console.log('state ' + result.outBinds.p_svrtreq_state_ind);
                writeSvtrReq(transcriptRequest, result.outBinds.p_svrtreq_match_ind, result.outBinds.p_svrtreq_state_ind, birthDate,actionCode);
            });      
         });   
}

function writeSvtrReq(transcriptRequest,matchIndicator, stateIndicator, birthDate,actionCode) {
    oracledb.getConnection(
        {
            user          : "georgian",
            password      : "BANNER8",
            connectString : "testrac01-vip.admin.georgianc.on.ca/GSB4"
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            var genderCode = transcriptRequest.Request.RequestedStudent.Person.Gender.GenderCode.substring(0, 1);
            var exitDate = new Date(transcriptRequest.Request.RequestedStudent.Attendance.ExitDate);
            connection.execute(
                "insert into saturn.svrtreq (svrtreq_bgn02,svrtreq_trans_date,svrtreq_purpose_cde, svrtreq_action_cde, svrtreq_state_ind, svrtreq_completion_ind, svrtreq_data_origin, svrtreq_user_id,svrtreq_activity_date,svrtreq_birth_date,svrtreq_gender,svrtreq_exit_date,svrtreq_surname,svrtreq_firstname,svrtreq_prefix) values (:svrtreq_bgn02,:svrtreq_trans_date,:svrtreq_purpose_cde, :svrtreq_action_cde, :svrtreq_state_ind, :svrtreq_completion_ind, :svrtreq_data_origin, :svrtreq_user_id,:svrtreq_activity_date, :svrtreq_birth_date, :svrtreq_gender,:svrtreq_exit_date,:svrtreq_surname,:svrtreq_firstname,:svrtreq_prefix)",
		        [transcriptRequest.TransmissionData.RequestTrackingID, new Date(transcriptRequest.Request.CreatedDateTime), '13', actionCode, stateIndicator, '~', 'deletexml', 'mwestbrooke', new Date(), birthDate, genderCode, exitDate, transcriptRequest.Request.RequestedStudent.Person.Name.LastName, transcriptRequest.Request.RequestedStudent.Person.Name.FirstName, transcriptRequest.Request.RequestedStudent.Person.Name.NamePrefix],
		        { autoCommit: true },   
                function (err, result) {
                if (err) {
                    console.error(err.message);
                    return;
                    }
                    if (transcriptRequest.Request.Recipient.constructor === Array) {
                        var numEntries = transcriptRequest.Request.Recipient.length - 1;
                        for (var index = 0; index <= numEntries; ++index) {
                            writeSvrtnte(transcriptRequest.TransmissionData.RequestTrackingID, transcriptRequest.Request.Recipient[index].Receiver.RequestorReceiverOrganization.CSIS, transcriptRequest.Request.Recipient[index].Receiver.RequestorReceiverOrganization.OrganizationName);
                        }
                    } else {
                        writeSvrtnte(transcriptRequest.TransmissionData.RequestTrackingID, transcriptRequest.Request.Recipient.Receiver.RequestorReceiverOrganization.CSIS, transcriptRequest.Request.Recipient.Receiver.RequestorReceiverOrganization.OrganizationName);
                    }
                });             
        });         
}


function writeSvrtnte(trackingId, csis, organizationName) {
    oracledb.getConnection(
        {
            user          : "georgian",
            password      : "BANNER8",
            connectString : "testrac01-vip.admin.georgianc.on.ca/GSB4"
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            //inst=352011/Ryerson University  
            var noteMessage = "inst=" + csis + "/" + organizationName;
            connection.execute(
                "insert into saturn.svrtnte (svrtnte_bgn02,svrtnte_note,svrtnte_data_origin, svrtnte_user_id, svrtnte_activity_date) values (:svrtnte_bgn02,:svrtnte_note,:svrtnte_data_origin, :svrtnte_user_id, :svrtnte_activity_date)",
		        [trackingId, noteMessage, 'deletexml', 'mwestbrooke', new Date()],
		        { autoCommit: true },   
                function (err, result) {
                    if (err) {
                        console.error(err.message);
                        //  doRelease(connection);
                        return;
                    }
                });
        });   
}

function checkForHolds(holdData) {
    oracledb.getConnection(
        {
            user          : "georgian",
            password      : "BANNER8",
            connectString : "testrac01-vip.admin.georgianc.on.ca/GSB4"
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            
            connection.execute(
                "BEGIN georgian.svptreq_pkg.check_for_holds(:p_spriden_pidm, :p_svrtreq_state_ind,:p_svrtreq_match_ind ); END;",
            {
                    // bind variables                   
                    p_spriden_pidm: holdData.pidm,                  
                    p_svrtreq_state_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                    p_svrtreq_match_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING }                  
                },	
            function (err, result) {
                    if (err) {
                        console.error(err.message);
                        //doRelease(connection);
                        return;
                    }
                    
                    
                    console.log('do we have a match ' + result.outBinds.p_svrtreq_match_ind);
                    console.log('state ' + result.outBinds.p_svrtreq_state_ind);
                });
        });      
}


function doRelease(connection) {
    connection.release(
        function (err) {
            if (err) {
                console.error(err.message);
            }
        });
}

//start processing
checkForTranscriptRequests();


function checkForTranscriptRequests() {
    request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var tokenInfo = JSON.parse(body);
            authToken = tokenInfo.token_type + " " + tokenInfo.access_token;
            
            var options = {
                url: config.settings.requestsNoResponseUrl,
                headers: {
                    'Authorization': authToken
                }
            };
            
            function getTranscriptDetails(error, response, body) {
                if (!error && response.statusCode == 200) {
                    var requestDetails = JSON.parse(body);
                    var parser = new xml2js.Parser({
                        attrkey:  '@',
                        xmlns:  false,  
                        ignoreAttrs: true,
                        explicitArray: false,
                        tagNameProcessors: [xml2js.processors.stripPrefix]  
                    });
                    parser.parseString(requestDetails.PESCXml, 
                        function (err, result) {
                            matchStudentInfo
                            (                               
                                result.TranscriptRequest
                        );
                    });
                    
                    console.log("write the transcript request details to the worker queue");                    
                }
            }
            
            function getTranscriptRequests(error, response, body) {
                if (!error && response.statusCode == 200) {
                    var info = JSON.parse(body);
                    for (var i = 0; i < info.length; i++) {
                        console.log(info[i].RequestID);
                        
                        //get the details
                        var options2 = {
                            url: config.settings.transcriptRequestUrl + info[i].RequestID,
                            headers: {
                                'Authorization': authToken
                            }
                        };
                        request(options2, getTranscriptDetails);
                    }
                }
            }
            
            request(options, getTranscriptRequests);
        } else {
            console.log("Got an error: ", error, ", status code: ", response.statusCode);
        }
    });
}


