// ==UserScript==
// @name         WME USPS Routes
// @namespace    WazeDev
// @version      2018.12.08.001
// @description  Displays USPS routes along with city and ZIP Code
// @author       MapOMatic
// @include     /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @license      GNU GPLv3
// @grant        GM_xmlhttpRequest
// @connect      usps.com
// ==/UserScript==

/* global $ */
/* global W */
/* global OpenLayers */

(function() {
    'use strict';

    let _scriptVersion = GM_info.script.version;
    let _mapLayer = null;
    let _radius = 0.5; // miles
    let _colors = ['#f00','#0a0','#00f','#a0a','#aa0','#0aa'];
    let _urlTemplate = 'https://gis.usps.com/arcgis/rest/services/EDDM/selectNear/GPServer/routes/execute?f=json&env%3AoutSR=102100&' +
        'Selecting_Features=%7B%22geometryType%22%3A%22esriGeometryPoint%22%2C%22features%22%3A%5B%7B%22geometry%22%3A%7B%22x%22%3A{lon}%2C%22y%22%3A{lat}' +
        '%2C%22spatialReference%22%3A%7B%22wkid%22%3A102100%2C%22latestWkid%22%3A3857%7D%7D%7D%5D%2C%22sr%22%3A%7B%22wkid%22%3A102100%2C%22latestWkid%22%3A3857%7D%7D&' +
        'Distance={radius}&Rte_Box=R&userName=EDDM';
    let _circleFeature;

    function log(message) {
        console.log('WME USPS Routes:', message);
    }

    function getLineWidth() {
        return 8 * Math.pow(1.15, (W.map.getZoom()-1));
    }

    function getUrl(lon, lat, radius) {
        return _urlTemplate.replace('{lon}', lon).replace('{lat}', lat).replace('{radius}', radius);
    }

    function getCirclePoints() {
        let center = W.map.getCenter();
        let centerX = center.lon;
        let centerY = center.lat;
        let radius = _radius * 1609.344; // miles to meters
        let points=[];

        for(let degree=0;degree<360;degree+=5){
            let radians = degree * Math.PI/180;
            let x = centerX + radius * Math.cos(radians);
            let y = centerY + radius * Math.sin(radians);
            points.push(new OpenLayers.Geometry.Point(x, y));
        }
        return new OpenLayers.Geometry.LinearRing(points);
    }

    function processResponse(res) {
        let data = $.parseJSON(res.responseText);
        let routes = data.results[0].value.features;

        log(routes);

        let zipRoutes = {};
        routes.forEach(route => {
            let id = route.attributes.CITY_STATE + ' ' + route.attributes.ZIP_CODE;
            let zipRoute = zipRoutes[id];
            if (!zipRoute) {
                zipRoute = {paths:[]};
                zipRoutes[id] = zipRoute;
            }
            zipRoute.paths = zipRoute.paths.concat(route.geometry.paths);
        });

        let features = [];
        let routeIdx = 0;

        $('#usps-route-results').empty();
        Object.keys(zipRoutes).forEach(zipName => {
            var paths = []
            let route = zipRoutes[zipName];
            route.paths.forEach(function(path){
                var pointList = [];
                path.forEach(function(point){
                    pointList.push(new OpenLayers.Geometry.Point(point[0],point[1]));
                });
                paths.push( new OpenLayers.Geometry.LineString(pointList));
            });
            let color = _colors[routeIdx];
            let style = {
                strokeColor: color,
                strokeDashstyle: "solid",
                strokeWidth: 18
            };
            features.push( new OpenLayers.Feature.Vector(
                new OpenLayers.Geometry.MultiLineString(paths), null, style
            ));
            $('#usps-route-results').append($('<div>').text(zipName).css({color: color, fontWeight: 'bold'}));
            routeIdx++;
        });
        $('#get-usps-routes').removeAttr('disabled').css({color:'#000'});
        _mapLayer.addFeatures(features);
    }

    function fetchFeatures() {
        let center = W.map.getCenter();
        let url = getUrl(center.lon, center.lat, _radius);

        $('#get-usps-routes').attr('disabled', 'true').css({color:'#888'});
        $('#usps-route-results').empty().append('<i class="fa fa-spinner fa-pulse fa-3x fa-fw"></i>');
        _mapLayer.removeAllFeatures();
        GM_xmlhttpRequest({ url: url, onload: processResponse});
    }

    function onGetRoutesButtonClick() {
        fetchFeatures();
    }

    function onGetRoutesButtonMouseEnter() {
        $('#get-usps-routes').css({color: '#00a'});
        let style = {
            strokeColor: '#ff0',
            strokeDashstyle: "solid",
            strokeWidth: 6,
            fillColor: '#ff0',
            fillOpacity: 0.2
        };

        _circleFeature = new OpenLayers.Feature.Vector(getCirclePoints(), null, style);
        _mapLayer.addFeatures([ _circleFeature ]);
    }

    function onGetRoutesButtonMouseLeave() {
        $('#get-usps-routes').css({color: '#000'});
        _mapLayer.removeFeatures([ _circleFeature ]);
    }

    function onClearRoutesButtonClick() {
        _mapLayer.removeAllFeatures();
        $('#usps-route-results').empty();
    }

    function initLayer(){
        let mapLayerZIndex = 334;
        _mapLayer = new OpenLayers.Layer.Vector("USPS Routes", {
            uniqueName: "__wmeUSPSroutes",
            displayInLayerSwitcher: false
        });

        W.map.addLayer(_mapLayer);
        _mapLayer.setZIndex(mapLayerZIndex);
        _mapLayer.setOpacity(0.6);
//         // Hack to fix layer zIndex.  Some other code is changing it sometimes but I have not been able to figure out why.
//         // It may be that the FC layer is added to the map before some Waze code loads the base layers and forces other layers higher.
//         let checkLayerZIndex = function(layerZIndex) {
//             if (_mapLayer.getZIndex() != mapLayerZIndex) {
//                 //log("ADJUSTED LAYER Z-INDEX",1);
//                 _mapLayer.setZIndex(mapLayerZIndex);
//             }
//         };

//         setInterval(function(){checkLayerZIndex(mapLayerZIndex);}, 200);

    }

    function initGui() {
        initLayer();
        $('#sidebar').prepend(
            $('<div>', {style: 'margin-left:10px;'}).append(
                $('<button>', {id: 'get-usps-routes', style: 'height:23px;'}).text('Get USPS routes').click(onGetRoutesButtonClick).mouseenter(onGetRoutesButtonMouseEnter).mouseout(onGetRoutesButtonMouseLeave),
                $('<button>', {id: 'clear-usps-routes', style: 'height:23px; margin-left:4px;'}).text('Clear').click(onClearRoutesButtonClick),
                $('<div>', {id: 'usps-route-results', style: 'margin-top:3px;'})
            )
        );
    }

    function init() {
        initGui();
        //unsafeWindow.addEventListener('beforeunload', function saveOnClose() { saveSettingsToStorage(); }, false);
        log('Initialized');
    }

    function bootstrap() {
        if (W && W.loginManager &&
            W.loginManager.events.register &&
            W.map && W.loginManager.user) {
            log('Initializing...');
            init();
        } else {
            log('Bootstrap failed. Trying again...');
            setTimeout(function () {
                bootstrap();
            }, 1000);
        }
    }

    log('Bootstrap...');
    bootstrap();
})();
