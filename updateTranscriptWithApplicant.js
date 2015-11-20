process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var DDP = require('ddp');
var DDPlogin = require('ddp-login');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var _ = require('underscore');
var db = require('oracledb');
var Fiber = require('fibers');
var Future = require('fibers/future');


console.log('Update transcript with OCAS Applicant info');

var authToken;

// Setup the DDP connection
var ddp = new DDP({
  host: config.settings.ddpHost,
  port: config.settings.ddpPort,
  use_ejson: true,
  useSockJs: true
});

Job.setDDP(ddp);

// Open the DDP connection
ddp.connect(function(err, wasReconnect) {
  if (err) throw err;
  var options = {
    env: 'METEOR_TOKEN',
    method: 'account',
    account: config.settings.ddpUser,
    pass: config.settings.ddpPassword,
    retry: 3,
    plaintext: false
  };
  DDPlogin(ddp, options, ddpLoginCB);
});

function ddpLoginCB(err) {
  if (err)
  //todo what if I can't connect
    throw err;

  //var workers = Job.processJobs('student-transcript-in', 'updateTranscriptWithApplicant', {}, updateTranscript);
  var workers = Job.processJobs('student-transcript-in', 'updateTranscriptWithApplicant', { payload: 20 }, updateTranscript);
}

/**
 * select distinct b.spriden_pidm,
 b.spriden_id,
 c.spbpers_birth_date,
 a.svroccc_term_code
 FROM svroccc a,
 spriden b,
 spbpers c
 WHERE a.svroccc_OCAS_APPL_NUM = '044760834'
 AND b.spriden_pidm = a.svroccc_pidm
 AND b.spriden_pidm = c.spbpers_pidm
 */
function getApplicant(ocasApplicantId) {
  var syncConnection = Future.wrapAsync(db.getConnection);
  var connection = syncConnection({
    user: config.settings.oracleUserId,
    password: config.settings.oraclePassword,
    connectString: config.settings.oracleConnectString
  });
  //todo: hook up SQL....
  var applicant = {
    applicantId: ocasApplicantId,
    termCode: "201310",
    pidm: "111014",
    studentId: "13416",
    lastName: "Hiles",
    firstName: "Todd",
    birthDate: new Date("1969/05/13")
  };
  return applicant;
}

function updateTranscript(jobs) {
  _.each(jobs, function(job) {
    var transcriptId = job.data.transcriptId;
    console.log("updateTranscript called for job "+job._id+", transcript "+transcriptId);
    ddp.call("getTranscript", [transcriptId], function(err, transcript) {
      if (err) {
        job.fail();
      } else {
        var ocasApplicantId = transcript.pescCollegeTranscript.CollegeTranscript.Student.Person.AgencyAssignedID;
        //todo: get applicant data for real
        var applicant = getApplicant(ocasApplicantId);
        ddp.call("setApplicant", [transcriptId, applicant], function(err, result){
          console.log("setApplicant err:"+err);
          console.log("setApplicant result:"+result);
          //todo: improve error handling.
          if (err) {
            job.fail();
          } else {
            job.done();
          }
        });
      }
    });
  });
}



