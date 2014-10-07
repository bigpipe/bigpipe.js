/*globals */
'use strict';

var EventEmitter = require('eventemitter3')
  , collection = require('./collection')
  , AsyncAsset = require('async-asset')
  , Fortress = require('fortress')
  , async = require('./async')
  , val = require('parsifal')
  , sandbox
  , undef;

//
// Async Asset loader.
//
var assets = new AsyncAsset();

/**
 * Representation of a single pagelet.
 *
 * @constructor
 * @param {BigPipe} bigpipe The BigPipe instance that was created.
 * @api public
 */
function Pagelet(bigpipe) {
  EventEmitter.call(this);

  this.orchestrate = bigpipe.orchestrate;
  this.bigpipe = this.pipe = bigpipe;
  this.stream = bigpipe.stream;

  //
  // Create one single Fortress instance that orchestrates all iframe based client
  // code. This sandbox variable should never be exposed to the outside world in
  // order to prevent leaking.
  //
  this.sandbox = sandbox = sandbox || new Fortress();
}

//
// Inherit from EventEmitter.
//
Pagelet.prototype = new EventEmitter();
Pagelet.prototype.constructor = Pagelet;

/**
 * Configure the Pagelet.
 *
 * @param {String} name The given name of the pagelet.
 * @param {Object} data The data of the pagelet.
 * @param {Array} roots HTML root elements search for targets.
 * @api private
 */
Pagelet.prototype.configure = function configure(name, data, roots) {
  var bigpipe = this.bigpipe
    , pagelet = this;

  //
  // Pagelet identification.
  //
  pagelet.id = data.id;                          // ID of the pagelet.
  pagelet.name = name;                           // Name of the pagelet.
  pagelet.rpc = collection.array(data.rpc);      // Pagelet RPC methods.
  pagelet.css = collection.array(data.css);      // CSS for the Page.
  pagelet.js = collection.array(data.js);        // Dependencies for the page.
  pagelet.run = data.run;                        // Pagelet client code.
  pagelet.data = data.data;                      // All the template data.
  pagelet.mode = data.mode;                      // Fragment rendering mode.
  pagelet.streaming = !!data.streaming;          // Are we streaming POST/GET.
  pagelet.container = pagelet.sandbox.create();  // Create an application sandbox.
  pagelet.timeout = data.timeout || 25 * 1000;   // Resource loading timeout.
  pagelet.hash = data.hash;                      // Hash of the template.
  pagelet.loader = data.loader || '';            // Loading placeholder.
  pagelet.lastclick = document.body;             // The last clicked element.
  pagelet.append = data.append || false;         // Append content to the container.

  //
  // This pagelet was actually part of a parent pagelet, so set a reference to
  // the parent pagelet that was loaded.
  //
  var parent = pagelet.parent = data.parent
    ? bigpipe.get(data.parent)
    : undef;

  //
  // Locate all the placeholders for this given pagelet.
  //
  pagelet.placeholders = pagelet.$('data-pagelet', name, roots);

  //
  // Destroy the pagelet as we've been given the remove flag.
  // However do not destroy assets as unauthorized pagelets won't register
  // assets in the first place and they might be used by other pagelets.
  //
  if (data.remove) return pagelet.destroy({
    assets: false,
    remove: true
  });

  //
  // If we don't have any loading placeholders we want to scan the current
  // placeholders for content and assume that this content should be used when
  // the pagelet is loading or re-loading content. This also needs to be done
  // BEFORE we render the template from the server or we will capture the wrong
  // piece of HTML.
  //
  if (!pagelet.loader) collection.each(pagelet.placeholders, function each(node) {
    if (pagelet.loader) return false;

    var html = (node.innerHTML || '').replace(/^\s+|\s+$/g, '');
    if (html.length) pagelet.loader = html;

    return !pagelet.loader;
  });

  //
  // Attach event listeners for FORM posts so we can intercept those.
  //
  pagelet.listen();

  //
  // Create a real-time Substream over which we can communicate over without.
  //
  pagelet.substream = pagelet.stream.substream(pagelet.name);
  pagelet.substream.on('data', function data(packet) {
    pagelet.processor(packet);
  });

  //
  // Register the pagelet with the BigPipe server as an indication that we've
  // been fully loaded and ready for action.
  //
  pagelet.orchestrate.write({ type: 'pagelet', name: name, id: pagelet.id });

  //
  // Generate the RPC methods that we're given by the server. We will make the
  // assumption that:
  //
  // - A callback function is always given as last argument.
  // - The function should return it self in order to chain.
  // - The function given supports and uses error first callback styles.
  // - Does not override the build-in prototypes of the Pagelet.
  //
  collection.each(pagelet.rpc, function rpc(method) {
    var counter = 0;

    //
    // Never override build-in methods as this WILL affect the way a Pagelet is
    // working.
    //
    if (method in Pagelet.prototype) return;

    pagelet[method] = function rpcfactory() {
      var args = Array.prototype.slice.call(arguments, 0)
        , id = method +'#'+ (++counter);

      pagelet.once('rpc:'+ id, args.pop());
      pagelet.substream.write({ method: method, type: 'rpc', args: args, id: id });

      return pagelet;
    };
  });

  //
  // Should be called before we create `rpc` hooks.
  //
  pagelet.broadcast('configured', data);

  async.each(this.css.concat(this.js), function download(url, next) {
    assets.add(url, next);
  }, function done(err) {
    if (err) return pagelet.broadcast('error', err);

    pagelet.broadcast('loaded');
    pagelet.render(pagelet.parse());

    //
    // All resources are loaded, but we have a parent element. When the parent
    // element renders it will most likely also nuke our placeholder references
    // preventing us from rendering updates again.
    //
    if (parent) parent.on('render', function render() {
      pagelet.placeholders = pagelet.$('data-pagelet', pagelet.name, parent.placeholders);
      pagelet.listen();
      pagelet.render(pagelet.parse() || pagelet.data);
    });

    pagelet.initialize();
  }, { context: this.bigpipe, timeout: this.timeout });
};

