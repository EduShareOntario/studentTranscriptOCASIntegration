
var https = require('https');
var request = require('request');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var Fiber = require('fibers');
var Future = require('fibers/future');
var ddpLogin = require('./ddpLogin');
var ocasLogin = require('./ocasLogin');

function start(processJobConfig, createJobConfig) {
  console.log('Start-up');
  ddpLogin.onSuccess(function(ddp) {
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
    ocasLogin.onLogin(function(err, authToken){
      if (err) {
        job.fail({task:"ocasAcquireAuthToken", exception:err});
        cb();
        return;
      }
      function createJobs(requests) {
        // This task will start saving all the jobs and then wait for them all to complete
        // before deciding on the success/failure.
        Future.task(function () {
          var errors = [];
          var requestIds = requests.map( function(request) { return request.RequestID;});
          var jobs = requestIds.map(function (requestId) { return createJob(requestId);});
          var jobSaveFutures = jobs.map(function (j){ return Future.wrap(j).saveFuture();});
          // Wait for all the saves to complete.
          // get() returns result/jobId in our case or throws and error.
          // We want to remember the Errors but not terminate processing!
          var savedJobIds = jobSaveFutures.map(function (saveFuture) {
            try {
              saveFuture.wait();
              var jobId = saveFuture.get()
              return jobId;
            } catch (err) {
              errors.push({task: "createJob", exception: err});
            }
          });
          if (errors.length > 0) {
            job.fail({errors: errors});
          } else {
            job.done({savedJobs: savedJobIds});
          }
          cb();
        }).detach();
      }
      var ocasRequestOptions = {
        url: processJobConfig.ocasUrl,
        headers: {
          'Authorization': authToken
        }
      };
      request(ocasRequestOptions, function (error, response, body) {
        if (error || response.statusCode != 200) {
          job.fail({task:"get $($ocasRequestOptions.ocasUrl)", exception:error, responseStatus: response.statusCode, data: body});
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

