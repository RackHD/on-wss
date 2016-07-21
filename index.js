// Copyright 2016, EMC, Inc.

"use strict";

var flattenDeep = require('lodash.flattendeep'),
    onCore = require('on-core'),
    ws = require('ws');

module.exports = onWssContextFactory;

function onWssContextFactory() {
    var core = onCore(),
        helper = core.helper,
        di = core.di;

    return {
        helper: helper,

        injectables: [
            helper.simpleWrapper(ws, 'ws'),
            helper.simpleWrapper(ws.Server, 'WebSocketServer'),
            helper.requireGlob(__dirname + '/lib/*.js')
        ],

        initialize: function () {
            var injector = new di.Injector(flattenDeep([
                core.injectables,
                this.injectables
            ]));

            this.injector = injector;
            this.logger = injector.get('Logger').initialize('Wss.Server');
            this.messenger = injector.get('Services.Messenger');
            this.waterline = injector.get('Services.Waterline');
            this.wss = injector.get('Services.WebSocket');

            return this;
        },

        run: function () {
            var logger = this.logger,
                messenger = this.messenger,
                waterline = this.waterline,
                wss = this.wss;

            Promise.all([messenger.start(), waterline.start()])
                .then(function () {
                    console.log('Messenger and Waterline Services started...');
                    wss.start(function () {
                        console.log('WebSocket Server started...');
                    });
                })
                .catch(function (err) { console.error(err);});

            process.on('SIGINT', function () {
                Promise.all([messenger.stop(), waterline.stop()])
                .then(function() {
                    wss.stop();
                    console.log('Stopping WebSocket Server...');
                })
                .catch(function(error) {
                    logger.critical('Server Shutdown Error.', { error: error });
                    process.nextTick(function() {
                        process.exit(1);
                    });
                });
            });

            return this;
        }
    };
}

if (require.main === module) {
    onWssContextFactory().initialize().run();
}
