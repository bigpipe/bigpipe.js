describe('async', function () {
  'use strict';

  var async = require('../async')
    , assume = require('assume');

  describe('.each', function () {
    it('iterates over the collection asynchronously', function (done) {
      async.each([1, 2], function (item, next) {
        assume(item).to.be.below(3);
        next();
      }, done);
    });

    it('execution time can be limited by timeout', function (done) {
      async.each([1, 2], function (item, next) {
        //
        // Set timeout, such that it at least takes longer than timeout.
        //
        setTimeout(next, 1250);
      }, function (error) {
        assume(error).to.be.instanceof(Error);
        assume(error).to.be.an('object');
        assume(error.message).to.equal('Operation timed out');

        done();
      }, {
        timeout: 1000
      });
    });
  });
});