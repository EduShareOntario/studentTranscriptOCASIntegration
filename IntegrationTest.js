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
var pInstCode;
var processTranscript = function (transcriptRequest) {
    Fiber(function () {
        console.log(transcriptRequest.TransmissionData.RequestTrackingID + '\t' + transcriptRequest.Request.RequestedStudent.Person.SchoolAssignedPersonID + '\t' + transcriptRequest.Request.RequestedStudent.Person.AgencyAssignedID + '\t' + transcriptRequest.Request.RequestedStudent.Person.Name.LastName + '\t' + transcriptRequest.Request.RequestedStudent.Person.Name.FirstName)
        var studentId = null;
        var matchIndicator = null;
        var holdIndicator = null;
        var stateIndicator = null;
        var dateIndicator = null;
        var firstMiddleName = null;
        var secondMiddleName = null;
        var formerSurName = null;
        var sendDate = null;
        var matchInfo = matchStudentInfo(transcriptRequest).wait();
        matchIndicator = matchInfo.matchInd;
        stateIndicator = matchInfo.stateInd;
        if (matchInfo.matchInd != null && matchInfo.matchInd == "X") {
            studentId = matchInfo.studentId;
        } else {
            matchInfo.matchInd = "N";
        }
        
        if (transcriptRequest.Request.RequestedStudent.Person.Name.MiddleName != undefined) {
            firstMiddleName = transcriptRequest.Request.RequestedStudent.Person.Name.MiddleName;
        }
        
        if (transcriptRequest.Request.RequestedStudent.Person.AlternateName != undefined) {
            if (transcriptRequest.Request.RequestedStudent.Person.AlternateName.LastName != undefined) {
                formerSurName = transcriptRequest.Request.RequestedStudent.Person.AlternateName.LastName;
            }
            if (transcriptRequest.Request.RequestedStudent.Person.AlternateName.MiddleName != undefined) {
                secondMiddleName = transcriptRequest.Request.RequestedStudent.Person.AlternateName.MiddleName;
            }
        }
        
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
        
        if (matchInfo.pidm != null) {
            holdData = checkForHolds(matchInfo.pidm).wait();
            stateIndicator = holdData.stateInd;
            holdIndicator = holdData.holdInd;
        } else {
            stateIndicator = "M";
        }
        
        //todo not sure if this code should execute conditionally 
        
        //if (stateIndicator == "D") {
        //    var dateInfo = calculateSendDate(actionCode, transcriptRequest.TransmissionData.RequestTrackingID).wait();
        //    sendDate = dateInfo.sendDate;
        //    stateIndicator = dateInfo.stateInd;
        //}
        
        //var t1 = transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.replace("-", "/");
        //var t2 = new Date(Date.parse(t1));
        //var birthDate = new Date(Date.parse(transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.replace("-", "/")));
        //writeRequest(transcriptRequest, 
        //    studentId,
        //    stateIndicator,
        //    matchIndicator, 
        //    holdIndicator,
        //    dateIndicator,
        //    birthDate, 
        //    actionCode, 
        //    completionInd,
        //    sendDate,
        //    firstMiddleName,
        //    secondMiddleName ,
        //    formerSurName
        //).wait();
        
        //writeRequestNotes(transcriptRequest.TransmissionData.RequestTrackingID, transcriptRequest.Request.Recipient).wait();
        ////var completionInd = null;
        //if (dateInfo != undefined) {
        //    if (dateInfo.message == null) {
        //        if (dateInfo.stateInd == "C" && dateInfo.sendDate != null && dateInfo.sendDate <= new Date()) {
        //            var seqNo = writeTranscript(matchInfo.pidm, matchInfo.studentId, transcriptRequest.TransmissionData.RequestTrackingID).wait();
        //            completionInd = "130";
        //        }
        
        ////    todo need to get some of the parameters, reason code
        ////    updateSvrtreq(transcriptRequest.TransmissionData.RequestTrackingID,dateInfo.sendDate,dateInfo.stateInd,matchInfo.matchInd, holdInd,dateInfo.dateInd,completionInd,matchInfo.studentId,null, dateInfo.reasonCode).wait();
        //    }
        //}
        
        
        console.log('what are the values');
    }).run();
}

