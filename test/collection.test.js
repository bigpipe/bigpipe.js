describe('collection', function () {
  'use strict';

  var collection = require('../collection')
    , assume = require('assume');

  describe('.type', function () {
    it('returns the correct type information', function () {
      assume(collection.type([])).to.equal('array');
      assume(collection.type({})).to.equal('object');
      assume(collection.type(0)).to.equal('number');
    });
  });

  describe('.each', function () {
    it('iterates over arrays', function () {
      collection.each([1, 2], function (item, index, arr) {
        assume(item).to.be.a('number');
        assume(index).to.be.a('number');

        assume(item).to.equal(index + 1);
        assume(arr).to.be.a('array');
      });
    });

    it('iterates over objects', function () {
      collection.each({ foo: 'bar', bar: 'bar' }, function (value, key, obj) {
        assume(value).to.be.a('string');
        assume(value).to.equal('bar');

        assume(key).to.be.a('string');
        assume(key).to.have.length(3);

        assume(obj).to.be.a('object');
      });
    });

    it('iterates with context', function () {
      var context = 'foo';

      collection.each([1, 2], function (item, index, arr) {
        var ctx = this.toString();

        assume(ctx).to.be.a('string');
        assume(ctx).to.equal('foo');
        assume(context).to.equal(ctx);
      }, context);
    });
  });

  describe('.empty', function () {
    it('accepts nothing', function () {
      assume(collection.empty()).to.be.a('boolean');
      assume(collection.empty()).to.be.false();
    });

    it('checks arrays', function () {
      assume(collection.empty([])).to.be.a('boolean');
      assume(collection.empty([1])).to.be.a('boolean');

      assume(collection.empty([])).to.be.true();
      assume(collection.empty([1])).to.be.false();
      assume(collection.empty(new Array(0))).to.be.true();
    });

    it('checks objects', function () {
      assume(collection.empty({})).to.be.a('boolean');
      assume(collection.empty({})).to.be.true();
      assume(collection.empty({foo: 0 })).to.be.false();
      assume(collection.empty(new Object())).to.be.true();

      if ('function' === Object.create) {
        assume(collection.empty(Object.create(null))).to.be.true();
      }
    });

    it('checks strings', function () {
      assume(collection.empty('')).to.be.a('boolean');
      assume(collection.empty('')).to.be.true();
      assume(collection.empty('foo')).to.be.false();

      assume(collection.empty(String('foo'))).to.be.false();
      assume(collection.empty(String(''))).to.be.true();
    });
  });

  describe('.index', function () {
    it('finds a string in an array', function () {
      assume(collection.index([1, 'bar'], 'bar')).to.equal(1);
      assume(collection.index([1, 'bar', 'bar'], 'bar')).to.equal(1);
    });

    it('finds nothing', function () {
      assume(collection.index([1], 2)).to.equal(-1);
      assume(collection.index([], 2)).to.equal(-1);
    });
  });

  describe('.copy', function () {
    it('copies the props of 2 objects', function () {
      var y = collection.copy({
        foo: 'bar'
      }, { bar: 'baz' });

      assume(y.foo).to.equal('bar');
      assume(y.bar).to.equal('baz');
      assume(y).to.have.length(2);
    });

    it('copies an array correctly', function () {
      var y = collection.copy({
        foo: [1, 2]
      }, { bar: 'baz' });

      assume(y).to.have.length(2);
      assume(y.foo).to.be.a('array');
      assume(y.foo).to.deep.equal([1, 2]);
      assume(y.bar).to.equal('baz');
    });

    it('allows empty objects', function () {
      var y = collection.copy({}, {});
      assume(y).to.have.length(0);

      y = collection.copy({ foo: 'bar' }, {});
      assume(y.foo).to.equal('bar');
      assume(y).to.have.length(1);

      y = collection.copy({}, { foo: 'bar' });
      assume(y.foo).to.equal('bar');
      assume(y).to.have.length(1);
    });

    it('does not extend the first given object', function () {
      var x = { foo: 'bar' }
        , y = collection.copy(x, { bar: 'baz' });

      assume(x).to.have.length(1);
      assume(y).to.have.length(2);
      assume(y.foo).to.equal('bar');
      assume(y.bar).to.equal('baz');
    });
  });
});
