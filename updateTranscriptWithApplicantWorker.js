var https = require('https');
var request = require('request');
var DDP = require('ddp');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var _ = require('underscore');
var db = require('oracledb');
var orawrap = require('orawrap');
var ddpLogin = require('./ddpLogin');
var ddp;

console.log('Update transcript with OCAS Applicant info');

orawrap.createPool(config.settings.dbConfig, function (error, pool){
  if (error) {
    console.log("createPool failed with error:"+error);
    throw error;
  }
  ddpLogin.onSuccess(function (ddpConnection){
    ddp = ddpConnection;
    Job.setDDP(ddpConnection);
    Job.processJobs(config.settings.jobCollectionName, 'updateTranscriptWithApplicant', {pollInterval:5000, workTimeout: 1*60*1000}, processJob);
  });

});

function processJob(job, cb){
  console.log("processing job "+job.doc._id+" data:"+JSON.stringify(job.data));
  var transcriptId = job.data.transcriptId;
  if (!transcriptId) {
    job.fail({exception:"Job data is invalid. transcriptId is required."});
    cb();
  } else {
    ddp.call("getTranscript", [transcriptId], function(error, transcript) {
      if (error || transcript == undefined) {
        job.fail({task: "getTranscript by id", exception: error, transcript: transcript});
        cb();
        return;
      }
      console.log("getTranscript returned transcript with transmissionData:"+JSON.stringify(transcript.pescCollegeTranscript.TransmissionData));
      var ocasApplicantId;
      try {
        ocasApplicantId = transcript.pescCollegeTranscript.CollegeTranscript.Student.Person.AgencyAssignedID;
      } catch (error) {
      }
      if (!ocasApplicantId) {
        job.fail({
          task: "extract OCAS Applicant Id from AgencyAssignedID of transcript",
          data: transcript.pescCollegeTranscript
        });
        cb();
        return;
      }
      var applicantQuery = "select distinct b.spriden_pidm,b.spriden_id,c.spbpers_birth_date,a.svroccc_term_code, b.spriden_first_name, b.spriden_last_name FROM svroccc a,spriden b,spbpers c WHERE a.svroccc_OCAS_APPL_NUM = :ocasApplicantId AND b.spriden_change_ind is null AND b.spriden_pidm = a.svroccc_pidm AND b.spriden_pidm = c.spbpers_pidm order by a.svroccc_term_code";
      orawrap.execute(applicantQuery, {ocasApplicantId:ocasApplicantId}, function(error, result){
        if (error) {
          job.fail({task:"get applicant query", exception:error});
          cb();
          return;
        }
        //Use earliest term code when more than one match; order is essential!
        var firstMatch = result.rows[0];
        if (!firstMatch) {
          job.fail({task:"Find applicant", data: ocasApplicantId});
          cb();
          return;
        }
        var applicant = {
          applicantId: ocasApplicantId,
          pidm: firstMatch[0],
          studentId: firstMatch[1],
          birthDate: firstMatch[2],
          termCode: firstMatch[3],
          firstName: firstMatch[4],
          lastName: firstMatch[5]
        };

        ddp.call("setApplicant", [transcriptId, applicant], function(error, result){
          if (error) {
            job.fail({task:"setApplicant",exception:error, data: {transcriptId:transcriptId, applicant:applicant}});
          }
          job.done();
          cb();
        });
      })
    });
  }
}

