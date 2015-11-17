process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var config = require('app-config');
var Fiber = require('fibers');
var Future = require('fibers/future');
var fs = Future.wrap(require('fs'));
var oracledb = require('oracledb');
var xml2js = require('xml2js');


console.log('Start Her Up');
var authToken;
var oracleConnection;

var processTranscript = function(transcriptRequest) {
    Fiber(function() {
        console.log(transcriptRequest.TransmissionData.RequestTrackingID + '\t' + transcriptRequest.Request.RequestedStudent.Person.SchoolAssignedPersonID + '\t' + transcriptRequest.Request.RequestedStudent.Person.AgencyAssignedID + '\t' + transcriptRequest.Request.RequestedStudent.Person.Name.LastName + '\t' + transcriptRequest.Request.RequestedStudent.Person.Name.FirstName)
        var matchInfo = matchStudentInfo(transcriptRequest).wait();
        var actionCode = "";
        var holdType = "";
        var completionInd = "~";
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
                actionCode = "R3";
                break;
            default :
                actionCode = "??";
                break;
        }
        
        //if we have a pidm -  check for holds
        var holdData = null;
        var holdInd = null;
        if (matchInfo.pidm != null) {
            holdData = checkForHolds(matchInfo.pidm).wait();
            holdInd = holdData.holdInd;
        }
        
        
        var dateInfo = calculateSendDate(actionCode, transcriptRequest.TransmissionData.RequestTrackingID).wait();
        var t1 = transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.replace("-", "/");
        var t2 = new Date(Date.parse(t1));
        //writeRequest(transcriptRequest, 
        //    matchInfo.matchInd, 
        //    dateInfo.stateInd, 
        //    t2, 
        //    actionCode, 
        //    completionInd,
        //    dateInfo.sendDate
        //).wait();
        
        //writeRequestNotes(transcriptRequest.TransmissionData.RequestTrackingID, transcriptRequest.Request.Recipient).wait();
        //var completionInd = null;
        //if (dateInfo.message == null) {
        //    if (dateInfo.stateInd == "C" && dateInfo.sendDate != null  && dateInfo.sendDate <= new Date()) {
        //        writeTranscript(matchInfo.pidm, matchInfo.studentId, transcriptRequest.TransmissionData.RequestTrackingID).wait();           
        //        completionInd = "130";
        //    }
        
        //    todo need to get some of the parameters, reason code
        //    updateSvrtreq(transcriptRequest.TransmissionData.RequestTrackingID,dateInfo.sendDate,dateInfo.stateInd,matchInfo.matchInd, holdInd,dateInfo.dateInd,completionInd,matchInfo.studentId,null, dateInfo.reasonCode).wait();
        //}
        
        console.log('what are the values');
    }).run();
}


var connectToDb = function connectToDb() {
    oracledb.getConnection(
        {
            user          : config.settings.oracleUserId,
            password      : config.settings.oraclePassword,
            connectString : config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            console.log('1: we are connected');
            return connection;
        });

}.future();


/**
 * /
 * @param {} transcriptRequest 
 * @returns {} 
 */
var matchStudentInfo = function matchStudentInfo(transcriptRequest) {
    var future = new Future();
    console.log(transcriptRequest.TransmissionData.RequestTrackingID);
    var birthDate = new Date(transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate);
    var birthDate1 = new Date(transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.substring(0, 4), transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.substring(5, 7), transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.substring(8, 10));
    var t1 = transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.replace("-", "/");
    var t2 = new Date(Date.parse(t1));
   // console.log(t2);
    oracledb.getConnection(
        {
            user          : config.settings.oracleUserId,
            password      : config.settings.oraclePassword,
            connectString : config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            
            connection.execute(
                "BEGIN georgian.svptreq_pkg.matchStudentInfo(:p_svrtreq_bgn02, :p_svrtreq_birth_date,:p_svrtreq_sex,:p_studentId,:p_svrtreq_last_name,:p_svrtreq_first_name,:p_svrtreq_state_ind,:p_svrtreq_match_ind,:p_spriden_pidm,:p_svrtreq_id ); END;",
            {
                    // bind variables                   
                    p_svrtreq_bgn02: transcriptRequest.TransmissionData.RequestTrackingID,
                    p_svrtreq_birth_date:t2,
                    p_svrtreq_sex: transcriptRequest.Request.RequestedStudent.Person.Gender.GenderCode.substring(0,1),
                    p_studentId : transcriptRequest.Request.RequestedStudent.Person.SchoolAssignedPersonID,
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
                    var matchInfo = {};
                    matchInfo.stateInd = result.outBinds.p_svrtreq_state_ind;
                    matchInfo.matchInd = result.outBinds.p_svrtreq_match_ind;
                    matchInfo.pidm = result.outBinds.p_spriden_pidm;
                    matchInfo.studentId = result.outBinds.p_svrtreq_id;
                    console.log('do we have a match ' + result.outBinds.p_svrtreq_match_ind);
                    console.log('state ' + result.outBinds.p_svrtreq_state_ind);
                    future.return(matchInfo);
                });
        });
    return future;
};