var institution = function (pId, pIndex) {
    Fiber(function () {
        var instName = getInstitution(pId, pIndex).wait();
        console.log('break here');
    }).run();
}

var connectToDb = function connectToDb() {
    Fiber(function () {
        oracleConnection = connectToDb1().wait();
        console.log('we are done');
        checkForTranscriptRequests();
        return;
    }).run();
}

var connectToDb1 = function connectToDb1() {
    var future = new Future();
    oracledb.getConnection(
        {
            user: config.settings.oracleUserId,
            password: config.settings.oraclePassword,
            connectString: config.settings.oracleConnectString
        },
        function (err, connection) {
            if (err) {
                console.error(err.message);
                return;
            }
            console.log('1: we are connected');
            future.return(connection);
        });
    return future;
}


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
                    p_svrtreq_birth_date: t2,
                    p_svrtreq_sex: transcriptRequest.Request.RequestedStudent.Person.Gender.GenderCode.substring(0, 1),
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
 * @param {} pInstCode 
 * @returns {} 
 */
var getInstitution = function getInstitution(pInstCode) {
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
                "BEGIN georgian.xmltranscripts.get_institution_name(:pXlblCode, :pEdiCode,:pInstName); END;",
            {
                    // bind variables
                    pXlblCode: "STVSBGIC",
                    pEdiCode: pInstCode,
                    pInstName: { dir: oracledb.BIND_OUT, type: oracledb.STRING }
                },
            function (err, result) {
                    if (err) {
                        console.error(err.message);
                        return;
                    }
                    var instData = {};
                    instData.schoolName = result.outBinds.pInstName;
                    future.return(result.outBinds.pInstName);
                });
        });
    return future;
}

var wrapAsyncWorkWithFuture = Future.wrap(pissedOff);


function pissedOff(callback, t1Test) {
    setTimeout(function () {
        return ('hello world' + t1Test);
        console.log('we have executed')
    }, 3000);
}

/**
 * 
 * @param {} transcriptRequest 
 * @param {} studentId 
 * @param {} stateIndicator 
 * @param {} matchIndicator 
 * @param {} holdIndicator 
 * @param {} dateIndicator 
 * @param {} birthDate 
 * @param {} actionCode 
 * @param {} completionInd 
 * @param {} sendDate 
 * @param {} firstMiddleName 
 * @param {} secondMiddleName 
 * @param {} formerSurName 
 * @returns {} 
 */
