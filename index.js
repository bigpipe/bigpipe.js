'use strict';

var read = require('fs').readFileSync;
  , Fittings = require('fittings')
  , path = require('path');

module.exports = Fittings.extend({
  library: read(path.join(__dirname, 'bigpipe.js')),
});
