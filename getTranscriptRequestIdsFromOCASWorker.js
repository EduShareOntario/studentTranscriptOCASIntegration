var config = require('app-config');

var processJobConfig = {
    root : 'student-transcript',
    type : 'getOutboundTranscriptRequestIdsFromOCAS',
    options : {pollInterval:1*30*1000, workTimeout: 3*60*1000},
    ocasUrl : config.settings.requestsNoResponseUrl
}

var createJobConfig = {
    root : 'student-transcript',
    type : 'getTranscriptRequestDetailsFromOCAS'
}

var worker = require ('./getRequestIdsFromOCAS');
worker.start(processJobConfig, createJobConfig);


