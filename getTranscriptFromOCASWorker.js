var https = require('https');
var request = require('request');
var DDP = require('ddp');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var ddpLogin = require('./ddpLogin');
var ocasLogin = require('./ocasLogin');

console.log('Fetch the transcript from OCAS and create downstream jobs; updateTranscriptWithApplicant, saveTranscripts');

var ddp
ddpLogin.onSuccess(function (ddpConnection){
  ddp = ddpConnection;
  Job.setDDP(ddpConnection);
  Job.processJobs(config.settings.jobCollectionName, 'getTranscriptDetailsFromOCAS', {pollInterval:5000, workTimeout: 1*60*1000}, processJob);
});

function processJob(job, cb) {
  var ocasRequestId = job.data.ocasRequestId
  if (!ocasRequestId) {
    // No point retrying this job!
    job.retry({retries:0});
    job.fail({task:"validate job", exception:"Missing required ocasRequestId"});
    cb();
  }
  ocasLogin.onLogin(function(err, authToken){
    if (err) {
      job.fail({task:"ocasAcquireAuthToken", exception:err});
      cb();
      return;
    }
    var httpOptions = {
      url: config.settings.transcriptDetailUrl + ocasRequestId,
      headers: {
        'Authorization': authToken
      }
    };
    request(httpOptions, function (error, response, body) {
      if (error || response.statusCode != 200) {
        //todo: maybe we should interrogate the response and stop retrying if it's a problem with our request data; ocasRequestId !!
        job.fail({task:"ocasGetTranscriptDetail", exception:error, responseStatus: response.statusCode, data: body});
        cb();
        return;
      }
      var transcriptDetails = JSON.parse(body);
      // Create the Transcript
      ddp.call("createTranscript", [{title:"In-bound Transcript", description:"getTranscriptFromOCAS job created me", pescCollegeTranscriptXML: transcriptDetails.PESCXml}], function(err,transcriptId) {
        if (err) {
          // todo: What should we tell OCAS when we can't save a Transcript they've provided?
          // todo: Depends on why it can't save. Maybe it was a temporary system state and nothing wrong with the data provided by OCAS.
          job.fail({task: "createTranscript", exception: err, data: transcriptDetails});
          cb();
          return;
        }
        var jobData = {requestId: transcriptDetails.RequestID, transcriptId: transcriptId};
        var updateTranscriptWithApplicantJob = new Job(config.settings.jobCollectionName, 'updateTranscriptWithApplicant', jobData);
        updateTranscriptWithApplicantJob.priority('normal').retry({retries: Job.forever, wait: 24*60*60*1000, backoff: 'constant'}); // try once a day.
        // Commit it to the server
        updateTranscriptWithApplicantJob.save(function (err, result) {
          if (err) {
            job.fail({task: "createJob", exception: err, data: updateTranscriptWithApplicantJob});
            cb();
            return;
          }
          var saveTranscriptJob = new Job(config.settings.jobCollectionName, 'saveTranscript', jobData);
          saveTranscriptJob.depends([updateTranscriptWithApplicantJob]);
          saveTranscriptJob.priority('normal').retry({retries: Job.forever, wait: 30 * 1000, backoff: 'exponential'}); // 30 second exponential backoff
          // Commit it to the server
          saveTranscriptJob.save(function (err, jobId) {
            if (err) {
              job.fail({task: "createJob", exception: err, data: saveTranscriptJob});
              cb();
              return;
            }
            // Ok, we have a Transcript saved, now it's time to tell OCAS so they don't send it again.
            ocasLogin.sendAcknowledgmentToOCAS(authToken, ocasRequestId, function(err, response) {
              if (response && response.statusCode == 400) {
                // No point retrying this job because OCAS doesn't know about this request
                job.retry({retries:0});
              }
              if (err || response.statusCode != 200) {
                job.fail({task: "sendAcknowledgmentToOCAS", exception: err, response: response});
              } else {
                job.done();
              }
              cb();
            });
          });
        });
      });
    });
  });
}



