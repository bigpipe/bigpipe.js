describe('pipe', function () {
  'use strict';

  var collection = require('../index')
    , assume = require('assume');

  describe('.arrive', function () {
    it('registers event listeners for each pagelet.render');
    it('emits finished when all authorized pagelets have been processed and rendered');
    it('keeps track of the number of allowed pagelets');
  });
});