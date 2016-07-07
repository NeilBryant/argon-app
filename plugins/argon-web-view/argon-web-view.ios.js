"use strict";
var common = require('./argon-web-view-common');
var web_view_1 = require('ui/web-view');
var trace = require('trace');
var ARGON_USER_AGENT = UIWebView.alloc().init().stringByEvaluatingJavaScriptFromString('navigator.userAgent') + ' Argon';
var processPool = WKProcessPool.new();
var ArgonWebView = (function (_super) {
    __extends(ArgonWebView, _super);
    function ArgonWebView() {
        _super.call(this);
        var configuration = WKWebViewConfiguration.alloc().init();
        // We want to replace the UIWebView created by superclass with WKWebView instance
        this._ios = WKWebView.alloc().initWithFrameConfiguration(CGRectZero, configuration);
        delete this._delegate; // remove reference to UIWebView delegate created by super class
        this._argonDelegate = ArgonWebViewDelegate.initWithOwner(new WeakRef(this));
        configuration.processPool = processPool;
        configuration.userContentController.addScriptMessageHandlerName(this._argonDelegate, "argon");
        configuration.userContentController.addScriptMessageHandlerName(this._argonDelegate, "argoncheck");
        configuration.userContentController.addScriptMessageHandlerName(this._argonDelegate, "log");
        configuration.userContentController.addUserScript(WKUserScript.alloc().initWithSourceInjectionTimeForMainFrameOnly("\n            var _originalLog = console.log;\n            console.log = function(message) {\n                webkit.messageHandlers.log.postMessage(message);\n                _originalLog.apply(console, arguments);\n            };\n            function _sendArgonCheck(event) {\n                if (document.head.querySelector('meta[name=argon]') !== null || typeof(Argon) !== 'undefined') {\n                    if (event.persisted) window.location.reload(false);\n                    else webkit.messageHandlers.argoncheck.postMessage(\"true\");\n                } else {\n                    webkit.messageHandlers.argoncheck.postMessage(\"false\");\n                }\n            }\n\t        document.addEventListener(\"DOMContentLoaded\", _sendArgonCheck);\n\t        window.addEventListener(\"pageshow\", _sendArgonCheck);\n        ", WKUserScriptInjectionTime.WKUserScriptInjectionTimeAtDocumentStart, true));
        this._ios.allowsBackForwardNavigationGestures = true;
        this._ios['customUserAgent'] = ARGON_USER_AGENT;
        // style appropriately
        this._ios.scrollView.layer.masksToBounds = false;
        this._ios.layer.masksToBounds = false;
    }
    ArgonWebView.prototype._setIsArgonApp = function (flag) {
        if (!this.isArgonApp && flag) {
            this._ios.scrollView.backgroundColor = UIColor.clearColor();
            this._ios.backgroundColor = UIColor.clearColor();
            this._ios.opaque = false;
            this.set("isArgonApp", true);
        }
        else if (this.isArgonApp && !flag) {
            this._ios.scrollView.backgroundColor = UIColor.whiteColor();
            this._ios.backgroundColor = UIColor.whiteColor();
            this._ios.opaque = true;
            this.set("isArgonApp", false);
        }
    };
    ArgonWebView.prototype.evaluateJavascript = function (script) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            _this._ios.evaluateJavaScriptCompletionHandler(script, function (result, error) {
                if (error)
                    reject(error.localizedDescription);
                else
                    resolve(result);
            });
        });
    };
    ArgonWebView.prototype.bringToFront = function () {
        this._ios.superview.bringSubviewToFront(this._ios);
    };
    ArgonWebView.prototype.onLoaded = function () {
        _super.prototype.onLoaded.call(this);
        this._ios.navigationDelegate = this._argonDelegate;
    };
    ArgonWebView.prototype.onUnloaded = function () {
        this._ios.navigationDelegate = null;
        _super.prototype.onUnloaded.call(this);
    };
    return ArgonWebView;
}(common.ArgonWebView));
exports.ArgonWebView = ArgonWebView;
var ArgonWebViewDelegate = (function (_super) {
    __extends(ArgonWebViewDelegate, _super);
    function ArgonWebViewDelegate() {
        _super.apply(this, arguments);
    }
    ArgonWebViewDelegate.initWithOwner = function (owner) {
        var delegate = ArgonWebViewDelegate.new();
        delegate._owner = owner;
        return delegate;
    };
    // WKScriptMessageHandler
    ArgonWebViewDelegate.prototype.userContentControllerDidReceiveScriptMessage = function (userContentController, message) {
        var owner = this._owner.get();
        if (!owner)
            return;
        if (message.name === 'argon') {
            if (!owner.session) {
                // just in case we thought below that the page was not an
                // argon page, perhaps because argon.js loaded asyncronously 
                // and the programmer didn't set up an argon meta tag
                owner._setIsArgonApp(true);
            }
            owner._handleArgonMessage(message.body);
        }
        else if (message.name === 'log') {
            owner._handleLogMessage(message.body);
        }
        else if (message.name === 'argoncheck') {
            if (!owner.session) {
                if (message.body === "true") {
                    owner._setIsArgonApp(true);
                }
                else {
                    owner._setIsArgonApp(false);
                }
            }
        }
    };
    ArgonWebViewDelegate.prototype.webViewDecidePolicyForNavigationActionDecisionHandler = function (webview, navigationAction, decisionHandler) {
        if (navigationAction.targetFrame && navigationAction.targetFrame.mainFrame) {
            var navigationType = navigationAction.navigationType;
            var navTypeIndex = web_view_1.WebView.navigationTypes.indexOf('other');
            switch (navigationType) {
                case WKNavigationType.WKNavigationTypeLinkActivated:
                    navTypeIndex = web_view_1.WebView.navigationTypes.indexOf('linkClicked');
                    break;
                case WKNavigationType.WKNavigationTypeFormSubmitted:
                    navTypeIndex = web_view_1.WebView.navigationTypes.indexOf('formSubmitted');
                    break;
                case WKNavigationType.WKNavigationTypeBackForward:
                    navTypeIndex = web_view_1.WebView.navigationTypes.indexOf('backForward');
                    break;
                case WKNavigationType.WKNavigationTypeReload:
                    navTypeIndex = web_view_1.WebView.navigationTypes.indexOf('reload');
                    break;
                case WKNavigationType.WKNavigationTypeFormResubmitted:
                    navTypeIndex = web_view_1.WebView.navigationTypes.indexOf('formResubmitted');
                    break;
            }
            var owner = this._owner.get();
            if (owner)
                owner['_onLoadStarted'](navigationAction.request.URL.absoluteString, web_view_1.WebView.navigationTypes[navTypeIndex]);
        }
        trace.write("ArgonWebView.webViewDecidePolicyForNavigationActionDecisionHandler(" + navigationAction.request.URL.absoluteString + ", " + navigationAction.navigationType + ")", trace.categories.Debug);
        decisionHandler(WKNavigationActionPolicy.WKNavigationActionPolicyAllow);
    };
    ArgonWebViewDelegate.prototype.webViewDecidePolicyForNavigationResponseDecisionHandler = function (webview, navigationResponse, decisionHandler) {
        decisionHandler(WKNavigationResponsePolicy.WKNavigationResponsePolicyAllow);
    };
    ArgonWebViewDelegate.prototype.webViewDidStartProvisionalNavigation = function (webView, navigation) {
        this._provisionalURL = webView.URL.absoluteString;
        var owner = this._owner.get();
        if (!owner)
            return;
        owner.set('progress', webView.estimatedProgress);
    };
    ArgonWebViewDelegate.prototype.webViewDidFailProvisionalNavigation = function (webView, navigation) {
        var owner = this._owner.get();
        if (!owner)
            return;
        owner['_onLoadFinished'](this._provisionalURL, "Provisional navigation failed");
        owner['_suspendLoading'] = true;
        owner.url = webView.URL.absoluteString;
        owner['_suspendLoading'] = false;
        owner.set('title', webView.title);
        owner.set('progress', webView.estimatedProgress);
    };
    ArgonWebViewDelegate.prototype.webViewDidCommitNavigation = function (webView, navigation) {
        var owner = this._owner.get();
        if (!owner)
            return;
        owner.log = [];
        owner._didCommitNavigation();
        owner['_suspendLoading'] = true;
        owner.url = webView.URL.absoluteString;
        owner['_suspendLoading'] = false;
        owner.set('title', webView.title);
        owner.set('progress', webView.estimatedProgress);
    };
    ArgonWebViewDelegate.prototype.webViewDidFinishNavigation = function (webView, navigation) {
        var owner = this._owner.get();
        if (owner)
            owner['_onLoadFinished'](webView.URL.absoluteString);
        owner.set('title', webView.title);
        owner.set('progress', webView.estimatedProgress);
    };
    ArgonWebViewDelegate.prototype.webViewDidFailNavigationWithError = function (webView, navigation, error) {
        var owner = this._owner.get();
        if (owner)
            owner['_onLoadFinished'](webView.URL.absoluteString, error.localizedDescription);
        owner.set('title', webView.title);
        owner.set('progress', webView.estimatedProgress);
    };
    ArgonWebViewDelegate.ObjCProtocols = [WKScriptMessageHandler, WKNavigationDelegate];
    return ArgonWebViewDelegate;
}(NSObject));
//# sourceMappingURL=argon-web-view.ios.js.map