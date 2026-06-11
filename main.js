const debug = false;

const files = ['data/stop_list.json', 'data/bangkok.json', 'data/districts.json', 'data/rail_lines.json'];
let promises = [];
files.forEach((url) => {
  promises.push(d3.json(url))
});
let stops;

const desc_stop = d3.select('#desc-stop');
const desc_bus = d3.select('#desc-bus');
const desc_stop_name = d3.select('#stop-name');
// const desc_stop_number = d3.select('#stop-number');
const desc_bus_number = d3.select('#bus-number');
const desc_reaches = d3.select('#reaches');
const desc_bus_name = d3.select('#bus-name');
const desc_bus_stops = d3.select('#bus-stops');
const tooltip = d3.select('#tooltip');

let width = Math.min(1000, window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth);
let height = Math.min(1000, (window.innerHeight|| document.documentElement.clientHeight|| document.body.clientHeight) - 150);
let svg = d3.select('svg')
  .attr('width', width)
  .attr('height', height)
  .append('g');

let transform;
let stop_r = (d, r) => {
  if (debug) {
    return d.bus_ids ? Math.sqrt(d.stop_reaches.size)/10 / (transform ? Math.sqrt(transform.k) : 1) : 0;
    // return d.bus_ids ? Math.sqrt(d.bus_ids.length)/2 / (transform ? Math.sqrt(transform.k) : 1) : 0;
  } else {
    return r / (transform ? Math.sqrt(transform.k) : 1);
  }
}

let svg_stops;
let projected_stops;
let voronoi;
let delaunay;
let busses = {};
let pause = false;
let pause_p;
let selected_bus = null;
let zoom;

let stop_nodes = {};
let stop_node = (stop_id) => d3.select(stop_nodes[stop_id]);

let hide_tooltip = () => tooltip.style('display', 'none');
let show_tooltip = (event, p) => {
  const e = event.sourceEvent || event;
  tooltip
    .style('display', 'block')
    .style('left', `${e.pageX + 15}px`)
    .style('top', `${e.pageY + 15}px`)
    .html(`${stops[p].stop_name}<br /><span class="buses">รถเมล์ ${stops[p].bus_ids.length} สาย</span>`);
}

let mousemove = (event) => {
  let hover = -1;
  const [mx, my] = transform.invert(d3.pointer(event));
  if (!isNaN(mx) && !isNaN(my)) {
    hover = delaunay.find(mx, my);
  }
  if (pause || selected_bus) {
    // a stop or a bus is selected; hovering another stop shows its name in a tooltip
    if (hover != -1 && hover != pause_p) {
      const [sx, sy] = transform.apply(projected_stops[hover]);
      const [px, py] = d3.pointer(event);
      if (Math.hypot(sx - px, sy - py) < 30) {
        show_tooltip(event, hover);
      } else {
        hide_tooltip();
      }
    } else {
      hide_tooltip();
    }
    if (pause && pause_p != null) {
      show_reaches(pause_p);
    }
  } else {
    hide_tooltip();
    if (hover != -1) {
      pause_p = hover;
      show_reaches(hover);
    }
  }
}

let reset_stops = () => {
  svg_stops
    .attr('stroke', 'none')
    .attr('fill', '#000')
    .attr('r', d => stop_r(d, 1));
}

let show_reaches = (p) => {
  selected_bus = null;
  desc_bus.style('display', 'none');
  desc_stop.style('display', null);

  // check if neighbors are within range
  let neighbors = [...voronoi.neighbors(p)];
  let all = [p];
  let stop = projected_stops[p];
  neighbors.forEach((n) => {
    let neighbor = projected_stops[n];
    if (Math.hypot(neighbor[0] - stop[0], neighbor[0] - stop[1]) < 10) { // NOTE distance in screen space (pixels)
      all.push(n);
    }
  });
  if (debug) {
    svg.selectAll('.voronoi')
      .attr('fill', 'none');
    all.forEach((x) => {
      svg.select(`.voronoi-${x}`)
        .attr('fill', '#009');
    });
    svg.select(`.voronoi-${p}`)
      .attr('fill', '#090');
  }

  reset_stops();

  let bus_ids = new Set();
  let reaches = new Set();
  all.forEach((x) => {
    stops[x].bus_ids.forEach((bus_id) => bus_ids.add(bus_id));

    stops[x].stop_reaches.forEach((stop_id) => {
      reaches.add(stop_id);

      stop_node(stop_id)
        .attr('fill', '#E60268')
        .attr('r', d => stop_r(d, 2));
    });
    stop_node(stops[x].id)
      .raise()
      .attr('stroke', '#fff')
      .attr('stroke-width', stop_r(1))
      .attr('fill', '#E60268')
      .attr('r', d => stop_r(d, 5));
  });

  desc_stop_name.text(stops[all[0]].stop_name);
  // desc_stop_number.text(all.length - 1);
  desc_bus_number.text(bus_ids.size);
  desc_reaches.text(reaches.size);
}

