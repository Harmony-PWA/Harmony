// This is a port foor node.js of this great article's code:
// http://cgbystrom.com/articles/deconstructing-spotifys-builtin-http-server/

var request = require('request')
var qs = require('querystring')
var util = require('util');
var path = require('path');
var child_process = require('child_process');

// global variables, used when running on windows
var wintools;
var spotifyWebHelperWinProcRegex;

// Default port that Spotify Web Helper binds to.
var DEFAULT_PORT = 4381;
var DEFAULT_PROTOCOL = 'http';
var DEFAULT_RETURN_ON = ['login', 'logout', 'play', 'pause', 'error', 'ap']
var DEFAULT_RETURN_AFTER = 1
var ORIGIN_HEADER = { 'Origin': 'https://open.spotify.com' }
var FAKE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36';


function getJson(url, params, headers, cb) {
    if (params instanceof Function) {
        cb = params;
        params = null;
        headers = null;
    }

    if (headers instanceof Function) {
        cb = headers;
        headers = null;
    }

    headers = headers || {}
    cb = cb || function() {};
    if (params)
        url += '?' + qs.stringify(params)

    headers['User-Agent'] = FAKE_USER_AGENT;

    // rejectUnauthorized:false should be ok here since we are working with localhost
    // this fixes the UNABLE_TO_VERIFY_LEAF_SIGNATURE error
    request({ 'url': url, 'headers': headers, 'rejectUnauthorized': false }, function(err, req, body) {
        if (err) {
            return cb(err);
        }

        var parsedBody;
        try {
            parsedBody = JSON.parse(body);
        } catch (e) {
            return cb(e);
        }

        return cb(null, parsedBody);
    });
}

var ASCII_LOWER_CASE = "abcdefghijklmnopqrstuvwxyz";
// http://stackoverflow.com/questions/1349404/generate-a-string-of-5-random-characters-in-javascript
function generateRandomString(length) {
    var text = "";

    for (var i = 0; i < 10; i++)
        text += ASCII_LOWER_CASE.charAt(Math.floor(Math.random() * ASCII_LOWER_CASE.length));

    return text;
}

function generateRandomLocalHostName() {
    // Generate a random hostname under the .spotilocal.com domain
    return generateRandomString(10) + '.spotilocal.com'
}

function getOauthToken(cb) {
    return getJson('http://open.spotify.com/token', function(err, res) {
        if (err) {
            return cb(err);
        }

        return cb(null, res['t']);
    });
}

function isSpotifyWebHelperRunning(cb) {
    cb = cb || function() {};
    // not doing anything for non windows, for now
    if (process.platform != 'win32') {
        return cb(null, true);
    }

    wintools = wintools || require('wintools');
    wintools.ps(function(err, lst) {
        if (err) {
            return cb(err);
        }

        spotifyWebHelperWinProcRegex = spotifyWebHelperWinProcRegex || new RegExp('spotifywebhelper.exe', 'i');

        for (var k in lst) {
            if (spotifyWebHelperWinProcRegex.test(lst[k].desc)) {
                return cb(null, true);
            }
            spotifyWebHelperWinProcRegex.lastIndex = 0;
        };
        cb(null, false);
    });
}

function getWindowsSpotifyWebHelperPath() {
    if (!process.env.USERPROFILE) {
        return null;
    }

    return path.join(process.env.USERPROFILE, 'AppData\\Roaming\\Spotify\\Data\\SpotifyWebHelper.exe');
}

function launchSpotifyWebhelperIfNeeded(cb) {
    cb = cb || function() {};
    // not doing anything for non windows, for now
    if (process.platform != 'win32') {
        return cb(null, true);
    }

    isSpotifyWebHelperRunning(function(err, res) {
        if (err) {
            return cb(err);
        }

        if (res) {
            return cb(null, res);
        }

        var exePath = getWindowsSpotifyWebHelperPath();

        if (!exePath) {
            return cb(new Error('Failed to retreive SpotifyWebHelper exe path'));
        }

        var child = child_process.spawn(exePath, { detached: true, stdio: 'ignore' });
        child.unref();

        return cb(null, true);
    });

}

