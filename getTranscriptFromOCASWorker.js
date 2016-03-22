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
ddpLogin.onSuccess(function (ddpConnection) {
  ddp = ddpConnection;
  Job.setDDP(ddpConnection);
  Job.processJobs(config.settings.jobCollectionName, 'getTranscriptDetailsFromOCAS', {
    pollInterval: 5000,
    workTimeout: 1 * 60 * 1000
  }, processJob);
});

function processJob(job, cb) {
  var ocasRequestId = job.data.ocasRequestId
  if (!ocasRequestId) {
    // No point retrying this job!
    job.fail({task: "validate job", exception: "Missing required ocasRequestId"}, {fatal: true});
    cb();
  }
  ocasLogin.onLogin(function (err, authToken) {
    if (err) {
      job.fail({task: "ocasAcquireAuthToken", exception: err});
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
      var responseStatus = response ? response.status : null;
      if (err || responseStatus != 200) {
        var failureDetail = {
          task: "ocasGetTranscriptDetail"
          , exception: err
          , request: httpOptions
        }
        if (response) {
          failureDetail.response = {
            headers: response.headers
            , body: response.body
            , statusCode: responseStatus
          };
          var failOptions = {};
          if (responseStatus >= 400 && responseStatus < 500) {
            // No point retrying this job because something is wrong with our request
            failOptions.fatal = true;
          }
        }
        job.fail(failureDetail, failOptions);
        cb();
        return;
      }
      var transcriptDetails = JSON.parse(body);
      // Create the Transcript
      ddp.call("createTranscript", [{
        title: "In-bound Transcript",
        description: "getTranscriptFromOCAS job created me",
        pescCollegeTranscriptXML: transcriptDetails.PESCXml
      }], function (err, transcriptId) {
        if (err) {
          // todo: Depends on why it can't save. Maybe it was a temporary system state and nothing wrong with the data provided by OCAS.
          job.fail({task: "createTranscript", exception: err, data: transcriptDetails});
          cb();
          return;
        }
        // Create sendInboundTranscriptAcknowledgmentToOCAS job!
        var jobData = {requestId: transcriptDetails.RequestID, transcriptId: transcriptId};
        var sendInboundTranscriptAcknowledgmentToOCAS = new Job(config.settings.jobCollectionName, 'sendInboundTranscriptAcknowledgmentToOCAS', jobData);
        sendInboundTranscriptAcknowledgmentToOCAS.priority('normal').retry({
          retries: Job.forever,
          wait: 1 * 60 * 60 * 1000,
          backoff: 'constant'
        }); // try once a minute.
        // Commit it to the server
        sendInboundTranscriptAcknowledgmentToOCAS.save(function (err, result) {
          if (err) {
            job.fail({task: "createJob", exception: err, data: sendInboundTranscriptAcknowledgmentToOCAS});
            cb();
            return;
          }

          // Create updateTranscriptWithApplicant job!
          var jobData = {requestId: transcriptDetails.RequestID, transcriptId: transcriptId};
          var updateTranscriptWithApplicantJob = new Job(config.settings.jobCollectionName, 'updateTranscriptWithApplicant', jobData);
          updateTranscriptWithApplicantJob.priority('normal').retry({
            retries: Job.forever,
            wait: 24 * 60 * 60 * 1000,
            backoff: 'constant'
          }); // try once a day.
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



