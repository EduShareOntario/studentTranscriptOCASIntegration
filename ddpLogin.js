var DDP = require('ddp');
var config = require('app-config');

/**
 * The callback will be called with ddp object.
 * @param cb
 */
function onSuccess(cb) {
  // Setup the DDP connection
  var ddp = new DDP({
    url: config.settings.ddpUrl
  });

  function ddpLoginCB(err, res) {
    console.log("ddpLogin err:"+JSON.stringify(err)+", res: "+JSON.stringify(res));
    if (err)
      //todo what if I can't connect
      throw err;

    cb(ddp);
  }

  // Open the DDP connection
  ddp.connect(function(err, wasReconnect) {
    if (err) {
      throw err;
    }
    var options = {
      username: config.settings.ddpUser,
      pass: config.settings.ddpPassword,
      ldap: true
    };
    ddp.call ("login", [options], ddpLoginCB);
  });
}

module.exports = {
  onSuccess : onSuccess
}