/**
 * 
 * @param {} actionCode 
 * @param {} trackingId 
 * @returns {} 
 */
var calculateSendDate = function calculateSendDate(actionCode, trackingId) {
    var future = new Future();
    oracledb.getConnection(
        {
            user          : config.settings.oracleUserId,
            password      : config.settings.oraclePassword,
            connectString : config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            
            connection.execute(
                "BEGIN georgian.svptreq_pkg.determine_send_date(:p_svrtreq_action_cde, :p_svrtreq_bgn02,:p_svrtreq_send_date, :p_svrtreq_state_ind, :p_svrtreq_date_ind, :p_svrtreq_reason_cde,:p_error_message); END;",
            {
                    // bind variables                   
                    p_svrtreq_action_cde: actionCode,  
                    p_svrtreq_bgn02: trackingId,                  
                    p_svrtreq_send_date: { dir: oracledb.BIND_OUT, type: oracledb.DATE },
                    p_svrtreq_state_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                    p_svrtreq_date_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                    p_svrtreq_reason_cde: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                    p_error_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING }

                },	
            function (err, result) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                    var dateData = {};                   
                    dateData.sendDate = result.outBinds.p_svrtreq_send_date;
                    dateData.stateInd = result.outBinds.p_svrtreq_state_ind;
                    dateData.dateInd = result.outBinds.p_svrtreq_date_ind;
                    dateData.reasonCode = result.outBinds.p_svrtreq_reason_cde;
                    dateData.message = result.outBinds.p_error_message;

                    future.return(dateData);
                });
        });
    return future;
}

/**
 * 
 * @param {} pPidm 
 * @returns {} 
 */
var checkForHolds = function checkForHolds(pPidm) {
    var future = new Future();
    oracledb.getConnection(
        {
            user          : config.settings.oracleUserId,
            password      : config.settings.oraclePassword,
            connectString : config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }          
            connection.execute(
                "BEGIN georgian.svptreq_pkg.check_for_holds(:p_spriden_pidm, :p_svrtreq_state_ind,:p_svrtreq_hold_ind ); END;",
            {
                    // bind variables                   
                    p_spriden_pidm: pPidm,                  
                    p_svrtreq_state_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
                    p_svrtreq_hold_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING }
                },	
            function (err, result) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                    var holdData = {};
                    holdData.stateInd = result.outBinds.p_svrtreq_state_ind;
                    holdData.holdInd = result.outBinds.p_svrtreq_hold_ind;
                    future.return(holdData);
                });
        });
    return future;
}

/**
 * 
 * @param {} transcriptRequest 
 * @param {} matchIndicator 
 * @param {} stateIndicator 
 * @param {} birthDate 
 * @param {} actionCode 
 * @param {} sendDate 
 * @returns {} 
 */