function SpotifyWebHelper(opts) {
    if (!(this instanceof SpotifyWebHelper)) {
        return new SpotifyWebHelper(opts);
    }

    opts = opts || {};
    var localPort = opts.port || DEFAULT_PORT;
    var localProto = opts.protocol || DEFAULT_PROTOCOL;

    function generateSpotifyUrl(url) {
        return util.format("%s://%s:%d%s", localProto, generateRandomLocalHostName(), localPort, url)
    }


    function getVersion(cb) {
        var url = generateSpotifyUrl('/service/version.json');
        return getJson(url, { 'service': 'remote' }, ORIGIN_HEADER, cb)
    }

    function getCsrfToken(cb) {
        // Requires Origin header to be set to generate the CSRF token.
        var url = generateSpotifyUrl('/simplecsrf/token.json');
        return getJson(url, null, ORIGIN_HEADER, function(err, res) {
            if (err) {
                return cb(err);
            }

            return cb(null, res['token']);
        });
    }

    this.isInitialized = false;

    this.init = function(cb) {
        var self = this;
        cb = cb || function() {};
        if (self.isInitialized) {
            return cb();
        }

        launchSpotifyWebhelperIfNeeded(function(err, res) {
            if (err) {
                return cb(err);
            }

            if (!res) {
                return cb(new Error('SpotifyWebHelper not running, failed to start it'));
            }

            getOauthToken(function(err, oauthToken) {
                if (err) {
                    return cb(err);
                }

                self.oauthToken = oauthToken;

                getCsrfToken(function(err, csrfToken) {
                    if (err) {
                        return cb(err);
                    }

                    self.csrfToken = csrfToken;
                    self.isInitialized = true;
                    return cb();
                });
            });
        });
    }

    function spotifyJsonRequest(self, spotifyRelativeUrl, additionalParams, cb) {
        cb = cb || function() {};
        additionalParams = additionalParams || {};

        self.init(function(err) {
            if (err) {
                return cb(err);
            }

            params = {
                'oauth': self.oauthToken,
                'csrf': self.csrfToken,
            }

            for (var key in additionalParams) {
                params[key] = additionalParams[key];
            }

            var url = generateSpotifyUrl(spotifyRelativeUrl);
            getJson(url, params, ORIGIN_HEADER, cb);
        });
    }

    this.getStatus = function(returnAfter, returnOn, cb) {

        if (returnAfter instanceof Function) {
            cb = returnAfter;
            returnAfter = null;
            returnOn = null;
        }

        if (returnOn instanceof Function) {
            cb = returnOn;
            returnOn = null;
        }

        returnOn = returnOn || DEFAULT_RETURN_ON;
        returnAfter = returnAfter || DEFAULT_RETURN_AFTER;

        cb = cb || function() {};

        params = {
            'returnafter': returnAfter,
            'returnon': returnOn.join(',')
        }

        spotifyJsonRequest(this, '/remote/status.json', params, cb);
    }

    this.pause = function(cb) {
        cb = cb || function() {};

        params = {
            'pause': true
        }

        spotifyJsonRequest(this, '/remote/pause.json', params, cb);
    }

    this.unpause = function(cb) {
        cb = cb || function() {};

        params = {
            'pause': false
        }

        spotifyJsonRequest(this, '/remote/pause.json', params, cb);
    }

    this.play = function(spotifyUri, cb) {
        cb = cb || function() {};

        params = {
            'uri': spotifyUri,
            'context': spotifyUri
        }

        spotifyJsonRequest(this, '/remote/play.json', params, cb);
    }

    this.getVersion = function(cb) {
        var url = generateSpotifyUrl('/service/version.json');
        return getJson(url, { 'service': 'remote' }, ORIGIN_HEADER, cb)
    }

    this.getLocalHostname = function() {
        return generateRandomLocalHostName();
    }
}

module.exports.SpotifyWebHelper = SpotifyWebHelper;