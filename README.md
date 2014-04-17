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

**Pagelet instance**

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

### BigPipe#arrive

_public_, **returns BigPipe**.

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

_public_, **returns boolean**.

```js
bigpipe.has('pagelet name');
```

Check if a Pagelet has already been loaded/received on the page.

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
