process.env.NODE_ENV = "dev";

var https = require('https');
var request = require('request');
var DDP = require('ddp');
var DDPlogin = require('ddp-login');
var Job = require('meteor-job');
var config = require('app-config');
var oracledb = require('oracledb');
var xml2js = require('xml2js');

// Setup the DDP connection
var ddp = new DDP({
    host: config.settings.ddpHost,
    port: config.settings.ddpPort,
    use_ejson: true
});

Job.setDDP(ddp);

// Open the DDP connection
ddp.connect(function (err) {
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
    checkForTranscriptsToProcess();
}

function checkForTranscriptsToProcess() {
    console.log("Processing transcripts");
    var workers = Job.processJobs('student-transcript-out', 'transcriptRequests', 
	  function (job, cb) {
        // This will only be called if a job is obtained from Job.getWork()         
        console.log("here");
        var parser = new xml2js.Parser({
            attrkey:  '@',
            xmlns:  false,  
            ignoreAttrs:  true,
            explicitArray: false,
            tagNameProcessors: [xml2js.processors.stripPrefix]
        });
        parser.parseString(job._doc.data.requestDetails, 
           function (err, result) {
            //todo                            
            console.log(result.TranscriptRequest);
        });
        // Be sure to invoke the callback when this job has been 
        // completed or failed. 
        cb();	 
    });   
}