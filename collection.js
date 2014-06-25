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
      if (false === iterator.call(context || iterator, collection[i], i, collection)) {
        return; // If false is returned by the callback we need to bail out.
      }
    }
  } else {
    for (i in collection) {
      if (hasOwn.call(collection, i)) {
        if (false === iterator.call(context || iterator, collection[i], i, collection)) {
          return; // If false is returned by the callback we need to bail out.
        }
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
  if ('arguments' === type(obj)) return Array.prototype.slice.call(obj, 0);

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
  if ('function' === typeof arr.indexOf) return arr.indexOf(o);

  for (
    var j = arr.length,
        i = i < 0 ? i + j < 0 ? 0 : i + j : i || 0;
    i < j && arr[i] !== o;
    i++
  );

  return j <= i ? -1 : i;

}

/**
 * Merge all given objects in to one objects.
 *
 * @returns {Object}
 * @api public
 */
function copy() {
  var result = {}
    , depth = 2
    , seen = [];

  (function worker() {
    each(array(arguments), function each(obj) {
      for (var prop in obj) {
        if (hasOwn.call(obj, prop) && !~index(seen, obj[prop])) {
          if (type(obj[prop]) !== 'object' || !depth) {
            result[prop] = obj[prop];
            seen.push(obj[prop]);
          } else {
            depth--;
            worker(result[prop], obj[prop]);
          }
        }
      }
    });
  }).apply(null, arguments);

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