/**
 * Get the template for a given type. We currently only support `client` and
 * `error` as types.
 *
 * @param {String} type Template type
 * @returns {Function}
 * @api private
 */
Pagelet.prototype.template = function template(type) {
  type = type || 'client';

  return this.bigpipe.templates[this.hash[type]];
};

/**
 * Get a pagelet loaded on the page. If we have
 *
 * @param {String} name Name of the pagelet we need.
 * @returns {Pagelet|Undefined}
 */
Pagelet.prototype.pagelet = function pagelet(name) {
  return this.bigpipe.get(name, this.name);
};

/**
 * Intercept form posts and stream them over our substream instead to prevent
 * full page reload.
 *
 * @returns {Pagelet}
 * @api private
 */
Pagelet.prototype.listen = function listen() {
  var pagelet = this;

  /**
   * Handles the actual form submission.
   *
   * @param {Event} evt The submit event.
   * @api private
   */
  function submission(evt) {
    evt = evt || window.event;

    var form = evt.target || evt.srcElement;

    //
    // In previous versions we had and `evt.preventDefault()` so we could make
    // changes to the form and re-submit it. But there's a big problem with that
    // and that is that in FireFox it loses the reference to the button that
    // triggered the submit. If causes buttons that had a name and value:
    //
    // ```html
    // <button name="key" value="value" type="submit">submit</button>
    // ```
    //
    // To be missing from the POST or GET. We managed to go around it by not
    // simply preventing the default action. If this still does not not work we
    // need to transform the form URLs once the pagelets are loaded.
    //
    if (
         ('getAttribute' in form && form.getAttribute('data-pagelet-async') === 'false')
      || !pagelet.streaming
    ) {
      var action = form.getAttribute('action')
        , _pagelet = '_pagelet='+ pagelet.name;

      if (!~action.indexOf(_pagelet)) {
        form.setAttribute('action', action +(
          ~action.indexOf('?') ? '&' : '?'
        )+ _pagelet);
      }

      return;
    }

    //
    // As we're submitting the form over our real-time connection and gather the
    // data our self we can safely prevent default.
    //
    evt.preventDefault();
    pagelet.submit(form, pagelet.activeElement(evt));
  }

  /**
   * We need cross browser way of getting the last clicked active element.
   * `document.activeElement` seems to return `document.body` after you've
   * clicked a button. So the only way we can get access to a button or input
   * button is to listen to click events and hope that they emitted AFTER
   */
  function active(evt) {
    evt = evt || window.event;
    pagelet.lastclick = evt.target || evt.srcElement;
  }

  collection.each(this.placeholders, function each(root) {
    root.addEventListener('submit', submission, false);
    root.addEventListener('click', active, false);
  });

  //
  // When the pagelet is removed we want to remove our listeners again. To
  // prevent memory leaks as well possible duplicate listeners when a pagelet is
  // loaded in the same placeholder (in case of a full reload).
  //
  return this.once('destroy', function destroy() {
    collection.each(pagelet.placeholders, function each(root) {
      root.removeEventListener('submit', submission, false);
      root.removeEventListener('click', active, false);
    });
  });
};

