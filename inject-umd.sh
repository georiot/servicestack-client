sed 's/})(function/    else if (typeof window != "undefined") factory(window.require||function(){}, window["\@servicestack\/client"]={});\n})(function/' dist/servicestack-client.umd.js > dist/servicestack-client.umd.js.tmp && mv dist/servicestack-client.umd.js.tmp dist/servicestack-client.umd.js