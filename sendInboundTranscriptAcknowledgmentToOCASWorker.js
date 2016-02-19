var config = require('app-config');
var request = require('request');
var Job = require('meteor-job');
var config = require('app-config');
var later = require('later');
var Fiber = require('fibers');
var Future = require('fibers/future');
var _ = require('underscore');
var ddpLogin = require('./ddpLogin');
var ocas = require('./ocasLogin');
var xmlBuilder = require('xmlbuilder');

console.log('Send transcript acknowledgment to OCAS.');

var processJobConfig = {
  root : 'student-transcript',
  type : 'sendInboundTranscriptAcknowledgmentToOCAS',
  options : {pollInterval:1*30*1000, workTimeout: 3*60*1000},
  ocasUrl : config.settings.transcriptAcknowledgmentUrl
}

_.extend(ocas, {
  makeOcasUrl : function (urlTemplate, ocasRequestId) {
    return urlTemplate.replace(":requestId",ocasRequestId);
  },
  buildAcknowledgmentDocument: function (transcript) {
    //Build Acknowledgment XML doc from inbound Transcript identified in job.
    var collegeTranscript = transcript.pescCollegeTranscript.CollegeTranscript;
    var acknowledgmentDoc = {
      "ta:Acknowledgment": {
        "@xmlns:ta":"urn:org:pesc:message:TranscriptAcknowledgment:v1.1.0",
        TransmissionData: {
          DocumentID: collegeTranscript.TransmissionData.DocumentID,
          CreatedDateTime: collegeTranscript.TransmissionData.CreatedDateTime,
          DocumentTypeCode: "Acknowledgment",
          TransmissionType: "Original",
          Source: {
            Organization: {
              CSIS: "353900",
              OrganizationName: "Georgian"
            }
          },
          Destination: {
            Organization: {
              MutuallyDefined: "OCAS",
              OrganizationName: "OCAS"
            }
          },
          DocumentProcessCode: config.settings.ocasAcknowledgmentDocumentProcessCode || 'PRODUCTION',
          RequestTrackingID: transcript.ocasRequestId
        },
        Person: collegeTranscript.Student.Person,
        //AcademicSummary: collegeTranscript.Student.AcademicAward.AcademicSummary,
        AcademicAwardTotal: 0,
        CourseTotal:0
      }
    }
    var xmlDoc = xmlBuilder.create(acknowledgmentDoc, {headless:true});
    return xmlDoc;
  },
    sendAcknowledgmentToOCAS : function (authToken, transcript, cb) {
    var ackDoc = ocas.buildAcknowledgmentDocument(transcript).end();
    var requestBody = { "PESCXML": ackDoc };
    var httpOptions = {
      url: ocas.makeOcasUrl(processJobConfig.ocasUrl, transcript.ocasRequestId),
      method: 'POST',
      headers: {
        'Authorization': authToken
      },
      body: JSON.stringify(requestBody)
    }
    request(httpOptions, function (error, response) {
      cb(error, response, httpOptions);
    });
  }
});

var ddpClient;
ddpLogin.onSuccess(function (ddp) {
  ddpClient = ddp;
  Job.setDDP(ddp);
  Job.processJobs(processJobConfig.root, processJobConfig.type, processJobConfig.options, processJob);
});

function processJob(job, cb) {
  console.log("processing job "+job.doc._id+" data:"+JSON.stringify(job.data));
  var transcriptId = job.data.transcriptId;
  if (!transcriptId) {
    job.fail({exception:"Job data is invalid. transcriptId is required."});
    cb();
  } else {
    ddpClient.call("getTranscript", [transcriptId], function (err, transcript) {
      if (err) {
        job.fail({task: "getTranscript by id", exception: err});
        cb();
        return;
      }
      console.log("getTranscript returned transcript with transmissionData:" + JSON.stringify(transcript.pescCollegeTranscript.TransmissionData));
      ocas.onLogin(function (err, authToken) {
        if (err) {
          job.fail({task: "ocasAcquireAuthToken", exception: err});
          cb();
          return;
        }
        // Ok, we have a Transcript saved, now it's time to tell OCAS so they don't send it again.
        ocas.sendAcknowledgmentToOCAS(authToken, transcript, function (err, response, httpOptions) {
          var errorOccured = err || (response && response.statusCode != 200);
          if (errorOccured) {
            // scrub logged data
            httpOptions.headers.Authorization = "scrubbed";
            var failureDetail = {
              task: "sendAcknowledgmentToOCAS"
              , exception: err
              , request: httpOptions
            }
            if (response) {
              failureDetail.response = {
                headers: response.headers
                , body: response.body
                , statusCode: response.statusCode
              };
              var failOptions = {};
              if (response.statusCode >= 400 && response.statusCode < 500) {
                // No point retrying this job because something is wrong with our request
                failOptions.fatal = true;
              }
            }
            job.fail(failureDetail, failOptions);
          } else {
            job.done();
          }
          cb();
        });
      });
    });
  }
}