/**
 * Submit the contents of a <form> to the server.
 *
 * @param {FormElement} form Form that needs to be submitted.
 * @param {Element} active Element that initated the submit.
 * @returns {Object} The data that is ported to the server.
 * @api public
 */
Pagelet.prototype.submit = function submit(form, active) {
  var elements = form.elements
    , data = {}
    , element
    , i;

  active = active || this.activeElement();

  //
  // Story time children! Once upon a time there was a developer, this
  // developer created a form with a lot of submit buttons. The developer
  // knew that when a user clicked on one of those buttons the value="" and
  // name="" attributes would get send to the server so he could see which
  // button people had clicked. He implemented this and all was good. Until
  // someone captured the `submit` event in the browser which didn't have
  // a reference to the clicked element. This someone found out that the
  // `document.activeElement` pointed to the last clicked element and used
  // that to restore the same functionality and the day was saved again.
  //
  // There are valuable lessons to be learned here. Submit buttons are the
  // suck. PERIOD.
  //
  if (active && active.name) {
    data[active.name] = active.value;
  }

  for (i = 0; i < elements.length; i++) {
    element = elements[i];

    if (
         element.name
      && !(element.name in data)
      && element.disabled === false
      && /^(?:input|select|textarea|keygen)/i.test(element.nodeName)
      && !/^(?:submit|button|image|reset|file)$/i.test(element.type)
      && (element.checked || !/^(?:checkbox|radio)$/i.test(element.type))
    ) data[element.name] = val(element);
  }

  //
  // Now that we have a JSON object, we can just send it over our real-time
  // connection and wait for a page refresh.
  //
  this.broadcast('submit', (form.method || 'GET').toLowerCase(), data);
  this.substream.write({
    type: (form.method || 'GET').toLowerCase(),
    body: data
  });
  this.loading();

  return data;
};

/**
 * Get the last clicked and therefor active element from the page.
 *
 * @param {Event} evt Optional event to search.
 * @returns {Element}
 * @api private
 */
Pagelet.prototype.activeElement = function activeElement(evt) {
  return (evt || {}).explicitOriginalTarget || this.lastclick;
};

/**
 * Get the pagelet contents once again.
 *
 * @returns {Pagelet}
 * @api public
 */
Pagelet.prototype.get = function get() {
  this.substream.write({ type: 'get' });

  return this.loading();
};

/**
 * Process the incoming messages from our SubStream.
 *
 * @param {Object} packet The decoded message.
 * @returns {Boolean}
 * @api private
 */
Pagelet.prototype.processor = function processor(packet) {
  if ('object' !== typeof packet) return false;

  switch (packet.type) {
    case 'rpc':
      EventEmitter.prototype.emit.apply(this, [
        'rpc:'+ packet.id
      ].concat(packet.args || []));
    break;

    case 'event':
      if (packet.args && packet.args.length && !this.reserved(packet.args[0])) {
        EventEmitter.prototype.emit.apply(this, packet.args);
      }
    break;

    case 'fragment':
      this.loading(true);
      this.render(packet.frag.view);
    break;

    case 'err':
      var err = new Error(packet.err.message || 'RPC error');

      if (packet.err.stack) err.stack = packet.err.stack;
      this.render(err);
    break;

    case 'redirect':
      window.location.href = packet.url;
    break;

    default:
      return false;
  }

  return true;
};

/**
 * The Pagelet's resource has all been loaded.
 *
 * @api private
 */
Pagelet.prototype.initialize = function initialise() {
  this.broadcast('initialize');

  //
  // Only load the client code in a sandbox when it exists. There no point in
  // spinning up a sandbox if it does nothing
  //
  if (!this.code) return;
  this.sandbox(this.prepare(this.code));
};

/**
 * Emit events on the server side Pagelet instance.
 *
 * @param {String} event Name of the event you wish to emit on the server.
 * @returns {Boolean}
 * @api public
 */
Pagelet.prototype.emit = function emit(event) {
  this.substream.write({
    args: Array.prototype.slice.call(arguments, 0),
    type: 'emit'
  });

  return true;
};

/**
 * Broadcast an event that will be emitted on the pagelet and the page.
 *
 * @param {String} event The name of the event we should emit
 * @returns {Pagelet}
 * @api public
 */
