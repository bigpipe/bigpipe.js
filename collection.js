'use strict';

var hasOwn = Object.prototype.hasOwnProperty
  , undef;

/**
 * Get an accurate type check for the given Object.
 *
 * @param {Mixed} obj The object that needs to be detected.
 * @returns {String} The object type.
 * @api public
 */
function type(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
}

/**
 * Iterate over a collection.
 *
 * @param {Mixed} collection The object we want to iterate over.
 * @param {Function} iterator The function that's called for each iteration.
 * @param {Mixed} context The context of the function.
 * @api public
 */
function each(collection, iterator, context) {
  var i = 0;

  if ('array' === type(collection)) {
    for (; i < collection.length; i++) {
      iterator.call(context || iterator, collection[i], i, collection);
    }
  } else {
    for (i in collection) {
      if (hasOwn.call(collection, i)) {
        iterator.call(context || iterator, collection[i], i, collection);
      }
    }
  }
}

/**
 * Checks if the given object is empty. The only edge case here would be
 * objects. Most object's have a `length` attribute that indicate if there's
 * anything inside the object.
 *
 * @param {Mixed} collection The collection that needs to be checked.
 * @returns {Boolean}
 * @api public
 */
function empty(obj) {
  if (undef === obj) return false;

  return size(obj) === 0;
}

/**
 * Determine the size of a collection.
 *
 * @param {Mixed} collection The object we want to know the size of.
 * @returns {Number} The size of the collection.
 * @api public
 */
function size(collection) {
  var x, i = 0;

  if ('object' === type(collection)) {
    for (x in collection) i++;
    return i;
  }

  return +collection.length;
}

/**
 * Wrap the given object in an array if it's not an array already.
 *
 * @param {Mixed} obj The thing we might need to wrap.
 * @returns {Array} We promise!
 * @api public
 */
function array(obj) {
  if ('array' === type(obj)) return obj;

  return obj  // Only transform objects in to an array when they exist.
    ? [obj]
    : [];
}

/**
 * Find the index of an item in the given array.
 *
 * @param {Array} arr The array we search in
 * @param {Mixed} o The object/thing we search for.
 * @returns {Number} Index of the thing.
 * @api public
 */
function index(arr, o) {
  for (
    var j = arr.length,
        i = i < 0 ? i + j < 0 ? 0 : i + j : i || 0;
    i < j && arr[i] !== o;
    i++
  );

  return j <= i ? -1 : i;

}

/**
 * Merge two objects.
 *
 * @param {Object} one The main object.
 * @param {Object} two Property overrides.
 * @param {Number} deep Depth of cloning.
 * @param {Array} seen Array of props we've seen before.
 * @returns {Object}
 * @api public
 */
function copy(one, two, deep, lastseen) {
  var depth = 'number' === type(deep) ? deep : 2
    , seen = lastseen || []
    , result = {};

  each([one, two], function each(obj) {
    for (var prop in obj) {
      if (hasOwn.call(obj, prop) && index(seen, prop) < 0) {
        if (typeof obj[prop] !== 'object' || !depth) {
          result[prop] = obj[prop];
          seen.push(obj[prop]);
        } else {
          copy(result[prop], obj[prop], depth - 1, seen);
        }
      }
    }
  });

  return result;
}

//
// Expose the collection utilities.
//
exports.array = array;
exports.empty = empty;
exports.index = index;
exports.copy = copy;
exports.size = size;
exports.type = type;
exports.each = each;
