
var https = require('https');
var request = require('request');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var Fiber = require('fibers');
var Future = require('fibers/future');
var _ = require('underscore');
var ddpLogin = require('./ddpLogin');
var ocasLogin = require('./ocasLogin');

function start(processJobConfig, createJobConfig) {
  console.log('Start-up');
  var ddpClient;
  ddpLogin.onSuccess(function (ddp) {
    ddpClient = ddp;
    Job.setDDP(ddp);
    Job.processJobs(processJobConfig.root, processJobConfig.type, processJobConfig.options, processJob);
  });

  function createJob(ocasRequestId) {
    console.log("Creating job for requestID: " + ocasRequestId);
    var getDetailsFromOcasJob = new Job(createJobConfig.root, createJobConfig.type, {ocasRequestId: ocasRequestId});
    getDetailsFromOcasJob.priority('normal').retry({
      retries: Job.forever,
      wait: 30 * 60 * 1000,
      backoff: 'exponential'
    }); // start at 30 second delay and exponentially backoff
    return getDetailsFromOcasJob;
  }

  function processJob(job, cb) {
    ocasLogin.onLogin(function (error, authToken) {
      if (error) {
        job.fail({task: "ocasAcquireAuthToken", exception: error});
        cb();
        return;
      }
      function createJobs(requests) {
        // This task will start saving all the jobs and then wait for them all to complete
        // before deciding on the success/failure.
        var requestIds = requests.map(function (request) {
          return request.RequestID;
        });
        ddpClient.call("findRedundantJobs", [createJobConfig.root, {"data.ocasRequestId": {$in: requestIds}, status: {$ne: "failed"}}, {"data.ocasRequestId": 1}], function (error, redundantJobs) {
          if (error) {
            job.fail({task: "findRedundantJobs", exception: error});
            cb();
            return;
          }
          var redundantIds = _.map(redundantJobs, function(job) { return job.data.ocasRequestId; });
          var newRequestIds = _.difference(requestIds, redundantIds)
          var jobs = newRequestIds.map(function (requestId) {
            return createJob(requestId);
          });
          Future.task(function () {
            var errors = [];
            var jobSaveFutures = jobs.map(function (j) {
              return Future.wrap(j).saveFuture();
            });
            // Wait for all the saves to complete.
            // get() returns result/jobId in our case or throws and error.
            // We want to remember the Errors but not terminate processing!
            var savedJobIds = jobSaveFutures.map(function (saveFuture) {
              try {
                saveFuture.wait();
                var jobId = saveFuture.get()
                return jobId;
              } catch (error) {
                errors.push({task: "createJob", exception: error});
              }
            });
            if (errors.length > 0) {
              job.fail({errors: errors, redundantRequestIds: redundantIds});
            } else {
              job.done({savedJobs: savedJobIds, redundantRequestIds: redundantIds});
            }
            cb();
          }).detach();
        });
      }

      var ocasRequestOptions = {
        url: processJobConfig.ocasUrl,
        headers: {
          'Authorization': authToken
        }
      };
      request(ocasRequestOptions, function (error, response, body) {
        var responseStatus = response ? response.statusCode : null;
        if ((error && !ddpLogin.isEmpty(error)) || responseStatus != 200) {
          job.fail({
            task: "get " + ocasRequestOptions.url,
            exception: error,
            responseStatus: responseStatus,
            body: body
          });
          cb();
          return;
        }
        createJobs(JSON.parse(body));
      });
    });
  }
}

module.exports = {
  start: start
};

