module.exports = {
    userName : 'xxxxxxxxxxxxxxxxxxxxxxxx',
    passWord : 'xxxxxxxxxxxxx',
    grantType : 'xxxxxxxxxxxxx',
    loginUrl: 'https://etms.uat.ocas.ca/api/auth/login',
    transcriptsNoResponseUrl : 'https://etms.uat.ocas.ca/api/transcripts/no_response',
    transcriptDetailUrl : 'https://etms.uat.ocas.ca/api/transcripts/',
    requestsNoResponseUrl : 'https://etms.uat.ocas.ca/api/transcriptrequests/no_response',
    transcriptRequestUrl : 'https://etms.uat.ocas.ca/api/transcriptrequests/',
    sendTranscriptUrl : 'https://etms.uat.ocas.ca/api/transcriptrequests/',
    transcriptToHtmlURL: "https://xxxxxx.com/transformdoc",
    transcriptAcknowledgmentUrl: "transcripts/:requestId/acknowledgment",
    ddpUrl: 'ws://xxxxx.com/path/websocket',
    ddpUser : 'xxxxxxxxxxxxxxxxx',
    ddpPassword : 'xxxxxxxxxxxxx',
    jobCollectionName: 'student-transcript',
    dbConfig : {
        user: 'xx',
        password: 'xx',
        connectString: 'localhost/xe',
        poolMax: 20,
        poolMin: 2,
        poolIncrement: 2,
        poolTimeout: 10
    },
    appxtenderURL: 'http://tsdocumentum01/AppXtenderServices/AxServicesInterface.asmx?WSDL',
    appxtenderUser: '**',
    appxtenderPass: '**',
    appxtenderDSN: 'UPG3',
    appxtenderAppId: '522',
    // The following must point to the same shared filesystem path
    appxtenderFilePath: 'E:/DOCUMENTUM/incoming_transcripts/',
    localFilePath: "z:/DOCUMENTUM/incoming_transcripts/"
}