// Copyright 2016, EMC, Inc.

'use strict';

var express = require('express');
var cors = require('cors');
var fs = require('fs');
var http = require('http');
var https = require('https');

module.exports = webSocketServiceFactory;

webSocketServiceFactory.$provide = 'Services.WebSocket';
webSocketServiceFactory.$inject = [
  'Logger',
  'Services.Configuration',
  'uuid',
  'WebSocketError',
  'WebSocketResources',
  'WebSocketServer'
];

function webSocketServiceFactory(
    Logger,
    serviceConfiguration,
    uuid,
    WebSocketError,
    webSocketResources,
    WebSocketServer
) {
    var logger = Logger.initialize(webSocketServiceFactory);

    class WebSocketService {
        constructor() {
            this.handlers = this._defaultMessageHandlers(),
            this.resources = webSocketResources;
            this.sessions = {};
            var app = express();
            app.use(cors());
            app.options('*', cors());
            app.get('/', function(req, res) {
                res.send('RackHD WebSocketServer');
            });
            this.app = app;
            this.ssl = serviceConfiguration.get('wssSsl', false);
            if (this.ssl) {
                var pfxPath = serviceConfiguration.get('wssSslPfx');
                if (pfxPath) {
                    this.sslOptions = {pfx: fs.readFileSync(pfxPath)};
                } else {
                    var certPath = serviceConfiguration.get('wssSslCert', 'data/dev-cert.pem'),
                        keyPath = serviceConfiguration.get('wssSslKey', 'data/dev-key.pem')
                    this.sslOptions = {
                        cert: fs.readFileSync(certPath),
                        key: fs.readFileSync(keyPath)
                    };
                }
            }
            this.serverOptions = {
                address: serviceConfiguration.get('wssBindAddress', '0.0.0.0'),
                port: serviceConfiguration.get('wssBindPort', 9100)
            }
            console.log(this.serverOptions, this.sslOptions);
            this.server = this.ssl ?
                https.createServer(this.sslOptions, app) :
                http.createServer(app);
            this.wssOptions = {
                server: this.server
            };
        }

        error(wsError) { logger.error(wsError.message, wsError); }

        broadcast(data, skipFunc) {
            if (!this.webSocketServer) {
                this.error(new WebSocketError('Broadcast failed, no server is available.'));
            }
            const wsClientBroadcast = wsConn => {
                if (typeof skipFunc === 'function' && skipFunc(wsConn)) { return; }
                try { wsConn.send(data); } catch (err) {
                    logger.warning('Failed to send message to client: %s'.format(wsConn.id));
                    this._closeConnection(wsConn);
                }
            }
            this.webSocketServer.clients.forEach(wsClientBroadcast);
        }

        start(callback) {
            try {
                logger.info('Creating WebSocketServer, and initializing WebSocketService...');
                this.webSocketServer = new WebSocketServer(this.wssOptions);
                this.webSocketServer.on('connection', this._handleConnection.bind(this));
            }
            catch (err) {
                this.error(new WebSocketError(err.message, {originalError: err}));
            }
            return new Promise(function(resolve, reject) {
                return this.server.listen(
                    this.serverOptions.port,
                    this.serverOptions.address,
                    function(error) {
                        if (error) {
                            this.error(error);
                            callback(error);
                            return reject(error);
                        }
                        logger.info('WebSocketServer is listening on ' +
                            this.serverOptions.address + ':' +
                            this.serverOptions.port + '...');
                        callback();
                        resolve();
                    }.bind(this)
                );
            }.bind(this));
        }

        stop(callback) {
            logger.info('Stopping WebSocketService...');
            if (this.webSocketServer) { this.webSocketServer.close(callback); }
            delete this.webSocketServer;
        }

        _closeConnection(wsConn) {
            if (!this.sessions[wsConn.id]) { return; }
            logger.debug('Client: %s disconnected from WebSocketServer.'.format(wsConn.id));
            delete this.sessions[wsConn.id];
            if (wsConn.watchers) {
                Object.keys(wsConn.watchers).forEach(watcherHash => {
                    var watcherList = wsConn.watchers[watcherHash];
                    watcherList && watcherList.forEach(watcher => watcher && watcher.dispose());
                });
                delete wsConn.watchers;
            }
            try { wsConn.terminate(); } catch (err) {}
        }

        _defaultMessageHandlers() {
            return {
                error:  msg => this.error(msg.message, {errorObject: msg}),
                init:  (msg, wsConn) => wsConn.sendSession(),
                all:   (msg, wsConn, rawMsg) => this._forwardResourceMethod('all', msg, wsConn, rawMsg),
                get:   (msg, wsConn, rawMsg) => this._forwardResourceMethod('get', msg, wsConn, rawMsg),
                query: (msg, wsConn, rawMsg) => this._forwardResourceMethod('query', msg, wsConn, rawMsg),
                stop:  (msg, wsConn, rawMsg) => this._forwardResourceMethod('stop', msg, wsConn, rawMsg),
                watch: (msg, wsConn, rawMsg) => this._forwardResourceMethod('watch', msg, wsConn, rawMsg)
            };
        }

        _forwardResourceMethod(method, msg, wsConn, rawMsg) {
            logger.debug('Client: %s requested a resource call.'.format(wsConn.id),
                {rawMessage: rawMsg});
            var resource = msg.resource || wsConn.upgradeReq.url.split('/').pop();
            if (this.resources[resource] && typeof this.resources[resource][method] === 'function') {
                return this.resources[resource][method](msg, wsConn, rawMsg);
            }
            this.error(new WebSocketError('Invalid WebSocketResource: %s'.format(msg.resource),
                {rawMessage: rawMsg}));
        }

        _handleConnection(wsConn) {
            wsConn.id = uuid('v4');
            this.sessions[wsConn.id] = wsConn;
            logger.debug('Client: %s connected to WebSocketServer.'.format(wsConn.id));
            wsConn.addWatcher = (params, watcher) => {
                var hash = JSON.stringify(params);
                wsConn.watchers = wsConn.watchers || {};
                wsConn.watchers[hash] = wsConn.watchers[hash] || [];
                wsConn.watchers[hash].push(watcher);
                return watcher;
            };
            wsConn.removeWatchers = params => {
                var hash = JSON.stringify(params);
                if (wsConn.watchers && wsConn.watchers[hash]) {
                    wsConn.watchers[hash].forEach(watcher => {
                        watcher && watcher.dispose();
                    });
                    delete wsConn.watchers[hash];
                    return true;
                }
            };
            wsConn.sendError = (err, resource) => wsConn.sendObject({
              handler: 'error',
              resource: resource,
              params: err
            });
            wsConn.sendItem = (resource, id, data) => wsConn.sendObject({
              handler: 'item',
              resource: resource,
              id: id,
              data: data
            });
            wsConn.sendList = (resource, items) => wsConn.sendObject({
              handler: 'list',
              resource: resource,
              items: items
            });
            wsConn.sendObject = object => wsConn.send(JSON.stringify(object));
            wsConn.sendRemove = (resource, id, data) => wsConn.sendObject({
              handler: 'remove',
              resource: resource,
              id: id,
              data: data
            });
            wsConn.sendSession = () => wsConn.sendObject({
              handler: 'session',
              id: wsConn.id
            });
            wsConn.on('message', this._handleMessage.bind(this, wsConn));
            wsConn.on('error', this._closeConnection.bind(this, wsConn));
            wsConn.on('close', this._closeConnection.bind(this, wsConn));
        };

        _handleMessage(wsConn, wsMsg) {
            logger.debug('Client: %s messsage was received.'.format(wsConn.id),
                {rawMessage: wsMsg});
            var msg;
            try { msg = JSON.parse(wsMsg); } catch (err) {
                return this.error(new WebSocketError('Malformed message from: %s'.format(wsConn.id),
                    {rawMessage: wsMsg}));
            }
            if (typeof this.handlers[msg.handler] === 'function') {
                return this.handlers[msg.handler](msg, wsConn, wsMsg);
            }
            this.error(new WebSocketError('Invalid message from: %s'.format(wsConn.id),
                {rawMessage: wsMsg, parsedMessage: msg}));
        };
    }

    return new WebSocketService();
}
