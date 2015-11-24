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
//var Fiber = require('fibers');
//var Future = require('fibers/future');


console.log('Update transcript with OCAS Applicant info');

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

  var workers = Job.processJobs('student-transcript-in', 'updateTranscriptWithApplicant', {pollInterval:5000, prefetch: 2, workTimeout: 1*60*1000}, processJob);
  //var workers = Job.processJobs('student-transcript-in', 'updateTranscriptWithApplicant', { payload: 20 }, processJobs);
}

function processJobs(jobs, cb) {
  _.each(jobs, function(job) {
    processJob(job);
  });
}

function processJob(job, cb){
  console.log("processing job "+job.doc._id+" data:"+JSON.stringify(job.data));
  var transcriptId = job.data.transcriptId;
  if (!transcriptId) {
    job.log("Job data is invalid. transcriptId is required.");
    //job.done();
    cb();
  } else {
    ddp.call("getTranscript", [transcriptId], function(err, transcript) {
      if (err) {
        job.log("Failed to getTranscript.",err);
        //job.fail();
        cb();
      } else {
        console.log("getTranscript returned transcript with transmissionData:"+JSON.stringify(transcript.pescCollegeTranscript.TransmissionData));
        var ocasApplicantId;
        var err;
        try {
          ocasApplicantId = transcript.pescCollegeTranscript.CollegeTranscript.Student.Person.AgencyAssignedID;
        } catch (error) {
          err = error;
        }
        if (!ocasApplicantId) {
          job.log("transcript missing AgencyAssignedID for student", err);
          //job.done();
          cb();
        } else {
          //todo: get applicant data for real
          var applicant = getApplicant(ocasApplicantId);
          ddp.call("setApplicant", [transcriptId, applicant], function(err, result){
            console.log("setApplicant err:"+err);
            console.log("setApplicant result:"+result);
            //todo: improve error handling.
            if (err) {
              //job.fail();
            } else {
              //job.done();
            }
            cb();
          });
        }
      }
    });
  }
}

var applicantQuery = "select distinct b.spriden_pidm,b.spriden_id,c.spbpers_birth_date,a.svroccc_term_code FROM svroccc a,spriden b,spbpers c WHERE a.svroccc_OCAS_APPL_NUM = :ocasApplicantId AND b.spriden_change_ind is null AND b.spriden_pidm = a.svroccc_pidm AND b.spriden_pidm = c.spbpers_pidm";
function getApplicant(ocasApplicantId) {
  //var syncConnection = Future.wrapAsync(db.getConnection);
  db.getConnection({
    user: config.settings.oracleUserId,
    password: config.settings.oraclePassword,
    connectString: config.settings.oracleConnectString
  }, function(err,connection){
    if (err) throw err;
    console.log("getApplicant called with applicantId: "+ ocasApplicantId);
    connection.execute(applicantQuery, {ocasApplicantId:ocasApplicantId}, function(err, result){
      console.log("error:"+err);
      console.log("applicant result:"+JSON.stringify(result));
      releaseConnection(connection);
    })
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

function releaseConnection(connection) {
  connection.release(function(err){
    if (err) console.error("Failed to release connection with error:"+err);
  });
}