Pagelet.prototype.broadcast = function broadcast(event) {
  var pagelet = this;

  /**
   * Broadcast the event with namespaced name.
   *
   * @param {String} name Event name.
   * @returns {Pagelet}
   * @api private
   */
  function shout(name) {
    pagelet.bigpipe.emit.apply(pagelet.bigpipe, [
      name.join(':'),
      pagelet
    ].concat(Array.prototype.slice.call(arguments, 1)));

    return pagelet;
  }

  EventEmitter.prototype.emit.apply(this, arguments);

  if (this.parent) shout([this.parent.name, this.name, event]);
  return shout([this.name, event]);
};

/**
 * Check if the event we're about to emit is a reserved event and should be
 * blocked.
 *
 * @param {String} event Name of the event we want to emit
 * @returns {Boolean}
 * @api public
 */
Pagelet.prototype.reserved = function reserved(event) {
  return /^rpc:\d+/.test(event)
  || event in this.reserved.events;
};

/**
 * The events that are used internally.
 *
 * @type {Object}
 * @api private
 */
Pagelet.prototype.reserved.events = {
  configured: 1,    // Pagelet has been configured.
  error: 1,         // Something when wrong in the Pagelet.
  loaded: 1,        // All assets has been loaded.
  submit: 1,        // We've submitted a form.
  initialize: 1,    // Pagelet has been fully initialized, ready to go.
  render: 1,        // Pagelet has rendered new HTML.
  destroy: 1        // Pagelet has been destroyed.
};

/**
 * Find the element based on the attribute and value.
 *
 * @param {String} attribute The name of the attribute we're searching.
 * @param {String} value The value that the attribute should equal to.
 * @param {Array} root Optional array of root elements.
 * @returns {Array} A list of HTML elements that match.
 * @api public
 */
Pagelet.prototype.$ = function $(attribute, value, roots) {
  var elements = [];

  collection.each(roots || [document], function each(root) {
    if ('querySelectorAll' in root) return Array.prototype.push.apply(
      elements,
      root.querySelectorAll('['+ attribute +'="'+ value +'"]')
    );

    //
    // No querySelectorAll support, so we're going to do a full DOM scan in
    // order to search for attributes.
    //
    for (var all = root.getElementsByTagName('*'), i = 0, l = all.length; i < l; i++) {
      if (value === all[i].getAttribute(attribute)) {
        elements.push(all[i]);
      }
    }
  });

  return elements;
};

/**
 * Invoke the correct render method for the pagelet.
 *
 * @param {String|Object} html The HTML or data that needs to be rendered.
 * @returns {Boolean} Successfully rendered a pagelet.
 * @api public
 */
Pagelet.prototype.render = function render(html) {
  if (!this.placeholders.length) return false;

  var mode = this.mode in this ? this[this.mode] : this.html
    , template = this.template('client');

  //
  // We have been given an object instead of pure HTML so we are going to make
  // the assumption that this is data for the client side template and render
  // that our selfs. If no HTML is supplied we're going to use the data that has
  // been send to the client
  //
  if (
       'function' === collection.type(template)
    && (
      'object' === collection.type(html)
      || undef === html && 'object' === collection.type(this.data)
      || html instanceof Error
    )) {
    try {
      if (html instanceof Error) throw html; // So it's captured an processed as error
      html = template(collection.copy(html || {}, this.data || {}));
    }
    catch (e) {
      html = this.template('error')(collection.copy(html || {}, this.data || {}, {
        reason: 'Failed to render: '+ this.name,
        message: e.message,
        stack: e.stack,
        error: e
      }));
    }
  }

  collection.each(this.placeholders, function each(root) {
    mode.call(this, root, html);
  }, this);

  //
  // Register the name of the rendered pagelet as child pagelets
  // might be waiting for it. The length of the collection
  // is also used to keep track of the number of rendered pagelets.
  //
  this.bigpipe.rendered.push(this.name);
  this.broadcast('render', html);

  return true;
};

/**
 * Render the fragment as HTML (default).
 *
 * @param {Element} root Container.
 * @param {String} content Fragment content.
 * @api public
 */
Pagelet.prototype.html = function html(root, content) {
  this.createElements(root, content);
};

/**
 * Render the fragment as SVG.
 *
 * @param {Element} root Container.
 * @param {String} content Fragment content.
 * @api public
 */
Pagelet.prototype.svg = function svg(root, content) {
  this.createElements(root, content);
};

/**
 * Get the element namespaceURI description based on mode.
 *
 * @param {String} mode Mode the pagelet will be rendered in.
 * @return {String} Element namespace.
 * @api private
 */
