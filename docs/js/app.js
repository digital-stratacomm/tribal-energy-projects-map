
(() => {
  "use strict";
  
  const config = {
    googleKey: window.MAP_SETTINGS.googleKey,
    spreadsheetId: window.MAP_SETTINGS.spreadsheetId,
    sheetId: "Data",
    url: "https://sheets.googleapis.com/v4/spreadsheets",
    uiFilters: { State: [], Technology: [], Category: [] },
    mapCenter: [-95.84, 37.81],
    mapZoom: 3,
    mapboxToken: window.MAP_SETTINGS.mapboxToken,
    tileLayer: "mapbox://styles/energy/ckhc7eaqv0mjm19p3yr4jtlcw",
    mapContainer: "map",
    datatableContainer: "datatable",
    dataHeaders: [
      "Project",
      "Tribe",
      "State",
      "Year",
      "Assistance Type",
      "Category",
      "Technology",
    ],
  };

  let map, datatable, data, spiderifier;

  window.onload = function () {
    init(config);
  };

  function init(config) {
    const url = `${config.url}/${config.spreadsheetId}/values/${config.sheetId}?key=${config.googleKey}`;
    const params = {
      mode: 'cors',
    };
    fetch(url, params)
      .then(resp => resp.json())
      .then(render)
      .catch(console.error);
  }

  function render(googledata /*, tabletop */) {
    data = googledata.values; // make the data global
    const headers = data.shift();
    data = data.map(row => Object.fromEntries(headers.map((value, index) => [value, row[index]])));

    linkTitle(data); // mashup the project name and hyperlink
    buildUI(data);
    renderMap(config);
    getFilterValues(config);
    renderMapMarkers(data);
    countMarkersFromState("Alaska", data);
    renderDataTable(data);
  }

  function buildHtmlTemplates(src, uiobj) {
    let tmplSrc = $("script")
      .filter('[data-template="' + src + '"]')
      .html();

    let template = Handlebars.compile(tmplSrc);

    return template(uiobj);
  }

  /**
   *
   * buildUI - build the inputs/selects/checkboxes used to control the map and table
   * @param  {array} data rows from the datasource
   *
   */
  function buildUI(dataarray) {
    const $ui = $("#ui-controls");
    let uiObj = {};

    // todo: refactor - this is not efficient... relooping thru data
    Object.keys(config.uiFilters).forEach((title) => {
      uiObj[title] = dataarray
        .map((result) => result[title])
        .sort()
        .filter((a, b, c) => c.indexOf(a) === b); // grab unique items
    });

    $ui.find("[data-target]").each((idx, el) => {
      let target = $(el).data().target;

      $(el).append(buildHtmlTemplates(target, uiObj));
    });
  }

  /**
   * Wrap the project name in a hyperlink
   *
   * @param  {array} data - rows from datasource
   *
   */
  function linkTitle(dataarray) {
    dataarray.forEach((row) => {
      row.Project = `<a target="_blank" href="${row.Link}">${row.Project}</a>`;
    });
  }

  /**
   * todo: if one of our headers isn't in the data, prune it so DT doesn't throw an error
   * [renderDataTable description]
   * @param  {[type]} data [description]
   */
  function renderDataTable(dataarray) {
    // set up columns properly
    const columns = config.dataHeaders.map((header) => {
      return {
        title: header,
        data: header,
      };
    });

    // swap footer UI element placement
    const dom =
      '<"row"<"col-sm-6"l><"col-sm-6"f>>' +
      '<"row"<"col-sm-12"tr>>' +
      '<"row"<"col-sm-5"p><"col-sm-7"i>>';

    // init the datatable
    datatable = $("#" + config.datatableContainer).DataTable({
      data: dataarray,
      columns: columns,
      dom: dom,
      language: { search: "Search table:" },
    });
  }

  /**
   *
   * renderMap - set the zoom, coords, tiles, and create a mapbox map
   * @return {[type]} [description]
   *
   */
  function renderMap(cfg) {
    mapboxgl.accessToken = cfg.mapboxToken;
    map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/light-v11",
      center: cfg.mapCenter,
      zoom: cfg.mapZoom,
      maxZoom: 13,
    });

    spiderifier = new MapboxglSpiderifier(map, {
      customPin: true,
      initializeLeg: function (spiderLeg) {
        let $spiderPinCustom = $("<div>", { class: "spider-point-circle" });
        let marker = spiderLeg.feature;

        $(spiderLeg.elements.pin).append($spiderPinCustom);
        $spiderPinCustom.css({
          width: "30px",
          height: "30px",
          "margin-left": "-15px",
          "margin-top": "-15px",
          "background-color": "rgba(8, 183, 241, 1)",
          "border-radius": "50%",
        });
        let content = "<h4>" + marker.Tribe + "</h4>";
        content += "<h5>" + marker.Project + "</h5>";
        let popup = new mapboxgl.Popup({
          closeOnClick: true,
          offset: MapboxglSpiderifier.popupOffsetForSpiderLeg(spiderLeg),
        }).addTo(map);
        popup.setHTML(content);
        spiderLeg.mapboxMarker.setPopup(popup);
      },
    });
  }

  /**
   *
   * getFilterValues - check the state of our UI elements
   *
   */
  function getFilterValues(cfg) {
    Object.keys(cfg.uiFilters).forEach((filter) => {
      const $el = $('#ui-controls [data-target="' + filter + '"] :checked');

      cfg.uiFilters[filter].length = 0; // clear out existing array

      $el.each((idx, el) => {
        if (el.value.length) {
          cfg.uiFilters[filter].push(el.value);
        }
      });
    });
  }

  /**
   *
   * renderMapMarkers -
   * @param  {array} data -
   *
   */

  function updateSource(dataarray) {
    let geojsondata = GeoJSON.parse(dataarray, {
      Point: ["Latitude", "Longitude"],
    }); //todo: abstract out lat/lon field

    geojsondata.features = geojsondata.features.filter((feat) =>
      filterData(feat, config.uiFilters)
    );

    map.getSource("locations").setData(geojsondata);
    zoomMapBounds(geojsondata.features, config);
  }

  function renderMapMarkers(dataarray) {
    let $ui = $("#ui-controls");

    map.on("load", function () {
      let geojsondata = GeoJSON.parse(dataarray, {
        Point: ["Latitude", "Longitude"],
      }); //todo: abstract out lat/lon field

      map.addSource("locations", {
        type: "geojson",
        data: geojsondata,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "locations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "rgba(8, 183, 241, 1)",
            10,
            "rgba(255, 201, 86, 1)",
            50,
            "rgba(232, 131, 32, 1)",
          ],
          "circle-radius": 20,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "locations",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "locations",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "rgba(8, 183, 241, 1)",
          "circle-radius": 20,
        },
      });

      map.addLayer({
        id: "unclustered-count",
        type: "symbol",
        source: "locations",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": "1",
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
      });

      map.on("zoomstart", function () {
        spiderifier.unspiderfy();
      });

      $ui.on("change", "input, select", function () {
        getFilterValues(config);
        updateSource(data);
        filterDataTable();
      });

      map.on("click", "clusters", function (e) {
        if (e.originalEvent.srcElement.className === "spider-point-circle") {
          return;
        }

        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = features[0].properties.cluster_id;
        map
          .getSource("locations")
          .getClusterExpansionZoom(clusterId, function (err, zoom) {
            if (err) return;
            if (map.getZoom() !== 13) {
              map.easeTo({
                center: features[0].geometry.coordinates,
                zoom: zoom,
              });
            }
          });

        if (!features.length || map.getZoom() !== 13) {
          return;
        } else {
          map
            .getSource("locations")
            .getClusterLeaves(clusterId, 100, 0, function (err, leafFeatures) {
              if (err) {
                return console.error("problem with leaf features", err);
              }
              let markers = leafFeatures.map(function (leafFeature) {
                return leafFeature.properties;
              });
              spiderifier.spiderfy(features[0].geometry.coordinates, markers);
            });
        }
      });

      // When a click event occurs on a feature in
      // the unclustered-point layer, open a popup at
      // the location of the feature, with
      // description HTML from its properties.
      map.on("click", "unclustered-point", function (e) {
        const coordinates = e.features[0].geometry.coordinates.slice();
        let content = "<h4>" + e.features[0].properties.Tribe + "</h4>";
        content += "<h5>" + e.features[0].properties.Project + "</h5>";

        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        new mapboxgl.Popup().setLngLat(coordinates).setHTML(content).addTo(map);
      });
    });
  }

  function countMarkersFromState(state, dataarray) {
    let count = 0;
    dataarray.forEach((point) => {
      if (point.State === state) count++;
    });
    $("#count-alaska").text(count);
    //console.log('found '+ arr.length + ' markers from ' + state)
  }

  /**
   * Zoom the map to show all markers if there are any.
   */
  function zoomMapBounds(features, cfg) {
    let bounds = new mapboxgl.LngLatBounds();

    features.forEach(function (feature) {
      bounds.extend(feature.geometry.coordinates);
    });
    if (features.length) {
      map.fitBounds(bounds, { maxZoom: 5, padding: 100 });
    } else {
      map.easeTo({
        center: cfg.mapCenter,
        zoom: cfg.mapZoom,
      });
      alert("No projects fit the criteria.");
    }
  }

  /**
   * clearMarkers - remove the marker layer from the map
   * @param  {object} markerLayer
   */
  function clearMarkers(markerLayer) {
    if (markerLayer !== undefined) {
      map.removeLayer(markerLayer);
    } else {
      console.log("Marker layer was undefined. Nothing to remove.");
    }
  }

  /**
   * filterData - find a value within an object's keys
   * @param  {object} feature
   * @param  {object} filters
   * @return {boolean} true if the feature matches
   */
  function filterData(feature, filters) {
    let bln = true;

    Object.keys(filters).forEach((filter) => {
      let props;

      if (feature.properties[filter]) {
        props = feature.properties[filter].split(","); // convert comma separated string to array

        bln = bln && matches(props, filters[filter]);
      }
    });

    return bln;
  }

  /**
   * matches - check if any of the criteria match our properties
   *
   * @param  {array} needles list of properties of an object
   * @param  {array} haystack array containing a list of criteria we're looking for
   *
   * @return {boolean} true if any of needles are in haystack
   */
  function matches(needles, haystack) {
    let ismatch;

    ismatch = haystack.length
      ? haystack.some((option) => needles.indexOf(option) >= 0)
      : true;
    // if ( haystack.length ) {
    //   ismatch   = haystack.some( option => needles.indexOf( option ) >= 0 )
    // }

    return ismatch;
  }

  /**
   * escapeRegExp - make a string safe for use as a regular expression
   * @param  {string} str input string
   * @return {string}    string with special regex characters escaped
   */
  function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
  }

  /**
   * filterDataTable - use datatables search/filter function to filter the table
   * @param  {[type]} terms [description]
   *
   */
  function filterDataTable() {
    Object.keys(config.uiFilters).forEach((filter) => {
      let idx = config.dataHeaders.indexOf(filter);

      // build out regex terms that match the word/phrase exactly
      // eg don't let "other" match "geothermal"
      // and escape out control characters
      let terms = config.uiFilters[filter].map((val) => {
        val = escapeRegExp(val);
        return `^${val}$`;
      });

      // convert array to pipe-separated string for regex search
      let regexterms = terms.join("|");

      datatable.column(idx).search(regexterms, true, false);
    });

    datatable.draw();
  }

  /**
   * 	Event handler for Alaska UI button
   */
  $(".map-navigation").on("click", "a", function (e) {
    e.preventDefault();

    const pos = $(e.delegateTarget).children().data("position");
    if (pos) {
      const loc = pos.split(",").reverse();

      map.easeTo({
        center: loc,
        zoom: 3,
      });
    }
  });
})();