let show_bus = (bus_id) => {
  pause = false;
  pause_p = null;
  selected_bus = bus_id;
  desc_stop.style('display', 'none');
  desc_bus.style('display', null);

  reset_stops();

  let stop_ids = busses[bus_id] || [];
  stop_ids.forEach((stop_id) => {
    stop_node(stop_id)
      .raise()
      .attr('fill', '#E60268')
      .attr('r', d => stop_r(d, 3));
  });

  desc_bus_name.text(bus_id);
  desc_bus_stops.text(stop_ids.length);
}

let focus_stop = (p) => {
  pause = true;
  pause_p = p;
  const k = Math.max(transform ? transform.k : 1, 4);
  const [x, y] = projected_stops[p];
  d3.select('svg').transition().duration(750)
    .call(zoom.transform, d3.zoomIdentity.translate(width/2 - k*x, height/2 - k*y).scale(k));
  show_reaches(p);
}

// search for a bus number or a stop name
let search_input = d3.select('#search-input');
let suggestions = d3.select('#suggestions');
let setup_search = () => {
  let bus_list = Object.keys(busses)
    .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

  let update_suggestions = () => {
    const query = search_input.property('value').trim().toLowerCase();
    suggestions.html('');
    if (!query) {
      suggestions.style('display', 'none');
      return;
    }

    // exact route numbers first, e.g. "8" ranks "2-38 (8)" before "1-18E (504E)"
    let bus_score = (bus_id) => {
      const id = bus_id.toLowerCase();
      const tokens = id.split(/[^0-9a-zA-Z-]+/).filter(t => t);
      if (tokens.some(t => t == query)) return 0;
      if (id.startsWith(query)) return 1;
      if (tokens.some(t => t.startsWith(query))) return 2;
      if (id.includes(query)) return 3;
      return -1;
    }
    let matches = bus_list
      .map((bus_id) => [bus_score(bus_id), bus_id])
      .filter(([score]) => score >= 0)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 5)
      .map(([score, bus_id]) =>
        ({ type: 'bus', text: bus_id, detail: `ผ่าน ${busses[bus_id].length} ป้าย`, value: bus_id }));
    stops.forEach((stop, i) => {
      if (matches.length < 12 &&
          (stop.stop_name.toLowerCase().includes(query) || stop.stop_name_en.toLowerCase().includes(query))) {
        matches.push({ type: 'stop', text: stop.stop_name, detail: `รถเมล์ ${stop.bus_ids.length} สาย`, value: i });
      }
    });

    if (matches.length == 0) {
      suggestions.style('display', 'none');
      return;
    }
    suggestions.style('display', 'block');
    suggestions.selectAll('.suggestion')
      .data(matches)
      .enter().append('div')
        .classed('suggestion', true)
        .html(d => `${d.type == 'bus' ? '🚌' : '📍'} ${d.text} <small>${d.detail}</small>`)
        .on('click', (event, d) => {
          search_input.property('value', d.text);
          suggestions.style('display', 'none');
          if (d.type == 'bus') {
            show_bus(d.value);
          } else {
            focus_stop(d.value);
          }
        });
  }

  search_input
    .on('input', update_suggestions)
    .on('keydown', (event) => {
      if (event.key == 'Enter') {
        const first = suggestions.select('.suggestion');
        if (!first.empty()) {
          first.node().click();
        }
      } else if (event.key == 'Escape') {
        suggestions.style('display', 'none');
      }
    });
  d3.select('body').on('click.search', (event) => {
    if (!event.target.closest('#search')) {
      suggestions.style('display', 'none');
    }
  });
}

