# on-wss [![Build Status](https://travis-ci.org/RackHD/on-wss.svg?branch=master)](https://travis-ci.org/RackHD/on-wss) [![Code Climate](https://codeclimate.com/github/RackHD/on-wss/badges/gpa.svg)](https://codeclimate.com/github/RackHD/on-wss) [![Coverage Status](https://coveralls.io/repos/github/RackHD/on-wss/badge.svg?branch=master)](https://coveralls.io/github/RackHD/on-wss?branch=master)

__`on-wss` is the WebSocket server for RackHD__

_Copyright 2016, EMC, Inc._

## Installation

    rm -rf node_modules
    npm install

## Running

Note: requires MongoDB and RabbitMQ to be running to start correctly.

    sudo node index.js

## CI/Testing

To run tests from a developer console:

    npm test

To run tests and get coverage for CI:

    # verify hint/style
    ./node_modules/.bin/jshint -c .jshintrc --reporter=checkstyle lib index.js > checkstyle-result.xml || true
    ./node_modules/.bin/istanbul cover -x "**/spec/**" _mocha -- $(find spec -name '*-spec.js') -R xunit-file --require spec/helper.js
    ./node_modules/.bin/istanbul report cobertura
    # if you want HTML reports locally
    ./node_modules/.bin/istanbul report html


## Licensing

Licensed under the Apache License, Version 2.0 (the “License”); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an “AS IS” BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

RackHD is a Trademark of Dell EMC
