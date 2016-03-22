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

function isEmpty(obj) {

  // null and undefined are "empty"
  if (obj == null) return true;

  // Assume if it has a length property with a non-zero value
  // that that property is correct.
  if (obj.length > 0)    return false;
  if (obj.length === 0)  return true;

  // Otherwise, does it have any properties of its own?
  // Note that this doesn't handle
  // toString and valueOf enumeration bugs in IE < 9
  for (var key in obj) {
    if (hasOwnProperty.call(obj, key)) return false;
  }

  return true;
}

module.exports = {
  onSuccess : onSuccess,
  isEmpty : isEmpty
}