var writeRequest = function writeRequest(transcriptRequest, matchIndicator, stateIndicator, birthDate, actionCode, completionInd,sendDate) {
    var future = new Future();
    oracledb.getConnection(
        {
            user          : config.settings.oracleUserId,
            password      : config.settings.oraclePassword,
            connectString : config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            var genderCode = transcriptRequest.Request.RequestedStudent.Person.Gender.GenderCode.substring(0, 1);
            
            var exitDate = null;
            if (transcriptRequest.Request.RequestedStudent.Attendance.ExitDate != undefined) {
                var t1 = transcriptRequest.Request.RequestedStudent.Attendance.ExitDate.replace("-", "/");
                var t2 = new Date(Date.parse(t1));
                exitDate = t2;
            }
                       
            connection.execute(
                "insert into saturn.svrtreq (svrtreq_bgn02,svrtreq_trans_date,svrtreq_purpose_cde, svrtreq_action_cde, svrtreq_state_ind, svrtreq_completion_ind, svrtreq_data_origin, svrtreq_user_id,svrtreq_activity_date,svrtreq_birth_date,svrtreq_gender,svrtreq_exit_date,svrtreq_surname,svrtreq_firstname,svrtreq_prefix,svrtreq_ocas_appnum,svrtreq_student_no_1,svrtreq_send_date) values (:svrtreq_bgn02,:svrtreq_trans_date,:svrtreq_purpose_cde, :svrtreq_action_cde, :svrtreq_state_ind, :svrtreq_completion_ind, :svrtreq_data_origin, :svrtreq_user_id,:svrtreq_activity_date, :svrtreq_birth_date, :svrtreq_gender,:svrtreq_exit_date,:svrtreq_surname,:svrtreq_firstname,:svrtreq_prefix, :svrtreq_ocas_appnum,:svrtreq_student_no_1,:svrtreq_send_date)",
                [transcriptRequest.TransmissionData.RequestTrackingID, new Date(Date.parse(transcriptRequest.Request.CreatedDateTime)), '13', actionCode, stateIndicator, completionInd, 'deletexml', 'mwestbrooke', new Date(), birthDate, genderCode, exitDate, transcriptRequest.Request.RequestedStudent.Person.Name.LastName, transcriptRequest.Request.RequestedStudent.Person.Name.FirstName, transcriptRequest.Request.RequestedStudent.Person.Name.NamePrefix, transcriptRequest.Request.RequestedStudent.Person.AgencyAssignedID, transcriptRequest.Request.RequestedStudent.Person.SchoolAssignedPersonID, sendDate],
		        { autoCommit: true },   
                function (err, result) {
                    if (err) {
                        console.error(err.message + ' ' + transcriptRequest.TransmissionData.RequestTrackingID);
                        return;
                    }
                    future.return();
                });
        });
    return future;
}

/**
 * 
 * @param {} trackingId 
 * @param {} recipient 
 * @returns {} 
 */
var writeRequestNotes = function writeRequestNotes(trackingId,recipient) {
    var future = new Future();
    var noteMessage = "";
    oracledb.getConnection(
        {
            user          : config.settings.oracleUserId,
            password      : config.settings.oraclePassword,
            connectString : config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            console.log("we are firing");
            if (recipient.constructor === Array) {
                var numEntries = recipient.length - 1;
                for (var index = 0; index <= numEntries; ++index) {
                    noteMessage = "inst=" + recipient[index].Receiver.RequestorReceiverOrganization.CSIS + "/" + recipient[index].Receiver.RequestorReceiverOrganization.OrganizationName;
                    connection.execute(
                        "insert into saturn.svrtnte (svrtnte_bgn02,svrtnte_note,svrtnte_data_origin, svrtnte_user_id, svrtnte_activity_date) values (:svrtnte_bgn02,:svrtnte_note,:svrtnte_data_origin, :svrtnte_user_id, :svrtnte_activity_date)",
                        [trackingId, noteMessage, 'deletexml', 'mwestbrooke', new Date()],
                        { autoCommit: true },
                        function(err, result) {
                            if (err) {
                                console.error(err.message);
                                return;
                            }                          
                        });
                }
            } else {
                noteMessage = "inst=" + recipient.Receiver.RequestorReceiverOrganization.CSIS + "/" + recipient.Receiver.RequestorReceiverOrganization.OrganizationName;
                connection.execute(
                    "insert into saturn.svrtnte (svrtnte_bgn02,svrtnte_note,svrtnte_data_origin, svrtnte_user_id, svrtnte_activity_date) values (:svrtnte_bgn02,:svrtnte_note,:svrtnte_data_origin, :svrtnte_user_id, :svrtnte_activity_date)",
                        [trackingId, noteMessage, 'deletexml', 'mwestbrooke', new Date()],
                        { autoCommit: true },
                        function (err, result) {
                        if (err) {
                            console.error(err.message);
                            return;
                        }
                          
                        });                
            }
            future.return();                      
        });
    return future;
}