var writeRequest = function writeRequest(transcriptRequest, studentId, stateIndicator, matchIndicator, holdIndicator, dateIndicator, birthDate, actionCode, completionInd, sendDate, firstMiddleName, secondMiddleName, formerSurName) {
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
                "insert into saturn.svrtreq (svrtreq_bgn02,svrtreq_id,svrtreq_trans_date, svrtreq_state_ind, svrtreq_match_ind, svrtreq_hold_ind,svrtreq_date_ind,svrtreq_purpose_cde, svrtreq_action_cde,  svrtreq_completion_ind, svrtreq_data_origin, svrtreq_user_id,svrtreq_activity_date,svrtreq_birth_date,svrtreq_gender,svrtreq_exit_date,svrtreq_surname,svrtreq_firstname,svrtreq_prefix,svrtreq_ocas_appnum,svrtreq_student_no_1,svrtreq_send_date,svrtreq_firstmidname, svrtreq_secondmidname, svrtreq_formersurname) values (:svrtreq_bgn02,:svrtreq_id,:svrtreq_trans_date,:svrtreq_state_ind, :svrtreq_match_ind, :svrtreq_hold_ind, :svrtreq_date_ind, :svrtreq_purpose_cde, :svrtreq_action_cde, :svrtreq_completion_ind, :svrtreq_data_origin, :svrtreq_user_id,:svrtreq_activity_date, :svrtreq_birth_date, :svrtreq_gender,:svrtreq_exit_date,:svrtreq_surname,:svrtreq_firstname,:svrtreq_prefix, :svrtreq_ocas_appnum,:svrtreq_student_no_1,:svrtreq_send_date,:svrtreq_firstmidname, :svrtreq_secondmidname, :svrtreq_formersurname)",
                [transcriptRequest.TransmissionData.RequestTrackingID, studentId, new Date(Date.parse(transcriptRequest.Request.CreatedDateTime)), stateIndicator, matchIndicator, holdIndicator, dateIndicator, '13', actionCode, completionInd, 'deletexml', 'mwestbrooke', new Date(), birthDate, genderCode, exitDate, transcriptRequest.Request.RequestedStudent.Person.Name.LastName, transcriptRequest.Request.RequestedStudent.Person.Name.FirstName, transcriptRequest.Request.RequestedStudent.Person.Name.NamePrefix, transcriptRequest.Request.RequestedStudent.Person.AgencyAssignedID, transcriptRequest.Request.RequestedStudent.Person.SchoolAssignedPersonID, sendDate, firstMiddleName, secondMiddleName, formerSurName],
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
var writeRequestNotes = function writeRequestNotes(trackingId, recipient) {
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
            //todo get the userid instead of using my name, change origin to xml from deletexml
            console.log("we are firing");
            if (recipient.constructor === Array) {
                var numEntries = recipient.length - 1;
                for (var index = 0; index <= numEntries; ++index) {
                    //var t1 = wrapAsyncWorkWithFuture(recipient[index].Receiver.RequestorReceiverOrganization.USIS, index);
                    // var t1 = "hello";
                    // institution(recipient[index].Receiver.RequestorReceiverOrganization.USIS,index);
                    Fiber(function () {
                        var recipientCode = null;
                        if (recipient[index].Receiver.RequestorReceiverOrganization.USIS != undefined) {
                            console.log('stop here');
                            recipientCode = recipient[index].Receiver.RequestorReceiverOrganization.USIS;
                        } else if (recipient[index].Receiver.RequestorReceiverOrganization.CSIS != undefined) {
                            recipientCode = recipient[index].Receiver.RequestorReceiverOrganization.CSIS;
                        } else {
                            //todo can this happen
                            console.log('this is an error');
                        }
                        //var recipeent = recipient[index].Receiver.RequestorReceiverOrganization.USIS;
                        var instName = getInstitution(recipientCode).wait();
                        noteMessage = "inst=" + recipientCode + "/" + instName;
                        
                        
                        //todo need to handle transaction semantics
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
                    }).run();


                }
            } else {
                Fiber(function () {
                    var recipientCode = null;
                    if (recipient.Receiver.RequestorReceiverOrganization.USIS != undefined) {
                        console.log('stop here');
                        recipientCode = recipient.Receiver.RequestorReceiverOrganization.USIS;
                    } else if (recipient.Receiver.RequestorReceiverOrganization.CSIS != undefined) {
                        recipientCode = recipient.Receiver.RequestorReceiverOrganization.CSIS;
                    } else {
                        //todo can this happen
                        console.log('this is an error');
                    }
                    var instName = getInstitution(recipientCode).wait();
                    noteMessage = "inst=" + recipientCode + "/" + instName;
                    
                    
                    //todo need to handle transaction semantics
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
                }).run();
            }
            future.return();
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
                "BEGIN georgian.svptreq_pkg.write_transcript_record(:p_spriden_pidm, :p_spriden_id,:p_svrtreq_bgn02,:p_shttran_seq_no); END;",
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
                    returnData.seqNo = result.outBinds.p_shttran_seq_no;
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
var updateSvrtreq = function updateSvrtreq(pTrackingId, pSendDate, pStateInd, pMatchInd, pHoldInd, pDateInd, pCompletionInd, pStudentId, pSeqNo, pReasonCode) {
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
//var oracleConnection = connectToDb();
//checkForTranscriptRequests();
checkForTranscriptsToProcess();
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


function checkForTranscriptsToProcess() {
    console.log("Processing transcripts");
    var workers = Job.processJobs('student-transcript-out', 'transcriptRequests', 
	  function (job, cb) {
        // This will only be called if a job is obtained from Job.getWork()         
        console.log("here");
        var parser = new xml2js.Parser({
            attrkey:  '@',
            xmlns:  false,  
            ignoreAttrs:  true,
            explicitArray: false,
            tagNameProcessors: [xml2js.processors.stripPrefix]
        });
        parser.parseString(job._doc.data.requestDetails, 
           function (err, result) {
            //todo                            
            console.log(result.TranscriptRequest);
        });
        // Be sure to invoke the callback when this job has been 
        // completed or failed. 
        cb();
    });
}