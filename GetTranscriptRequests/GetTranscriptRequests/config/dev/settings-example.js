// you need to create a settings.js in both the dev and prod folders under the config node
// and insert the values for your institution
module.exports = {
    userName : 'yourusernamehere',
    passWord : 'yourpasswordhere',
    grantType : 'yourgrantypehere',
    loginUrl: 'https://etms.uat.ocas.ca/api/auth/login',
    requestsNoResponseUrl : 'https://etms.uat.ocas.ca/api/transcriptrequests/no_response',
    transcriptRequestUrl : 'https://etms.uat.ocas.ca/api/transcriptrequests/'
}