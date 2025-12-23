// Resolve clinic ip adress
//require('../config.js');
const dns = require('dns');
let homeaddrs = {};
const timeout = 1 * 60 * 1000; //min

setInterval((function getHomeAddrs() {
    // console.log('Resolving home addresses...');
    Admin.hosts.forEach(function(host){
        dns.lookup(host,4,function(err,addr){
            homeaddrs[host] = addr;
            // console.log("Host:" + host + ", IP address: " + addr);
        });
    });
    return getHomeAddrs;
}()), timeout);

function arrhome(){
    let r = ['127.0.0.1','::1','192.168','fe80:'];
    for( key in homeaddrs ) {
        if( homeaddrs.hasOwnProperty(key) && homeaddrs[key]) {
            r.push(homeaddrs[key]);
        }
    }
    return r;
}


module.exports.arrhome = arrhome;