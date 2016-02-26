var https = require('https');
var request = require('request');
var DDP = require('ddp');
var Job = require('meteor-job');
var config = require('app-config');
var Fiber = require('fibers');
var Future = require('fibers/future');
var fs = Future.wrap(require('fs'));
var dbconfig = require("./libs/dbconfig.js");
var oracledb = require('oracledb');
var xml2js = require('xml2js');
var orawrap = require('orawrap');
var ddpLogin = require('./ddpLogin');
var ddp;

console.log('Start Her Up');

orawrap.createPool(config.settings.dbConfig, function (err, pool) {
    if (err) {
        console.log("createPool failed with err:" + err);
        throw err;
    }
    ddpLogin.onSuccess(function (ddpConnection) {
        ddp = ddpConnection;
        Job.setDDP(ddpConnection);
        Job.processJobs(config.settings.jobCollectionName, 'transcriptRequest', { pollInterval: 1 * 30 * 1000, workTimeout: 3 * 60 * 1000 }, processJob);
    });
});

function processJob(job, cb) {
    var parser = new xml2js.Parser({
            attrkey:  '@',
            xmlns:  false,  
            ignoreAttrs:  true,
            explicitArray: false,
            tagNameProcessors: [xml2js.processors.stripPrefix]
    });        
    parser.parseString(job._doc.data.requestDetails, function (err, result) {
        if (err) {
            job.fail({ task: "parse Transcript request", exception: err }, {fatal: true});
            cb();
            return;
        }
        Fiber(function() {
            processTranscript(result.TranscriptRequest, function(err) {
                if (err) {
                    job.fail({ task: "process Transcript Request", exception: err });
                } else {
                    job.done();
                }
                cb();
            });
        }).run();
        }
    );  
}

var institution = function (pId, pIndex) {
    Fiber(function () {
        var instName = getInstitution(pId, pIndex).wait();
    }).run();
}

