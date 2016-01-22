var https = require('https');
var request = require('request');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var ddpLogin = require('./ddpLogin');
var ocasLogin = require('./ocasLogin');

console.log('Fetch the Transcript Request details from OCAS and create downstream jobs; transcriptRequests');

ddpLogin.onSuccess(function (ddpConnection){
  Job.setDDP(ddpConnection);
  Job.processJobs(config.settings.jobCollectionName, 'getTranscriptRequestDetailsFromOCAS', {pollInterval:5000, workTimeout: 1*60*1000}, processJob);
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
    } else {
      var httpOptions = {
        url: config.settings.transcriptRequestUrl + ocasRequestId,
        headers: {
          'Authorization': authToken
        }
      };
      request(httpOptions, function (error, response, body) {
        if (error || response.statusCode != 200) {
          //todo: maybe we should interrogate the response and stop retrying if it's a problem with our request data; ocasRequestId !!
          job.fail({task:"ocasGetTranscriptRequestDetail", exception:error, responseStatus: response.statusCode, data: body});
          cb();
          return;
        }
        var transcriptRequestDetails = JSON.parse(body);
        // Create the job
        var jobData = {requestId: transcriptRequestDetails.RequestID, requestDetails: transcriptRequestDetails.PESCXml};
        var transcriptRequestsJob = new Job(config.settings.jobCollectionName, 'transcriptRequest', jobData);
        transcriptRequestsJob.priority('normal').retry({retries: Job.forever, wait: 60 * 1000, backoff: 'exponential'}); // 60 second exponential backoff
        // Commit it to the server
        transcriptRequestsJob.save(function (err, result) {
          if (err) {
            job.fail({task: "createJob", exception: err, data: transcriptRequestsJob});
            cb();
            return;
          }
          // Ok, we have a TranscriptRequest saved, now it's time to tell OCAS so they don't send it again.
          ocasLogin.sendAcknowledgmentToOCAS(authToken, ocasRequestId, function(err, response) {
            if (response && response.statusCode == 400) {
              // No point retrying this job because OCAS doesn't know about this request
              job.retry({retries:0});
            }
            if (err || response.statusCode != 200) {
              job.fail({task: "sendAcknowledgmentToOCAS", exception: err});
            } else {
              job.done();
            }
            cb();
          });
        });
      });
    }
  });
}