Promise.all(promises).then((data) => {
  stops = data[0];
  let bangkok = data[1];
  let districts = data[2];
  let rail_lines = data[3];

  stops.forEach((stop) => {
    stop.bus_ids.forEach((bus_id) => {
      if (bus_id in busses) {
        busses[bus_id].push(stop.id);
      } else {
        busses[bus_id] = [stop.id];
      }
    });
  });
  stops.forEach((stop, i) => {
    let stop_set = new Set()
    stop.bus_ids.forEach((bus_id) => {
      busses[bus_id].forEach((stop_id) => {
        stop_set.add(stop_id);
      });
    });
    stops[i].stop_reaches = stop_set;
  });

  let projection = d3.geoMercator()
    .fitSize([width, height], bangkok);
  let path = d3.geoPath()
    .projection(projection);

  // bangkok boundary
  svg.selectAll('path')
    .data([bangkok])
    .enter().append('path')
      .attr('fill', '#ccc')
      .attr('d', path);

  // light background overlay: district boundaries and names
  svg.selectAll('.district')
    .data(districts.features)
    .enter().append('path')
      .classed('district', true)
      .attr('fill', 'none')
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.7)
      .attr('opacity', 0.8)
      .attr('pointer-events', 'none')
      .attr('d', path);
  svg.selectAll('.district-label')
    .data(districts.features)
    .enter().append('text')
      .classed('district-label', true)
      .attr('transform', d => `translate(${path.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#999')
      .attr('font-size', 10)
      .attr('opacity', 0.8)
      .attr('pointer-events', 'none')
      .text(d => d.properties.name);

  // light background overlay: BTS/MRT/SRT/ARL lines
  let line = d3.line()
    .x(d => projection(d)[0])
    .y(d => projection(d)[1]);
  svg.selectAll('.rail')
    .data(rail_lines)
    .enter().append('path')
      .classed('rail', true)
      .attr('fill', 'none')
      .attr('stroke', d => d.color)
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.4)
      .attr('pointer-events', 'none')
      .attr('d', d => line(d.coords));

  projected_stops = stops.map(d => projection([d.longitude, d.latitude]));
  delaunay = d3.Delaunay.from(projected_stops);
  voronoi = delaunay.voronoi([0, 0, width, height]);
  let cells = stops.map((d, i) => [d, voronoi.cellPolygon(i)]);

  // voronoi
  if (debug) {
    cells.forEach((cell, i) => {
      if (cell[1]) {
        svg.append('path')
          .classed(`voronoi`, true)
          .classed(`voronoi-${i}`, true)
          .attr('fill', 'none')
          // .attr('fill', (Math.abs(d3.polygonArea(cell[1])) > 200) ? '#900' : 'none')
          .attr('opacity', 0.1)
          .attr('stroke', 'none')
          .attr('stroke-width', 0.5)
          .attr('d', `M${cell[1].join(' ')}Z`);
      }
    });
    svg.append('path')
      .attr('fill', 'none')
      .attr('stroke', '#eee')
      .attr('stroke-width', 0.5)
      .attr('d', voronoi.render());
  }

  // bus stops
  // svg.append('path')
  //   .attr('d', delaunay.renderPoints(null, 1));
  svg_stops = svg.selectAll('.stop')
    .data(stops)
    .enter().append('circle')
      .classed('stop', true)
      .attr('id', (d) => `stop-${d.id}`)
      .attr('fill', '#000')
      .attr('r', d => stop_r(d, 1))
      .attr('transform', (d, i) => `translate(${projected_stops[i][0]},${projected_stops[i][1]})`)
    .on('click', (event, d) => {
      pause = true;
      pause_p = stops.indexOf(d);
      event.stopPropagation();
    });
  svg_stops.each(function(d) { stop_nodes[d.id] = this; });

  // interaction
  zoom = d3.zoom().on('zoom', (event) => {
    transform = event.transform;
    svg.attr('transform', transform);

    svg.selectAll('.district')
      .attr('stroke-width', 0.7 / transform.k);
    svg.selectAll('.district-label')
      .attr('font-size', 10 / transform.k)
      .attr('opacity', transform.k > 6 ? 0 : 0.8);
    svg.selectAll('.rail')
      .attr('stroke-width', 2 / transform.k);

    mousemove(event)
  });
  d3.select('svg')
    .call(zoom)
    .call(zoom.transform, d3.zoomIdentity)
    .on('mousemove', mousemove)
    .on('click', (event) => {
      pause = false;
      if (selected_bus) {
        selected_bus = null;
        desc_bus.style('display', 'none');
        desc_stop.style('display', null);
      }
    });

  setup_search();

  // init from a random stop
  show_reaches(d3.randomInt(stops.length)())
});