var writeTranscript = function writeTranscript(pPidm, pStudentId, pTrackingId) {
    var future = new Future();
    oracledb.getConnection(
        {
            user          : config.settings.oracleUserId,
            password      : config.settings.oraclePassword,
            connectString : config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            
            connection.execute(
                "BEGIN georgian.insert_shttran_record(:p_spriden_pidm, :p_spriden_id,:p_svrtreq_bgn02,:p_shttran_seq_no); END;",
            {
                    // bind variables                   
                    p_spriden_pidm: pPidm,
                    p_spriden_id: pStudentId,
                    p_svrtreq_bgn02: pTrackingId,
                    p_shttran_seq_no: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
                },	                       
                function (err, result) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                    var returnData = {};
                    returnData.sendDate = result.outBinds.p_shttran_seq_no;
                    future.return(returnData);
                });
        });
    return future;
}

/**
 * 
 * @param {} pPidm 
 * @param {} pStudentId 
 * @param {} pTrackingId 
 * @returns {} 
 */
var updateSvrtreq = function updateSvrtreq(pTrackingId,pSendDate,pStateInd,pMatchInd,pHoldInd,pDateInd,pCompletionInd,pStudentId,pSeqNo,pReasonCode) {
    var future = new Future();
    oracledb.getConnection(
        {
            user          : config.settings.oracleUserId,
            password      : config.settings.oraclePassword,
            connectString : config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            
            connection.execute(
                "BEGIN georgian.update_svrtreq_record(:p_svrtreq_bgn02, :p_svrtreq_send_date,:p_svrtreq_state_ind,:p_svrtreq_match_ind,:p_svrtreq_hold_ind,:p_svrtreq_date_ind,:p_svrtreq_completion_ind,:p_svrtreq_id,:p_svrtreq_seq_no,:p_svrtreq_reason_cde); END;",
            {
                    // bind variables                   
                    p_svrtreq_bgn02: pTrackingId,
                    p_svrtreq_send_date: pSendDate,
                    p_svrtreq_state_ind: pStateInd,
                    p_svrtreq_match_ind: pMatchInd,
                    p_svrtreq_hold_ind: pHoldInd,
                    p_svrtreq_date_ind: pDateInd,
                    p_svrtreq_completion_ind: pCompletionInd,
                    p_svrtreq_id: pStudentId,
                    p_svrtreq_seq_no: pSeqNo,
                    p_svrtreq_reason_cde: pReasonCode
                },	                       
                function (err, result) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                });
        });
    return future;
}

//start processing
var oracleConnection = connectToDb();
checkForTranscriptRequests();

/**
 * 
 * @returns {} 
 */
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
                        ignoreAttrs:  true,
                        explicitArray: false,
                        tagNameProcessors: [xml2js.processors.stripPrefix]
                    });
                    parser.parseString(requestDetails.PESCXml, 
                        function (err, result) {
                        //todo                            
                            processTranscript(result.TranscriptRequest);
                        });                                        
                }
            }
            
            function getTranscriptRequests(error, response, body) {
                if (!error && response.statusCode == 200) {
                    var info = JSON.parse(body);
                    for (var i = 0; i < info.length; i++) {
                       console.log(info[i].RequestID);
                        
                        //get the details
                        var detailOptions = {
                            url: config.settings.transcriptRequestUrl + info[i].RequestID,
                            headers: {
                                'Authorization': authToken
                            }
                        };
                        request(detailOptions, getTranscriptDetails);
                    }
                }
            }
            
            request(options, getTranscriptRequests);
        } else {
            console.log("Got an error: ", error, ", status code: ", response.statusCode);
        }
    });
}

function dateFromString(s) {
    var bits = s.split(/[-T:+]/g);
    var d = new Date(bits[0], bits[1] - 1, bits[2]);
    d.setHours(bits[3], bits[4], bits[5]);
    
    // Get supplied time zone offset in minutes
    var offsetMinutes = bits[6] * 60 + Number(bits[7]);
    var sign = /\d\d-\d\d:\d\d$/.test(s)? '-' : '+';
    
    // Apply the sign
    offsetMinutes = 0 + (sign == '-'? -1 * offsetMinutes : offsetMinutes);
    
    // Apply offset and local timezone
    d.setMinutes(d.getMinutes() - offsetMinutes - d.getTimezoneOffset())
    
    // d is now a local time equivalent to the supplied time
    return d;
}







