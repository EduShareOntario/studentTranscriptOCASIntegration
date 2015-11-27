process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var DDP = require('ddp');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');

console.log('Fetch the transcript from OCAS and create downstream jobs; updateTranscriptWithApplicant, saveTranscripts');

var authToken;

// Setup the DDP connection
var ddp = new DDP({
  host: config.settings.ddpHost,
  port: config.settings.ddpPort
});

Job.setDDP(ddp);

// Open the DDP connection
ddp.connect(function(err, wasReconnect) {
  if (err) throw err;
  var options = {
    username: config.settings.ddpUser,
    pass: config.settings.ddpPassword,
    ldap: true
  };
  ddp.call ("login", [options], ddpLoginCB);
});

function ddpLoginCB(err, res) {
  console.log("ddpLoginCB with "+JSON.stringify(err)+", and "+JSON.stringify(res));
  if (err)
  //todo what if I can't connect
    throw err;

  Job.processJobs('student-transcript-in', 'getTranscriptFromOCAS', {pollInterval:5000, workTimeout: 1*60*1000}, processJob);
  //processJob({data:{ocasRequestId:'asdfasdf3'}}, function(){console.log("processJob is done!");});
}



function acquireAuthToken(callback) {
  request.post(config.settings.loginUrl, { form: { Username: config.settings.userName, Password: config.settings.passWord, grant_type: config.settings.grantType } }, function(error,response, body) {
    var authToken;
    if (!error && response.statusCode != 200) {
      error = new Error("Authentication failed." + JSON.stringify(result));
    }
    if (!error) {
      var tokenInfo = JSON.parse(body);
      authToken = tokenInfo.token_type + " " + tokenInfo.access_token;
    }
    callback(error, authToken);
  });
}

// todo: Acknowledge to OCAS that we have received the transcript!!!
function sendAcknowledgmentToOCAS() {
}

function processJob(job, cb) {
  var ocasRequestId = job.data.ocasRequestId
  //todo: handle invalid job data; no ocasRequestId
  acquireAuthToken(function(err, authToken){
    if (err) {
      job.fail({task:"ocasAcquireAuthToken", exception:err});
      cb();
    } else {
      var httpOptions = {
        url: config.settings.transcriptDetailUrl + ocasRequestId,
        headers: {
          'Authorization': authToken
        }
      };
      request(httpOptions, function (error, response, body) {
        //todo: handle invalid authToken scenario, 401 Unauthorized
        if (error || response.statusCode != 200) {
          job.fail({task:"ocasGetTranscriptDetail", exception:error, data: body});
          cb();
          return;
        }
        var transcriptDetails = JSON.parse(body);
        // Create the Transcript
        ddp.call("createTranscript", [{title:"bob", description:"getTranscript from OCAS created me", pescCollegeTranscriptXML: transcriptDetails.PESCXml}], function(err,transcriptId) {
          if (err) {
            // todo: What should we tell OCAS when we can't save a Transcript they've provided?
            // ? Acknowledge or not
            job.fail({task: "createTranscript", exception: err, data: transcriptDetails});
            cb();
          } else {
            // Ok, we have a Transcript saved, now it's time to tell OCAS so they don't send it again and also schedule downstream jobs.
            sendAcknowledgmentToOCAS();
            var jobData = {requestId: transcriptDetails.RequestID, transcriptId: transcriptId};
            var updateTranscriptWithApplicantJob = new Job('student-transcript-in', 'updateTranscriptWithApplicant', jobData);
            updateTranscriptWithApplicantJob.priority('normal').retry({retries: Job.forever, wait: 24*60*60*1000, backoff: 'constant'}); // try once a day.
            // Commit it to the server
            updateTranscriptWithApplicantJob.save(function (err, result) {
              if (err) {
                job.fail({task: "createJob", exception: err, data: updateTranscriptWithApplicantJob});
                cb();
              } else {
                var saveTranscriptJob = new Job('student-transcript-in', 'saveTranscript', jobData);
                saveTranscriptJob.depends([updateTranscriptWithApplicantJob]);
                saveTranscriptJob.priority('normal').retry({retries: Job.forever, wait: 30 * 1000, backoff: 'exponential'}); // 30 second exponential backoff
                // Commit it to the server
                saveTranscriptJob.save(function (err, jobId) {
                  //todo: real exception handling.
                  if (err) {
                    job.fail({task: "createJob", exception: err, data: saveTranscriptJob});
                  } else {
                    job.done();
                  }
                  cb();
                });
              }
            });
          }
        });
      });
    }
  });
}