var pInstCode;
var processTranscript = function(transcriptRequest, cb) {
    console.log(transcriptRequest.TransmissionData.RequestTrackingID);
    var studentId = null;

    var matchIndicator = null;
    var holdIndicator = null;
    var stateIndicator = null;
    var dateIndicator = null;
    var firstMiddleName = null;
    var secondMiddleName = null;
    var formerSurName = null;
    var sendDate = null;
    var ocasNumber = null;

    try {
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
        
        //mdw feb 26/2016 OUAC requests don't have the agency identifier in the document
        //as a result I have to check if it exists, otherwise the code was failing.
        if (transcriptRequest.Request.RequestedStudent.Person.AgencyIdentifier != undefined) {
            if (transcriptRequest.Request.RequestedStudent.Person.AgencyIdentifier.constructor === Array) {
                var numEntries = transcriptRequest.Request.RequestedStudent.Person.AgencyIdentifier.length - 1;
                for (var index = 0; index <= numEntries; ++index) {
                    if (transcriptRequest.Request.RequestedStudent.Person.AgencyIdentifier[index].AgencyName != undefined) {
                        if (transcriptRequest.Request.RequestedStudent.Person.AgencyIdentifier[index].AgencyName.toUpperCase() == "OCAS APPLICATION NUMBER") {
                            ocasNumber = transcriptRequest.Request.RequestedStudent.Person.AgencyIdentifier[index].AgencyAssignedID;
                        }
                    }
                }
            }
        } else {
            ocasNumber = transcriptRequest.Request.RequestedStudent.Person.AgencyAssignedID;
        }
                
        if (ocasNumber == undefined) {
            ocasNumber = transcriptRequest.Request.RequestedStudent.Person.AgencyAssignedID; 
        }

        var actionCode = "";
        var holdType = "";
        var holdUntilTerm = "";
        var completionInd = "~";
        if (transcriptRequest.Request.Recipient.constructor === Array) {
            holdType = transcriptRequest.Request.Recipient[0].TranscriptHold.HoldType.toUpperCase();
            if (holdType != "NOW") {
                holdUntilTerm = transcriptRequest.Request.Recipient[0].TranscriptHold.SessionName;
            }
        } else {
            holdType = transcriptRequest.Request.Recipient.TranscriptHold.HoldType.toUpperCase();;
            if (holdType != "NOW") {
                holdUntilTerm = transcriptRequest.Request.Recipient.TranscriptHold.SessionName;
            }
        }
        
      
        switch (holdType) {
            case "NOW":
                actionCode = "R2";
                break;
            case "AFTERSPECIFIEDTERM":
                actionCode = "R3";
                break;
            case "AFTERDEGREEAWARDED":                
                actionCode = "R4";
                break;
            default:
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
        
        //mdw feb 26/2016 i moved this code up because the calculateSendDate function
        //depends on a record with a term code in svrtne. If this isn't before the
        //calculation it will never set the send date
        //this is a temporary work-around - I will create another function that will
        //pass in the date
        //as a result I have to check if it exists, otherwise the code was failing.
        
        if (actionCode == "R3" || actionCode == "R4") {
            writeFutureTermNote(transcriptRequest.TransmissionData.RequestTrackingID, holdUntilTerm).wait();
        }

        //todo not sure if this code should execute conditionally 
        if (stateIndicator == "D") {
            var dateInfo = calculateSendDate(actionCode, transcriptRequest.TransmissionData.RequestTrackingID).wait();
            sendDate = dateInfo.sendDate;
            stateIndicator = dateInfo.stateInd;
        }

        //Javascript's Date class doesn't represent a date, it represents a timestamp so I need to modify the value       
        var sourceDate = transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.replace(/-/g, "/") + " EST";

        var birthDate = new Date(Date.parse(sourceDate));
        
        writeRequest(transcriptRequest,
            studentId,
            stateIndicator,
            matchIndicator,
            holdIndicator,
            dateIndicator,
            birthDate,
            actionCode,
            completionInd,
            sendDate,
            firstMiddleName,
            secondMiddleName,
            formerSurName,
            ocasNumber
        ).wait();
        
       console.log('write agency');
        writeAgency(transcriptRequest.TransmissionData.RequestTrackingID, transcriptRequest.Request.RequestedStudent.Person).wait();
        
        console.log('write request notes');
       writeRequestNotes(transcriptRequest.TransmissionData.RequestTrackingID, transcriptRequest.Request.Recipient).wait();
        
       /* if (actionCode == "R3" || actionCode == "R4") {
            writeFutureTermNote(transcriptRequest.TransmissionData.RequestTrackingID, holdUntilTerm).wait();           
        }*/

        if (dateInfo != undefined) {
            if (dateInfo.message == null) {
                if (dateInfo.stateInd == "C" && dateInfo.sendDate != null && dateInfo.sendDate <= new Date()) {
                    var seqNo = writeTranscript(matchInfo.pidm, matchInfo.studentId, transcriptRequest.TransmissionData.RequestTrackingID).wait();
                    completionInd = "130";
                }
                console.log('calling updateSvrtreq');
                //    todo need to get some of the parameters, reason code
                updateSvrtreq(transcriptRequest.TransmissionData.RequestTrackingID, dateInfo.sendDate, dateInfo.stateInd, matchInfo.matchInd, holdIndicator, dateInfo.dateInd, completionInd, matchInfo.studentId, null, dateInfo.reasonCode).wait();
            }
        } 
        cb();
    } catch (e) {
        cb(e.message);
    }
};



/**
 * /
 * @param {} transcriptRequest 
 * @returns {} 
 */
var matchStudentInfo = function matchStudentInfo(transcriptRequest) {
    var future = new Future();
    var sourceDate = transcriptRequest.Request.RequestedStudent.Person.Birth.BirthDate.replace(/-/g, "/") + " EST";    
    var birthDate = new Date(Date.parse(sourceDate));
    
    orawrap.execute("BEGIN georgian.svptreq_pkg.matchStudentInfo(:p_svrtreq_bgn02, :p_svrtreq_birth_date,:p_svrtreq_sex,:p_studentId,:p_svrtreq_last_name,:p_svrtreq_first_name,:p_svrtreq_state_ind,:p_svrtreq_match_ind,:p_spriden_pidm,:p_svrtreq_id ); END;",
    {
        // bind variables                   
        p_svrtreq_bgn02: transcriptRequest.TransmissionData.RequestTrackingID,
        p_svrtreq_birth_date: birthDate,
        p_svrtreq_sex: transcriptRequest.Request.RequestedStudent.Person.Gender.GenderCode.substring(0, 1),
        p_studentId : transcriptRequest.Request.RequestedStudent.Person.SchoolAssignedPersonID,
        p_svrtreq_last_name: transcriptRequest.Request.RequestedStudent.Person.Name.LastName,
        p_svrtreq_first_name: transcriptRequest.Request.RequestedStudent.Person.Name.FirstName,	
        p_svrtreq_state_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
        p_svrtreq_match_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
        p_spriden_pidm: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        p_svrtreq_id : { dir: oracledb.BIND_OUT, type: oracledb.STRING }
    },
    {}	,
        function (err, result) {
        var matchInfo;
        if (err) {
            console.error("matchStudentInfo: " + err.message);
            future.throw(err);
            return;
        }
        var matchInfo = {};
        matchInfo.stateInd = result.outBinds.p_svrtreq_state_ind;
        matchInfo.matchInd = result.outBinds.p_svrtreq_match_ind;
        matchInfo.pidm = result.outBinds.p_spriden_pidm;
        matchInfo.studentId = result.outBinds.p_svrtreq_id;
        future.return(matchInfo);
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
    
    orawrap.execute("BEGIN georgian.svptreq_pkg.determine_send_date(:p_svrtreq_action_cde, :p_svrtreq_bgn02,:p_svrtreq_send_date, :p_svrtreq_state_ind, :p_svrtreq_date_ind, :p_svrtreq_reason_cde,:p_error_message); END;",
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
            console.error("calculateSendDate: " + err.message);
            future.throw(err);
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
    return future;
}

/**
 * 
 * @param {} pPidm 
 * @returns {} 
 */
var checkForHolds = function checkForHolds(pPidm) {
    var future = new Future();
    
    
    orawrap.execute("BEGIN georgian.svptreq_pkg.check_for_holds(:p_spriden_pidm, :p_svrtreq_state_ind,:p_svrtreq_hold_ind ); END;",
    {
        // bind variables                   
        p_spriden_pidm: pPidm,                  
        p_svrtreq_state_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
        p_svrtreq_hold_ind: { dir: oracledb.BIND_OUT, type: oracledb.STRING }
    },	
       function (err, result) {
        if (err) {
            console.error("checkForHolds: " + err.message);
            future.throw(err);
            return;
        }
        var holdData = {};
        holdData.stateInd = result.outBinds.p_svrtreq_state_ind;
        holdData.holdInd = result.outBinds.p_svrtreq_hold_ind;
        future.return(holdData);
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
    
    orawrap.execute("BEGIN georgian.xmltranscripts.get_institution_name(:pXlblCode, :pEdiCode,:pInstName); END;",
    {
            // bind variables
            pXlblCode: "STVSBGIC",
            pEdiCode: pInstCode,
            pInstName: { dir: oracledb.BIND_OUT, type: oracledb.STRING }
        },
            function (err, result) {
            if (err) {
                console.error("getInstitution: " + err.message);
                future.throw(err);
                return;
            }
            var instData = {};
            instData.schoolName = result.outBinds.pInstName;
            future.return(result.outBinds.pInstName);
        });       
    return future;
}

var getTermCode = function getTermCode(pTermCode) {
    var future = new Future();
    
    orawrap.execute("BEGIN georgian.svptreq_pkg.calc_term_code(:pTermCode); END;",
    {
        // bind variables        
        pInputTerm: pTermCode,
        pOutPutTerm: { dir: oracledb.BIND_OUT, type: oracledb.STRING }
    },
        function (err, result) {
        if (err) {
            console.error("getTermCode: " + err.message);
            future.throw(err);
            return;
        }
      /*  var termData = {};
        termData.schoolName = result.outBinds.pOutPutTerm;
        future.return(result.outBinds.pOutPutTerm);*/
    });
    return future;
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
 * @param {} ocasNumber
 * @returns {} 
 */
var writeRequest = function writeRequest(transcriptRequest, studentId, stateIndicator, matchIndicator, holdIndicator, dateIndicator, birthDate, actionCode, completionInd, sendDate, firstMiddleName, secondMiddleName, formerSurName, ocasNumber) {
    var future = new Future();
    var genderCode = transcriptRequest.Request.RequestedStudent.Person.Gender.GenderCode.substring(0, 1);
    
    var exitDate = null;
    if (transcriptRequest.Request.RequestedStudent.Attendance.ExitDate != undefined) {
        var tranExitDate = transcriptRequest.Request.RequestedStudent.Attendance.ExitDate.replace(/-/g, "/") + " EST";
        exitDate = new Date(Date.parse(tranExitDate));
    }
       
    orawrap.execute(
        "insert into saturn.svrtreq (svrtreq_bgn02,svrtreq_id,svrtreq_trans_date, svrtreq_state_ind, svrtreq_match_ind, svrtreq_hold_ind,svrtreq_date_ind,svrtreq_purpose_cde, svrtreq_action_cde,  svrtreq_completion_ind, svrtreq_data_origin, svrtreq_user_id,svrtreq_activity_date,svrtreq_birth_date,svrtreq_gender,svrtreq_exit_date,svrtreq_surname,svrtreq_firstname,svrtreq_prefix,svrtreq_ocas_appnum,svrtreq_student_no_1,svrtreq_send_date,svrtreq_firstmidname, svrtreq_secondmidname, svrtreq_formersurname) values (:svrtreq_bgn02,:svrtreq_id,:svrtreq_trans_date,:svrtreq_state_ind, :svrtreq_match_ind, :svrtreq_hold_ind, :svrtreq_date_ind, :svrtreq_purpose_cde, :svrtreq_action_cde, :svrtreq_completion_ind, :svrtreq_data_origin, :svrtreq_user_id,:svrtreq_activity_date, :svrtreq_birth_date, :svrtreq_gender,:svrtreq_exit_date,:svrtreq_surname,:svrtreq_firstname,:svrtreq_prefix, :svrtreq_ocas_appnum,:svrtreq_student_no_1,:svrtreq_send_date,:svrtreq_firstmidname, :svrtreq_secondmidname, :svrtreq_formersurname)",
                [transcriptRequest.TransmissionData.RequestTrackingID, studentId, new Date(Date.parse(transcriptRequest.Request.CreatedDateTime)), stateIndicator, matchIndicator, holdIndicator, dateIndicator, '13', actionCode, completionInd, 'deletexml', 'mwestbrooke', new Date(), birthDate, genderCode, exitDate, transcriptRequest.Request.RequestedStudent.Person.Name.LastName, transcriptRequest.Request.RequestedStudent.Person.Name.FirstName, transcriptRequest.Request.RequestedStudent.Person.Name.NamePrefix, ocasNumber, transcriptRequest.Request.RequestedStudent.Person.SchoolAssignedPersonID, sendDate, firstMiddleName, secondMiddleName, formerSurName],
		        { autoCommit: true },   
                function (err, result) {
            if (err) {
                console.error("writeRequest: " + err.message + ' ' + transcriptRequest.TransmissionData.RequestTrackingID);
                future.throw(err);
                return;
            }

            future.return();
        });  
    return future;
}

/**
 * 
 * @param {} trackingId 
 * @param {} person 
 * @returns {} 
 */
var writeAgency = function writeAgency(trackingId, person) {
    var future = new Future();
    var noteMessage = "";
    if (person.AgencyAssignedID === undefined) {
        if (person.AgencyIdentifier.constructor === Array) {
            var numEntries = person.AgencyIdentifier.length - 1;
          
            for (var index = 0; index <= numEntries; ++index) {
                console.log('writeAgency');
                Fiber(function () {
                    orawrap.execute(
                        "insert into saturn.xml_agency (xml_agency_requesttrackingid,xml_agency_name,xml_agency_code, xml_agency_id, xml_agency_status,xml_agency_activity) values (:xml_agency_requesttrackingid,:xml_agency_name,:xml_agency_code, :xml_agency_id, :xml_agency_status,:xml_agency_activity)",
                                [trackingId, person.AgencyIdentifier[index].AgencyName, person.AgencyIdentifier[index].AgencyCode, person.AgencyIdentifier[index].AgencyAssignedID, '', new Date()],
                                { autoCommit: true },
                            function (err, result) {
                            if (err) {
                                future.throw(err);
                                return;
                            }
                        });
                }).run();
            }
        }
    } else {
        Fiber(function () {
            //todo need to handle transaction semantics
            orawrap.execute(
                "insert into saturn.xml_agency (xml_agency_requesttrackingid,xml_agency_name,xml_agency_code, xml_agency_id, xml_agency_status,xml_agency_activity) values (:xml_agency_requesttrackingid,:xml_agency_name,:xml_agency_code, :xml_agency_id, :xml_agency_status,:xml_agency_activity)",
                        [trackingId, 'OCAS Application Number', 'MutuallyDefined', person.AgencyAssignedID, '', new Date()],
                        { autoCommit: true },
                        function (err, result) {
                    if (err) {
                        console.error("writeAgency: " + err.message);
                        future.throw(new Error(err.message));  
                    }
                });
        }).run();
    }
    future.return();
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
    
    //todo get the userid instead of using my name, change origin to xml from deletexml
    if (recipient.constructor === Array) {
        var numEntries = recipient.length - 1;
        for (var index = 0; index <= numEntries; ++index) {           
            Fiber(function () {
                var recipientCode = null;
                if (recipient[index].Receiver.RequestorReceiverOrganization.USIS != undefined) {
                    recipientCode = recipient[index].Receiver.RequestorReceiverOrganization.USIS;
                } else if (recipient[index].Receiver.RequestorReceiverOrganization.CSIS != undefined) {
                    recipientCode = recipient[index].Receiver.RequestorReceiverOrganization.CSIS;
                } else {
                    //todo can this happen
                    console.log("writeRequestNotes: this is an error");
                }
                //var recipeent = recipient[index].Receiver.RequestorReceiverOrganization.USIS;
                var instName = getInstitution(recipientCode).wait();
                noteMessage = "inst=" + recipientCode + "/" + instName;
                
                
                //todo need to handle transaction semantics             
                orawrap.execute(
                    "insert into saturn.svrtnte (svrtnte_bgn02,svrtnte_note,svrtnte_data_origin, svrtnte_user_id, svrtnte_activity_date) values (:svrtnte_bgn02,:svrtnte_note,:svrtnte_data_origin, :svrtnte_user_id, :svrtnte_activity_date)",
                            [trackingId, noteMessage, 'deletexml', 'mwestbrooke', new Date()],
                            { autoCommit: true },
                            function (err, result) {
                        if (err) {
                            console.error("writeRequestNotes: " + err.message);
                            future.throw(new Error(err.message)); 
                        }
                    });
            }).run();


        }
    } else {
        Fiber(function () {
            var recipientCode = null;
            if (recipient.Receiver.RequestorReceiverOrganization.USIS != undefined) {
                recipientCode = recipient.Receiver.RequestorReceiverOrganization.USIS;
            } else if (recipient.Receiver.RequestorReceiverOrganization.CSIS != undefined) {
                recipientCode = recipient.Receiver.RequestorReceiverOrganization.CSIS;
            } else {
                //todo can this happen
                console.log("writeRequestNotes: this is an error");
            }
            var instName = getInstitution(recipientCode).wait();
            noteMessage = "inst=" + recipientCode + "/" + instName;
                        
            //todo need to handle transaction semantics
            orawrap.execute(
                "insert into saturn.svrtnte (svrtnte_bgn02,svrtnte_note,svrtnte_data_origin, svrtnte_user_id, svrtnte_activity_date) values (:svrtnte_bgn02,:svrtnte_note,:svrtnte_data_origin, :svrtnte_user_id, :svrtnte_activity_date)",
                            [trackingId, noteMessage, 'deletexml', 'mwestbrooke', new Date()],
                            { autoCommit: true },
                            function (err, result) {
                    if (err) {
                        console.error("writeRequestNotes: " + err.message);
                        future.throw(new Error(err.message));  
                    }
                });
        }).run();
    }
    future.return();    
    return future;
}

/**
 * 
 * @param {} trackingId 
 * @param {} termCode 
 * @returns {} 
 */
var writeFutureTermNote = function writeFutureTermNote(trackingId,termCode) {
    var future = new Future();   
    var noteMessage = "TERM=" + termCode;  
    orawrap.execute(
        "insert into saturn.svrtnte (svrtnte_bgn02,svrtnte_note,svrtnte_data_origin, svrtnte_user_id, svrtnte_activity_date) values (:svrtnte_bgn02,:svrtnte_note,:svrtnte_data_origin, :svrtnte_user_id, :svrtnte_activity_date)",
            [trackingId, noteMessage, 'deletexml', 'mwestbrooke', new Date()],
            { autoCommit: true },
            function (err, result) {
            if (err) {
                console.error("writeRequest: " + err.message + ' ' + trackingId);
                future.throw(err);
                return;
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
    orawrap.execute(
        "BEGIN georgian.svptreq_pkg.write_transcript_record(:p_spriden_pidm, :p_spriden_id,:p_svrtreq_bgn02,:p_shttran_seq_no); END;",
            {
            // bind variables                   
            p_spriden_pidm: pPidm,
            p_spriden_id: pStudentId,
            p_svrtreq_bgn02: pTrackingId,
            p_shttran_seq_no: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        },
        { autoCommit: true },	 
           function (err, result) {
            if (err) {
                console.error("writeTranscript: " + err.message);
                future.throw(new Error(err.message));   
            }         
            var returnData = {};
            returnData.seqNo = result.outBinds.p_shttran_seq_no;
            future.return(returnData);
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
    
    orawrap.execute(
        "BEGIN georgian.svptreq_pkg.update_svrtreq_record(:p_svrtreq_bgn02, :p_svrtreq_send_date,:p_svrtreq_state_ind,:p_svrtreq_match_ind,:p_svrtreq_hold_ind,:p_svrtreq_date_ind,:p_svrtreq_completion_ind,:p_svrtreq_id,:p_svrtreq_seq_no,:p_svrtreq_reason_cde); END;",
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
        { autoCommit: true },	                       
        function (err, result) {
            if (err) {
                console.error("updateSvrtreq: " + err.message);
                future.throw(new Error(err.message));  
            }
            future.return();    
        });        
    return future;
}