Pagelet.prototype.getElementNS = function getElementNS(mode) {
  mode = mode.toLowerCase();

  switch(mode) {
    case 'svg': return 'http://www.w3.org/2000/svg';
    default: return 'http://www.w3.org/1999/xhtml';
  }
};

/**
 * Create elements by namespace and via a document fragment.
 *
 * @param {Element} root Container.
 * @param {String} content Fragment content.
 * @api private
 */
Pagelet.prototype.createElements = function createElements(root, content) {
  var fragment = document.createDocumentFragment()
    , div = document.createElementNS(this.getElementNS(this.mode), 'div')
    , borked = this.bigpipe.IEV < 7;

  //
  // Clean out old HTML before we append our new HTML or we will get duplicate
  // DOM. Or there might have been a loading placeholder in place that needs
  // to be removed. If elements need to be appended only move the elements from
  // the root to the new fragment.
  //
  while (root.firstChild) {
    if (this.append) {
      fragment.appendChild(root.firstChild);
      continue;
    }

    root.removeChild(root.firstChild);
  }

  if (borked) root.appendChild(div);

  div.innerHTML = content;

  while (div.lastChild) {
    fragment.insertBefore(div.lastChild, fragment.firstChild);
  }

  root.appendChild(fragment);
  if (borked) root.removeChild(div);
};

/**
 * Parse the included template from the comment node so it can be injected in to
 * the page as initial rendered view.
 *
 * @returns {String} View.
 * @api private
 */
Pagelet.prototype.parse = function parse() {
  var node = this.$('data-pagelet-fragment', this.name)[0]
    , comment;

  //
  // The firstChild of the fragment should have been a HTML comment, this is to
  // prevent the browser from rendering and parsing the template.
  //
  if (!node.firstChild || node.firstChild.nodeType !== 8) return;

  comment = node.firstChild.nodeValue;

  return comment
    .substring(1, comment.length -1)
    .replace(/\\([\s\S]|$)/g, '$1');
};

/**
 * Set the pagelet in a loading state.
 *
 * @param {Boolean} unloading We're not loading, but unloading.
 * @returns {Pagelet}
 * @api public
 */
Pagelet.prototype.loading = function loading(unloading) {
  if (!unloading) this.render(
    'function' !== typeof this.loader
      ? this.loader || ''
      : this.loader()
  );

  collection.each(this.placeholders, !unloading ? function add(node) {
    var className = (node.className || '').split(' ');

    if (!~collection.index(className, 'loading')) {
      className.push('loading');
      node.className = className.join(' ');
    }

    node.style.cursor = 'wait';
  } : function remove(node) {
    var className = (node.className || '').split(' ')
      , index = collection.index(className, 'loading');

    if (~index) {
      className.splice(index, 1);
      node.className = className.join(' ');
    }

    node.style.cursor = '';
  });

  return this;
};

/**
 * Destroy the pagelet and clean up all references so it can be re-used again in
 * the future.
 *
 * Options:
 *
 * - assets: Also remove assets, true by default can be set to false to keep.
 * - remove: Remove the DOM node after deletion.
 *
 * @param {Object} options Destruction information.
 * @api public
 */
Pagelet.prototype.destroy = function destroy(options) {
  var pagelet = this;

  options = options || {};

  //
  // Execute any extra destroy hooks. This needs to be done before we remove any
  // elements or destroy anything as there might people subscribed to these
  // events.
  //
  this.broadcast('destroy', options);

  //
  // Remove all the HTML from the placeholders.
  //
  if (this.placeholders) collection.each(this.placeholders, function remove(root) {
    if (options.remove && root.parentNode) root.parentNode.removeChild(root);
    else while (root.firstChild) root.removeChild(root.firstChild);
  });

  //
  // Remove the added RPC handlers, make sure we don't delete prototypes.
  //
  if (this.rpc.length) collection.each(this.rpc, function nuke(method) {
    if (method in Pagelet.prototype) return;
    delete pagelet[method];
  });

  //
  // Remove the sandboxing and prevent element leaking by deferencing them.
  //
  if (this.container) sandbox.kill(this.container.id);
  this.placeholders = this.container = this.lastclick = null;

  //
  // Announce the destruction and remove it.
  //
  if (this.substream) this.substream.end();

  //
  // Remove the CSS and JS assets.
  //
  if (options.assets !== false) {
    collection.each(this.css.concat(this.js), function remove(url) {
      assets.remove(url);
    });
  }

  //
  // Everything has been cleaned up, release it to our free list Pagelet pool.
  //
  this.bigpipe.free(this);

  return this;
};

//
// Expose the module.
//
module.exports = Pagelet;
