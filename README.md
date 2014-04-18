# Pipe

`Pipe` is the client side component for the [BigPipe] framework. It orchestrates
the arrival of [pagelet]'s on the page, loads all assets and setup the real-time
connections. It's the glue between the server and your own client code. While
this library is highly opinionated and developed against the features that are
provided in [BigPipe] we made sure that every piece of code is re-usable by the
community. We've extracted various of components out of this library and
released them as separate projects:

- **[frames]**: A small function for creating and managing iframes in the DOM.
- **[containerization]**: Containerization for front-end code.
- **[alcatraz]**: Wraps and prepares front-end code for containerization.
- **[fortress]**: The Docker of front-end applications. It provides a
  docker like API for controlling the containerization process of multiple
  snippets of code.

## Installation

The code is released through npm, but it doesn't work in Node.js. We merely use
it for dependency management.

```
npm install --save pipe.js
```

We assume that this code is loaded in an environment that has [primus] and it's
[substream] plugin loaded.

## Table of Contents

**BigPipe instance**
- [Configuration](#bigpipe-configuration)
- [Events](#bigpipe-events)
- [BigPipe.arrive](#bigpipearrive)
- [BigPipe.has](#bigpipehas)
- [BigPipe.remove](#bigpiperemove)
- [BigPipe.broadcast](#bigpipebroadcast)

**Pagelet instance**
- [Configuration](#pagelet-configuration);
- [Events](#pagelet-events);

### BigPipe: Configuration

The code introduced to the page as an **`BigPipe`** global. The `BigPipe`
constructor accepts 2 arguments:

1. Location of your BigPipe server. If nothing is provided it assumes that you
   want to connect to the current domain.
2. Configuration or options of the BigPipe instance.

The following options are accepted:

- **limit**: The amount of Pagelets instances we can re-use to reduce garbage
  collections. Defaults to `20`
- **pagelets**: The amount of Pagelets we expect to be loaded on the page. This
  is used to determine the loading/progress of the page.
- **id**: The `id` of the Page that we're loading.

In addition to the options listed above, all options that can be used to
configure [primus] are also supported as this options object is directly passed
to the Primus constructor. The only Primus option that is forced by us is the
**manual** option. As we need to be in control of the opening of the real-time
connection.

```js
var bigpipe = new BigPipe(undefined, { 
  pagelets: 20,
  id: 'ADFASDF0E-2FADAF-24'
});
```

When a new BigPipe instance has been created it will automatically check the
`documentElement` or `<html>` element for the presence of a `no_js` class. When
this class is found it will be automatically removed as JavaScript is obviously
active and working as intended.  In addition to that we also append the class
`pagelets-loading` to the element.

### BigPipe: Events

The created `bigpipe` instance is an [EventEmitter3]. Events that are prefixed
with `<name>` indicates that the `<name>` is the name of the Pagelet that emits
this message.

Event                 | Receives                   | Description
----------------------|----------------------------|--------------------------------
`progress`            | percentage, index, Pagelet | A new Pagelet has been loaded.
`loaded`              |                            | All Pagelets have been loaded.
`create`              | Pagelet                    | A new Pagelet has been created.
`remove`              | Pagelet                    | A pagelet has been removed.
`<name>::error`       | Error                      | We've failed to load the Pagelet.
`<name>::loaded`      |                            | All assets have been loaded.
`<name>::configure`   | Data object                | Pagelet has been configured.
`<name>::initialise`  |                            | Pagelet has been initialised.
`<name>::render`      | html                       | Rendered the HTML.
`<name>::destroy`     |                            | Pagelet has been destroyed.

### BigPipe#arrive

**public**, _returns BigPipe_.

```js
bigpipe.arrive('pagelet name', { data object });
```

When a new Pagelet has been pushed from the server to the client it should be
announced using this method. If we don't have a Pagelet for this name yet we
will automatically create a new Pagelet instance and assign it this name. After
the creation of this Pagelet we emit the `progress` event as new Pagelet has
been loaded.

```js
bigpipe.on('progress', function progress(percentage, index, pagelet) {
  console.log('loaded %s of %s pagelets. We are %s% loaded', this.expected, index, percentage);
});
```

But also an `create` event:

```js
bigpipe.on('create', function create(pagelet) {
  console.log('A new pagelet has been created', pagelet.name);
});
```

If this was the last Pagelet that needed to be loaded we will also emit the
`loaded` event:

```js
bigpipe.on('loaded', function loaded() {
  console.log('All pagelets have been loaded.');
});
```

But just because they have been loaded it doesn't mean that they all have been
rendered as well as assets still need to be loaded.

The options that are provided will be passed in the Pagelet's configuration
method so it can start fetching and rendering the newly received Pagelet. There
is one property that is **required** to be present on the data object:

- **processed**: A number that indicates how many pagelets the server has
  processed. This is used to determine if all Pagelets have been flushed from
  the server.

Please note that in the case of BigPipe this method call is automatically added
at the bottom of the server response. So you don't need to manually invoke this.

```js
bigpipe.arrive("packages", {
  "id":"G1M3RAKQK4V7K3XR-SB00M199BR8DUNMI-9EJZKHLWHE5C23XR-LHXF7DD4SHHQ6W29",
  "css": ["/4200c15db55f69d6038332b69a9099b3d178242f.css"],
  "js":["/97bdbe337bf705ff46b4476ed8a5b65b551106dd.js"],
  "rpc":["autocomplete"],
  "authorized":true,
  "remove":false,
  "processed":1,
  "data":{}
});
```

### BigPipe#has

**public**, _returns boolean_.

```js
bigpipe.has('pagelet name');
```

Check if a Pagelet has already been loaded/received on the page.

### BigPipe#remove

**public**, _returns BigPipe_

```js
bigpipe.remove('pagelet name');
```

Removes a pagelet from our internal Pagelet object. The `remove` event is
emitted before we actually destroy the pagelet that gets removed so you could do
some additional cleanup if needed. After the event is emitted we call the
[Pagelet#destroy](#pageletdestroy) method and remove it from our internal
reference.

```js
bigpipe.on('remove', function (pagelet) {
  console.log('removed', pagelet);
});

bigpipe.remove('pagelet name');
```

### BigPipe#broadcast

**public**, __returns BigPipe__

```js
bigpipe.broadcast(event, [args]);
```

Broadcast will emit the given event on every single added Pagelet instance.

```js
bigpipe.broadcast('hello', 'world');
bigpipe.broadcast('foo bar', 'multiple', 1, 'args', { no: 'problem' });
```
### Pagelet: Configuration

The following options are accepted:

- **id**: The `id` of the Pagelet that we're loading.
- **remove**: Do we need to remove the placeholder from the DOM? You usually
  want to do this with optional pagelets that require authorization.
- **css**: An array of CSS files that need to be loaded before we can display
  the Pagelet's HTML.
- **js**: Array of JS files that need to be loaded before we can display the
  Pagelet's HTML.
- **data**: Addition data that should be made available on the client. This is
  data that you've selected using the
  [Pagelet.query](https://github.com/bigpipe/pagelet#pagelet-query) on the server.
- **rpc**: An array of method names on the server which should be introduced on
  this Pagelet which will do RPC calls.
- **timeout**: The maximum amount of milliseconds we should wait for all the
  Pagelets resources to be loaded. If it takes longer than this we assume a load
  failure.

### Pagelet: Events

The created `Pagelet` instance is an [EventEmitter3]. The following events are
emitted by the Pagelet:

Event                 | Receives                   | Description
----------------------|----------------------------|--------------------------------
`error`               | Error                      | We've failed to load the Pagelet.
`loaded`              |                            | All assets have been loaded.
`configure`           | Data object                | Pagelet has been configured.
`initialise`          |                            | Pagelet has been initialised.
`render`              | html                       | Rendered the HTML.
`destroy`             |                            | Pagelet has been destroyed.

## License

MIT

[BigPipe]: https://bigpipe.io
[pagelet]: https://github.com/bigpipe/pagelet
[primus]: https://github.com/primus/primus
[substream]: https://github.com/primus/substream
[frames]: https://github.com/bigpipe/frames
[containerization]: https://github.com/bigpipe/containerization
[alcatraz]: https://github.com/bigpipe/alcatraz
[fortress]: https://github.com/bigpipe/fortress
[EventEmitter3]: https://github.com/3rd-Eden/EventEmitter3
